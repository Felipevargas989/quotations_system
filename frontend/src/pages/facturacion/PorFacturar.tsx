import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";
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
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { formatearRut } from "../../utils/rut";
import { matchesSearch } from "../../utils/searchMatch";
import { LLAVE_POR_FACTURAR, usePorFacturar } from "./consultas";
import RevisionDeLaFacturacion from "./RevisionDeLaFacturacion";

// «POR FACTURAR» (doc 19 §9.21). Felipe, 06-11: *"los eventos que no se
// hayan facturado (…) y los pudiera como facturar de acá"*. Los eventos
// aceptados o realizados de los últimos 90 días (y los que vienen) con algo
// por emitir: el total, lo emitido (facturas y boletas, con la cadena) y lo
// que queda. Desde el 07-11 (§9.23) es el único lugar donde se factura un
// evento, y lo ve y lo emite quien tiene «Facturar eventos» (operaciones y
// el administrador, de fábrica).
//
// Lo ya facturado fuera de Eventia (§9.24; Felipe, 07-11: *"yo te puedo dar
// el check de lo que ya está facturado"*): «Ya está facturado» saca el
// evento de la lista, y queda abajo, plegado, con quién lo marcó y
// «Devolver». §9.26: cada evento dice «Pendiente» o «Parcial» con el %
// facturado debajo, y los facturados completos van abajo, plegados. Las OC
// que BelIA todavía no lee se leen solas al entrar (la primera lectura;
// desde ese día, la que se sube a Documentos se lee sola).
//
// §9.31 (Felipe, 08-11, con la maqueta: *"sí, así"*):
// - arriba, el buscador amplio (*"por rut, nombre cliente, persona
//   contacto, nro de cotización etc."*) y «Facturar seleccionados», que
//   reemplaza a «+ Nuevo documento» en esta pestaña;
// - cada fila, solo con sus columnas y «Ya está facturado» (*"el facturar
//   lo dejaría solo con el de arriba y si se va a facturar 1 solo, se
//   selecciona"*); de las OC queda el distintivo «Con OC», y lo demás (sus
//   OC, lo que BelIA no pudo leer, la factura en Documentos) va en «Lo del
//   evento», dentro de la revisión;
// - «Facturar seleccionados» abre la revisión una por una
//   (`RevisionDeLaFacturacion`).
//
// Felipe, 08-11: *"se mueven todas las columnas cuando intento colocar
// algunas como facturadas"*. La pregunta era más ancha que el botón y la
// tabla repartía las columnas según lo que traía cada fila. Ahora las
// columnas tienen ancho fijo (solo el cliente toma lo que sobra) y la
// pregunta cabe en el lugar del botón: «¿Sacarlo? Sí · No». Nada se mueve
// al preguntar, al sacar una fila ni al buscar.

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

/** El RUT como se escriba: con puntos, sin puntos o solo los números. */
const formasDelRut = (rut: string | null | undefined) =>
  rut ? [rut, formatearRut(rut), rut.replace(/[^0-9kK]/g, "")] : [];

/** El buscador amplio (§9.31), con el criterio de todos los buscadores
 *  (`matchesSearch`: sin tildes, por palabras, en cualquier orden). */
const coincide = (
  e: EventoPorFacturar,
  texto: string,
): boolean =>
  matchesSearch(
    texto,
    `#${e.numero}`,
    e.cliente,
    e.contacto,
    e.tipoDeEvento,
    ...(e.ordenes ?? []).flatMap((o) => [o.numero, ...formasDelRut(o.rut)]),
    ...(e.ruts ?? []).flatMap(formasDelRut),
  );

