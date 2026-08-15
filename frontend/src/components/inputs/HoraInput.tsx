import SelectWithSearch from "../selects/SelectWithSearch";
import type { SelectOption } from "../selects/types";

// CAMPO DE HORA — PIEZA DE LA CASA (15-08)
//
// Todas las horas del sistema se ven y se comportan igual. Antes había
// UNA hora hecha a mano (la ficha de cocina de Post-Venta); la pieza
// nació justo antes de la primera copia.
//
// NO usa el <input type="time"> del navegador. Se probó y Chrome
// **ignora el salto de 15 minutos**: por más que se le pida con `step`,
// su desplegable sigue mostrando 00, 01, 02, 03… (Felipe, 15-08:
// "solamente quiero que aparezcan menos cantidad de números cuando elijo
// la hora"). Además obliga a pelear con el a.m./p.m.
//
// Por eso la hora es un desplegable de la casa con las 96 horas del día
// en cuartos: 00:00, 00:15, 00:30, 00:45, 01:00… Se puede teclear "13" y
// filtra. Si un dato viejo trae una hora que no cae en un cuarto, se
// muestra igual y sigue valiendo — nunca se pierde nada.
//
// El portero vigila `type="time"` fuera de components/ con techo 0.

/** Las 96 horas del día, de a cuarto. */
const CUARTOS: SelectOption[] = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

export default function HoraInput({
  value,
  onChange,
  disabled = false,
  compacta = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  /** "HH:MM" o null si no hay hora. */
  readonly value: string | null;
  readonly onChange: (valor: string | null) => void;
  readonly disabled?: boolean;
  /** La versión chica, para vivir dentro de una fila. */
  readonly compacta?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
}) {
  const actual = value?.slice(0, 5) ?? "";
  // Una hora guardada que no cae en un cuarto (dato viejo, o puesta a
  // mano en la base) igual se ve y se puede conservar.
  const opciones = CUARTOS.some((o) => o.value === actual)
    ? CUARTOS
    : actual
      ? [{ value: actual, label: actual }, ...CUARTOS]
      : CUARTOS;

  return (
    <div
      className={`${compacta ? "w-24" : "w-28"} ${className}`}
      aria-label={ariaLabel}
    >
      <SelectWithSearch
        options={opciones}
        value={actual}
        onChange={(v) => onChange(v || null)}
        disabled={disabled}
        placeholder="--:--"
        searchPlaceholder="13:00"
        noResultsText="No existe esa hora"
        tamano={compacta ? "sm" : "base"}
        mostrarConteo={false}
      />
    </div>
  );
}

/**
 * Las horas trabajadas entre dos horas, descontando la colación.
 * Si la salida es "antes" que la entrada, se asume que cruza medianoche
 * (entra 22:00, sale 02:00 → 4 horas). Devuelve null si falta un dato.
 */
export const horasTrabajadas = (
  entrada: string | null,
  salida: string | null,
  colacionMinutos: number | null,
): number | null => {
  if (!entrada || !salida) return null;
  const [eh, em] = entrada.split(":").map(Number);
  const [sh, sm] = salida.split(":").map(Number);
  if ([eh, em, sh, sm].some(Number.isNaN)) return null;
  let minutos = sh * 60 + sm - (eh * 60 + em);
  if (minutos < 0) minutos += 24 * 60; // cruza medianoche
  minutos -= colacionMinutos || 0;
  return Math.max(0, minutos) / 60;
};

/** "8 h" · "8,5 h" — con la coma decimal chilena. */
export const formatoHoras = (horas: number | null): string =>
  horas === null
    ? "—"
    : `${horas.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`;
