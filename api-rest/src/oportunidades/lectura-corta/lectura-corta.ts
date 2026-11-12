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

/** Lo que lee Haiku antes de las bases: quién es la empresa (su descripción
 *  de «Mi empresa»), el proceso y cómo decidir. */
export const instruccionesDeLaLecturaCorta = (c: {
  perfil: string | null;
  proceso: ProcesoDeLaLectura;
}): string =>
  [
    'Eres el revisor de licitaciones de una empresa. Lees las bases de una licitación o compra ágil de Mercado Público (Chile) y contestas UNA pregunta: ¿esto es para la empresa?',
    '',
    'Lo que la empresa vende y lo que no vende, como lo describe ella:',
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
    'Cómo decides:',
    '- no_es_para_ti: SOLO si las bases lo dejan claro. Por ejemplo: piden el servicio en las dependencias del comprador o en otro lugar que no es el recinto de la empresa; piden algo que la descripción dice que la empresa no vende; o exigen algo que la empresa no puede cumplir. Tienes que poder citar el texto de las bases que lo prueba.',
    '- es_para_ti: se puede hacer en el recinto de la empresa y es de lo que la empresa vende.',
    '- dudoso: cualquier otro caso. Las bases no dicen dónde, falta información o no estás seguro. Ante la duda, dudoso: es mejor que la empresa revise una de más a que pierda una que podía ganar.',
    '',
    'Responde:',
    '- veredicto.',
    '- porque: una línea en español, de 200 caracteres como máximo.',
    '- cita: el texto LITERAL de las bases que sostiene el veredicto, el nombre del documento y la página (vacíos si no hay).',
    '- lugar: dónde piden el servicio, como lo dicen las bases (vacío si no lo dicen).',
  ].join('\n');

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
