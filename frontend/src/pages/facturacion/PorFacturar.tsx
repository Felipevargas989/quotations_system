import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Sparkles } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  devolverAPorFacturar,
  leerOrdenesPendientes,
  marcarFacturadoFuera,
  type EstadoDeLaFacturacion,
  type EventoFacturadoFuera,
  type EventoPorFacturar,
  type OcSinLeer,
  type OrdenPorFacturar,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import EmitirDte from "../postventa/facturacion/EmitirDte";
import { LLAVE_POR_FACTURAR, usePorFacturar } from "./consultas";
import FacturacionMasiva from "./FacturacionMasiva";

// «POR FACTURAR» (doc 19 §9.21). Felipe, 06-11: *"los eventos que no se
// hayan facturado (…) y los pudiera como facturar de acá"*. Los eventos
// aceptados o realizados de los últimos 90 días (y los que vienen) con algo
// por emitir: el total, lo emitido (facturas y boletas, con la cadena) y lo
// que queda. «Facturar» abre ahí mismo el mismo «Emitir DTE» del evento:
// BelIA lee sus OC de Documentos y se llena desde la OC o la cotización.
// Desde el 07-11 (§9.23) es el único lugar donde se factura un evento (la
// pestaña de Post-Venta salió), y lo ve y lo emite quien tiene «Facturar
// eventos» (operaciones y el administrador, de fábrica), que además puede
// marcar varios y facturarlos juntos (`FacturacionMasiva`).
//
// Lo ya facturado fuera de Eventia (§9.24; Felipe, 07-11: *"yo te puedo dar
// el check de lo que ya está facturado"*): «Ya está facturado» saca el
// evento de la lista y de la masiva, y queda abajo, plegado, con quién lo
// marcó y «Devolver». El que tiene en Documentos el PDF de una factura
// subido a mano lo dice bajo el cliente, en el mismo lugar que sus OC.
//
// §9.26 (Felipe, 07-11: *"el sistema debe reconocer cuando esté por
// facturar, cuando esté facturado parcialmente y cuando esté todo
// facturado"* y *"quizás un distintivo que diga con OC"*): cada evento dice
// «Pendiente» o «Parcial» con el % facturado debajo; bajo el cliente,
// «Con OC» y cada OC con lo suyo; bajo lo que queda, la OC que factura
// «Facturar». Los facturados completos van abajo, plegados. Las OC que
// BelIA todavía no lee se leen solas al entrar (la primera lectura; desde
// ese día, la que se sube a Documentos se lee sola).

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const pct = (n: number) =>
  `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;

const CHIP: Record<EstadoDeLaFacturacion, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-gray-100 text-gray-700" },
  parcial: { texto: "Parcial", clase: "bg-amber-100 text-amber-800" },
  facturado: { texto: "Facturado", clase: "bg-green-100 text-green-800" },
};

function ChipDeFacturacion({
  estado,
}: {
  readonly estado: EstadoDeLaFacturacion;
}) {
  const chip = CHIP[estado];
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${chip.clase}`}
    >
      {chip.texto}
    </span>
  );
}

/** «OC 4500123 · $10.000.000 · facturada», una por línea. */
function LineaDeOc({ oc }: { readonly oc: OrdenPorFacturar }) {
  const estado =
    oc.estado === "facturado"
      ? "facturada"
      : oc.estado === "parcial"
        ? `${pct((oc.facturado / oc.total) * 100)} facturado`
        : "pendiente";
  return (
    <span className="block whitespace-nowrap text-xs text-gray-500">
      OC {oc.numero} · {clp(oc.total)} ·{" "}
      <span
        className={
          oc.estado === "facturado"
            ? "text-green-700"
            : oc.estado === "parcial"
              ? "text-amber-700"
              : ""
        }
      >
        {estado}
      </span>
    </span>
  );
}

