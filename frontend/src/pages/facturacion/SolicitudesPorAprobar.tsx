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
import { LLAVE_SOLICITUDES, clp, horaDe, nombreDelTipo } from "./solicitudes";

// «SOLICITUDES» (doc 19 §9.45). Felipe, 09-11: recepción ya no emite al
// SII; manda la boleta o la factura al contado como solicitud. Aquí, quien
// tiene «Aprobar y emitir solicitudes» revisa cada una para que nada se
// boletee dos veces: «Aprobar y emitir» corre la emisión de siempre, y
// «Rechazar» la deja sin emitir (su plata sigue en la caja del turno). Dos
// del mismo día con el mismo tipo, total y medio se avisan en ámbar.

const medioDe = (m: string) =>
  MEDIOS_DE_PAGO.find((x) => x.value === m)?.label ?? m;

const diaYHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

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
  // La recién emitida que se imprime: su PDF se abre solo.
  const [imprimir, setImprimir] = useState<number | null>(null);

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
      if (s.imprimir && r.documento.pdf_path) setImprimir(s.id);
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

  const fila = (s: Solicitud, conAcciones: boolean) => {
    const igual = s.igual_a
      ? solicitudes.find((o) => o.id === s.igual_a)
      : null;
    return (
      <li key={s.id} className="space-y-2 px-4 py-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_9rem_7rem] sm:items-start">
          <span className="text-xs text-gray-500">
            {diaYHora(s.created_at)}
            <span className="block">{s.solicitada_por_nombre}</span>
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-gray-900">
              {nombreDelTipo(s.tipo)}
              {s.para ? ` · ${s.para}` : ""}
              {s.rut ? ` · ${s.rut}` : ""}
            </span>
            {s.lineas.map((l, i) => (
              <span
                key={i}
                className="flex justify-between gap-2 text-xs text-gray-600"
              >
                <span className="truncate">
                  {l.cantidad > 1 ? `${l.cantidad} × ` : ""}
                  {l.descripcion}
                </span>
                <span className="shrink-0">{clp(l.monto)}</span>
              </span>
            ))}
            <span className="mt-0.5 block text-xs text-gray-500">
              {medioDe(s.medio_de_pago)} ·{" "}
              {s.imprimir ? "Sin correo: se imprime" : s.correo}
            </span>
          </span>
          <span className="text-right text-base font-semibold text-gray-900">
            {clp(s.total)}
          </span>
          <span className="text-right">
            <ChipDeSolicitud solicitud={s} />
            {s.estado === "aprobada" && s.documento?.pdf_path && (
              <span className="mt-0.5 block text-xs">
                <FileViewLink
                  url={s.documento.pdf_path}
                  title={`${nombreDelTipo(s.tipo)} ${s.documento.folio ?? ""}.pdf`}
                  abrirAlMontar={imprimir === s.id}
                  alCerrar={() => setImprimir(null)}
                />
              </span>
            )}
            {s.resuelta_por_nombre && !conAcciones && (
              <span className="mt-0.5 block text-xs text-gray-400">
                {s.resuelta_por_nombre}
              </span>
            )}
          </span>
        </div>
        {conAcciones && igual && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <AlertTriangle size={13} />
            Igual a otra de las {horaDe(igual.created_at)} (
            {nombreDelTipo(igual.tipo)} por {clp(igual.total)},{" "}
            {medioDe(igual.medio_de_pago)}): revisa que no sea la misma.
          </p>
        )}
        {conAcciones && s.error && (
          <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800">
            {s.estado === "emitiendo"
              ? `No se sabe si salió: ${s.error}. Revísala en «Documentos» antes de hacer nada.`
              : `La última vez no salió: ${s.error}`}
          </p>
        )}
        {conAcciones && s.estado === "pendiente" && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {rechazando === s.id ? (
              <>
                <input
                  type="text"
                  value={motivo}
                  maxLength={300}
                  placeholder="Motivo (opcional)"
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-56 rounded-lg border border-gray-300 px-2 py-1 text-xs"
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
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={ocupada !== null}
                  onClick={() => setRechazando(s.id)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={ocupada !== null}
                  onClick={() => void aprobar(s)}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {ocupada === s.id ? "Emitiendo…" : "Aprobar y emitir"}
                </button>
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
          Por aprobar ({porResolver.length})
        </h2>
        {porResolver.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            No hay solicitudes esperando.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {porResolver.map((s) => fila(s, true))}
          </ul>
        )}
      </section>
      {resueltas.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
            Resueltas (últimos 7 días)
          </h2>
          <ul className="divide-y divide-gray-100">
            {resueltas.map((s) => fila(s, false))}
          </ul>
        </section>
      )}
    </div>
  );
}
