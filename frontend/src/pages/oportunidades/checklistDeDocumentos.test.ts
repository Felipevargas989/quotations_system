import { describe, expect, it } from "vitest";
import type { DocumentoPedido } from "../../services/exigencias.service";
import type {
  AdjuntoDeOportunidad,
  DocumentoDeEmpresa,
  ResultadoDeBases,
} from "../../services/oportunidades.service";
import {
  checklistDeDocumentos,
  esOpcional,
  documentosDeUnAnalisisAnterior,
  fijaUnPlazo,
  resumenDelChecklist,
} from "./checklistDeDocumentos";

// EL CHECKLIST DE DOCUMENTOS (19-10). Felipe: "un cruce de documentación
// que ya tengo en el sistema y documentación que debo conseguir". Cada
// documento que piden las bases contra la carpeta de «Mi empresa» y «Mi
// postulación».

const pedido = (
  nombre: string,
  carpeta: string,
  extra: Partial<DocumentoPedido> = {},
): DocumentoPedido => ({
  nombre,
  parte: "administrativa",
  cuando: "con_la_oferta",
  obligatorio: true,
  condicion: "",
  carpeta,
  pagina: 0,
  ...extra,
});

const enLaCarpeta = (
  id: number,
  tipo: string,
  nombre: string,
  vence: string | null,
  creado_en = "2026-07-01T12:00:00.000Z",
) =>
  ({
    id,
    tipo,
    nombre,
    vence,
    creado_en,
  }) as DocumentoDeEmpresa;

const enLaPostulacion = (
  id: number,
  nombre: string,
  origen: AdjuntoDeOportunidad["origen"],
) => ({ id, nombre, origen }) as AdjuntoDeOportunidad;

const SIN_REQUISITOS = { requisitos: [], formularios: [] };

