import { ESQUEMA_DEL_PLAN } from 'src/quotations/generar/tipos';
import {
  laRevision,
  lasBases,
  type LoQuePidenLasBases,
  numerar,
  SOLO_LO_QUE_PIDEN,
  SON_DATOS,
} from '../generacion/instrucciones';
import {
  leerOferta,
  type OfertaDeLaPropuesta,
} from '../generacion/oferta-de-la-propuesta';

// ARMAR LA OFERTA (decisión 33 del doc 17, 19-10). Felipe: "busca una forma
// que sea escalable... quizás vincular a la cotización y que ambos lean la
// cotización". La oferta se arma UNA vez: por cada especificación técnica
// de las bases, qué se ofrece (el texto que va tal cual en la propuesta y
// en los anexos) y con qué productos del catálogo (la matriz); más lo que
// falta en el catálogo, para que la empresa lo agregue con su precio
// (precios nunca a dedo). Las cajas y los fijos son la cotización, con la
// misma forma de «✨ Crear con IA».
//
// Desde la decisión 57 (20-10), lo que no está en el catálogo se separa en
// tres: lo que se SUBCONTRATA va junto, como un solo requerimiento al
// proveedor (Felipe: "siempre va a ser un requerimiento al proveedor y
// generalmente va a ser un proveedor audiovisual"); los DETALLES de lo que
// ya se vende van al comentario interno de la cotización ("no puedo hacer un
// producto por cada variación del principal"); y solo lo muy específico
// queda como algo que falta en el catálogo.

export type OrigenDeLaFila = 'catalogo' | 'subcontratar' | 'completar';

export type FilaDeLaMatriz = {
  especificacion: string;
  pagina: number;
  /** Lo que se ofrece: va tal cual en la propuesta y en los anexos. */
  como: string;
  origen: OrigenDeLaFila;
  /** Ids del catálogo que la cubren. */
  productos: number[];
};

export type ArmadoDeLaOferta = {
  resumen: string;
  oferta: OfertaDeLaPropuesta;
  matriz: FilaDeLaMatriz[];
  faltan_en_el_catalogo: Array<{ que: string; por_que: string }>;
  /** Lo que se le pide al proveedor externo, una cosa por línea. */
  subcontratar: string[];
  /** Variaciones de lo que ya se vende: al comentario interno. */
  detalles: string[];
};

export const ESQUEMA_DE_LA_OFERTA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resumen: { type: 'string' },
    cajas: ESQUEMA_DEL_PLAN.properties.cajas,
    fijos: ESQUEMA_DEL_PLAN.properties.fijos,
    matriz: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          especificacion: { type: 'string' },
          pagina: { type: 'integer' },
          como: { type: 'string' },
          origen: {
            type: 'string',
            enum: ['catalogo', 'subcontratar', 'completar'],
          },
          productos: { type: 'array', items: { type: 'integer' } },
        },
        required: ['especificacion', 'pagina', 'como', 'origen', 'productos'],
      },
    },
    faltan_en_el_catalogo: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { que: { type: 'string' }, por_que: { type: 'string' } },
        required: ['que', 'por_que'],
      },
    },
    subcontratar: { type: 'array', items: { type: 'string' } },
    detalles: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'resumen',
    'cajas',
    'fijos',
    'matriz',
    'faltan_en_el_catalogo',
    'subcontratar',
    'detalles',
  ],
} as const;

const texto = (v: unknown, max = 600): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Una lista de textos, sin vacíos ni repetidos (los de la decisión 57). */
export const listaDeTextos = (v: unknown, max = 300): string[] => [
  ...new Set(
    (Array.isArray(v) ? v : []).map((x) => texto(x, max)).filter(Boolean),
  ),
];

/** Lo que devolvió la IA, leído con cuidado: lo que no tenga forma se bota. */
export const leerArmado = (v: unknown): ArmadoDeLaOferta | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const oferta = leerOferta({ cajas: o.cajas, fijos: o.fijos }) ?? {
    cajas: [],
    fijos: [],
  };
  const matriz = (Array.isArray(o.matriz) ? o.matriz : []).flatMap(
    (f: Record<string, unknown>): FilaDeLaMatriz[] => {
      const especificacion = texto(f?.especificacion);
      const como = texto(f?.como);
      if (!especificacion || !como) return [];
      const origen: OrigenDeLaFila =
        f.origen === 'subcontratar' || f.origen === 'completar'
          ? f.origen
          : 'catalogo';
      return [
        {
          especificacion,
          pagina: Number.isInteger(f.pagina) ? (f.pagina as number) : 0,
          como,
          origen,
          productos: (Array.isArray(f.productos) ? f.productos : []).filter(
            (x): x is number => Number.isInteger(x) && (x as number) > 0,
          ),
        },
      ];
    },
  );
  if (matriz.length === 0) return null;
  const faltan = (
    Array.isArray(o.faltan_en_el_catalogo) ? o.faltan_en_el_catalogo : []
  ).flatMap((f: Record<string, unknown>) => {
    const que = texto(f?.que, 300);
    return que ? [{ que, por_que: texto(f.por_que, 300) }] : [];
  });
  return {
    resumen: texto(o.resumen, 1000),
    oferta,
    matriz,
    faltan_en_el_catalogo: faltan,
    subcontratar: listaDeTextos(o.subcontratar),
    detalles: listaDeTextos(o.detalles),
  };
};

