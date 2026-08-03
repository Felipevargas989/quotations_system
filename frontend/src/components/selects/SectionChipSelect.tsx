import { useState } from "react";
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
}

export default function SectionChipSelect({
  value,
  options,
  onChange,
  title,
  ariaLabel,
  zeroLabel = "Sin sección",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const actual =
    options.find((o) => o.id === value)?.name || zeroLabel || "";

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        className={`flex items-center justify-between gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-500 bg-white hover:border-gray-300 w-[130px] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title={title}
        aria-label={ariaLabel}
      >
        <span className="truncate">{actual}</span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
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
          <span className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block max-h-60 overflow-y-auto">
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