describe("El checklist de documentos", () => {
  it("cada documento contra tu carpeta y tu postulación", () => {
    const filas = checklistDeDocumentos({
      r: {
        ...SIN_REQUISITOS,
        documentos: [
          pedido("Formulario N°1 Identificación", "formulario"),
          pedido("Formulario N°2 Declaración jurada", "formulario"),
          pedido("Formulario N°3 Experiencia", "formulario"),
          pedido("Formulario N°4 Oferta económica", "formulario", {
            parte: "economica",
          }),
          pedido("Patente municipal", "patente"),
          pedido("Inicio de actividades", "inicio_actividades"),
          pedido("Copias de las órdenes de compra", "respaldo_experiencia", {
            parte: "tecnica",
          }),
          pedido("Programa de integridad", "programa_integridad", {
            obligatorio: false,
          }),
          pedido("Certificado DICOM", "otro", {
            cuando: "al_adjudicar",
            condicion: "emitido hace menos de 15 días",
          }),
          pedido("Certificado F30", "f30", { cuando: "al_pagar" }),
        ],
      },
      carpeta: [
        enLaCarpeta(
          1,
          "patente",
          "Patente 2025.pdf",
          "2025-12-31",
          "2025-01-01",
        ),
        enLaCarpeta(
          2,
          "patente",
          "Patente 2026.pdf",
          "2026-12-31",
          "2026-07-01",
        ),
        enLaCarpeta(3, "inicio_actividades", "Inicio.pdf", "2026-10-01"),
        enLaCarpeta(4, "respaldo_experiencia", "OC 1.pdf", null),
        enLaCarpeta(5, "respaldo_experiencia", "OC 2.pdf", null),
      ],
      postulacion: [
        enLaPostulacion(10, "Anexo_N1_Identificacion.pdf", "generado"),
        enLaPostulacion(11, "Anexo_N1_Identificacion firmado.pdf", "firmado"),
        enLaPostulacion(12, "Formulario 2 firmado a mano.pdf", "subido"),
        enLaPostulacion(13, "Anexo_N3_Experiencia.docx", "generado"),
        enLaPostulacion(14, "Programa de Probidad.pdf", "subido"),
      ],
      corte: "2026-10-19",
    });

    expect(filas.map((f) => [f.nombre, f.estado, f.detalle])).toEqual([
      [
        "Formulario N°1 Identificación",
        "firmado",
        "Anexo_N1_Identificacion firmado.pdf",
      ],
      [
        "Formulario N°2 Declaración jurada",
        "en_tu_postulacion",
        "Formulario 2 firmado a mano.pdf",
      ],
      [
        "Formulario N°3 Experiencia",
        "hecho",
        "Hecho por la IA, falta firmarlo",
      ],
      // La patente: la más nueva, con su vencimiento.
      [
        "Patente municipal",
        "en_tu_carpeta",
        "Patente 2026.pdf · vence el 31-12-2026",
      ],
      ["Inicio de actividades", "vencido", "Inicio.pdf: venció el 01-10-2026"],
      [
        "Programa de integridad",
        "en_tu_postulacion",
        "Programa de Probidad.pdf",
      ],
      [
        "Copias de las órdenes de compra",
        "en_tu_carpeta",
        "2 respaldos en tu carpeta",
      ],
      [
        "Formulario N°4 Oferta económica",
        "lo_arma_la_ia",
        "Lo arma «Armar postulación»",
      ],
      // Lo de adjudicar y pagar, al final.
      ["Certificado DICOM", "falta", null],
      ["Certificado F30", "falta", null],
    ]);

    expect(resumenDelChecklist(filas)).toEqual({
      listos: 5,
      faltan: 1,
      total: 8,
    });
  });

  it("decisión 102: la certificación de que el personal conoce el programa de integridad la cubre el programa, que la trae dentro", () => {
    const certificacion = pedido(
      "Certificación de que el personal conoce el programa de integridad",
      "dj_trabajadores",
      {
        condicion:
          "Incluye al representante legal y a los trabajadores que participan en el servicio",
      },
    );
    const programa = enLaCarpeta(
      46,
      "programa_integridad",
      "Programa de integridad - firmado.pdf",
      null,
    );
    const [fila] = checklistDeDocumentos({
      r: { ...SIN_REQUISITOS, documentos: [certificacion] },
      carpeta: [programa],
      postulacion: [],
      corte: "2026-11-06",
    });
    // En la 5040-14-LE26 salía «Falta».
    expect([fila.estado, fila.detalle]).toEqual([
      "en_tu_carpeta",
      "Programa de integridad - firmado.pdf",
    ]);
    // Si la empresa tiene la declaración aparte, va esa.
    const [aparte] = checklistDeDocumentos({
      r: { ...SIN_REQUISITOS, documentos: [certificacion] },
      carpeta: [
        programa,
        enLaCarpeta(47, "dj_trabajadores", "DJ trabajadores.pdf", null),
      ],
      postulacion: [],
      corte: "2026-11-06",
    });
    expect(aparte.detalle).toBe("DJ trabajadores.pdf");
  });

  it("sin cierre que lo venza, lo que no vence sigue en tu carpeta", () => {
    const [fila] = checklistDeDocumentos({
      r: {
        ...SIN_REQUISITOS,
        documentos: [pedido("Certificado de vigencia", "vigencia")],
      },
      carpeta: [enLaCarpeta(1, "vigencia", "Vigencia.pdf", null)],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect([fila.estado, fila.detalle]).toEqual([
      "en_tu_carpeta",
      "Vigencia.pdf",
    ]);
  });
});

describe("Lo que el análisis dice que no aplica", () => {
  it("el formulario de UTP no se arma ni cuenta; los demás siguen igual", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [
          {
            nombre: "Formulario N°5 - Oferta Económica",
            archivo: "Formularios_Anexos.docx",
            paginas: "",
            aplica: true,
            por_que_no_aplica: "",
            se_entrega_en: "economica",
          },
          {
            nombre:
              "Formulario N°6 - Declaración para Uniones Temporales de Proveedores",
            archivo: "Formularios_Anexos.docx",
            paginas: "",
            aplica: false,
            por_que_no_aplica:
              "Solo corresponde si se postula como Unión Temporal de Proveedores.",
            se_entrega_en: "administrativa",
          },
        ],
        documentos: [
          pedido("Formulario Anexo N°5 Oferta Económica", "formulario"),
          pedido("Formulario Anexo N°6 Declaración para UTP", "formulario", {
            obligatorio: false,
            condicion: "Solo si se postula como UTP",
          }),
        ],
      },
      carpeta: [],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => [f.estado, f.detalle])).toEqual([
      ["lo_arma_la_ia", "Lo arma «Armar postulación»"],
      [
        "no_aplica",
        "Solo corresponde si se postula como Unión Temporal de Proveedores.",
      ],
    ]);
    expect(resumenDelChecklist(filas).total).toBe(1);
  });
});

