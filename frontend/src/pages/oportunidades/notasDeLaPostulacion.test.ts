import { describe, expect, it } from "vitest";
import type {
  AdjuntoDeOportunidad,
  Generacion,
  ValidacionDeDocumentos,
} from "../../services/oportunidades.service";
import {
  cuantosFirmados,
  enOrden,
  notasDeLaPostulacion,
  numeroDelFormulario,
} from "./notasDeLaPostulacion";

// «TUS DOCUMENTOS» (decisión 79 del doc 17, 26-10): lo que falta o hay que
// revisar, bajo el formulario del que habla. Los datos son como los del Día
// de Campo (5040-14-LE26) la noche del 25 al 26-10.

const archivo = (
  id: number,
  nombre: string,
  origen: AdjuntoDeOportunidad["origen"],
  creado_en: string,
  editado_en: string | null = null,
): AdjuntoDeOportunidad => ({
  id,
  nombre,
  ruta: `c1/oportunidades/4633/postulacion/${id}`,
  tipo: "",
  bytes: 1000,
  origen,
  viene_de: 184,
  creado_en,
  subido_por: null,
  quien: null,
  editado_en,
});

const N1 = archivo(
  192,
  "Formulario N°1 - Identificación del oferente - firmado.pdf",
  "firmado",
  "2026-10-24T00:30:02Z",
);
const N3 = archivo(
  201,
  "Formulario N°3 - Experiencia del oferente - firmado.pdf",
  "firmado",
  "2026-10-24T20:04:21Z",
);
const N4 = archivo(
  216,
  "Formulario N°4 - Calidad de la oferta - firmado.pdf",
  "firmado",
  "2026-10-26T03:01:54Z",
);
const N5 = archivo(
  217,
  "Formulario N°5 - Oferta económica - lleno.docx",
  "generado",
  "2026-10-26T03:05:27Z",
);

const trabajo = (
  id: number,
  tipo: Generacion["tipo"],
  documentos: Array<{
    adjunto_id: number;
    nombre: string;
    pendientes: string[];
  }>,
  pendientes: string[] = [],
): Generacion => ({
  id,
  tipo,
  estado: "listo",
  parametros: {},
  resultado: {
    resumen: "",
    documentos: documentos.map((d) => ({ ...d, que_se_hizo: "" })),
    pendientes,
    descartados: [],
    no_entregados: [],
  },
  archivos: [],
  no_leidos: [],
  modelo: null,
  tokens_entrada: null,
  tokens_salida: null,
  costo_usd: null,
  error: null,
  creado_en: "2026-10-26T03:03:42Z",
  terminado_en: "2026-10-26T03:05:27Z",
});

const ANEXOS = trabajo(
  49,
  "anexos",
  [
    {
      adjunto_id: 217,
      nombre: "Formulario N°5 - Oferta económica - lleno.docx",
      pendientes: [
        "Precios unitarios netos de «Uso Centro», «Almuerzo» y «Colación»: quedan en blanco.",
        "Firma del representante legal Hernán Felipe Vargas Droguett.",
      ],
    },
  ],
  ["Formularios N°1, 2, 3 y 4 ya firmados, no se entregan."],
);

const FIRMA = trabajo(
  47,
  "firma",
  [{ adjunto_id: 216, nombre: "Formulario N°4 - firmado.pdf", pendientes: [] }],
  [
    "Falta confirmar si la licitación exige timbre en el Formulario N°4.",
    "La oferta debe subirse a Mercado Público antes del cierre.",
  ],
);

const VALIDACION: ValidacionDeDocumentos = {
  id: 4,
  estado: "listo",
  resultado: {
    resumen: "Casi completa.",
    listo: "no",
    requisitos: [
      {
        que: "Formulario N°1 Identificación del oferente",
        donde: "Formulario N°1 - Identificación del oferente - firmado.pdf",
        estado: "cumple",
        observacion: "Está firmado.",
      },
      {
        que: "Formulario N°3 Experiencia, con copia de las órdenes de compra",
        donde: "Formulario N°3 - Experiencia del oferente - firmado.pdf",
        estado: "revisar",
        observacion: "Faltan las facturas N°260 y N°219 en la carpeta.",
      },
      {
        que: "Colación con jugo como alternativa",
        donde: "Formulario N°4 - Calidad de la oferta - lleno.docx",
        estado: "revisar",
        observacion: "Falta el jugo como alternativa.",
      },
      {
        que: "Indicar el plazo de entrega o de ejecución",
        donde: "",
        estado: "falta",
        observacion: "Ningún documento dice el plazo.",
      },
    ],
    otros_problemas: [
      "Formulario N°3, fila 5: 'Adwards' parece un error de escritura.",
      "El certificado F30 vence el 31-10-2026, antes del cierre.",
      "Línea N°2 dice «No aplica».",
    ],
  },
  archivos: [],
  no_leidos: [],
  modelo: null,
  tokens_entrada: null,
  tokens_salida: null,
  costo_usd: null,
  error: null,
  creado_en: "2026-10-26T02:59:03Z",
  terminado_en: "2026-10-26T03:00:00Z",
};

