import type { ReactNode } from "react";

/**
 * EL DETALLE SIN ABANDONAR LA TABLA.
 *
 * Nace de la nómina consolidada: una cifra junta siete días de
 * restaurante y dos eventos, y al pagar en el banco hay que poder
 * responder "¿por qué $500.000?" sin salir de la pantalla (Felipe,
 * 16-08: "pasar el mouse por el dinero y que el hover me muestre a qué
 * corresponde").
 *
 * Es solo lectura y se abre con CSS —nada de estado ni de posición
 * calculada—, así que no compite con los paneles de la casa
 * (SelectWithSearch y compañía), que sí eligen valores.
 *
 * Se abre hacia arriba y se centra sobre lo que explica. Al vivir en un
 * contenedor con overflow puede quedar cortado: por eso el disparador
 * también lleva `title`, que el navegador muestra igual.
 */
export default function Tooltip({
  contenido,
  titulo,
  children,
  lado = "centro",
}: {
  /** Lo que se muestra al pasar el mouse. */
  readonly contenido: ReactNode;
  /** El mismo detalle en texto plano: teclado, lectores y desbordes. */
  readonly titulo: string;
  readonly children: ReactNode;
  /** Hacia dónde crece. En la última columna de una tabla se abre
   *  hacia la izquierda: centrado se salía por el borde y el contenedor
   *  lo cortaba (Felipe, 17-08). */
  readonly lado?: "centro" | "izquierda" | "derecha";
}) {
  const posicion =
    lado === "izquierda"
      ? "right-0"
      : lado === "derecha"
        ? "left-0"
        : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex" title={titulo}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute bottom-full z-30 mb-1.5 w-max max-w-xs rounded-lg bg-gray-900 px-2.5 py-1.5 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 ${posicion}`}
      >
        {contenido}
      </span>
    </span>
  );
}