describe("Lo de UTP (Felipe, 19-10: «en mi caso no es necesario que lo arme»)", () => {
  it("el formulario y la escritura de la UTP no aplican, aunque el análisis no lo diga", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido(
            "Formulario Anexo N°6: Declaración para Uniones Temporales de Proveedores",
            "formulario",
            { obligatorio: false },
          ),
          pedido("Instrumento de constitución de la UTP", "otro", {
            obligatorio: false,
            condicion: "Solo si se postula como UTP",
          }),
        ],
      },
      carpeta: [],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => [f.estado, f.detalle])).toEqual([
      [
        "no_aplica",
        "Solo si postulas como Unión Temporal de Proveedores (UTP)",
      ],
      [
        "no_aplica",
        "Solo si postulas como Unión Temporal de Proveedores (UTP)",
      ],
    ]);
    expect(resumenDelChecklist(filas).total).toBe(0);
  });

  it("si la postula como UTP y lo sube, cuenta como en su postulación", () => {
    const [fila] = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [pedido("Instrumento de constitución de la UTP", "otro")],
      },
      carpeta: [],
      postulacion: [enLaPostulacion(1, "Constitucion UTP.pdf", "subido")],
      corte: "2026-10-19",
    });
    expect([fila.estado, fila.detalle]).toEqual([
      "en_tu_postulacion",
      "Constitucion UTP.pdf",
    ]);
  });

  it("lo general para contratar se cruza con su tipo de la carpeta (decisión 38)", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido("e-RUT", "erut"),
          pedido("Certificado de no quiebra", "no_quiebra"),
          pedido("Estatutos vigentes", "estatutos"),
        ],
      },
      carpeta: [
        enLaCarpeta(1, "erut", "E-rut Quillon.pdf", null),
        enLaCarpeta(2, "estatutos", "Estatutos.pdf", null),
      ],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => [f.nombre, f.estado])).toEqual([
      ["e-RUT", "en_tu_carpeta"],
      ["Certificado de no quiebra", "falta"],
      ["Estatutos vigentes", "en_tu_carpeta"],
    ]);
  });
});

describe("La deuda fiscal y el informe comercial (decisión 89)", () => {
  it("se cruzan con su tipo de la carpeta, y por el nombre en un análisis que los dejó en «otro»", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido("Certificado de deuda de la Tesorería", "tgr", {
            cuando: "al_adjudicar",
          }),
          pedido("Informe DICOM", "otro", { cuando: "al_adjudicar" }),
        ],
      },
      carpeta: [
        enLaCarpeta(1, "tgr", "Deuda TGR octubre.pdf", null),
        enLaCarpeta(2, "dicom", "Equifax octubre.pdf", null),
      ],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => [f.nombre, f.estado])).toEqual([
      ["Certificado de deuda de la Tesorería", "en_tu_carpeta"],
      ["Informe DICOM", "en_tu_carpeta"],
    ]);
  });
});

describe("La vigencia la fijan las bases (decisión 90)", () => {
  it("con un plazo desde la emisión, manda el plazo y no la fecha que anotó la empresa; con «vigente», la fecha", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido("Certificado de vigencia", "vigencia", {
            condicion: "emitido hace no más de 30 días",
          }),
          pedido("Certificado F30", "f30", { condicion: "vigente" }),
        ],
      },
      carpeta: [
        enLaCarpeta(1, "vigencia", "Vigencia agosto.pdf", "2026-10-01"),
        enLaCarpeta(2, "f30", "F30 septiembre.pdf", "2026-10-01"),
      ],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => [f.nombre, f.estado, f.detalle])).toEqual([
      [
        "Certificado de vigencia",
        "en_tu_carpeta",
        "Vigencia agosto.pdf · las bases piden: emitido hace no más de 30 días",
      ],
      [
        "Certificado F30",
        "vencido",
        "F30 septiembre.pdf: venció el 01-10-2026",
      ],
    ]);
  });

  it("un plazo es en días o meses, con número o con palabras; «vigente» no lo es", () => {
    expect(fijaUnPlazo("emitido hace no más de 30 días")).toBe(true);
    expect(
      fijaUnPlazo(
        "con una antigüedad no superior a sesenta (60) días corridos",
      ),
    ).toBe(true);
    expect(fijaUnPlazo("emitido dentro de los últimos 3 meses")).toBe(true);
    expect(fijaUnPlazo("vigente")).toBe(false);
    expect(fijaUnPlazo(undefined)).toBe(false);
  });
});

