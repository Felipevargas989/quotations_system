import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import { toast } from "../../components/toast/Toast";
import { MEDIOS_DE_PAGO, marcaDelAmbiente } from "../../constants/facturacion";
import {
  aprobarSolicitud,
  getSolicitudes,
  rechazarSolicitud,
  type Solicitud,
} from "../../services/solicitudes.service";
import { humanizeApiError } from "../../utils/apiErrors";
import ChipDeSolicitud from "./ChipDeSolicitud";
import { LLAVE_SOLICITUDES, clp, nombreDelTipo } from "./solicitudes";

// «SOLICITUDES» (doc 19 §9.45). Felipe, 09-11: recepción ya no emite al
// SII; manda la boleta o la factura al contado como solicitud. Aquí, quien
// tiene «Aprobar y emitir solicitudes» revisa cada una para que nada se
// boletee dos veces: «Emitir» (aprobar y emitir) corre la emisión de
// siempre, y «Rechazar» la deja sin emitir (su plata sigue en la caja del
// turno). Dos del mismo día con el mismo tipo, total y medio se avisan en
// ámbar. Una tabla con las mismas seis columnas arriba y abajo.

const medioDe = (m: string) =>
  MEDIOS_DE_PAGO.find((x) => x.value === m)?.label ?? m;

/** «22:04»: la hora en 24 h, para que no se parta («09:50 p. m.»). */
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
  });
const esDeHoy = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString();

/** Lo vendido en una línea («2 × Tinaja · 1 × Ticket diario»), sin la
 *  cabaña del comienzo, que ya va arriba. */
const loVendido = (s: Solicitud) =>
  s.lineas
    .map((l) => {
      const que =
        s.para && l.descripcion.startsWith(`${s.para} · `)
          ? l.descripcion.slice(s.para.length + 3)
          : l.descripcion;
      return `${l.cantidad} × ${que}`;
    })
    .join(" · ");
/** Lo mismo con el monto de cada línea, para leerlo entero con el mouse. */
const loVendidoConMontos = (s: Solicitud) =>
  s.lineas
    .map((l) => `${l.cantidad} × ${l.descripcion}: ${clp(l.monto)}`)
    .join("\n");

// Las mismas seis columnas en «Por aprobar» y en «Resueltas» (Felipe: lo que
// se repite va siempre en el mismo lugar).
const COLUMNAS = (
  <>
    <colgroup>
      <col className="w-28" />
      <col />
      <col className="w-64" />
      <col className="w-28" />
      <col className="w-36" />
      <col className="w-44" />
    </colgroup>
    <thead>
      <tr className="text-left text-xs text-gray-500">
        <th className="px-2 py-2 pl-4 font-medium">Pedida</th>
        <th className="px-2 py-2 font-medium">Documento</th>
        <th className="px-2 py-2 font-medium">Pago y correo</th>
        <th className="px-2 py-2 text-right font-medium">Total</th>
        <th className="px-2 py-2 font-medium">Estado</th>
        <th className="px-2 py-2 pr-4 text-right font-medium">Acción</th>
      </tr>
    </thead>
  </>
);
const CELDA = "px-2 py-2.5 align-top";
const ABAJO = "block truncate text-xs text-gray-500";

