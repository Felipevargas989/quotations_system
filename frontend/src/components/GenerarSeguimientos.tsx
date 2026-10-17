import { Loader2, Mail } from "lucide-react";
import ConfirmInline from "./ConfirmInline";
import {
  TOPE_POR_VEZ,
  type useSeguimientoConIA,
} from "../hooks/useSeguimientoConIA";

// «✉ Generar seguimientos (N)» arriba del tablero (17-10-2026, doc 18): la
// IA escribe, de a uno, el seguimiento de cada cotización cuyo próximo
// contacto venció y es por correo, y lo deja de borrador en Outlook. Nada
// se envía. Con borde violeta: es de segundo nivel; el único botón de color
// fuerte de la barra es Nueva Cotización (Felipe, 17-10).
//
// La pregunta va en su propia franja, debajo de la fila de acciones, y el
// botón se queda donde está: dentro de la fila empujaba los demás botones
// a otra línea (Felipe, 17-10: "y eso hay que ordenar"). En azul: el rojo
// de ConfirmInline es para lo que destruye.

type Seguimiento = ReturnType<typeof useSeguimientoConIA>;

/** Lo que falta en esta visita: lo que ya salió o se saltó no se vuelve a
 *  pedir (lo que falló, sí). */
const porGenerarDe = (seguimiento: Seguimiento) =>
  seguimiento.pendientes.filter((p) => {
    const r = seguimiento.resultadoDe(p.id);
    return !r || r.accion === "error";
  });

export default function GenerarSeguimientos({
  seguimiento,
  confirmando,
  onConfirmando,
}: {
  readonly seguimiento: Seguimiento;
  readonly confirmando: boolean;
  readonly onConfirmando: (si: boolean) => void;
}) {
  const porGenerar = porGenerarDe(seguimiento);
  const { lote } = seguimiento;
  if (porGenerar.length === 0 && !lote) return null;
  return (
    <button
      type="button"
      onClick={() => onConfirmando(!confirmando)}
      disabled={seguimiento.ocupado}
      aria-expanded={confirmando}
      className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap border border-violet-600 text-violet-800 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed ${
        confirmando ? "bg-violet-100" : "bg-white hover:bg-violet-50"
      }`}
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

/** La franja de la pregunta, a lo ancho, debajo de la fila de acciones. */
export function ConfirmarSeguimientos({
  seguimiento,
  onCerrar,
}: {
  readonly seguimiento: Seguimiento;
  readonly onCerrar: () => void;
}) {
  const porGenerar = porGenerarDe(seguimiento);
  const cuantos = Math.min(porGenerar.length, TOPE_POR_VEZ);
  if (cuantos === 0) return null;
  return (
    <div className="flex justify-end rounded-lg bg-violet-50 px-3 py-2">
      <ConfirmInline
        tono="normal"
        question={`¿Escribir con IA ${cuantos} seguimiento${cuantos === 1 ? "" : "s"}? Quedan de borrador en Outlook; nada se envía.`}
        yesLabel="Sí, escribir"
        onYes={() => {
          onCerrar();
          void seguimiento.generarTodos(
            porGenerar.map((p) => ({ id: p.id, numero: p.quotation_number })),
          );
        }}
        onNo={onCerrar}
      />
    </div>
  );
}
