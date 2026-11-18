/**
 * EL TIPO QUE RIGE UN DÍA (doc 10 §12, 17-11-2026).
 *
 * Planta o freelance ya no es un solo valor de la ficha: cada cambio queda
 * en `historial_de_tipo` con el día DESDE el que rige (Felipe: *"la
 * ventana desde desarrollemos en el laboratorio"*; Sofía pasó a planta el
 * 01-11 y se registró después). El tipo de un día se DERIVA de ahí:
 *
 *   - el último cambio con `desde` <= ese día manda;
 *   - antes del primer cambio rige su `anterior`;
 *   - sin historial, rige `default_kind` (lo de siempre).
 *
 * Así un cambio a futuro no necesita reloj: quien pregunta por un día
 * recibe el tipo de ese día, y la proyección de la planta (que mira un año
 * hacia adelante) le carga sus días desde la fecha.
 */

export type Tipo = 'planta' | 'freelance';

export interface CambioDeTipo {
  id?: number;
  person_id?: number;
  kind: Tipo;
  anterior: Tipo;
  /** AAAA-MM-DD (la base guarda `date`). */
  desde: string;
  registrado_en?: string | null;
  registrado_por_nombre?: string | null;
}

export interface ConHistorial {
  default_kind?: string | null;
  historial_tipo?: readonly CambioDeTipo[] | null;
}

const dia = (fecha: string) => String(fecha).slice(0, 10);
const momento = (c: CambioDeTipo) => Date.parse(c.registrado_en ?? '') || 0;

/** Del más viejo al más nuevo; con el mismo `desde`, manda el último que
 *  se registró. */
export const ordenarHistorial = (
  historial: readonly CambioDeTipo[] | null | undefined,
): CambioDeTipo[] =>
  [...(historial ?? [])].sort(
    (a, b) =>
      dia(a.desde).localeCompare(dia(b.desde)) ||
      momento(a) - momento(b) ||
      (a.id ?? 0) - (b.id ?? 0),
  );

/** El tipo que rige ese día (AAAA-MM-DD). */
export const tipoALaFecha = (persona: ConHistorial, fecha: string): Tipo => {
  const historial = ordenarHistorial(persona.historial_tipo);
  if (historial.length === 0) {
    return persona.default_kind === 'planta' ? 'planta' : 'freelance';
  }
  let tipo: Tipo = historial[0].anterior;
  for (const cambio of historial) {
    if (dia(cambio.desde) > dia(fecha)) break;
    tipo = cambio.kind;
  }
  return tipo;
};

/** El próximo cambio que todavía no rige: «Pasa a planta el 01-11». */
export const proximoCambio = (
  persona: ConHistorial,
  hoy: string,
): CambioDeTipo | null =>
  ordenarHistorial(persona.historial_tipo).find(
    (c) => dia(c.desde) > dia(hoy),
  ) ?? null;

/** ¿Es (o será) de planta algún día desde hoy? Quien pasa a planta el
 *  01-11 tiene que entrar a la proyección aunque hoy sea freelance. */
export const esPlantaDesde = (persona: ConHistorial, hoy: string): boolean =>
  tipoALaFecha(persona, hoy) === 'planta' ||
  ordenarHistorial(persona.historial_tipo).some(
    (c) => dia(c.desde) > dia(hoy) && c.kind === 'planta',
  );

/** ¿Ese día le toca su jornada de planta? Activa, de planta ESE día y no
 *  en su día libre. El evento lo descuenta quien llama. */
export const leTocaPlanta = (
  persona: ConHistorial & {
    status?: string | null;
    days_off?: number[] | null;
  },
  fecha: string,
): boolean =>
  persona.status === 'activa' &&
  tipoALaFecha(persona, fecha) === 'planta' &&
  !(persona.days_off ?? []).includes(
    new Date(`${dia(fecha)}T00:00:00Z`).getUTCDay(),
  );

/** La persona como la lee el resto del motor: con su historial a mano y
 *  `default_kind` = el tipo que rige HOY. Un cambio a futuro que ya llegó
 *  se ve sin esperar a que alguien lo guarde. */
export const conTipoVigente = <P extends ConHistorial & { id: number }>(
  persona: P,
  historial: readonly CambioDeTipo[],
  hoy: string,
): P & { historial_tipo: CambioDeTipo[] } => {
  const suyo = ordenarHistorial(
    historial.filter((c) => c.person_id == null || c.person_id === persona.id),
  );
  const conHistorial = { ...persona, historial_tipo: suyo };
  return { ...conHistorial, default_kind: tipoALaFecha(conHistorial, hoy) };
};

/** Hoy en Chile, AAAA-MM-DD. */
export const hoyEnChile = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
