import { Lock } from "lucide-react";

// EL INTERRUPTOR DE LA CASA (doc 22, 05-11-2026). Felipe pidió los permisos
// como «pestañas que se puedan deslizar como botones (lo típico en estos
// casos)»: un prendido/apagado de un toque, nunca un casillero.
//
// Es un botón con `role="switch"` y `aria-checked`: Espacio y Enter lo
// mueven como cualquier botón, y el lector de pantalla dice si está
// prendido. Con `candado` no se mueve y muestra el candado; el porqué va
// en `motivo` (el aviso del navegador al pasar el mouse).
export default function Interruptor({
  prendido,
  onCambiar,
  etiqueta,
  candado = false,
  motivo,
  ocupado = false,
}: {
  readonly prendido: boolean;
  readonly onCambiar: (prendido: boolean) => void;
  /** Lo que lee el lector de pantalla: «Cotizaciones de Recepción». */
  readonly etiqueta: string;
  readonly candado?: boolean;
  readonly motivo?: string;
  /** Mientras se guarda: no acepta otro toque. */
  readonly ocupado?: boolean;
}) {
  const quieto = candado || ocupado;
  return (
    <span className="inline-flex items-center gap-1.5" title={motivo}>
      <button
        type="button"
        role="switch"
        aria-checked={prendido}
        aria-label={etiqueta}
        aria-disabled={quieto || undefined}
        disabled={quieto}
        onClick={() => onCambiar(!prendido)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          prendido ? "bg-blue-600" : "bg-gray-300"
        } ${candado ? "opacity-50 cursor-not-allowed" : ocupado ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            prendido ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      {candado && (
        <Lock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
      )}
    </span>
  );
}
