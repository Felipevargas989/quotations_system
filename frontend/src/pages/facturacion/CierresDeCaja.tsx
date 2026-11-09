import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  MEDIOS_DE_PAGO,
  nombreDelMedio,
  type MedioDePago,
} from "../../constants/facturacion";
import {
  corregirMedio,
  getCierre,
  getCierres,
  revisarCierre,
  type CierreDeCaja,
  type CierreEnLaLista,
} from "../../services/caja.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { Seccion } from "./PiezasDelDocumento";

// LOS CIERRES DE LA CAJA DE RECEPCIÓN, PARA REVISARLOS (doc 19 §9.43,
// sprint 2; Felipe, 09-11: *"luego Camila valide viendo qué se vendió y
// cuánto debería tener"*). La lista con su estado («Por revisar»,
// «Revisado · cuadra», «Revisado · faltan $X») y cada cierre en el panel de
// la derecha: por medio de pago, lo declarado, lo de Eventia y la
// diferencia; sus documentos, con el medio de pago que se corrige ahí; lo
// vendido; los retiros; y «Marcar revisado» con su nota.

const clp = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
/** «a las 18:05», y «a la 01:30» con la una. */
const aLas = (iso: string) => {
  const h = hora(iso);
  return `${h.startsWith("01") ? "a la" : "a las"} ${h}`;
};
const chip =
  "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold";
const VERDE = `${chip} border-green-200 bg-green-50 text-green-700`;
const ROJO = `${chip} border-red-200 bg-red-50 text-red-700`;
const AMBAR = `${chip} border-amber-200 bg-amber-50 text-amber-800`;
const AZUL = `${chip} border-blue-200 bg-blue-50 text-blue-700`;

/** «Cuadra», «Faltan $5.000» o «Sobran $500», con su color. */
function Diferencia({ valor }: { readonly valor: number | null }) {
  if (valor == null) return <span className="text-gray-400">—</span>;
  if (valor === 0) return <span className={VERDE}>Cuadra</span>;
  return valor < 0 ? (
    <span className={ROJO}>Faltan {clp(-valor)}</span>
  ) : (
    <span className={AMBAR}>Sobran {clp(valor)}</span>
  );
}

/** El estado de un cierre en una palabra, con el resultado al revisarlo. */
function Estado({ c }: { readonly c: CierreEnLaLista }) {
  if (c.estado === "abierta") return <span className={AZUL}>Abierta</span>;
  if (c.estado === "por_revisar")
    return <span className={AMBAR}>Por revisar</span>;
  const d = c.diferencia ?? 0;
  return (
    <span className={d === 0 ? VERDE : d < 0 ? ROJO : AMBAR}>
      Revisado ·{" "}
      {d === 0 ? "cuadra" : d < 0 ? `faltan ${clp(-d)}` : `sobran ${clp(d)}`}
    </span>
  );
}

const NOMBRE_DEL_TIPO: Record<number, string> = {
  33: "Factura",
  39: "Boleta",
};

