import type {
  CartaDeEventia,
  EventoDeEventia,
} from '../eventia/eventia.repository';
import type { Oferente } from '../oferente/oferente.repository';

// "¿PUEDO CUMPLIR?" (Felipe, 17-10: "¿qué pasa si lo que están pidiendo no
// está en Eventia? ¿Qué pasa con ese caso borde?"). Después de leer las
// bases, cada exigencia técnica se compara con lo que la empresa tiene en
// Eventia —su carta, sus instalaciones y su agenda de ese día—:
//  - "tengo": la carta o las instalaciones lo cubren, y se dice con qué;
//  - "conseguir": no está en Eventia (un show, un músico, equipos): hay que
//    subcontratarlo, comprarlo o confirmarlo. Nunca se promete en los
//    documentos;
//  - "no_se_puede": SOLO con un dato duro (la capacidad, la distancia, la
//    agenda), y diciendo cuál. Lo decide siempre la empresa.
// Lo hace Sonnet 5.5 (no lee las bases: solo cruza listas).

export type EstadoDeCumplimiento = 'tengo' | 'conseguir' | 'no_se_puede';

export type ItemDeCumplimiento = {
  /** El número de la exigencia en la lista que se le dio (1, 2, 3…). */
  requisito: number;
  /** Su texto, para mostrarla aunque la lista cambie. */
  que: string;
  estado: EstadoDeCumplimiento;
  con_que: string;
  por_que: string;
};

export type Cumplimiento = {
  resumen: string;
  items: ItemDeCumplimiento[];
  /** La fecha cuya agenda se miró (AAAA-MM-DD), si se pudo. */
  agenda_de: string | null;
};

export const ESQUEMA_DE_CUMPLIMIENTO = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requisito: { type: 'integer' },
          estado: {
            type: 'string',
            enum: ['tengo', 'conseguir', 'no_se_puede'],
          },
          con_que: { type: 'string' },
          por_que: { type: 'string' },
        },
        required: ['requisito', 'estado', 'con_que', 'por_que'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'items'],
  additionalProperties: false,
} as const;

/** La carta en texto corto, sin precios. */
export const textoDeLaCarta = (c: CartaDeEventia): string[] => {
  const porSeccion = new Map<string, string[]>();
  for (const f of c.fijos) {
    const s = f.seccion ?? 'Sin sección';
    porSeccion.set(s, [...(porSeccion.get(s) ?? []), f.nombre]);
  }
  const fijos = [...porSeccion].map(
    ([seccion, nombres]) => `- ${seccion}: ${nombres.join('; ')}`,
  );
  return [
    'SERVICIOS FIJOS (por sección):',
    ...(fijos.length > 0 ? fijos : ['(ninguno)']),
    'MENÚS GUARDADOS (categoría, nombre y platos):',
    ...(c.menus.length > 0
      ? c.menus.map(
          (m) =>
            `- [${m.categoria}] ${m.nombre}${m.platos.length > 0 ? `: ${m.platos.join(', ')}` : ''}`,
        )
      : ['(ninguno)']),
    `PAQUETES: ${c.paquetes.length > 0 ? c.paquetes.join('; ') : '(ninguno)'}`,
  ];
};

/** Los eventos confirmados de ese día, o que no hay. */
export const textoDeLaAgenda = (
  fecha: string | null,
  eventos: EventoDeEventia[] | null,
): string[] => {
  if (!fecha || !eventos) {
    return ['SU AGENDA ESE DÍA: no se sabe la fecha del servicio.'];
  }
  if (eventos.length === 0) {
    return [`SU AGENDA EL ${fecha}: ningún evento confirmado.`];
  }
  return [
    `SU AGENDA EL ${fecha} (eventos ya confirmados; el complejo puede tener varios salones):`,
    ...eventos.map(
      (e) =>
        `- N° ${e.numero}: ${e.tipo ?? 'evento'}${e.personas ? `, ${e.personas} personas` : ''}${e.fijos.length > 0 ? `, con ${e.fijos.join(', ')}` : ''}`,
    ),
  ];
};

