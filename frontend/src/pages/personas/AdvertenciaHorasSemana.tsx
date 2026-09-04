import { formatoHoras, horasTrabajadas } from "../../components/inputs";
import { horarioHabitual } from "./MiniCalendario";
import type { Asignacion, Persona } from "../../types/people.types";

/**
 * LAS HORAS DE LA SEMANA DE PLANTA (Felipe, 04-09, capítulo 11).
 *
 * La semana laboral se suma SOLO con las jornadas marcadas PLANTA,
 * estén donde estén (restaurante, o un evento adonde la llevó el
 * imán). Las jornadas freelance son acuerdos aparte —"pasan casi en
 * negro"— y no tocan su semana. La jornada definida sale de la ficha:
 * días no libres × horario habitual.
 *
 * Un solo cálculo alimenta las dos caras de la advertencia:
 * - la LÍNEA en los editores de horario (este componente), y
 * - el RELOJ ROJO en las celdas del calendario (diasConExceso) — "un
 *   ícono con el día que se pasó de horas", pedido al ver que en la
 *   ventana de la pregunta el número aún no existe: la advertencia
 *   vive donde se asignan las horas, cuando ya es de verdad.
 *
 * Solo avisa cuando la semana queda PASADA: el exceso son horas extra
 * que se pagan a fin de mes — o una falta laboral. Si calza, silencio.
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

/** Las horas reales de una jornada, con el habitual de respaldo. */
const horasDeLaJornada = (persona: Persona, a: Asignacion) => {
  const hab = horarioHabitual(persona, String(a.day).slice(0, 10));
  return (
    horasTrabajadas(
      hhmm(a.starts_at) ?? hab.in,
      hhmm(a.ends_at) ?? hab.out,
      a.break_minutes ?? hab.break,
    ) ?? 0
  );
};

/** Sus jornadas DE PLANTA de la semana (dom a sáb) que contiene `dia`.
 *  Se defiende de insumos crudos: ni dormidas ni filas solo-propina. */
const semanaDePlanta = (dia: string, jornadas: readonly Asignacion[]) => {
  const domingo = diaMas(dia, -new Date(`${dia}T00:00:00Z`).getUTCDay());
  const sabado = diaMas(domingo, 6);
  return {
    domingo,
    dePlanta: jornadas.filter((a) => {
      const d = String(a.day).slice(0, 10);
      return (
        d >= domingo &&
        d <= sabado &&
        a.kind === "planta" &&
        a.ajuste !== "descansa" &&
        !a.solo_propina
      );
    }),
  };
};

/** Horas de planta vs jornada definida, de la semana de ese día. */
export const resumenSemanaDePlanta = (
  persona: Persona,
  dia: string,
  jornadas: readonly Asignacion[],
) => {
  const { domingo, dePlanta } = semanaDePlanta(dia, jornadas);
  const horas = dePlanta.reduce(
    (t, a) => t + horasDeLaJornada(persona, a),
    0,
  );
  const definidas = [0, 1, 2, 3, 4, 5, 6].reduce((t, n) => {
    const d = diaMas(domingo, n);
    if ((persona.days_off ?? []).includes(n)) return t;
    return t + horasHabituales(persona, d);
  }, 0);
  return { horas, definidas };
};

/**
 * EL RELOJ ROJO: los días a marcar en el calendario, con su aviso.
 *
 * En una semana pasada de horas se marcan los días EXTRAORDINARIOS —
 * los trabajados fuera de patrón (su día libre) y los de patrón con el
 * horario alargado. La marca sigue el neto de la semana: un día extra
 * que quedó compensado (se quitó otro día) no se marca, y el reloj se
 * queda en el día que originó el exceso, como pidió Felipe: "la
 * diferencia debería mantener las horas extras en el día que se
 * agregó de manera extraordinaria".
 */
export const diasConExceso = (
  persona: Persona | null,
  dias: readonly string[],
  jornadas: readonly Asignacion[],
): Map<string, string> => {
  const marcas = new Map<string, string>();
  if (!persona || persona.default_kind !== "planta") return marcas;

  const domingos = new Set(
    dias.map((d) => diaMas(d, -new Date(`${d}T00:00:00Z`).getUTCDay())),
  );
  for (const domingo of domingos) {
    const { horas, definidas } = resumenSemanaDePlanta(
      persona,
      domingo,
      jornadas,
    );
    if (horas <= definidas) continue;
    const aviso = `Esa semana queda con ${formatoHoras(horas)} de planta: ${formatoHoras(
      horas - definidas,
    )} extra sobre las ${formatoHoras(definidas)} de su jornada definida.`;
    for (const a of semanaDePlanta(domingo, jornadas).dePlanta) {
      const d = String(a.day).slice(0, 10);
      const libre = (persona.days_off ?? []).includes(
        new Date(`${d}T00:00:00Z`).getUTCDay(),
      );
      const alargado =
        horasDeLaJornada(persona, a) > horasHabituales(persona, d) + 0.001;
      if (libre || alargado) marcas.set(d, aviso);
    }
  }
  return marcas;
};

/** La línea de los editores de horario. Solo aparece con exceso. */
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
  const { horas, definidas } = resumenSemanaDePlanta(persona, dia, jornadas);
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
