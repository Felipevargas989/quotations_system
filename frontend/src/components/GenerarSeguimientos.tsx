import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "./ConfirmInline";
import {
  TOPE_POR_VEZ,
  type useSeguimientoConIA,
} from "../hooks/useSeguimientoConIA";

// «✉ Generar seguimientos (N)» arriba del tablero (17-10-2026, doc 18): la
// IA escribe, de a uno, el seguimiento de cada cotización cuyo próximo
// contacto venció y es por correo, y lo deja de borrador en Outlook. Nada
// se envía. La pregunta va en la misma línea (kit de la casa:
// ConfirmInline), como «Generar todas» de Requerimientos.
export default function GenerarSeguimientos({
  seguimiento,
}: {
  readonly seguimiento: ReturnType<typeof useSeguimientoConIA>;
}) {
  const [confirmar, setConfirmar] = useState(false);
  // Lo que ya salió o se saltó en esta visita no se vuelve a pedir.
  const porGenerar = seguimiento.pendientes.filter((p) => {
    const r = seguimiento.resultadoDe(p.id);
    return !r || r.accion === "error";
  });
  const { lote } = seguimiento;
  if (porGenerar.length === 0 && !lote) return null;
  const cuantos = Math.min(porGenerar.length, TOPE_POR_VEZ);

  if (confirmar) {
    return (
      <ConfirmInline
        question={`¿Escribir con IA ${cuantos} seguimiento${cuantos === 1 ? "" : "s"}? Quedan de borrador en Outlook; nada se envía.`}
        yesLabel="Sí, escribir"
        onYes={() => {
          setConfirmar(false);
          void seguimiento.generarTodos(
            porGenerar.map((p) => ({ id: p.id, numero: p.quotation_number })),
          );
        }}
        onNo={() => setConfirmar(false)}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirmar(true)}
      disabled={seguimiento.ocupado}
      className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
      title={`La IA escribe el seguimiento de las cotizaciones con el próximo contacto por correo vencido y lo deja de borrador en Outlook, de a uno (hasta ${TOPE_POR_VEZ} por vez).`}
    >
      {lote ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : (
        <Mail size={16} aria-hidden />
      )}
      <span>
        {lote
          ? `Escribiendo ${Math.min(lote.hecho + 1, lote.total)} de ${lote.total}…`
          : `Generar seguimientos (${porGenerar.length})`}
      </span>
    </button>
  );
}