describe("Lo que hizo la IA, en un documento que el análisis dejó en «otro» (decisión 91)", () => {
  it("la propuesta técnica firmada cuenta como firmada, la que falta firmar como hecha y la subida como subida", () => {
    const fila = (origen: AdjuntoDeOportunidad["origen"]) =>
      checklistDeDocumentos({
        r: {
          ...SIN_REQUISITOS,
          documentos: [
            pedido(
              "Propuesta técnica con el detalle del servicio (menú, salón y equipos)",
              "otro",
              { parte: "tecnica" },
            ),
          ],
        },
        carpeta: [],
        postulacion: [
          enLaPostulacion(
            250,
            "Formulario Identificación del Proveedor - firmado.pdf",
            "firmado",
          ),
          enLaPostulacion(
            251,
            origen === "firmado"
              ? "Propuesta técnica 1030177-85-COT26 - firmado.pdf"
              : "Propuesta técnica 1030177-85-COT26.docx",
            origen,
          ),
        ],
        corte: "2026-10-27",
      })[0];
    // En la 1030177-85-COT26 la firmada salía como «falta», en rojo.
    expect([fila("firmado").estado, fila("firmado").detalle]).toEqual([
      "firmado",
      "Propuesta técnica 1030177-85-COT26 - firmado.pdf",
    ]);
    expect(fila("generado").estado).toBe("hecho");
    expect(fila("subido").estado).toBe("en_tu_postulacion");
  });
});

describe("El Registro de Proveedores (Felipe, 19-10: «sácalo de los documentos a entregar»)", () => {
  it("no va en la lista, ni del análisis nuevo ni de uno anterior; otro registro sí", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido("Inscripción en el Registro de Proveedores", "otro", {
            cuando: "al_adjudicar",
            condicion: "habilitado",
          }),
          pedido("Registro de empresa de guardias ante OS10", "otro"),
        ],
      },
      carpeta: [],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => f.nombre)).toEqual([
      "Registro de empresa de guardias ante OS10",
    ]);
    expect(
      documentosDeUnAnalisisAnterior({
        requisitos: [
          {
            que: "Estar inscrito en el Registro de Proveedores del Estado y no tener inhabilidades",
            tipo: "administrativo",
            obligatorio: true,
            documento: "Bases.pdf",
            pagina: 5,
          },
        ] as ResultadoDeBases["requisitos"],
      }).length,
    ).toBe(1);
    expect(
      checklistDeDocumentos({
        r: {
          requisitos: [
            {
              que: "Estar inscrito en el Registro de Proveedores del Estado y no tener inhabilidades",
              tipo: "administrativo",
              obligatorio: true,
              documento: "Bases.pdf",
              pagina: 5,
            },
          ] as ResultadoDeBases["requisitos"],
        },
        carpeta: [],
        postulacion: [],
        corte: "2026-10-19",
      }),
    ).toEqual([]);
  });
});

describe("Lo que el análisis dejó en «otro» (19-10)", () => {
  it("se reconoce por su nombre: el certificado de la Inspección del Trabajo y el e-RUT", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido(
            "Certificado de la Inspección del Trabajo de no tener reclamos laborales",
            "otro",
            { cuando: "al_pagar", condicion: "vigente" },
          ),
          pedido("e-RUT de la empresa", "otro"),
          pedido("Certificado de experiencia del chef", "otro"),
        ],
      },
      carpeta: [
        enLaCarpeta(1, "f30_1", "Certificado DT.pdf", "2026-12-31"),
        enLaCarpeta(2, "erut", "E-rut Quillon.pdf", null),
      ],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(
      filas.map((f) => [f.nombre.slice(0, 20), f.estado, f.detalle]),
    ).toEqual([
      ["e-RUT de la empresa", "en_tu_carpeta", "E-rut Quillon.pdf"],
      ["Certificado de exper", "falta", null],
      [
        "Certificado de la In",
        "en_tu_carpeta",
        "Certificado DT.pdf · vence el 31-12-2026",
      ],
    ]);
  });
});

