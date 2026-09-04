import { formatoHoras, horasTrabajadas } from "../../components/inputs";
import { horarioHabitual } from "./MiniCalendario";
import type { Asignacion, Persona } from "../../types/people.types";

/**
 * LA ADVERTENCIA DE HORAS, donde se asignan las horas (Felipe, 04-09,
 * segunda vuelta del capítulo 11): en la ventana de la pregunta todavía
 * no hay jornada definida —no se sabe si vendrá 5, 10 o 12 horas—, así
 * que la advertencia vive en los editores de horario, cuando el número
 * ya es de verdad.
 *
 * La semana laboral se suma SOLO con las jornadas marcadas PLANTA,
 * estén donde estén (restaurante, o un evento adonde la llevó el imán).
 * Las jornadas freelance son acuerdos aparte —"pasan casi en negro"—
 * y no tocan su semana. La jornada definida sale de la ficha: días no
 * libres × horario habitual.
 *
 * Solo aparece cuando la semana queda PASADA: el exceso son horas
 * extra que se pagan a fin de mes — o una falta laboral. Si calza,
 * no ensucia el editor.
 */

const hhmm = (v: string | null | undefined) => v?.slice(0, 5) ?? null;

const diaMas = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const horasHabituales = (persona: Persona, dia: string) => {
  const h = horarioHabitual(persona, dia);
  return horasTrabajadas(h.in, h.out, h.break) ?? 0;
};

export default function AdvertenciaHorasSemana({
  persona,
  dia,
  jornadas,
}: {
  readonly persona: Persona;
  /** El día que se está editando: define cuál semana se suma. */
  readonly dia: string;
  /** Sus jornadas del rango cargado (de esa persona, de todos lados). */
  readonly jornadas: readonly Asignacion[];
}) {
  const domingo = diaMas(dia, -new Date(`${dia}T00:00:00Z`).getUTCDay());
  const sabado = diaMas(domingo, 6);

  const horas = jornadas
    .filter((a) => {
      const d = String(a.day).slice(0, 10);
      return (
        d >= domingo &&
        d <= sabado &&
        a.kind === "planta" &&
        a.ajuste !== "descansa" &&
        !a.solo_propina
      );
    })
    .reduce((t, a) => {
      const hab = horarioHabitual(persona, String(a.day).slice(0, 10));
      return (
        t +
        (horasTrabajadas(
          hhmm(a.starts_at) ?? hab.in,
          hhmm(a.ends_at) ?? hab.out,
          a.break_minutes ?? hab.break,
        ) ?? 0)
      );
    }, 0);

  const definidas = [0, 1, 2, 3, 4, 5, 6].reduce((t, n) => {
    const d = diaMas(domingo, n);
    const dw = new Date(`${d}T00:00:00Z`).getUTCDay();
    if ((persona.days_off ?? []).includes(dw)) return t;
    return t + horasHabituales(persona, d);
  }, 0);

  if (horas <= definidas) return null;

  return (
    <p className="text-xs bg-amber-50 text-amber-900 rounded-lg px-3 py-2">
      Esa semana queda con <strong>{formatoHoras(horas)}</strong> de
      planta: <strong>{formatoHoras(horas - definidas)} extra</strong>{" "}
      sobre las {formatoHoras(definidas)} de su jornada definida. Se
      pagan a fin de mes — o se ajusta su semana en su calendario.
    </p>
  );
}
