// POR QUÉ PERDIMOS (06-08-2026, migración 61). Nació de un dato medido:
// el ticket promedio de las cotizaciones GANADAS ($3.025.652) y el de las
// PERDIDAS ($3.028.883) son prácticamente idénticos — o sea, el precio NO
// explica las derrotas. Sin registrar el motivo, 170 cotizaciones perdidas
// no enseñan nada.
//
// Dos listas distintas a propósito (decisión de Felipe): perder una venta
// y que se caiga un evento ya ganado duelen distinto. El motivo es
// OBLIGATORIO —de un clic— porque si es opcional nadie lo llena y en tres
// meses el dato no existe. El comentario es opcional y viaja como nota al
// hilo de seguimiento, salvo en "Otro", donde se exige.
import { useState } from "react";

export type MotivoTipo = "rechazo" | "anulacion";

export const MOTIVOS_RECHAZO = [
  { v: "precio", l: "Precio", d: "Nos encontró caros o no le daba el presupuesto" },
  { v: "fecha_no_disponible", l: "Fecha no disponible", d: "Queríamos, pero el día ya estaba tomado" },
  { v: "otro_proveedor", l: "Eligió otro proveedor", d: "Compitió y perdimos" },
  { v: "no_respondio", l: "No respondió", d: "Se enfrió, nunca hubo respuesta" },
  { v: "desistio", l: "Desistió del evento", d: "No se hace el evento, con nadie" },
  { v: "otro", l: "Otro", d: "Cuéntalo en el comentario" },
] as const;

export const MOTIVOS_ANULACION = [
  { v: "cliente_cancelo", l: "El cliente canceló", d: "Se arrepintió o cambió de planes" },
  { v: "cambio_fecha", l: "Se movió de fecha", d: "No se perdió: se reagenda" },
  { v: "problema_pago", l: "Problema de pago", d: "No llegó el abono o no cumplió" },
  { v: "no_pudimos", l: "No pudimos atenderlo", d: "Problema nuestro" },
  { v: "otro", l: "Otro", d: "Cuéntalo en el comentario" },
] as const;

// Etiqueta legible de un motivo guardado (para fichas y Dashboard).
export const etiquetaMotivo = (v?: string | null): string => {
  if (!v) return "";
  const todos = [...MOTIVOS_RECHAZO, ...MOTIVOS_ANULACION];
  return todos.find((m) => m.v === v)?.l || v;
};

export default function MotivoPerdida({
  tipo,
  titulo,
  onConfirmar,
  onCancelar,
  guardando = false,
}: {
  readonly tipo: MotivoTipo;
  readonly titulo?: string;
  // El comentario viaja aparte: quien llama decide si lo anota en el hilo.
  readonly onConfirmar: (motivo: string, comentario: string) => void;
  readonly onCancelar: () => void;
  readonly guardando?: boolean;
}) {
  const opciones = tipo === "rechazo" ? MOTIVOS_RECHAZO : MOTIVOS_ANULACION;
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  // "Otro" sin explicación no enseña nada: ahí el comentario es obligatorio.
  const faltaDetalle = motivo === "otro" && !comentario.trim();
  const puede = !!motivo && !faltaDetalle && !guardando;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      onClick={onCancelar}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-base font-bold text-gray-900">
            {titulo ||
              (tipo === "rechazo" ? "¿Por qué la perdimos?" : "¿Por qué se anula?")}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Queda registrado para saber qué mejorar. Un clic basta.
          </p>
        </div>

        <div className="px-5 py-2 space-y-1.5">
          {opciones.map((o) => {
            const activo = motivo === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setMotivo(o.v)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${
                  activo
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`block text-sm font-semibold ${
                    activo ? "text-blue-900" : "text-gray-800"
                  }`}
                >
                  {o.l}
                </span>
                <span className="block text-[11px] text-gray-500">{o.d}</span>
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-4 pt-1 space-y-2.5">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder={
              motivo === "otro"
                ? "Cuéntanos qué pasó (obligatorio)"
                : "Comentario (opcional) — queda en el hilo de seguimiento"
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelar}
              disabled={guardando}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirmar(motivo, comentario.trim())}
              disabled={!puede}
              title={
                !motivo
                  ? "Elige un motivo"
                  : faltaDetalle
                    ? "Cuéntanos qué pasó"
                    : undefined
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