export default function PorFacturar() {
  const queryClient = useQueryClient();
  const lista = usePorFacturar();
  const [buscar, setBuscar] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  // Los que se revisan: fijos mientras la ventana está abierta (la lista se
  // recarga al emitir).
  const [revision, setRevision] = useState<EventoPorFacturar[] | null>(null);
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
  const visibles = eventos.filter((e) => coincide(e, buscar));
  const facturadosVisibles = facturados.filter((e) => coincide(e, buscar));
  const fueraVisibles = fuera.filter((e) => coincide(e, buscar));
  const marcar = (id: string, si: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  const todos =
    visibles.length > 0 && visibles.every((e) => marcados.has(e.id));
  const elegidos = eventos.filter((e) => marcados.has(e.id));

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
      {revision && (
        <RevisionDeLaFacturacion
          eventos={revision}
          noLeidas={noLeidas}
          onCerrar={() => setRevision(null)}
          onEmitidos={() => {
            setMarcados(new Set());
            recargar();
            void queryClient.invalidateQueries({
              queryKey: ["facturacion", "lista"],
            });
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={buscar}
            placeholder="Buscar por RUT, cliente, contacto, N° de cotización u OC"
            autoComplete="off"
            onChange={(ev) => setBuscar(ev.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <button
          type="button"
          onClick={() => setRevision(elegidos)}
          disabled={elegidos.length === 0}
          title={
            elegidos.length === 0
              ? "Marca los eventos que vas a facturar"
              : undefined
          }
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <FileText size={15} /> Facturar seleccionados
          {elegidos.length > 0 ? ` (${elegidos.length})` : ""}
        </button>
      </div>
      {leyendo > 0 && (
        <p className="flex items-center gap-2 text-sm text-violet-700">
          <Sparkles size={14} /> BelIA está leyendo{" "}
          {leyendo === 1
            ? "una orden de compra"
            : `${leyendo} órdenes de compra`}{" "}
          de Documentos…
        </p>
      )}
      {eventos.length === 0 ? (
        <p className="text-sm text-gray-500">
          Todos los eventos desde el {fechaCorta(lista.data.desde)} están
          emitidos.
        </p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-gray-500">
          Ningún evento por facturar coincide con «{buscar.trim()}».
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
          <table className="w-full min-w-[68rem] table-fixed text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="w-7 py-1">
                  <input
                    type="checkbox"
                    aria-label="Marcar todos"
                    checked={todos}
                    onChange={(ev) =>
                      setMarcados((m) => {
                        const n = new Set(m);
                        for (const e of visibles)
                          if (ev.target.checked) n.add(e.id);
                          else n.delete(e.id);
                        return n;
                      })
                    }
                  />
                </th>
                <th className="w-40 py-1 font-medium">Evento</th>
                <th className="py-1 font-medium">Cliente</th>
                <th className="w-24 py-1 font-medium">Fecha</th>
                <th className="w-28 py-1 font-medium">Estado</th>
                <th className="w-28 py-1 pr-2 text-right font-medium">Total</th>
                <th className="w-28 py-1 pr-2 text-right font-medium">
                  Emitido
                </th>
                <th className="w-28 py-1 pr-2 text-right font-medium">Queda</th>
                <th className="w-40 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((e) => (
                <tr key={e.id} className="align-top">
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
                      <span
                        className="block truncate text-xs text-gray-500"
                        title={e.tipoDeEvento}
                      >
                        {e.tipoDeEvento}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-700">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate" title={e.cliente ?? undefined}>
                        {e.cliente ?? "—"}
                      </span>
                      {(e.ordenes ?? []).length > 0 && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                          Con OC
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-gray-600">
                    {e.fecha ? fechaCorta(e.fecha) : "—"}
                  </td>
                  <td className="py-1.5 pr-2">
                    <ChipDeFacturacion estado={e.facturacion ?? "pendiente"} />
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
                  </td>
                  <td className="py-1.5 text-right">
                    {preguntando === e.id ? (
                      <ConfirmInline
                        question="¿Sacarlo?"
                        yesLabel="Sí"
                        tono="normal"
                        busy={ocupado === e.id}
                        onYes={() => void yaFacturado(e)}
                        onNo={() => setPreguntando(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreguntando(e.id)}
                        className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Ya está facturado
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {facturadosVisibles.length > 0 && (
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
            Facturados en Eventia ({facturadosVisibles.length})
          </button>
          {verFacturados && (
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {facturadosVisibles.map((e) => (
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
      {fueraVisibles.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setVerFuera((v) => !v)}
            aria-expanded={verFuera}
            className="flex w-full items-center gap-1 px-4 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {verFuera ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Facturados fuera de Eventia ({fueraVisibles.length})
          </button>
          {verFuera && (
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {fueraVisibles.map((e) => (
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