/** Los eventos realizados, para la experiencia (Anexo de experiencia). */
export const textoDeLaExperiencia = (eventos: EventoDeEventia[]): string[] =>
  eventos.length > 0
    ? eventos.map(
        (e) =>
          `- ${e.fecha ?? 's/f'} · ${e.tipo ?? 'evento'} · ${e.cliente ?? 'cliente sin nombre'}${e.personas ? ` · ${e.personas} personas` : ''}${e.monto ? ` · $${e.monto.toLocaleString('es-CL')} (total de la cotización)` : ''} · N° ${e.numero}`,
      )
    : ['(ningún evento realizado registrado en Eventia)'];

type Requisito = { que: string; tipo: string; obligatorio: boolean };

export type ContextoDeCumplimiento = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  lugar: string;
  tecnicos: Requisito[];
  oferente: Oferente | null;
  carta: CartaDeEventia;
  fecha: string | null;
  agenda: EventoDeEventia[] | null;
};

export const instruccionesDeCumplimiento = (
  c: ContextoDeCumplimiento,
): string =>
  [
    'Revisas si una empresa de eventos puede cumplir lo que pide una licitación pública de Chile, con lo que la empresa tiene registrado en su sistema (Eventia). No lees las bases: ya te las resumieron.',
    `La licitación es ${c.codigo}, "${c.nombre}"${c.organismo ? `, de ${c.organismo}` : ''}.${c.lugar ? ` Lugar según las bases: ${c.lugar}.` : ''}`,
    '',
    'LO QUE EXIGEN (las exigencias técnicas, numeradas):',
    ...c.tecnicos.map(
      (r, i) => `${i + 1}. ${r.que}${r.obligatorio ? '' : ' (opcional)'}`,
    ),
    '',
    'LAS INSTALACIONES DE LA EMPRESA (lo que ella escribió):',
    c.oferente?.instalaciones?.trim() || '(no las ha descrito)',
    `Comuna de la empresa: ${c.oferente?.comuna ?? '(no informada)'}.`,
    '',
    'SU CARTA EN EVENTIA (lo que vende hoy, sin precios):',
    ...textoDeLaCarta(c.carta),
    '',
    ...textoDeLaAgenda(c.fecha, c.agenda),
    '',
    'Para CADA exigencia, con su número en "requisito", decide:',
    '- "tengo": la carta o las instalaciones lo cubren. En "con_que", con qué, con el nombre exacto del menú, servicio, paquete o salón (por ejemplo: "Menú guardado [Cena] Plateada" o "Salón principal, 300 personas").',
    '- "conseguir": no está en lo que te pasé: hay que subcontratarlo, comprarlo o confirmarlo (un show, un músico, equipos, un certificado). En "por_que", qué falta, en una frase.',
    '- "no_se_puede": SOLO si un dato duro lo impide, y di cuál: la capacidad (piden más personas de las que caben según las instalaciones), el lugar (exigen otra comuna o una distancia que el complejo no cumple) o la agenda (ese día ya hay eventos confirmados que ocupan lo necesario). Con varios salones, un evento confirmado no basta para decir que no.',
    'Si dudas, es "conseguir", nunca "tengo". No inventes nada que no esté en la carta o en las instalaciones. Deja vacío lo que no corresponda ("con_que" en "conseguir", por ejemplo).',
    'En "resumen", 1 o 2 frases: cuántas exigencias tiene, cuántas hay que conseguir y si algo lo impide. Responde en español de Chile, claro y sin jerga.',
  ].join('\n');

/** Lo que devolvió la IA, ordenado y con el texto de cada exigencia; los
 *  números fuera de la lista se descartan. */
export const armarCumplimiento = (
  crudo: {
    resumen: string;
    items: Array<{
      requisito: number;
      estado: EstadoDeCumplimiento;
      con_que: string;
      por_que: string;
    }>;
  },
  tecnicos: Requisito[],
  agendaDe: string | null,
): Cumplimiento => ({
  resumen: crudo.resumen,
  items: crudo.items
    .filter((i) => i.requisito >= 1 && i.requisito <= tecnicos.length)
    .map((i) => ({ ...i, que: tecnicos[i.requisito - 1].que }))
    .sort((a, b) => a.requisito - b.requisito),
  agenda_de: agendaDe,
});
