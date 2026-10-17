import { Lock } from "lucide-react";
import { useId } from "react";
import { comentarioNoCargado } from "../utils/comentarioInterno";

// LOS DOS COMENTARIOS DE UN EVENTO (17-10-2026). Felipe: "cada
// requerimiento debería tener dos campos de comentario, uno que lo ve el
// cliente y otro interno". La misma pieza en Recepción (RequestForm) y en
// el cotizador: se arregla acá y las dos pantallas la reciben.
//
// - Observaciones: las ve el cliente, salen en el PDF.
// - Comentario interno: solo el equipo; ahí van las instrucciones para
//   armar la cotización ("menú económico, tres días, con desayuno").
//   Nunca sale al cliente.
interface Props {
  observaciones: string | undefined;
  onObservaciones: (valor: string) => void;
  /** undefined = la cotización llegó sin el campo: se muestra bloqueado. */
  comentarioInterno: string | null | undefined;
  onComentarioInterno: (valor: string) => void;
  deshabilitado?: boolean;
}

const caja =
  "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent resize-y disabled:bg-gray-100 disabled:cursor-not-allowed";

export default function ComentariosDelEvento({
  observaciones,
  onObservaciones,
  comentarioInterno,
  onComentarioInterno,
  deshabilitado = false,
}: Props) {
  const id = useId();
  const noCargado = comentarioNoCargado(comentarioInterno);

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${id}-obs`}
          className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-gray-700"
        >
          Observaciones
          <span className="text-xs font-normal text-gray-500">
            las ve el cliente: salen en el PDF
          </span>
        </label>
        <textarea
          id={`${id}-obs`}
          value={observaciones ?? ""}
          onChange={(e) => onObservaciones(e.target.value)}
          rows={4}
          disabled={deshabilitado}
          className={`${caja} border-gray-300 focus:ring-blue-500`}
          placeholder="Detalles adicionales, requerimientos especiales, etc."
        />
      </div>
      <div>
        <label
          htmlFor={`${id}-interno`}
          className="mb-1 flex flex-wrap items-center gap-x-2 text-sm font-medium text-gray-700"
        >
          <span className="flex items-center gap-1.5">
            <Lock size={14} className="text-amber-600" aria-hidden />
            Comentario interno
          </span>
          <span className="text-xs font-normal text-gray-500">
            solo el equipo: nunca sale al cliente
          </span>
        </label>
        <textarea
          id={`${id}-interno`}
          value={comentarioInterno ?? ""}
          onChange={(e) => onComentarioInterno(e.target.value)}
          rows={3}
          maxLength={5000}
          disabled={deshabilitado || noCargado}
          className={`${caja} border-amber-200 bg-amber-50 focus:ring-amber-400`}
          placeholder="Instrucciones para armar la cotización: menú económico, tres días, con desayuno…"
        />
        {noCargado && (
          <p className="mt-1 text-xs text-amber-700">
            No se pudo cargar el comentario interno. Recarga la página para
            editarlo.
          </p>
        )}
      </div>
    </div>
  );
}
