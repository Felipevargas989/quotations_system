import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Cajita de sección de la casa (30-07, pedido de Felipe): reemplaza al
// <select> nativo de las filas del catálogo. Chip sobrio + menú
// flotante blanco, como los menús ⋮ del sistema. Sin buscador a
// propósito: para un puñado de secciones sería ruido.

interface Props {
  /** 0 = la opción "cero" (por defecto "Sin sección"). */
  readonly value: number;
  readonly options: { id: number; name: string }[];
  /** Recibe 0 para la opción "cero". */
  readonly onChange: (id: number) => void;
  readonly title?: string;
  readonly ariaLabel?: string;
  /** Etiqueta de la opción 0; null = sin opción cero (Tanda 3b). */
  readonly zeroLabel?: string | null;
  readonly disabled?: boolean;
  /** "md": altura y letra de campo de formulario (cotizador). */
  readonly size?: "sm" | "md";
  /** Colores propios del chip (borde/fondo/texto). Sin esto, el chip
   *  sobrio de siempre. Lo usa la cosecha del mes, donde el color ES
   *  la información (07-08). */
  readonly chipClass?: string;
  /** Ancho del chip; por defecto el de la fila del catálogo. */
  readonly widthClass?: string;
}

export default function SectionChipSelect({
  value,
  options,
  onChange,
  title,
  ariaLabel,
  zeroLabel = "Sin sección",
  disabled = false,
  size = "sm",
  chipClass,
  widthClass,
}: Props) {
  const [open, setOpen] = useState(false);
  // Si abajo no cabe, el menú se levanta hacia ARRIBA (pillada de
  // Felipe 03-08 en el "Día" al final de la pestaña Servicios).
  const [openUp, setOpenUp] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const actual =
    options.find((o) => o.id === value)?.name || zeroLabel || "";

  return (
    <span className="relative inline-block">
      <button
        type="button"
        ref={anchorRef}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open && anchorRef.current) {
            const r = anchorRef.current.getBoundingClientRect();
            const alto = Math.min(
              240,
              (options.length + (zeroLabel === null ? 0 : 1)) * 34 + 10,
            );
            const abajo = window.innerHeight - r.bottom;
            setOpenUp(abajo < alto && r.top > abajo);
          }
          setOpen((v) => !v);
        }}
        className={`flex items-center justify-between gap-1 border ${
          size === "md"
            ? "text-sm rounded-lg px-3 py-2"
            : "text-xs rounded-md px-2 py-1"
        } ${
          // Sin colores propios, el chip sobrio de siempre, hover
          // incluido: los 4 usos del catálogo y el cotizador tienen que
          // verse idénticos a antes (revisión del 07-08).
          chipClass
            ? `${chipClass} hover:brightness-95`
            : `bg-white hover:border-gray-300 ${
                size === "md"
                  ? "border-gray-300 text-gray-700"
                  : "border-gray-200 text-gray-500"
              }`
        } ${
          widthClass || (size === "md" ? "w-[150px]" : "w-[130px]")
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title={title}
        aria-label={ariaLabel}
      >
        <span className="truncate">{actual}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 ${chipClass ? "opacity-60" : "text-gray-400"}`}
        />
      </button>
      {open && (
        <>
          <span
            className="fixed inset-0 z-10 block"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <span
            className={`absolute right-0 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block max-h-60 overflow-y-auto ${
              openUp ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            {[
              ...(zeroLabel === null ? [] : [{ id: 0, name: zeroLabel }]),
              ...options,
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (o.id !== value) onChange(o.id);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                  o.id === value
                    ? "font-semibold text-gray-900"
                    : "text-gray-600"
                }`}
              >
                {o.name}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