export default function PorFacturar() {
  const queryClient = useQueryClient();
  const lista = usePorFacturar();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [masiva, setMasiva] = useState<string[] | null>(null);
  const [preguntando, setPreguntando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verFuera, setVerFuera] = useState(false);
  const [verFacturados, setVerFacturados] = useState(false);
  const [leyendo, setLeyendo] = useState(0);
  const [noLeidas, setNoLeidas] = useState<OcSinLeer[]>([]);
  const yaLeyo = useRef(false);
  const eventos = lista.data?.eventos ?? [];
  const facturados = lista.data?.facturados ?? [];
  const fuera = lista.data?.facturados_fuera ?? [];
  const marcar = (id: string, si: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  const todos = eventos.length > 0 && eventos.every((e) => marcados.has(e.id));

  const recargar = () =>
    void queryClient.invalidateQueries({ queryKey: LLAVE_POR_FACTURAR });

  // La primera lectura (§9.26): las OC de Documentos que BelIA no ha leído
  // se leen solas, una vez por visita.
  const sinLeer = eventos.reduce((s, e) => s + (e.ocs_sin_leer ?? 0), 0);
  useEffect(() => {
    if (yaLeyo.current || !lista.data || sinLeer === 0) return;
    yaLeyo.current = true;
    setLeyendo(sinLeer);
    leerOrdenesPendientes()
      .then((r) => {
        setNoLeidas(r.sin_leer);
        void queryClient.invalidateQueries({ queryKey: LLAVE_POR_FACTURAR });
      })
      .catch((err) =>
        toast.error(
          humanizeApiError(err, "BelIA no pudo leer las órdenes de compra."),
        ),
      )
      .finally(() => setLeyendo(0));
  }, [lista.data, sinLeer, queryClient]);

  const emitido = () => {
    setAbierto(null);
    recargar();
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "lista"] });
  };

  const yaFacturado = async (e: EventoPorFacturar) => {
    setOcupado(e.id);
    try {
      await marcarFacturadoFuera(e.id);
      marcar(e.id, false);
      setPreguntando(null);
      toast.success(`El #${e.numero} quedó como facturado fuera de Eventia.`);
      recargar();
    } catch (err) {
      toast.error(humanizeApiError(err, "No se pudo marcar el evento."));
    } finally {
      setOcupado(null);
    }
  };

  const devolver = async (e: EventoFacturadoFuera) => {
    setOcupado(e.id);
    try {
      await devolverAPorFacturar(e.id);
      toast.success(`El #${e.numero} volvió a «Por facturar».`);
      recargar();
    } catch (err) {
      toast.error(humanizeApiError(err, "No se pudo devolver el evento."));
    } finally {
      setOcupado(null);
    }
  };

  if (lista.isPending)
    return <p className="text-sm text-gray-400">Cargando…</p>;
  if (lista.isError)
    return (
      <p className="text-sm text-red-600">
        No se pudo cargar lo que falta por facturar.
      </p>
    );

  return (
    <div className="space-y-3">
      {masiva && (
        <FacturacionMasiva
          eventos={eventos.filter((e) => masiva.includes(e.id))}
          onCerrar={() => {
            setMasiva(null);
            setMarcados(new Set());
          }}
          onEmitidos={() => {
            recargar();
            void queryClient.invalidateQueries({
              queryKey: ["facturacion", "lista"],
            });
          }}
        />
      )}
      {leyendo > 0 && (
        <p className="flex items-center gap-2 text-sm text-violet-700">
          <Sparkles size={14} /> BelIA está leyendo{" "}
          {leyendo === 1
            ? "una orden de compra"
            : `${leyendo} órdenes de compra`}{" "}
          de Documentos…
        </p>
      )}
      {marcados.size > 0 && !masiva && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMasiva([...marcados])}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            Facturar{" "}
            {marcados.size === 1
              ? "el marcado"
              : `los ${marcados.size} marcados`}
          </button>
        </div>
      )}
      {eventos.length === 0 ? (
        <p className="text-sm text-gray-500">
          Todos los eventos desde el {fechaCorta(lista.data.desde)} están
          emitidos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="w-6 py-1">
                  <input
                    type="checkbox"
                    aria-label="Marcar todos"
                    checked={todos}
                    onChange={(ev) =>
                      setMarcados(
                        ev.target.checked
                          ? new Set(eventos.map((e) => e.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th className="py-1 font-medium">Evento</th>
                <th className="py-1 font-medium">Cliente</th>
                <th className="py-1 font-medium">Fecha</th>
                <th className="py-1 font-medium">Estado</th>
                <th className="py-1 text-right font-medium">Total</th>
                <th className="py-1 text-right font-medium">Emitido</th>
                <th className="py-1 text-right font-medium">Queda</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eventos.map((e) => {
                const ordenes = e.ordenes ?? [];
                const fallas = noLeidas.filter((n) => n.quotation_id === e.id);
                return (
                  <Fragment key={e.id}>
                    <tr className="align-top">
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Marcar el #${e.numero}`}
                          checked={marcados.has(e.id)}
                          onChange={(ev) => marcar(e.id, ev.target.checked)}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Link
                          to={`/post-venta/${e.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          #{e.numero}
                        </Link>
                        {e.tipoDeEvento && (
                          <span className="block text-xs text-gray-500">
                            {e.tipoDeEvento}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-gray-700">
                        {e.cliente ?? "—"}
                        {ordenes.length > 0 && (
                          <span className="mt-0.5 block">
                            <span className="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                              Con OC
                            </span>
                          </span>
                        )}
                        {ordenes.map((o) => (
                          <LineaDeOc key={o.id} oc={o} />
                        ))}
                        {(e.ocs_sin_leer ?? 0) > 0 && (
                          <span className="block text-xs text-gray-500">
                            {e.ocs_sin_leer === 1
                              ? "1 OC sin leer"
                              : `${e.ocs_sin_leer} OC sin leer`}
                          </span>
                        )}
                        {fallas.map((f) => (
                          <span
                            key={f.documento_id}
                            className="block text-xs text-amber-700"
                          >
                            BelIA no pudo leer «{f.nombre}»:{" "}
                            {f.motivo.replace(/\.$/, "")}
                          </span>
                        ))}
                        {e.tiene_factura_en_documentos && (
                          <span className="block text-xs font-medium text-amber-700">
                            Tiene factura en Documentos
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-600">
                        {e.fecha ? fechaCorta(e.fecha) : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <ChipDeFacturacion
                          estado={e.facturacion ?? "pendiente"}
                        />
                        {e.facturacion === "parcial" && (
                          <span className="block whitespace-nowrap text-xs text-gray-500">
                            {pct(e.porcentaje_facturado ?? 0)} facturado
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                        {clp(e.total)}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap text-gray-600">
                        {clp(e.emitido)}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap font-semibold text-gray-900">
                        {clp(e.queda)}
                        {e.se_factura?.oc && (
                          <span className="block text-xs font-normal text-gray-500">
                            OC {e.se_factura.oc}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        {preguntando === e.id ? (
                          <ConfirmInline
                            question="¿Ya se facturó fuera de Eventia?"
                            yesLabel="Sí, sacarlo"
                            tono="normal"
                            busy={ocupado === e.id}
                            onYes={() => void yaFacturado(e)}
                            onNo={() => setPreguntando(null)}
                          />
                        ) : (
                          abierto !== e.id && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreguntando(e.id)}
                                className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                              >
                                Ya está facturado
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbierto(e.id)}
                                className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                              >
                                <FileText size={12} /> Facturar
                              </button>
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                    {abierto === e.id && (
                      <tr>
                        <td colSpan={9} className="pb-3">
                          <EmitirDte
                            quotationId={e.id}
                            puedeEmitir
                            onCerrar={() => setAbierto(null)}
                            onEmitido={emitido}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {facturados.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setVerFacturados((v) => !v)}
            aria-expanded={verFacturados}
            className="flex w-full items-center gap-1 px-4 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {verFacturados ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            Facturados en Eventia ({facturados.length})
          </button>
          {verFacturados && (
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {facturados.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="py-1.5 pr-2">
                        <Link
                          to={`/post-venta/${e.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          #{e.numero}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2 text-gray-700">
                        {e.cliente ?? "—"}
                        {(e.ordenes ?? []).map((o) => (
                          <LineaDeOc key={o.id} oc={o} />
                        ))}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-600">
                        {e.fecha ? fechaCorta(e.fecha) : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <ChipDeFacturacion estado="facturado" />
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {clp(e.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {fuera.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setVerFuera((v) => !v)}
            aria-expanded={verFuera}
            className="flex w-full items-center gap-1 px-4 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {verFuera ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Facturados fuera de Eventia ({fuera.length})
          </button>
          {verFuera && (
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {fuera.map((e) => (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-2">
                        <Link
                          to={`/post-venta/${e.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          #{e.numero}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2 text-gray-700">
                        {e.cliente ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-600">
                        {e.fecha ? fechaCorta(e.fecha) : "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                        {clp(e.total)}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-gray-500">
                        {e.marcado_por ? `${e.marcado_por} · ` : ""}
                        {formatMomento(e.marcado_en, "diaMes")}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          disabled={ocupado === e.id}
                          onClick={() => void devolver(e)}
                          className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Devolver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
