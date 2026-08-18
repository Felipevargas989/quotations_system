/**
 * LA COLACIÓN, EN UN SOLO LUGAR.
 *
 * Vivía suelta dentro de la casilla de Planificación, así que en la
 * Liquidación no había cómo tocarla — y ahí es donde se nota: dos
 * personas con el mismo 09:00–19:00 mostraban 9,5 h y 9 h sin que se
 * viera por qué (Felipe, 16-08, mirando a Matías Zapata).
 *
 * Es la misma fila de la base en las dos pantallas, así que ajustarla
 * en cualquiera de ellas la deja ajustada en la otra. No hay dos
 * colaciones que sincronizar: hay una sola.
 *
 * No puede ser cero: siempre hay media hora o una hora (Felipe, 15-08).
 */
export default function SelectorColacion({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: number | null;
  readonly onChange: (minutos: number) => void;
  readonly disabled?: boolean;
}) {
  return (
    <span
      className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs shrink-0"
      title="Colación: se descuenta de las horas trabajadas"
    >
      {(
        [
          [30, "30 m"],
          [60, "1 h"],
        ] as const
      ).map(([min, texto]) => (
        <button
          key={min}
          type="button"
          disabled={disabled}
          onClick={() => onChange(min)}
          aria-pressed={(value || 0) === min}
          className={`px-1.5 py-0.5 disabled:opacity-50 ${
            // EN GRIS, NO AZUL (Felipe, 18-08): en la tabla de jornadas
            // el azul era el color más fuerte de la fila y no decía
            // nada. El color se guarda para lo que importa.
            (value || 0) === min
              ? "bg-gray-700 text-white"
              : "bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          {texto}
        </button>
      ))}
    </span>
  );
}
