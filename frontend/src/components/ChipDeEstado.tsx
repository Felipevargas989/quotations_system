import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// EL CHIP DE ESTADO — PIEZA DE LA CASA (15-08)
//
// El estado como una píldora de color que se pincha y despliega los
// otros estados, cada uno con SU color. Nació en la ficha de una
// cotización ("Enviada ⌄") y Felipe pidió el mismo en la ficha de una
// persona: *"la desplegable de estado debería ser también idéntica a
// esa"*. En vez de copiarlo, la pieza.
//
// Vive en components/ a propósito: el portero cuenta los paneles
// flotantes escritos a mano fuera de esta carpeta, y su techo está
// justo. Una copia más habría dejado el CI en rojo — que es
// exactamente para lo que sirve ese candado.

export interface OpcionDeEstado {
  readonly value: string;
  readonly label: string;
  /** Las clases del chip: fondo y texto. Salen del diccionario de
   *  estados de cada módulo (estadoCotizacion, estadoPersona…). */
  readonly clases: string;
}

export default function ChipDeEstado({
  value,
  opciones,
  onChange,
  titulo = "Cambiar estado",
  tamano = "sm",
  disabled = false,
}: {
  readonly value: string;
  readonly opciones: readonly OpcionDeEstado[];
  readonly onChange: (value: string) => void;
  readonly titulo?: string;
  /** "sm" es el de la ficha comercial; "base" el de la ficha de una
   *  persona, donde la cabecera pide más peso. */
  readonly tamano?: "sm" | "base";
  readonly disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);

  // Se cierra al pinchar afuera y con Escape, como todo lo que se abre
  // en esta casa.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      window.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const actual = opciones.find((o) => o.value === value);

  return (
    <span ref={raiz} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setAbierto((v) => !v)}
        disabled={disabled}
        title={titulo}
        className={`flex items-center gap-1.5 font-semibold rounded-full disabled:opacity-60 ${
          tamano === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"
        } ${actual?.clases ?? "bg-gray-100 text-gray-600"}`}
      >
        {actual?.label ?? value}
        {!disabled && (
          <ChevronDown size={tamano === "sm" ? 12 : 16} className="shrink-0" />
        )}
      </button>

      {abierto && (
        <span className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block">
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setAbierto(false);
                onChange(o.value);
              }}
              className="block w-full text-left px-2.5 py-1.5 hover:bg-gray-50"
            >
              <span
                className={`block w-full font-semibold rounded-full ${
                  tamano === "sm"
                    ? "px-2.5 py-1 text-xs"
                    : "px-3 py-1.5 text-sm"
                } ${o.clases}`}
              >
                {o.label}
              </span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