describe("El F30 y el F30-1 (Felipe, 19-10: «ya, para F30 y F30-1»)", () => {
  it("cada uno con el suyo; el de la Inspección del Trabajo de no tener reclamos es el F30-1", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido("Certificado F30-1", "otro"),
          pedido(
            "Certificado de Antecedentes Laborales y Previsionales (F30)",
            "f30",
          ),
          pedido(
            "Certificado F30 emitido por la Inspección del Trabajo",
            "otro",
          ),
        ],
      },
      carpeta: [
        enLaCarpeta(1, "f30", "F30 septiembre.pdf", "2026-10-31"),
        enLaCarpeta(2, "f30_1", "F30-1 septiembre.pdf", "2026-10-31"),
      ],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => f.detalle)).toEqual([
      "F30-1 septiembre.pdf · vence el 31-10-2026",
      "F30 septiembre.pdf · vence el 31-10-2026",
      "F30 septiembre.pdf · vence el 31-10-2026",
    ]);
  });
});

describe("Un análisis de antes del checklist", () => {
  const requisito = (que: string, tipo = "administrativo", pagina = 9) => ({
    que,
    tipo,
    obligatorio: true,
    documento: "Bases.pdf",
    pagina,
  });

  it("los formularios que aplican y los requisitos que son documentos", () => {
    const documentos = documentosDeUnAnalisisAnterior({
      formularios: [
        {
          nombre: "Formulario Anexo N°1",
          archivo: "Bases.pdf",
          paginas: "16",
          aplica: true,
          por_que_no_aplica: "",
          se_entrega_en: "administrativa",
        },
        {
          nombre: "Formulario Anexo N°3 Experiencia",
          archivo: "Bases.pdf",
          paginas: "17-18",
          aplica: true,
          por_que_no_aplica: "",
          se_entrega_en: "tecnica",
        },
        {
          nombre: "Formulario Anexo N°6 UTP",
          archivo: "Bases.pdf",
          paginas: "21",
          aplica: false,
          por_que_no_aplica: "No postulas en unión temporal.",
          se_entrega_en: "administrativa",
        },
      ],
      requisitos: [
        // Ya está en los formularios.
        requisito("Anexo N°1 firmado por el representante legal"),
        // El de experiencia pide además las copias de sus respaldos.
        requisito(
          "Anexo N°3 con copias de órdenes de compra o facturas",
          "tecnico",
          17,
        ),
        requisito("Patente municipal vigente"),
        requisito("Todos los anexos firmados"),
        requisito("Almuerzo con plateada al horno", "tecnico", 19),
      ] as ResultadoDeBases["requisitos"],
    });
    expect(documentos.map((d) => [d.nombre, d.carpeta, d.pagina])).toEqual([
      ["Formulario Anexo N°1", "formulario", 16],
      ["Formulario Anexo N°3 Experiencia", "formulario", 17],
      [
        "Copias de las órdenes de compra o facturas de la experiencia",
        "respaldo_experiencia",
        17,
      ],
      ["Patente municipal vigente", "patente", 9],
    ]);
  });

  it("sin formularios (antes del 18-10), el «Anexo N°1» de los requisitos es un formulario", () => {
    const documentos = documentosDeUnAnalisisAnterior({
      requisitos: [
        requisito("Anexo N°1 firmado"),
        requisito("Boleta de garantía", "garantia"),
        requisito("Programa de integridad"),
      ] as ResultadoDeBases["requisitos"],
    });
    expect(documentos.map((d) => [d.nombre, d.carpeta, d.parte])).toEqual([
      ["Anexo N°1 firmado", "formulario", "administrativa"],
      ["Boleta de garantía", "otro", "otra"],
      ["Programa de integridad", "programa_integridad", "administrativa"],
    ]);
  });
});

describe("Una sola lista, la de postular (19-10)", () => {
  it("la factura para cobrar no va; la que se pide con la oferta, sí; lo de adjudicar y pagar es opcional", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [
          pedido(
            "Factura electrónica a nombre de I. Municipalidad de Quillón, Depto. de Educación",
            "otro",
            { cuando: "al_pagar" },
          ),
          pedido("Copia de facturas de servicios similares", "otro"),
          pedido("Certificado F30", "f30", { cuando: "al_pagar" }),
        ],
      },
      carpeta: [],
      postulacion: [],
      corte: "2026-10-19",
    });
    expect(filas.map((f) => [f.nombre.slice(0, 20), esOpcional(f)])).toEqual([
      ["Copia de facturas de", false],
      ["Certificado F30", true],
    ]);
  });
});