export default function SolicitudesPorAprobar() {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: LLAVE_SOLICITUDES,
    queryFn: getSolicitudes,
    refetchInterval: 30_000,
  });
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  const solicitudes = consulta.data?.solicitudes ?? [];
  const porResolver = solicitudes.filter(
    (s) => s.estado === "pendiente" || s.estado === "emitiendo",
  );
  const resueltas = solicitudes.filter(
    (s) => s.estado === "aprobada" || s.estado === "rechazada",
  );
  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: LLAVE_SOLICITUDES });
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "lista"] });
  };

  const aprobar = async (s: Solicitud) => {
    setOcupada(s.id);
    try {
      const r = await aprobarSolicitud(s.id);
      if (r.aviso) toast.warn(r.aviso, { sticky: true });
      else
        toast.success(
          `${nombreDelTipo(r.documento.tipo)} N° ${r.documento.folio} emitida${marcaDelAmbiente(r.documento.ambiente)}.`,
        );
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo emitir la solicitud."));
    } finally {
      setOcupada(null);
      refrescar();
    }
  };

  const rechazar = async (s: Solicitud) => {
    setOcupada(s.id);
    try {
      await rechazarSolicitud(s.id, motivo.trim() || null);
      toast.success("Solicitud rechazada: no se emite.");
      setRechazando(null);
      setMotivo("");
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo rechazar la solicitud."));
    } finally {
      setOcupada(null);
      refrescar();
    }
  };

  if (consulta.isPending)
    return <p className="text-sm text-gray-400">Cargando las solicitudes…</p>;

  // Cada solicitud en dos líneas, y nada se parte: lo que no cabe termina
  // en «…» y se lee entero al pasar el mouse (Felipe, 09-11: «mejoremos
  // estas tablas»; la maqueta que aprobó).
  const fila = (s: Solicitud, conAcciones: boolean) => {
    const igual = s.igual_a
      ? solicitudes.find((o) => o.id === s.igual_a)
      : null;
    const cuando =
      conAcciones && esDeHoy(s.created_at)
        ? hora(s.created_at)
        : `${dia(s.created_at)} ${hora(s.created_at)}`;
    const documento = `${nombreDelTipo(s.tipo)}${s.para ? ` · ${s.para}` : ""}`;
    const vendido = `${s.rut ? `${s.rut} · ` : ""}${loVendido(s)}`;
    return [
      <tr key={s.id} className="border-t border-gray-100">
        <td className={`${CELDA} whitespace-nowrap pl-4 text-gray-900`}>
          {cuando}
          <span className={ABAJO}>{s.solicitada_por_nombre}</span>
        </td>
        <td className={`${CELDA} max-w-0`}>
          <span
            title={documento}
            className="block truncate font-medium text-gray-900"
          >
            {documento}
          </span>
          <span title={loVendidoConMontos(s)} className={ABAJO}>
            {vendido}
          </span>
        </td>
        <td className={`${CELDA} max-w-0 text-gray-900`}>
          {medioDe(s.medio_de_pago)}
          <span title={s.correo ?? undefined} className={ABAJO}>
            {s.correo ?? "Sin correo"}
          </span>
        </td>
        <td
          className={`${CELDA} whitespace-nowrap text-right font-semibold text-gray-900`}
        >
          {clp(s.total)}
        </td>
        <td className={`${CELDA} max-w-0`}>
          <ChipDeSolicitud
            solicitud={s}
            alinear="izquierda"
            aviso={
              conAcciones && igual
                ? `Igual a la de ${hora(igual.created_at)}`
                : null
            }
          />
        </td>
        <td className={`${CELDA} whitespace-nowrap pr-4 text-right`}>
          {conAcciones ? (
            s.estado === "pendiente" ? (
              <span className="inline-flex gap-1.5">
                <button
                  type="button"
                  disabled={ocupada !== null}
                  onClick={() => {
                    setMotivo("");
                    setRechazando(s.id);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={ocupada !== null}
                  title="Aprobar y emitir"
                  onClick={() => void aprobar(s)}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {ocupada === s.id ? "Emitiendo…" : "Emitir"}
                </button>
              </span>
            ) : (
              <span className="text-gray-300">—</span>
            )
          ) : (
            <>
              {s.estado === "aprobada" && s.documento?.pdf_path ? (
                <span className="text-xs">
                  <FileViewLink
                    url={s.documento.pdf_path}
                    title={`${nombreDelTipo(s.tipo)} ${s.documento.folio ?? ""}.pdf`}
                  />
                </span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
              <span className={ABAJO}>{s.resuelta_por_nombre ?? ""}</span>
            </>
          )}
        </td>
      </tr>,
      conAcciones && rechazando === s.id && (
        <tr key={`${s.id}-rechazar`}>
          <td colSpan={6} className="px-4 pb-2.5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                type="text"
                value={motivo}
                maxLength={300}
                placeholder="Motivo (opcional)"
                onChange={(e) => setMotivo(e.target.value)}
                className="w-64 rounded-lg border border-gray-300 px-2 py-1 text-xs"
              />
              <ConfirmInline
                question="¿Rechazarla? No se emite."
                yesLabel="Rechazar"
                busy={ocupada === s.id}
                onYes={() => void rechazar(s)}
                onNo={() => {
                  setRechazando(null);
                  setMotivo("");
                }}
              />
            </div>
          </td>
        </tr>
      ),
      conAcciones && igual && (
        <tr key={`${s.id}-igual`}>
          <td colSpan={6} className="px-4 pb-2.5">
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              <AlertTriangle size={13} />
              Igual a otra de las {hora(igual.created_at)} (
              {nombreDelTipo(igual.tipo)} por {clp(igual.total)},{" "}
              {medioDe(igual.medio_de_pago)}): revisa que no sea la misma.
            </p>
          </td>
        </tr>
      ),
      conAcciones && s.error && (
        <tr key={`${s.id}-error`}>
          <td colSpan={6} className="px-4 pb-2.5">
            <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800">
              {s.estado === "emitiendo"
                ? `No se sabe si salió: ${s.error}. Revísala en «Documentos» antes de hacer nada.`
                : `La última vez no salió: ${s.error}`}
            </p>
          </td>
        </tr>
      ),
    ];
  };

  const tabla = (filas: Solicitud[], conAcciones: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] table-fixed text-sm">
        {COLUMNAS}
        <tbody>{filas.map((s) => fila(s, conAcciones))}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
          Por aprobar
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${porResolver.length ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}`}
          >
            {porResolver.length}
          </span>
        </h2>
        {porResolver.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            No hay solicitudes esperando.
          </p>
        ) : (
          tabla(porResolver, true)
        )}
      </section>
      {resueltas.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="flex items-baseline gap-2 border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
            Resueltas
            <span className="text-xs font-normal text-gray-400">
              últimos 7 días
            </span>
          </h2>
          {tabla(resueltas, false)}
        </section>
      )}
    </div>
  );
}
