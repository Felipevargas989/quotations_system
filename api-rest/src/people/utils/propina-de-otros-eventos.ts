import { filaTraidaAlEvento } from './fila-traida-al-evento';

/**
 * LA PROPINA DE LOS OTROS EVENTOS DEL DÍA (Felipe, 19-11-2026; doc 10,
 * «La gente de los otros eventos del día»).
 *
 * Con dos o tres eventos los mismos días, el personal trabaja en todos:
 * *"todos participan en todo… a los que están asignados a B se les
 * castiga respecto a la A, y ambos trabajaron en todo"*. Por eso la ficha
 * de un evento trae, además de la planta y de los citados como staff, a
 * la gente ANOTADA en los otros eventos de la empresa esos mismos días.
 * Llega igual que el citado como staff (22-09): fila solo-de-propina, sin
 * monto (su jornada se paga en el otro evento) y con «sin propina» YA
 * marcado; Felipe lo desmarca si le quiere dar.
 *
 * Aquí viven solo las decisiones, como funciones puras (con prueba en
 * `tests/propina-de-otros-eventos.spec.ts`). Las lecturas y escrituras
 * están en `PropinaDeOtrosEventosService`.
 */

/** Lo que hace falta de una fila de `event_staff` para decidir. */
export interface FilaDelDia {
  id: number;
  quotation_id: string | null;
  person_id: number | null;
  day: string;
  role_id?: number | null;
  kind?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  break_minutes?: number | null;
  solo_propina?: boolean | null;
  ajuste?: string | null;
  no_tip?: boolean | null;
  amount?: number | string | null;
  tip_amount?: number | string | null;
  payroll_id?: number | null;
  tip_payroll_id?: number | null;
  /** El evento de la fila (Supabase entrega el número a veces como texto). */
  quotations?: {
    quotation_number?: number | string | null;
    quotation_status?: string | null;
  } | null;
}

/** Solo cuentan los eventos que de verdad se hacen: los mismos estados
 *  que la Liquidación lista. La gente que quedó puesta en un evento
 *  anulado (mapa 07: «la gente queda puesta… huérfana») no trabajó ahí. */
const ESTADOS_DEL_EVENTO = ['aceptada', 'realizada'];

const llave = (personId: number | null, day: string) =>
  `${String(personId)}|${String(day).slice(0, 10)}`;

