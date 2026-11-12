// LA LECTURA CORTA DE LAS BASES (decisión 132 del doc 17, 12-11). Felipe no
// quiere gastar los dólares del motor en leer bases con Opus (los quiere para
// BelIA y los seguimientos): "intentemos hacerlo con un modelo barato, una
// lectura que diga ¿es para mí o no es para mí?". Y antes de usarla: "Haz la
// prueba ahora con la lectura barata. Y ver si esas 9 quedarían afuera".
//
// Haiku 5.5 lee las mismas bases que lee Opus y contesta una sola pregunta.
// La regla que Felipe aceptó: «no es para ti» solo si las bases lo dejan
// claro; ante la duda, deja pasar. Funciones puras.

export const VEREDICTOS = ['es_para_ti', 'no_es_para_ti', 'dudoso'] as const;
export type Veredicto = (typeof VEREDICTOS)[number];

export type LecturaCorta = {
  veredicto: Veredicto;
  /** Una línea. */
  porque: string;
  /** El texto literal de las bases que sostiene el veredicto. */
  cita: { texto: string; documento: string; pagina: string };
  /** Dónde piden el servicio, como lo dicen las bases. */
  lugar: string;
};

export const ESQUEMA_DE_LECTURA_CORTA = {
  type: 'object',
  properties: {
    veredicto: { type: 'string', enum: [...VEREDICTOS] },
    porque: { type: 'string' },
    cita: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        documento: { type: 'string' },
        pagina: { type: 'string' },
      },
      required: ['texto', 'documento', 'pagina'],
      additionalProperties: false,
    },
    lugar: { type: 'string' },
  },
  required: ['veredicto', 'porque', 'cita', 'lugar'],
  additionalProperties: false,
} as const;

export type ProcesoDeLaLectura = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  monto: number | null;
};

const pesos = (monto: number): string =>
  `$${Math.round(monto).toLocaleString('es-CL')}`;

/** La versión de las instrucciones: va en el lote de cada prueba, para
 *  comparar una con otra. v1 (12-11, madrugada): botó 2 de las 8 postuladas.
 *  v2 (12-11): el mismo criterio con que el análisis de Opus llena
 *  `se_puede_en_el_complejo` (decisión 21), escrito como reglas; botó 1 de
 *  las 8 postuladas y 1 de las «sí» de Opus. v3 (12-11): un encargo de
 *  varias partes con una que la empresa puede dar en su recinto no queda
 *  fuera, y un puntaje por cercanía no es una zona exigida. */
export const VERSION_DE_LAS_INSTRUCCIONES = 'v3';

/** Lo que lee el modelo antes de las bases: quién es la empresa (su
 *  descripción de «Mi empresa» y lo que sabe la casa, lo mismo que lee
 *  Opus), el proceso y cómo decidir. Solo reglas: ningún caso real, para no
 *  hacerle trampa a la prueba. */