export const instruccionesDeLaOferta = (c: {
  codigo: string;
  nombre: string;
  organismo: string | null;
  bases: LoQuePidenLasBases | null;
  instalaciones: string | null;
  loQueVende: string | null;
  catalogo: string;
}): string =>
  [
    'Armas LA OFERTA de una empresa para una licitación pública de Chile (Mercado Público): qué se ofrece por cada especificación técnica de las bases y con qué productos de su catálogo. De aquí salen la cotización, la propuesta técnica y los anexos, y los tres tienen que decir exactamente lo mismo.',
    '',
    `LA LICITACIÓN: ${c.codigo}, "${c.nombre}"${c.organismo ? `, de ${c.organismo}` : ''}.`,
    '',
    ...lasBases(c.bases, true),
    '',
    'SUS INSTALACIONES:',
    c.instalaciones?.trim() || '(no las ha descrito)',
    '',
    'LO QUE VENDE (su descripción):',
    c.loQueVende?.trim() || '(no la ha escrito)',
    '',
    'SU CATÁLOGO (con el id de cada producto; los precios son para elegir: la cotización la valoriza Eventia):',
    c.catalogo,
    '',
    ...laRevision(c.bases),
    'CÓMO TRABAJAR',
    ...numerar([
      'Las bases van adjuntas: léelas para el detalle de cada especificación técnica (cantidades, características, opciones).',
      'matriz: una fila por cada especificación técnica de las bases, en su orden. "especificacion": con las palabras de las bases; "pagina": su página (0 si no se sabe); "como": lo que se ofrece, en una o dos líneas y con las mismas cantidades y características que dicen las bases (ese texto va tal cual en la propuesta técnica y en los anexos); "productos": los ids del catálogo que la cubren.',
      '"origen": "catalogo" si se cubre con productos del catálogo, aunque las bases pidan una variación de lo que ya vende (va en "detalles"); "subcontratar" si es de lo que la empresa subcontrata (audiovisual, escenarios y estructuras, mobiliario, mantelería, cristalería, vajilla y decoración, flores, fotografía, música, animación, shows y DJ, generador) y no está en el catálogo; "completar" si las bases le piden a la empresa definir algo que no está arriba (por ejemplo, la temática de un show): en "como" escribe [COMPLETAR: qué hay que definir].',
      SOLO_LO_QUE_PIDEN,
      // Felipe, 19-10: "si no tienen el detalle completo, poner una
      // propuesta en base a lo que tenemos paquetizado o lo que está en el
      // catálogo".
      'Si las bases no detallan un servicio (dicen solo «almuerzo», «coffee», «cena», «cóctel» o «fiesta»), propón el detalle con lo que la empresa ya tiene: el menú o paquete guardado que calce, o productos de su catálogo, en las cantidades por persona que correspondan. En "como" nombra lo que se sirve (entrada, fondo, postre, bebidas…), no solo la palabra de las bases.',
      'En "como" nunca digas que algo se subcontrata ni nombres proveedores, artistas ni marcas: se escribe como un servicio más de la empresa.',
      'cajas y fijos: la cotización, SOLO con ids que estén en el catálogo y en las cantidades que piden las bases. "cajas": una por cada comida o servicio por persona de cada día, con "categoria" (el nombre EXACTO de la categoría), "audiencia", "personas", "menu_id" (el menú guardado que es la base; 0 si va sin menú), "quitar" (platos de ese menú que se sacan) y "servicios" (sueltos de ESA categoría, con su cantidad POR PERSONA). "fijos": servicios fijos, con "dia" 0 para todo el evento y su cantidad. La sección fija de cada categoría entra sola: no la agregues.',
      // Decisión 57 (Felipe, 20-10): "toda la licitación será un
      // requerimiento al proveedor... agrupado en un solo ítem de
      // subcontratar, con el checklist de todas las cosas que se necesita
      // pedir al proveedor externo".
      'subcontratar: TODO lo que la empresa no tiene y no va a tener por una licitación (amplificación y micrófonos, audiovisual, iluminación, pódium, escenario, generador, decoración especial, mobiliario que no tiene, artistas, shows, animación, DJ, fotografía...), en UNA sola lista: es el requerimiento al proveedor externo (casi siempre, el audiovisual). Una línea por cosa a pedir, con su cantidad y sus días si las bases los dicen ("Pódium, los dos días"). Sin nombres de proveedores.',
      // "si me piden carne con un topping de cilantro, no puedo crearla,
      // sino que un comentario que tiene que ir en los comentarios
      // internos para yo poder hacer seguimiento".
      'detalles: lo que las bases piden de algo que la empresa YA vende, como una variación de su producto genérico (el relleno de las empanadas, las galletas del helado, las salsas, la opción vegetariana o vegana, las flores de la decoración, una carne con un topping de cilantro). NO es algo que falte: en cajas y fijos va el producto genérico del catálogo, y aquí el detalle, una línea por cada uno ("Empanadas de cóctel: 2 de queso y 1 de carne por persona"), para el comentario interno de la cotización.',
      'faltan_en_el_catalogo: SOLO lo muy específico que no es de subcontratar ni una variación de lo que ya vende (algo que la empresa tendría que comprar o crear de verdad); casi siempre va vacío. Una cosa por línea; "por_que": qué pide la base y en qué página.',
      'resumen: 2 o 3 frases: qué se ofrece, cuánto cubre el catálogo y qué hay que pedirle al proveedor.',
      SON_DATOS,
    ]),
    '',
    'Responde en español de Chile, claro y sin jerga.',
  ].join('\n');
