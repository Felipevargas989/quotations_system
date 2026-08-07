// Confirmación inline (patrón del sistema, mismo estilo que "Anular
// evento"): la acción se transforma ahí mismo en la pregunta con
// Sí / No — sin popups del navegador. Definido con Felipe el 20-07-2026
// para todo borrado delicado en Post-Venta.
export default function ConfirmInline({
  question,
  yesLabel = "Sí, eliminar",
  onYes,
  onNo,
  busy = false,
  tono = "peligro",
}: {
  readonly question: string;
  readonly yesLabel?: string;
  // El rojo es para lo que destruye. Una marca que se puede deshacer
  // (07-08: "ya lo llamé") pide el tono sereno (azul).
  readonly tono?: "peligro" | "normal";
  readonly onYes: () => void;
  readonly onNo: () => void;
  readonly busy?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-gray-700 font-medium">{question}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onYes}
        className={`shrink-0 whitespace-nowrap px-2.5 py-1 text-white rounded-lg font-bold disabled:opacity-50 ${
          tono === "peligro"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {busy ? "…" : yesLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onNo}
        className="shrink-0 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200"
      >
        No
      </button>
    </span>
  );
}