export const instruccionesDeLaLecturaCorta = (c: {
  perfil: string | null;
  proceso: ProcesoDeLaLectura;
  /** Lo que sabe la casa de la empresa (`loQueSabeLaCasa`), o vacío. */
  casa?: string;
}): string =>
  [
    'Eres el revisor de licitaciones de una empresa. Lees las bases de una licitación o compra ágil de Mercado Público (Chile) y contestas UNA pregunta: ¿esto es para la empresa?',
    '',
    'La empresa ES un recinto: presta sus servicios en su propio complejo. Lo que vende y lo que no vende, como lo describe ella:',
    c.perfil?.trim() || 'Sin descripción.',
    '',
    `El proceso: ${[
      c.proceso.codigo,
      c.proceso.nombre,
      [c.proceso.organismo, c.proceso.comuna].filter(Boolean).join(', '),
      c.proceso.monto ? pesos(c.proceso.monto) : 'sin monto publicado',
    ]
      .filter(Boolean)
      .join(' · ')}.`,
    '',
    'Cómo decides. Es el mismo criterio con que se decide si el servicio se puede prestar en las instalaciones de la empresa: sí, si se puede en sus instalaciones o el lugar lo propone el oferente; no, si exige otro lugar; dudoso, si no queda claro.',
    '- es_para_ti: lo pedido es de lo que la empresa vende y se puede hacer en su recinto. También cuando el lugar lo propone, lo ofrece o lo pone el proveedor (el recinto del oferente o del adjudicatario, un centro de eventos, un local establecido) y la zona que piden incluye la comuna o la región de la empresa: el recinto de la empresa es ese lugar.',
    '- no_es_para_ti: SOLO en uno de estos casos, y con la cita de las bases que lo prueba:',
    '  1. el lugar está FIJADO y no es el recinto de la empresa: las dependencias del comprador, una dirección o una comuna que no es la suya;',
    '  2. la zona EXIGIDA deja fuera a la empresa. Exigida es lo que, si no se cumple, deja la oferta inadmisible o fuera de bases. Un puntaje, una preferencia o un criterio de evaluación por comuna o por cercanía NO es una zona exigida: no deja fuera;',
    '  3. lo pedido es solo producto (insumos, artículos, alimentos para llevar o entregar) o un rubro que la descripción dice que la empresa no vende.',
    '- Lo que se puede subcontratar (traslados, buses, relatores, coach o monitores, amplificación, actividades o excursiones) NUNCA es motivo de no_es_para_ti: la empresa lo cotiza aparte.',
    '- Si lo pedido tiene varias partes y al menos una es de lo que la empresa vende y se podría prestar en su recinto (alojamiento, salón, alimentación servida, una jornada), NUNCA es no_es_para_ti, aunque otra parte sea en otro lugar o sea una entrega: en ese caso es dudoso.',
    '- dudoso: si piden varios lugares, o mezclan lo que se hace en un recinto con entregas en otro lado; si las bases no dicen dónde; si falta información; o si no estás seguro. Ante la duda, dudoso: es mejor que la empresa revise una de más a que pierda una que podía ganar.',
    '',
    'Responde:',
    '- veredicto.',
    '- porque: una línea en español, de 200 caracteres como máximo.',
    '- cita: el texto LITERAL de las bases que sostiene el veredicto, el nombre del documento y la página (vacíos si no hay).',
    '- lugar: dónde piden el servicio, como lo dicen las bases, o "lo propone el oferente" (vacío si no lo dicen).',
  ].join('\n') + (c.casa ?? '');

/** Lo que se ve en la fila de la bandeja (decisión 132): el porqué de
 *  Haiku y, si la hay, la cita de las bases con su documento y página. */
export const razonDeLaLecturaCorta = (l: LecturaCorta): string => {
  const cita = l.cita.texto.trim();
  if (!cita) return l.porque;
  const corta = cita.length > 200 ? `${cita.slice(0, 199)}…` : cita;
  const donde = [
    l.cita.documento.trim(),
    l.cita.pagina.trim() ? `p. ${l.cita.pagina.trim()}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return `${l.porque} Dicen las bases: «${corta}»${donde ? ` (${donde})` : ''}.`.trim();
};

const texto = (v: unknown, tope: number): string =>
  typeof v === 'string' ? v.trim().slice(0, tope) : '';

/** Lo que contestó Haiku, revisado antes de guardarlo. Un veredicto fuera de
 *  la lista es null: la fila queda en error, no se inventa un «dudoso». */
export const lecturaCortaValida = (salida: unknown): LecturaCorta | null => {
  if (!salida || typeof salida !== 'object') return null;
  const s = salida as Record<string, unknown>;
  const veredicto = VEREDICTOS.find(
    (v) => v === texto(s.veredicto, 40).toLowerCase(),
  );
  if (!veredicto) return null;
  const cita =
    s.cita && typeof s.cita === 'object'
      ? (s.cita as Record<string, unknown>)
      : {};
  return {
    veredicto,
    porque: texto(s.porque, 300),
    cita: {
      texto: texto(cita.texto, 1000),
      documento: texto(cita.documento, 300),
      pagina: texto(cita.pagina, 40),
    },
    lugar: texto(s.lugar, 300),
  };
};
