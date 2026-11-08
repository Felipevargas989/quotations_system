import { describe, expect, it } from "vitest";
import type { DocumentoPedido } from "../../services/exigencias.service";
import type {
  AdjuntoDeOportunidad,
  DocumentoDeEmpresa,
  FormularioDelAnalisis,
} from "../../services/oportunidades.service";
import {
  checklistDeDocumentos,
  resumenDelChecklist,
} from "./checklistDeDocumentos";

// QUIÉN HACE CADA PAPEL, EN «LO QUE TIENES QUE PRESENTAR» (decisión 119,
// parte 3b, 08-11). Felipe aprobó: "La lista ya no marca «Falta» en lo que
// va a armar Eventia. En lo que subes tú, explica debajo por qué, por
// ejemplo «es del bus». Lo que se firma directo en Mercado Público aparece
// como «Portal»". La regla es la misma del motor (@los-papeles).

const pedido = (
  nombre: string,
  carpeta = "otro",
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

const enLaPostulacion = (
  id: number,
  nombre: string,
  origen: AdjuntoDeOportunidad["origen"],
  viene_de: number | null = null,
) => ({ id, nombre, origen, viene_de }) as AdjuntoDeOportunidad;

const formulario = (nombre: string, archivo: string): FormularioDelAnalisis => ({
  nombre,
  archivo,
  paginas: "",
  aplica: true,
  por_que_no_aplica: "",
  se_entrega_en: "administrativa",
});

const fila = (
  p: DocumentoPedido,
  extra: {
    postulacion?: AdjuntoDeOportunidad[];
    formularios?: FormularioDelAnalisis[];
    carpeta?: DocumentoDeEmpresa[];
  } = {},
) => {
  const [f] = checklistDeDocumentos({
    r: {
      requisitos: [],
      formularios: extra.formularios ?? [],
      documentos: [p],
    },
    carpeta: extra.carpeta ?? [],
    postulacion: extra.postulacion ?? [],
    corte: "2026-11-08",
  });
  return [f.estado, f.detalle];
};

describe("Quién hace cada papel, en la lista (decisión 119, parte 3b)", () => {
  it("lo del portal dice «Portal» y no cuenta como algo que preparar", () => {
    const filas = checklistDeDocumentos({
      r: {
        requisitos: [],
        formularios: [],
        documentos: [pedido("Declaración jurada de requisitos para ofertar")],
      },
      carpeta: [],
      postulacion: [],
      corte: "2026-11-08",
    });
    expect([filas[0].estado, filas[0].detalle]).toEqual([
      "portal",
      "Se hace en Mercado Público al ofertar",
    ]);
    expect(resumenDelChecklist(filas)).toEqual({
      listos: 0,
      faltan: 0,
      total: 0,
    });
  });

  it("lo que subes tú dice por qué; subido, cuenta", () => {
    const p = pedido("Permiso de circulación del bus", "otro", {
      parte: "tecnica",
    });
    expect(fila(p)).toEqual(["falta", "Lo subes tú: es del vehículo"]);
    expect(
      fila(p, {
        postulacion: [
          enLaPostulacion(1, "Permiso circulacion bus 2026.pdf", "subido"),
        ],
      }),
    ).toEqual(["en_tu_postulacion", "Permiso circulacion bus 2026.pdf"]);
  });

  it("la «patente» del vehículo no es la patente municipal de tu carpeta", () => {
    expect(
      fila(
        pedido(
          "Identificación del vehículo (marca, modelo, año, patente y capacidad)",
        ),
        {
          carpeta: [
            {
              id: 1,
              tipo: "patente",
              nombre: "Patente 2026.pdf",
              vence: null,
              creado_en: "2026-07-01T12:00:00.000Z",
            } as DocumentoDeEmpresa,
          ],
        },
      ),
    ).toEqual(["falta", "Lo subes tú: es del vehículo"]);
  });

  it("una declaración sin formato la arma Eventia: antes de armar, hecha y firmada", () => {
    const p = pedido("Datos bancarios para el pago", "otro", {
      parte: "economica",
    });
    expect(fila(p)).toEqual([
      "lo_arma_la_ia",
      "Lo arma «Armar postulación» con tus datos de «Mi empresa»",
    ]);
    expect(
      fila(p, {
        postulacion: [
          enLaPostulacion(
            5,
            "Datos bancarios para el pago 4362-30-LE26.docx",
            "generado",
          ),
        ],
      }),
    ).toEqual([
      "hecho",
      "Hecho por Eventia, falta firmarlo · Datos bancarios para el pago 4362-30-LE26.docx",
    ]);
    expect(
      fila(p, {
        postulacion: [
          enLaPostulacion(
            6,
            "Datos bancarios para el pago 4362-30-LE26 - firmado.pdf",
            "firmado",
          ),
        ],
      }),
    ).toEqual([
      "firmado",
      "Datos bancarios para el pago 4362-30-LE26 - firmado.pdf",
    ]);
  });

  it("la cotización con otro nombre cuenta como ese papel; el anexo que llenó la IA desde el comprador, no", () => {
    const p = pedido("Oferta económica por línea", "otro", {
      parte: "economica",
    });
    expect(fila(p)).toEqual([
      "lo_arma_la_ia",
      "Lo arma «Armar postulación» con tu cotización vinculada",
    ]);
    expect(
      fila(p, {
        postulacion: [
          enLaPostulacion(
            7,
            "Formato N°3 - Oferta económica - lleno.docx",
            "generado",
            12,
          ),
        ],
      })[0],
    ).toBe("lo_arma_la_ia");
    expect(
      fila(p, {
        postulacion: [
          enLaPostulacion(8, "Oferta económica por línea 4362-30-LE26.docx", "generado"),
        ],
      })[0],
    ).toBe("hecho");
  });

  it("lo de la propuesta técnica, aunque la propuesta lleve otro nombre", () => {
    expect(
      fila(pedido("Menú (formato libre)", "otro", { parte: "tecnica" }), {
        postulacion: [
          enLaPostulacion(
            9,
            "Especificaciones y detalle del servicio 4362-30-LE26.docx",
            "generado",
          ),
        ],
      }),
    ).toEqual([
      "hecho",
      "Hecho por la IA, falta firmarlo · Especificaciones y detalle del servicio 4362-30-LE26.docx",
    ]);
  });

  it("un formulario sin su formato: lo arma Eventia, sale de tu carpeta o se sube hecho; con su formato, lo llena la IA como siempre", () => {
    const identificacion = pedido(
      "Formato N°1 - Identificación del oferente",
      "formulario",
    );
    expect(
      fila(identificacion, {
        formularios: [formulario("Formato N°1 - Identificación del oferente", "")],
      }),
    ).toEqual([
      "lo_arma_la_ia",
      "Lo arma «Armar postulación» con tus datos de «Mi empresa»",
    ]);
    expect(
      fila(identificacion, {
        formularios: [
          formulario("Formato N°1 - Identificación del oferente", "Formatos.docx"),
        ],
      }),
    ).toEqual(["lo_arma_la_ia", "Lo arma «Armar postulación»"]);
    expect(
      fila(pedido("ANEXO N° 2 FORMULARIO PROGRAMA DE INTEGRIDAD", "formulario"), {
        formularios: [formulario("ANEXO N° 2 FORMULARIO PROGRAMA DE INTEGRIDAD", "")],
        carpeta: [
          {
            id: 2,
            tipo: "programa_integridad",
            nombre: "Programa de integridad.pdf",
            vence: null,
            creado_en: "2026-07-01T12:00:00.000Z",
          } as DocumentoDeEmpresa,
        ],
      }),
    ).toEqual(["en_tu_carpeta", "Programa de integridad.pdf"]);
    expect(
      fila(pedido("Anexos exigidos (no especificados)", "formulario"), {
        formularios: [formulario("Anexos exigidos (no especificados)", "")],
      }),
    ).toEqual(["falta", "Las bases no traen su formato: súbelo hecho"]);
  });
});
