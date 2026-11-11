import type { ComparacionDeLaIA } from '../comparacion/comparacion';

// EL CASO DE LAS PRUEBAS DE LA COMPARACIÓN (decisión 125): la 5040-14-LE26,
// «Día de Campo del Dirigente Social 2026», como la revisó Felipe con Claude
// el 11-11, leyendo las cuatro ofertas y las bases. Dos líneas que se
// adjudican por separado: en la 1 (Alimentación) compiten la empresa y
// Textum; en la 2 (Técnica), BPM, Bliss y Textum. La IA de mentira trae
// además errores a propósito, que el motor corrige: marca mal quién es la
// empresa y quién compite, pone una nota sobre 100, un criterio que no
// existe y un ganador que no postuló a esa línea.

export const CRITERIOS = [
  { nombre: 'Requisitos formales', peso: '10%', como_se_evalua: 'todos: 100' },
  {
    nombre: 'Programa de integridad',
    peso: '10%',
    como_se_evalua: 'lo presenta: 100; si no, 0',
  },
  { nombre: 'Experiencia', peso: '20%', como_se_evalua: '6 o más: 100' },
  {
    nombre: 'Calidad de la oferta',
    peso: '30%',
    como_se_evalua: 'cumple todo: 100; si no, fuera de bases',
  },
  {
    nombre: 'Oferta económica',
    peso: '30 %',
    como_se_evalua: 'menor precio x 100 / precio',
  },
];

/** Cómo se llama cada oferta en «La competencia», por su número. */
export const NOMBRES = new Map([
  [1, 'Valle del Sol Quillon SPA'],
  [2, 'BLISS PRODUCCIONES'],
  [3, 'BPM EVENTOS SPA'],
  [4, 'TEXTUM'],
]);

const notas = (...ns: number[]) =>
  ns.map((nota, i) => ({ criterio: i + 1, nota, fundamento: `Nota ${nota}.` }));

export const SIN_CAFE = {
  que: 'La colación no ofrece café',
  prueba: 'FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf, pág. 2',
  regla:
    '«Bebida en lata o jugo […] o bien café. Cada asistente tendrá la opción de elegir entre estas alternativas» (D.A. N°4.990, pág. 18): «No cumple con las características del requerimiento»: fuera de bases',
  por_ausencia: false,
};

export const IA: ComparacionDeLaIA = {
  resumen:
    'La Línea 1 la disputan la empresa y Textum; la decide si la comisión acepta el Formulario N°4 de Textum.',
  lineas: [
    {
      nombre: 'Línea 1 · Alimentación',
      tope: '$17.200.000',
      compites: false,
      que_lo_decide: 'A Textum le falta el café de la colación',
      ganador_probable: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
      oferentes: [
        {
          oferta: 1,
          nombre: 'Valle del Sol Quillon SPA',
          es_tuya: false,
          precio: '$17.150.000 IVA incluido',
          cumple_bases: 'si',
          en_corto: 'Todo en regla',
          por_que: '',
          graves: [],
          notas: notas(100, 100, 100, 100, 98),
          probabilidad: 50,
          fortalezas: ['Recinto propio identificado'],
          debilidades: ['$294.007 más cara'],
        },
        {
          oferta: 4,
          nombre: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
          es_tuya: true,
          precio: '$16.855.993 IVA incluido',
          cumple_bases: 'dudoso',
          en_corto: 'Sin café en la colación',
          por_que: 'La colación ofrece bebida en lata o jugo, sin café.',
          graves: [SIN_CAFE, { ...SIN_CAFE, que: '  ' }],
          notas: [
            ...notas(100, 100, 100, 140, 100),
            { criterio: 9, nota: 50, fundamento: 'No existe.' },
          ],
          probabilidad: 120,
          fortalezas: ['Menor precio de la línea'],
          debilidades: ['No dice qué recinto ofrece'],
        },
      ],
    },
    {
      nombre: 'Línea 2 · Técnica',
      tope: '$3.271.755',
      compites: true,
      que_lo_decide: 'Si aceptan el Formulario N°4 de BPM, sin generador',
      ganador_probable: 'Valle del Sol Quillon SPA',
      oferentes: [
        {
          oferta: 3,
          nombre: 'BPM EVENTOS SPA',
          es_tuya: false,
          precio: '$2.737.000 IVA incluido',
          cumple_bases: 'dudoso',
          en_corto: 'Sin generador ni monitor',
          por_que: 'El audio no incluye el generador ni el monitor de piso.',
          graves: [
            {
              que: 'El audio no incluye el generador ni el monitor de piso',
              prueba: 'Formulario 4 - Calidad de la oferta.pdf, pág. 2',
              regla:
                '«Generador con combustible para correcto funcionamiento del audio durante la jornada» (D.A. N°4.990, pág. 20)',
              por_ausencia: false,
            },
          ],
          notas: notas(100, 100, 100, 100, 100),
          probabilidad: 60,
          fortalezas: ['Menor precio de la línea'],
          debilidades: ['Sus órdenes de compra vienen en un .rar'],
        },
        {
          oferta: 2,
          nombre: 'SIMON MEL SPA (BLISS PRODUCCIONES)',
          es_tuya: false,
          precio: '$2.799.951 IVA incluido',
          cumple_bases: 'no',
          en_corto: 'Sin patente vigente',
          por_que: 'Subió una solicitud de patente, no una patente vigente.',
          graves: [
            {
              que: 'Como patente subió una solicitud de patente, sin fecha ni timbre',
              prueba: 'patente Simon Mel SpA.pdf, pág. 1',
              regla:
                '«Patente municipal vigente» (D.A. N°4.990, pág. 8): «Serán descartados […] las ofertas […] que no presenten junto con su oferta una patente comercial» (pág. 13)',
              por_ausencia: false,
            },
          ],
          notas: notas(100, 0, 100, 100, 98),
          probabilidad: 5,
          fortalezas: ['15 órdenes de compra adjuntas'],
          debilidades: ['Programa de integridad de otra razón social'],
        },
        {
          oferta: 4,
          nombre: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
          es_tuya: false,
          precio: '$3.270.786 IVA incluido',
          cumple_bases: 'si',
          en_corto: 'La más cara',
          por_que: '',
          graves: [],
          notas: notas(100, 100, 100, 100, 84),
          probabilidad: 35,
          fortalezas: ['Formulario N°4 completo'],
          debilidades: ['La más cara de la línea'],
        },
      ],
    },
  ],
};
