import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";
import type { ResultadoDeSeguimiento } from "../hooks/useSeguimientoConIA";

// El botón chico «✉ Generar seguimiento» (17-10-2026, doc 18): en la
// tarjeta del tablero y en el aviso «Contacto comprometido» de la ficha.
// Mientras la IA escribe, gira; cuando el borrador quedó, se vuelve el
// enlace para abrirlo en Outlook (nada se envía: se revisa y se envía
// desde ahí). Si se saltó, dice por qué al pasar el mouse.
//
// Los clics no siguen de largo: la tarjeta entera abre la ficha.
export default function BotonSeguimientoIA({
  trabajando,
  ocupado,
  resultado,
  onGenerar,
  texto = "Generar seguimiento",
}: {
  /** La IA está escribiendo ESTE seguimiento. */
  readonly trabajando: boolean;
  /** La IA está escribiendo otro: no se puede apretar. */
  readonly ocupado: boolean;
  readonly resultado: ResultadoDeSeguimiento | null;
  readonly onGenerar: () => void;
  readonly texto?: string;
}) {
  if (resultado?.accion === "borrador") {
    const contenido = (
      <>
        <CheckCircle2 size={13} aria-hidden />
        <span>
          {resultado.enlace ? "Borrador listo · Abrir" : "Borrador listo"}
        </span>
      </>
    );
    return resultado.enlace ? (
      <a
        href={resultado.enlace}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
        title={`${resultado.detalle}. Ábrelo en Outlook, revísalo y envíalo desde ahí.`}
      >
        {contenido}
      </a>
    ) : (
      <span
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50"
        title={resultado.detalle}
      >
        {contenido}
      </span>
    );
  }

  if (resultado?.accion === "saltada") {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-amber-800 bg-amber-50"
        title={`No se escribió: ${resultado.detalle}`}
      >
        <AlertTriangle size={13} aria-hidden />
        <span>No se escribió</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onGenerar();
      }}
      disabled={ocupado}
      className="inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
      title={
        resultado?.accion === "error"
          ? `No se pudo: ${resultado.detalle} Aprieta para intentarlo de nuevo.`
          : "La IA escribe el seguimiento y lo deja de borrador en el hilo del cliente en Outlook. Nada se envía."
      }
    >
      {trabajando ? (
        <Loader2 size={13} className="animate-spin" aria-hidden />
      ) : (
        <Mail size={13} aria-hidden />
      )}
      <span>
        {trabajando
          ? "Escribiendo…"
          : resultado?.accion === "error"
            ? "Reintentar"
            : texto}
      </span>
    </button>
  );
}
