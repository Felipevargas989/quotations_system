import type {
  ComparacionDeOfertas,
  OferenteComparado,
} from "../../services/comparacion.service";

// EL CASO DE LAS PRUEBAS DE LA COMPARACIÓN (decisión 125): la 5040-14-LE26,
// «Día de Campo del Dirigente Social 2026», como la revisó Felipe con Claude
// el 11-11. Dos líneas que se adjudican por separado: en la 1 compiten la
// empresa y Textum; en la 2, BPM, Bliss y Textum.

const notas = (...ns: number[]) =>
  ns.map((nota, i) => ({ criterio: i + 1, nota, fundamento: `Nota ${nota}.` }));

const oferente = (
  de: Partial<OferenteComparado> & Pick<OferenteComparado, "nombre">,
): OferenteComparado => ({
  es_tuya: false,
  precio: "no se ve",
  cumple_bases: "si",
  en_corto: "",
  por_que: "",
  graves: [],
  notas: notas(100, 100),
  probabilidad: 0,
  fortalezas: [],
  debilidades: [],
  puntaje: 100,
  ...de,
});

export const SIN_CAFE = {
  que: "La colación no ofrece café",
  prueba: "FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf, pág. 2",
  regla:
    "«…o bien café. Cada asistente tendrá la opción de elegir» (D.A. N°4.990, pág. 18)",
  por_ausencia: false,
};

export const VALLE = oferente({
  oferta: 1,
  nombre: "Valle del Sol Quillon SPA",
  corto: "Valle del Sol Quillon SPA",
  es_tuya: true,
  precio: "$17.150.000 IVA incluido",
  en_corto: "Todo en regla",
  notas: notas(100, 98),
  probabilidad: 50,
  fortalezas: ["Recinto propio identificado"],
  debilidades: ["$294.007 más cara"],
  puntaje: 99.4,
});

export const TEXTUM_L1 = oferente({
  oferta: 4,
  nombre: "TEXTUM BURGOS Y ORTIZ LIMITADA",
  corto: "TEXTUM",
  precio: "$16.855.993 IVA incluido",
  cumple_bases: "dudoso",
  en_corto: "Sin café en la colación",
  por_que: "La colación ofrece bebida en lata o jugo, sin café.",
  graves: [SIN_CAFE],
  probabilidad: 50,
  fortalezas: ["Menor precio de la línea"],
  debilidades: ["No dice qué recinto ofrece"],
});

export const CASO: ComparacionDeOfertas = {
  resumen: "La Línea 1 la disputan la empresa y Textum.",
  criterios: [
    { nombre: "Calidad de la oferta", peso: 70 },
    { nombre: "Oferta económica", peso: 30 },
  ],
  lineas: [
    {
      nombre: "Línea 2 · Técnica",
      tope: "$3.271.755",
      compites: false,
      que_lo_decide: "Si aceptan el Formulario N°4 de BPM, sin generador",
      ganador_probable: "BPM EVENTOS SPA",
      si_aceptan_todo: "BPM EVENTOS SPA",
      a_la_letra: "TEXTUM BURGOS Y ORTIZ LIMITADA",
      oferentes: [
        oferente({
          oferta: 3,
          nombre: "BPM EVENTOS SPA",
          corto: "BPM EVENTOS SPA",
          precio: "$2.737.000 IVA incluido",
          cumple_bases: "dudoso",
          en_corto: "Sin generador ni monitor",
          graves: [
            {
              que: "El audio no incluye el generador ni el monitor de piso",
              prueba: "Formulario 4 - Calidad de la oferta.pdf, pág. 2",
              regla: "«Generador con combustible» (D.A. N°4.990, pág. 20)",
              por_ausencia: false,
            },
          ],
          probabilidad: 60,
        }),
        oferente({
          oferta: 2,
          nombre: "SIMON MEL SPA (BLISS PRODUCCIONES)",
          corto: "BLISS PRODUCCIONES",
          precio: "$2.799.951 IVA incluido",
          cumple_bases: "no",
          en_corto: "Sin patente vigente",
          probabilidad: 5,
          puntaje: 89.4,
        }),
        oferente({
          oferta: 4,
          nombre: "TEXTUM BURGOS Y ORTIZ LIMITADA",
          corto: "TEXTUM",
          precio: "$3.270.786 IVA incluido",
          en_corto: "La más cara",
          probabilidad: 35,
          fortalezas: ["Formulario N°4 completo"],
          puntaje: 95.2,
        }),
      ],
    },
    {
      nombre: "Línea 1 · Alimentación",
      tope: "$17.200.000",
      compites: true,
      que_lo_decide: "A Textum le falta el café de la colación",
      ganador_probable: "TEXTUM BURGOS Y ORTIZ LIMITADA",
      si_aceptan_todo: "TEXTUM BURGOS Y ORTIZ LIMITADA",
      a_la_letra: "Valle del Sol Quillon SPA",
      oferentes: [VALLE, TEXTUM_L1],
    },
  ],
  lectura: [
    {
      oferta: 1,
      nombre: "Valle del Sol Quillon SPA",
      es_tuya: true,
      leidos: 15,
      total: 15,
      sin_leer: [],
      sin_traer: [],
    },
    {
      oferta: 2,
      nombre: "BLISS PRODUCCIONES",
      es_tuya: false,
      leidos: 12,
      total: 12,
      sin_leer: [],
      sin_traer: [],
    },
    {
      oferta: 3,
      nombre: "BPM EVENTOS SPA",
      es_tuya: false,
      leidos: 14,
      total: 15,
      sin_leer: [
        { nombre: "planilla.xlsx", motivo: "la IA lee PDF, Word e imágenes" },
      ],
      sin_traer: [
        {
          nombre: "EXPERIENCIA DEL OFERENTE OC.rar",
          motivo: "viene comprimido",
        },
        { nombre: "Toda la Documentacion.rar", motivo: "viene comprimido" },
      ],
    },
    {
      oferta: 4,
      nombre: "TEXTUM",
      es_tuya: false,
      leidos: 15,
      total: 15,
      sin_leer: [],
      sin_traer: [],
    },
  ],
  ganador_probable: "TEXTUM BURGOS Y ORTIZ LIMITADA",
  oferentes: [VALLE, TEXTUM_L1],
};

/** El trabajo como lo entrega el motor. */
export const trabajoListo = (resultado: unknown = CASO) => ({
  id: 134,
  estado: "listo",
  tipo: "comparacion",
  modelo: "claude-opus-5-5",
  costo_usd: 2.3,
  archivos: Array.from({ length: 58 }, (_, i) => ({ id: i, nombre: `a${i}` })),
  no_leidos: [
    {
      nombre: "BPM EVENTOS SPA: EXPERIENCIA DEL OFERENTE OC.rar",
      motivo: "no se trajo de Mercado Público: viene comprimido",
    },
    {
      nombre: "BPM EVENTOS SPA: Toda la Documentacion.rar",
      motivo: "no se trajo de Mercado Público: viene comprimido",
    },
    {
      nombre: "BPM EVENTOS SPA: planilla.xlsx",
      motivo: "la IA lee PDF, Word e imágenes",
    },
  ],
  error: null,
  creado_en: "2026-11-11T16:40:00.000Z",
  terminado_en: "2026-11-11T16:44:00.000Z",
  resultado,
});