function Detalle({
  id,
  onCerrar,
}: {
  readonly id: number;
  readonly onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const cierre = useQuery({
    queryKey: ["caja", "cierre", id],
    queryFn: () => getCierre(id),
  });
  const [nota, setNota] = useState<string | null>(null);
  const alDia = (c: CierreDeCaja) => {
    queryClient.setQueryData(["caja", "cierre", id], c);
    void queryClient.invalidateQueries({ queryKey: ["caja", "cierres"] });
  };
  const corregir = useMutation({
    mutationFn: (v: { documentoId: number; medio: MedioDePago }) =>
      corregirMedio(id, v.documentoId, v.medio),
    onSuccess: alDia,
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo corregir el medio de pago.")),
  });
  const revisar = useMutation({
    mutationFn: () => revisarCierre(id, (nota ?? "").trim() || null),
    onSuccess: (c) => {
      alDia(c);
      toast.success("Cierre revisado.");
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo marcar revisado.")),
  });

  const c = cierre.data;
  const debito = c?.cuadre.lineas.find((l) => l.medio === "debito");
  const credito = c?.cuadre.lineas.find((l) => l.medio === "credito");
  // Débito y crédito que se compensan: lo más común es una venta cargada
  // con el medio equivocado.
  const seCompensan =
    !!debito?.diferencia &&
    !!credito?.diferencia &&
    debito.diferencia === -credito.diferencia;

  return (
    <Modal
      lado="derecha"
      ancho="max-w-2xl"
      titulo={c ? `Caja del ${dia(c.abierta_en)}` : "Cierre de la caja"}
      onCerrar={onCerrar}
    >
      {!c ? (
        <p className="text-sm text-gray-400">Cargando el cierre…</p>
      ) : (
        <div className="space-y-4">
          {/* Quién abrió y quién cerró, cada uno con su hora: los dos salen
              del perfil de la sesión (Felipe, 09-11: *"que diga las dos"*). */}
          <p className="text-sm text-gray-700">
            Abrió <strong>{c.abierta_por_nombre}</strong> {aLas(c.abierta_en)} ·{" "}
            {c.cerrada_en ? (
              <>
                Cerró <strong>{c.cerrada_por_nombre ?? "—"}</strong>
                {dia(c.cerrada_en) !== dia(c.abierta_en) &&
                  ` el ${dia(c.cerrada_en)}`}{" "}
                {aLas(c.cerrada_en)}
              </>
            ) : (
              "Sigue abierta"
            )}
          </p>
          <Seccion titulo="Por medio de pago">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="w-[30%] pb-1 font-normal">Medio</th>
                  <th className="pb-1 text-right font-normal">Declaró</th>
                  <th className="pb-1 text-right font-normal">Según Eventia</th>
                  <th className="w-[28%] pb-1 text-right font-normal">
                    Diferencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.cuadre.lineas.map((l) => (
                  <tr key={l.medio} className="border-t border-gray-100">
                    <td className="py-1.5">
                      {nombreDelMedio(l.medio)}
                      {l.medio === "efectivo" && (
                        <span className="block text-xs text-gray-400">
                          sencillo + ventas − retiros
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {l.declarado == null ? "—" : clp(l.declarado)}
                    </td>
                    <td className="py-1.5 text-right">{clp(l.esperado)}</td>
                    <td className="py-1.5 text-right">
                      <Diferencia valor={l.diferencia} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="py-1.5">Total</td>
                  <td className="py-1.5 text-right">
                    {c.cuadre.declarado == null ? "—" : clp(c.cuadre.declarado)}
                  </td>
                  <td className="py-1.5 text-right">
                    {clp(c.cuadre.esperado)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Diferencia valor={c.cuadre.diferencia} />
                  </td>
                </tr>
              </tbody>
            </table>
            {seCompensan && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Débito y crédito se compensan: puede ser una venta cargada con
                el medio equivocado. Revisa los documentos de abajo.
              </p>
            )}
            {c.cuadre.porConfirmar > 0 && (
              <p className="text-xs text-amber-800">
                {c.cuadre.porConfirmar} documento(s) por confirmar: todavía no
                cuentan.
              </p>
            )}
          </Seccion>

          <Seccion titulo="Documentos del turno">
            {c.documentos.length === 0 ? (
              <p className="text-xs text-gray-400">Sin documentos.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {c.documentos.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <span
                      className={d.estado === "emitido" ? "" : "text-gray-400"}
                    >
                      {NOMBRE_DEL_TIPO[d.tipo] ?? "Documento"}{" "}
                      {d.folio ?? "s/n"}
                      {d.emitido_en && ` · ${hora(d.emitido_en)}`} ·{" "}
                      {clp(d.total)}
                      {d.estado !== "emitido" &&
                        ` · ${d.estado.replace("_", " ")}`}
                    </span>
                    <span className="w-40">
                      <SelectWithSearch
                        options={MEDIOS_DE_PAGO.map((m) => ({
                          value: m.value,
                          label: m.label,
                        }))}
                        value={d.medio_de_pago ?? ""}
                        onChange={(v) =>
                          v &&
                          v !== d.medio_de_pago &&
                          corregir.mutate({
                            documentoId: d.id,
                            medio: v as MedioDePago,
                          })
                        }
                        placeholder="Sin medio"
                        tamano="sm"
                        sinLimpiar
                        mostrarConteo={false}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {c.correcciones.length > 0 && (
              <ul className="space-y-0.5 text-xs text-gray-500">
                {c.correcciones.map((x) => {
                  const d = c.documentos.find((y) => y.id === x.documento_id);
                  return (
                    <li key={x.id}>
                      {d
                        ? `${NOMBRE_DEL_TIPO[d.tipo] ?? ""} ${d.folio ?? ""}`
                        : "Documento"}{" "}
                      pasado de {nombreDelMedio(x.medio_antes) ?? "sin medio"} a{" "}
                      {nombreDelMedio(x.medio_despues)} por{" "}
                      {x.corregido_por_nombre ?? "—"}, {dia(x.created_at)}{" "}
                      {hora(x.created_at)}.
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>

          <Seccion titulo="Lo vendido en el turno">
            <table className="w-full table-fixed text-sm">
              <tbody>
                {c.cuadre.vendidoPorItem.map((i) => (
                  <tr
                    key={`${i.tarifario_id}-${i.nombre}`}
                    className="border-t border-gray-100 first:border-t-0"
                  >
                    <td className="w-[60%] py-1.5">{i.nombre}</td>
                    <td className="py-1.5 text-right">{i.cantidad}</td>
                    <td className="py-1.5 text-right">{clp(i.monto)}</td>
                  </tr>
                ))}
                {c.retiros.map((r) => (
                  <tr key={`r${r.id}`} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600">
                      Retiro {hora(r.creado_en)} · {r.motivo}
                    </td>
                    <td />
                    <td className="py-1.5 text-right text-gray-600">
                      {clp(-r.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500">
              Comentario de {c.cerrada_por_nombre ?? c.abierta_por_nombre}:{" "}
              {c.comentario ?? "sin comentario"}
            </p>
          </Seccion>

          {c.estado !== "abierta" && (
            <Seccion titulo="Revisión">
              {c.revisado_en && (
                <p className="text-xs text-green-800">
                  Revisado por {c.revisado_por_nombre ?? "—"} el{" "}
                  {dia(c.revisado_en)} {aLas(c.revisado_en)}
                  {c.nota_revision ? `: ${c.nota_revision}` : "."}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <label className="block min-w-[14rem] flex-1">
                  <span className="text-xs text-gray-500">
                    Nota de la revisión
                  </span>
                  <input
                    value={nota ?? c.nota_revision ?? ""}
                    maxLength={500}
                    placeholder="Un ticket de convenio se cargó como crédito"
                    onChange={(e) => setNota(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <button
                  type="button"
                  disabled={revisar.isPending}
                  onClick={() => revisar.mutate()}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {c.revisado_en ? "Guardar la nota" : "Marcar revisado"}
                </button>
              </div>
            </Seccion>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function CierresDeCaja() {
  const cierres = useQuery({
    queryKey: ["caja", "cierres"],
    queryFn: getCierres,
  });
  const [abierto, setAbierto] = useState<number | null>(null);
  const lista = cierres.data ?? [];
  return (
    <Seccion titulo="Cierres de la caja de recepción">
      {cierres.isPending ? (
        <p className="text-sm text-gray-400">Cargando los cierres…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay cierres.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="w-[22%] pb-1 font-normal">Día</th>
              <th className="w-[20%] pb-1 font-normal">Quién</th>
              <th className="pb-1 text-right font-normal">Vendido</th>
              <th className="pb-1 text-right font-normal">Declarado</th>
              <th className="w-[30%] pb-1 text-right font-normal">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr
                key={c.id}
                onClick={() => setAbierto(c.id)}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
              >
                <td className="py-1.5">
                  <button
                    type="button"
                    className="text-left text-blue-700 hover:underline"
                  >
                    {dia(c.abierta_en)}
                  </button>
                </td>
                <td className="py-1.5">
                  {c.cerrada_por_nombre ?? c.abierta_por_nombre}
                </td>
                <td className="py-1.5 text-right">{clp(c.vendido)}</td>
                <td className="py-1.5 text-right">
                  {c.declarado == null ? "—" : clp(c.declarado)}
                </td>
                <td className="py-1.5 text-right">
                  <Estado c={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {abierto != null && (
        <Detalle id={abierto} onCerrar={() => setAbierto(null)} />
      )}
    </Seccion>
  );
}