describe("el N° de un formulario", () => {
  it("lo lee de un nombre o una nota; una línea no es un formulario", () => {
    expect(
      numeroDelFormulario("Formulario N°5 - Oferta económica - lleno.docx"),
    ).toBe(5);
    expect(
      numeroDelFormulario("El RUT del Anexo 3 no es el de la empresa."),
    ).toBe(3);
    expect(numeroDelFormulario("Formulario N° 12")).toBe(12);
    expect(numeroDelFormulario("Línea N°2 dice «No aplica».")).toBeNull();
    expect(numeroDelFormulario("Formulario_Anexos - lleno.docx")).toBeNull();
    expect(
      numeroDelFormulario("Propuesta técnica 1532886-5-LE26.docx"),
    ).toBeNull();
  });

  it("ordena por N° y cuenta los firmados sin lo que se subió en PDF", () => {
    const subido = archivo(
      300,
      "Patente.pdf",
      "subido",
      "2026-10-20T00:00:00Z",
    );
    const lista = enOrden([N5, subido, N3, N1]);
    expect(lista.map((a) => a.id)).toEqual([192, 201, 217, 300]);
    expect(cuantosFirmados(lista)).toEqual({ firmados: 2, total: 3 });
  });
});

describe("las notas de cada documento", () => {
  const { porDocumento, requisitos, otros } = notasDeLaPostulacion(
    [N1, N3, N4, N5],
    { anexos: ANEXOS, firma: FIRMA, propuesta: null },
    VALIDACION,
  );

  it("el Word por completar: lo que dejó la IA, sin su línea de firma, y la firma al final", () => {
    expect(porDocumento.get(217)).toEqual({
      estado: "por_completar",
      notas: [
        {
          texto:
            "Precios unitarios netos de «Uso Centro», «Almuerzo» y «Colación»: quedan en blanco.",
          tono: "completar",
        },
        { texto: "Falta la firma.", tono: "completar" },
      ],
      aviso: null,
      ocultas: [],
    });
  });

  it("un firmado sin observaciones queda limpio", () => {
    expect(porDocumento.get(192)).toEqual({
      estado: "firmado",
      notas: [],
      aviso: null,
      ocultas: [],
    });
  });

  it("lo de la validación va bajo su formulario, por su nombre o por su N°", () => {
    expect(porDocumento.get(201)?.notas.map((n) => n.texto)).toEqual([
      "Faltan las facturas N°260 y N°219 en la carpeta.",
      "Formulario N°3, fila 5: 'Adwards' parece un error de escritura.",
    ]);
  });

  it("firmado después de validar: la nota de la firma sí, la validación ya no", () => {
    expect(porDocumento.get(216)).toEqual({
      estado: "firmado",
      notas: [
        {
          texto:
            "Falta confirmar si la licitación exige timbre en el Formulario N°4.",
          tono: "revisar",
        },
      ],
      aviso: "Cambió después de la última validación: vuelve a validar.",
      // Lo de la validación queda guardado: el editor lo comprueba contra el texto.
      ocultas: [{ texto: "Falta el jugo como alternativa.", tono: "revisar" }],
    });
  });

  it("lo que no es de ningún documento queda para «Validar todo»", () => {
    expect(requisitos.map((q) => q.que)).toEqual([
      "Indicar el plazo de entrega o de ejecución",
    ]);
    expect(otros).toEqual([
      "El certificado F30 vence el 31-10-2026, antes del cierre.",
      "Línea N°2 dice «No aplica».",
    ]);
  });
});

describe("un documento editado en Eventia", () => {
  const editado = { ...N5, editado_en: "2026-10-26T12:00:00Z" };

  it("sin validar después, no repite lo de la IA: pide validar", () => {
    const { porDocumento } = notasDeLaPostulacion(
      [editado],
      { anexos: ANEXOS, firma: null, propuesta: null },
      VALIDACION,
    );
    expect(porDocumento.get(217)).toEqual({
      estado: "por_firmar",
      notas: [],
      aviso: "Lo editaste: valida para ver si quedó completo.",
      ocultas: [
        {
          texto:
            "Precios unitarios netos de «Uso Centro», «Almuerzo» y «Colación»: quedan en blanco.",
          tono: "completar",
        },
      ],
    });
  });

  it("validado después, manda la validación", () => {
    const nueva: ValidacionDeDocumentos = {
      ...VALIDACION,
      creado_en: "2026-10-26T12:05:00Z",
      resultado: {
        ...VALIDACION.resultado!,
        requisitos: [
          {
            que: "Formulario N°5 Oferta económica con precios unitarios",
            donde: "Formulario N°5 - Oferta económica - lleno.docx",
            estado: "falta",
            observacion: "El precio de la colación sigue en blanco.",
          },
        ],
        otros_problemas: [],
      },
    };
    const { porDocumento } = notasDeLaPostulacion(
      [editado],
      { anexos: ANEXOS, firma: null, propuesta: null },
      nueva,
    );
    expect(porDocumento.get(217)).toEqual({
      estado: "por_completar",
      notas: [
        {
          texto: "El precio de la colación sigue en blanco.",
          tono: "completar",
        },
        { texto: "Falta la firma.", tono: "completar" },
      ],
      aviso: null,
      // Validado después de editar: lo de la IA al llenarlo ya no cuenta.
      ocultas: [],
    });
  });

  it("validando (sin resultado), quedan solo las notas de la IA", () => {
    const { porDocumento, requisitos } = notasDeLaPostulacion(
      [N5],
      { anexos: ANEXOS, firma: null, propuesta: null },
      { ...VALIDACION, estado: "procesando", resultado: null },
    );
    expect(porDocumento.get(217)?.notas).toHaveLength(2);
    expect(requisitos).toEqual([]);
  });
});
