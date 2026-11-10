import type { Solicitud } from "../../services/solicitudes.service";

// El estado de una solicitud de recepción (doc 19 §9.45) en una palabra,
// con su detalle chico debajo.

const ESTADO: Record<Solicitud["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-800" },
  emitiendo: { texto: "Emitiendo", clase: "bg-blue-100 text-blue-800" },
  aprobada: { texto: "Emitida", clase: "bg-green-100 text-green-800" },
  rechazada: { texto: "Rechazada", clase: "bg-red-100 text-red-800" },
};

/** El estado en una palabra y, debajo, lo que lo explica (Felipe: chips
 *  cortos, el detalle en una línea chica). */
export default function ChipDeSolicitud({
  solicitud: s,
}: {
  readonly solicitud: Solicitud;
}) {
  const e = ESTADO[s.estado];
  const detalle =
    s.estado === "aprobada" && s.documento
      ? s.documento.estado === "emitido"
        ? `N° ${s.documento.folio}`
        : "Por confirmar"
      : s.estado === "rechazada"
        ? s.motivo_rechazo
        : s.estado === "pendiente" && s.error
          ? "No salió: reintentar"
          : null;
  return (
    <span className="inline-flex flex-col items-end">
      <span
        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}
      >
        {e.texto}
      </span>
      {detalle && (
        <span className="mt-0.5 max-w-[10rem] truncate text-xs text-gray-500">
          {detalle}
        </span>
      )}
    </span>
  );
}
