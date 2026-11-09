import type { ReactNode } from "react";
import {
  LINEA_DE_SECCION,
  PESTANA_DE_SECCION,
  type ColorDeSeccion,
} from "./coloresDeSeccion";

// EL TÍTULO DE UNA SECCIÓN: una pestaña de color fuerte con letra blanca y
// una línea fina del mismo color (Felipe, 09-11-2026, la opción 2 de la
// maqueta: así una sección no se confunde con la franja pastel de un
// evento). Lo usan la sábana de Planificación (Eventos, Personal de planta,
// Personal Staff) y los bloques del resumen del día. Ver coloresDeSeccion.ts.

export default function TituloDeSeccion({
  titulo,
  color,
  accion,
  encabezado = false,
  children,
}: {
  readonly titulo: string;
  readonly color: ColorDeSeccion;
  /** Un control chico pegado a la pestaña (ej: "+ cargo"). */
  readonly accion?: ReactNode;
  /** El título como encabezado (h3) y no como texto: para los bloques del
   *  resumen del día. */
  readonly encabezado?: boolean;
  /** Lo que va al final de la línea, a la derecha (ej: un subtotal). */
  readonly children?: ReactNode;
}) {
  const Titulo = encabezado ? "h3" : "span";
  return (
    <div
      className={`flex items-end gap-2 border-b-2 ${LINEA_DE_SECCION[color]}`}
    >
      <Titulo
        className={`rounded-t-md px-3 py-1 text-sm font-semibold text-white ${PESTANA_DE_SECCION[color]}`}
      >
        {titulo}
      </Titulo>
      {accion && <span className="self-center">{accion}</span>}
      {children && <span className="ml-auto pb-1">{children}</span>}
    </div>
  );
}
