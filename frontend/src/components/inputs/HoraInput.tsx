// CAMPO DE HORA — PIEZA DE LA CASA (15-08)
//
// Envuelve el <input type="time"> nativo con el estilo de la casa, para
// que todas las horas del sistema se vean y se comporten igual. Antes de
// esta pieza había UNA hora hecha a mano (la ficha de cocina de
// Post-Venta) y la etapa de horarios del módulo de Personal iba a crear
// la segunda: la pieza nace justo antes de la primera copia.
//
// El portero vigila `type="time"` fuera de components/ con techo 0.

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
  const base = compacta
    ? "border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white"
    : "border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  return (
    <input
      type="time"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
    />
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
