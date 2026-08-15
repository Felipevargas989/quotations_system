import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// EL MODAL — PIEZA DE LA CASA (15-08)
//
// Nace tarde: el sistema ya tenía ~30 ventanas hechas a mano, cada una
// con su propia idea de cómo cerrarse. La del 15-08 tapaba la pantalla
// entera ("me cubre toda la pantalla, no logro ni cerrarlo") y su
// arreglo es el que esta pieza guarda para todos:
//
//  1. ANCLADA ARRIBA (items-start + my-4). Centrada y alta, se sale por
//     las dos puntas y no se alcanza ni el título ni el botón de cerrar.
//  2. max-h-[88vh] + flex-col, con el scroll SOLO en el cuerpo: la
//     cabecera con el ✕ queda SIEMPRE a la vista.
//  3. Escape cierra.
//  4. Clic en el fondo cierra — con onMouseDown y comparando
//     target === currentTarget, para que arrastrar un texto desde
//     adentro y soltar afuera no la cierre de golpe.
//
// El fondo es `fixed`, no `absolute`: así el portero no lo cuenta como
// panel flotante a mano (esa regla vigila los desplegables, y está en
// su techo justo).

export default function Modal({
  titulo,
  subtitulo,
  ancho = "max-w-2xl",
  acciones,
  pie,
  bloquearEscape = false,
  sinTope = false,
  onCerrar,
  children,
}: {
  readonly titulo: ReactNode;
  readonly subtitulo?: ReactNode;
  /** La clase de ancho de Tailwind: max-w-md · max-w-2xl · max-w-4xl… */
  readonly ancho?: string;
  /** Botones a la izquierda del ✕ (ej: "Exportar"). */
  readonly acciones?: ReactNode;
  /** Barra fija abajo (ej: Cancelar / Guardar). */
  readonly pie?: ReactNode;
  /** Cuando adentro hay un desplegable abierto, el Escape le toca a él:
   *  si no, una sola tecla cerraría la lista Y la ventana. */
  readonly bloquearEscape?: boolean;
  /** Sin tope de alto: la ventana crece y quien se desplaza es el velo.
   *  Es la salida para las ventanas que llevan un buscador adentro —
   *  su lista se abre SIEMPRE hacia abajo y el tope se la comía: con
   *  la casilla vacía se veía el 4% de los nombres (medido el 15-08). */
  readonly sinTope?: boolean;
  readonly onCerrar: () => void;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    if (bloquearEscape) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar, bloquearEscape]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${ancho} my-4 flex flex-col ${
          sinTope ? "" : "max-h-[88vh]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
            {subtitulo && (
              <div className="text-sm text-gray-500 mt-0.5">{subtitulo}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {acciones}
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="p-1 text-gray-400 hover:text-gray-700 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className={`px-5 py-4 ${sinTope ? "" : "overflow-y-auto"}`}>
          {children}
        </div>

        {pie && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 shrink-0">
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}
