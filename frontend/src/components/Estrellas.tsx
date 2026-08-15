import { Star } from "lucide-react";

// LAS ESTRELLAS — PIEZA DE LA CASA (15-08, etapa de cierre del módulo
// de Personal).
//
// Muestra (y opcionalmente edita) la calificación de una persona.
// Reglas de la arquitectura que esta pieza respeta:
//  · Se muestra el PROMEDIO SIMPLE — sin fórmulas ponderadas escondidas.
//  · "Sin evaluar" NO es lo mismo que "malo": con value null se pinta
//    gris y chico, nunca como cero estrellas.
//  · Las notas pueden existir sin bajar la estrella — eso vive fuera de
//    esta pieza; acá solo estrellas.

export default function Estrellas({
  value,
  onChange,
  tamano = "md",
  conNumero = false,
}: {
  /** 1 a 5 (acepta decimales para promedios). NULL = sin evaluar. */
  readonly value: number | null;
  /** Si viene, las estrellas se pueden pinchar (modo evaluación). */
  readonly onChange?: (estrellas: number) => void;
  readonly tamano?: "sm" | "md";
  /** Muestra el promedio con un decimal al lado ("4,3"). */
  readonly conNumero?: boolean;
}) {
  const px = tamano === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  if (value === null && !onChange) {
    return (
      <span className="text-xs text-gray-400" title="Sin evaluar no es lo mismo que malo">
        sin evaluar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${String(n)} ${n === 1 ? "estrella" : "estrellas"}`}
            className="p-0.5"
          >
            <Star
              className={`${px} ${
                value !== null && n <= value
                  ? "text-amber-400 fill-amber-400"
                  : "text-gray-300 hover:text-amber-300"
              }`}
            />
          </button>
        ) : (
          <Star
            key={n}
            className={`${px} ${
              value !== null && n <= Math.round(value)
                ? "text-amber-400 fill-amber-400"
                : "text-gray-300"
            }`}
          />
        ),
      )}
      {conNumero && value !== null && (
        <span className="ml-1 text-xs tabular-nums text-gray-600">
          {value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}
        </span>
      )}
    </span>
  );
}
