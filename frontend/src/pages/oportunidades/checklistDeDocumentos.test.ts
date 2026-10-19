import { describe, expect, it } from "vitest";
import type { DocumentoPedido } from "../../services/exigencias.service";
import type {
  AdjuntoDeOportunidad,
  DocumentoDeEmpresa,
  ResultadoDeBases,
} from "../../services/oportunidades.service";
import {
  checklistDeDocumentos,
  documentosDeUnAnalisisAnterior,
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