const numeroDe = (f: FilaDelDia): number => {
  const n = Number(f.quotations?.quotation_number);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

/**
 * ¿ES UNA JORNADA DE EVENTO DE VERDAD? Con persona, que no sea silla
 * vacía, que no sea solo-de-propina (un traído no se vuelve a traer en
 * cadena), que no esté dormida y que no sea la planta que la ficha de ese
 * evento trajo (`kind = 'planta'` en un evento = la trajo la ficha; esa
 * persona ya llega por su turno de staff). En la práctica: los freelance
 * anotados en el evento.
 */
export const esJornadaRealDeEvento = (f: FilaDelDia): boolean =>
  f.quotation_id != null &&
  f.person_id != null &&
  !f.solo_propina &&
  f.kind !== 'planta' &&
  f.ajuste !== 'descansa';

/** El invitado al pozo del día tiene que venir de una jornada de evento:
 *  la fila solo-de-propina que una ficha trajo (del staff o de otro
 *  evento) no lo es, o la persona aparecería dos o tres veces en el día. */
export const noEsJornadaDeEvento = (
  f: Pick<FilaDelDia, 'quotation_id' | 'person_id' | 'solo_propina'> | null,
): boolean => !f || !f.quotation_id || f.person_id == null || !!f.solo_propina;

/** La fila que una ficha trajo para la propina (del staff o de otro
 *  evento). La planta traída no: esa lleva propina y es otra regla. */
export const esTraidaSoloPropina = (f: FilaDelDia): boolean =>
  !!f.solo_propina &&
  f.quotation_id != null &&
  f.person_id != null &&
  f.kind !== 'planta';

/** Una traída que nadie tocó: sin monto, sin propina, sin sello de
 *  nómina y con «sin propina» todavía marcado. Solo esa se puede borrar. */
export const traidaIntacta = (f: FilaDelDia): boolean =>
  !Number(f.amount ?? 0) &&
  !Number(f.tip_amount ?? 0) &&
  f.payroll_id == null &&
  f.tip_payroll_id == null &&
  f.no_tip === true;

export interface IndiceDeOrigenes {
  /** persona|día con jornada de staff (citado, no dormido). */
  staff: Set<string>;
  /** persona|día → sus jornadas de evento de verdad, de número menor a mayor. */
  eventos: Map<string, FilaDelDia[]>;
}

/** De dónde puede venir cada persona cada día, mirando todas las filas
 *  de esos días (de todos los eventos y del staff). */
export const indiceDeOrigenes = (filas: readonly FilaDelDia[]) => {
  const staff = new Set<string>();
  const eventos = new Map<string, FilaDelDia[]>();
  for (const f of filas) {
    if (f.person_id == null) continue;
    const k = llave(f.person_id, f.day);
    if (f.quotation_id == null) {
      if (!f.solo_propina && f.ajuste !== 'descansa') staff.add(k);
      continue;
    }
    if (!esJornadaRealDeEvento(f)) continue;
    const estado = f.quotations?.quotation_status;
    if (estado != null && !ESTADOS_DEL_EVENTO.includes(estado)) continue;
    eventos.set(k, [...(eventos.get(k) ?? []), f]);
  }
  for (const lista of eventos.values())
    lista.sort((a, b) => numeroDe(a) - numeroDe(b));
  return { staff, eventos } as IndiceDeOrigenes;
};

/**
 * EL ORIGEN DE UNA TRAÍDA en el evento `quotationId`: «staff» si esa
 * persona tuvo jornada de staff ese día (así entraba ya desde el 22-09, y
 * no se duplica), el otro evento de número menor si estuvo anotada en
 * otro, o null si ya no viene de ninguna parte (huérfana).
 */
export const origenDe = (
  indice: IndiceDeOrigenes,
  quotationId: string,
  personId: number | null,
  day: string,
): 'staff' | FilaDelDia | null => {
  const k = llave(personId, day);
  if (indice.staff.has(k)) return 'staff';
  return (
    (indice.eventos.get(k) ?? []).find((o) => o.quotation_id !== quotationId) ??
    null
  );
};

/**
 * A QUIÉN TRAER de los otros eventos: por cada persona y día del evento
 * en que estuvo anotada en otro evento, una fila solo-de-propina con el
 * cargo y el horario de esa jornada (la del evento de número menor si
 * fueron varios). Quien ya tiene fila en este evento ese día (anotado,
 * planta traída o staff traído) no se repite: abrir la ficha dos veces no
 * duplica. Y quien ese día fue staff entra por la regla del 22-09.
 */
export const traidasDeOtrosEventos = (p: {
  companyId: number;
  quotationId: string;
  dias: readonly string[];
  indice: IndiceDeOrigenes;
  yaEnEvento: readonly FilaDelDia[];
}) => {
  const dias = new Set(p.dias.map((d) => String(d).slice(0, 10)));
  const ocupado = new Set(
    p.yaEnEvento
      .filter((f) => f.person_id != null)
      .map((f) => llave(f.person_id, f.day)),
  );
  const nuevas: ReturnType<typeof filaTraidaAlEvento>[] = [];
  for (const [k, lista] of p.indice.eventos) {
    const origen = lista.find((o) => o.quotation_id !== p.quotationId);
    if (!origen) continue;
    if (!dias.has(String(origen.day).slice(0, 10))) continue;
    if (ocupado.has(k) || p.indice.staff.has(k)) continue;
    nuevas.push(
      filaTraidaAlEvento(p.companyId, p.quotationId, {
        ...origen,
        // Una jornada de evento de verdad nunca es planta (ver arriba):
        // la fila nace solo-de-propina y con «sin propina» marcado.
        kind: origen.kind ?? 'freelance',
      }),
    );
  }
  return nuevas;
};

/**
 * LAS TRAÍDAS HUÉRFANAS: las solo-de-propina de este evento cuya persona
 * ya no viene de ninguna parte ese día (la sacaron del otro evento o del
 * staff, la movieron de día, o el día ya no es del evento). Se borran
 * solo si nadie las tocó (`traidaIntacta`): una con monto, propina o
 * sello jamás se borra.
 */
export const huerfanas = (p: {
  quotationId: string;
  dias: readonly string[];
  indice: IndiceDeOrigenes;
  filasDelEvento: readonly FilaDelDia[];
}): number[] => {
  const dias = new Set(p.dias.map((d) => String(d).slice(0, 10)));
  return p.filasDelEvento
    .filter(
      (f) =>
        esTraidaSoloPropina(f) &&
        traidaIntacta(f) &&
        (!dias.has(String(f.day).slice(0, 10)) ||
          origenDe(p.indice, p.quotationId, f.person_id, f.day) === null),
    )
    .map((f) => f.id);
};

/**
 * LA ETIQUETA DE LA CAJA DEL MONTO (sin migración: se deriva al leer).
 * `origen_evento` es el número del otro evento de donde viene una traída
 * («evento 522» en la caja); null en todo lo demás, y en la traída del
 * staff o huérfana la pantalla dice «staff», como desde el 22-09.
 */
export const conOrigenDelEvento = <T extends FilaDelDia>(
  quotationId: string,
  filas: readonly T[],
  indice: IndiceDeOrigenes,
): (T & { origen_evento: number | null })[] =>
  filas.map((f) => {
    if (!esTraidaSoloPropina(f)) return { ...f, origen_evento: null };
    const origen = origenDe(indice, quotationId, f.person_id, f.day);
    const numero =
      origen && origen !== 'staff'
        ? Number(origen.quotations?.quotation_number)
        : NaN;
    return { ...f, origen_evento: Number.isFinite(numero) ? numero : null };
  });

/**
 * AL SACAR A ALGUIEN DE UN EVENTO O DEL STAFF, sus traídas de ese día en
 * los otros eventos se van también, si quedaron sin origen y nadie las
 * tocó (el molde de `removeStaff` con la fila solo-de-propina del día).
 * Una ficha cerrada no se toca.
 */
export const traidasSinOrigenTrasSacar = (p: {
  filasDeLaPersona: readonly FilaDelDia[];
  cerradas: ReadonlySet<string>;
}): number[] => {
  const indice = indiceDeOrigenes(p.filasDeLaPersona);
  return p.filasDeLaPersona
    .filter(
      (f) =>
        esTraidaSoloPropina(f) &&
        traidaIntacta(f) &&
        !p.cerradas.has(f.quotation_id as string) &&
        origenDe(indice, f.quotation_id as string, f.person_id, f.day) === null,
    )
    .map((f) => f.id);
};
