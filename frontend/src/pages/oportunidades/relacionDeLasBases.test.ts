import { describe, expect, it } from "vitest";
import type { FilaDeLaOferta } from "../../services/postulacion.service";
import type { FilaDelChecklist } from "./checklistDeDocumentos";
import { claveDeExigencia, type Exigencia } from "./exigencias";
import {
  comoVasEn,
  estadoDeExigencia,
  estadoDeLoQueTeDejaFuera,
  numerosDeFormularios,
  ofertaDeCadaExigencia,
  resumenDeLasExigencias,
  selloDeLaExperiencia,
  selloDeLaIntegridad,
  selloDeLasExigencias,
  selloDeLosDocumentos,
  textoDeLaOferta,
} from "./relacionDeLasBases";

// «BASES Y CRITERIOS» RELACIONADO (decisión 80 del doc 17, 26-10). Los
// datos son los del Día de Campo (5040-14-LE26): las exigencias del
// análisis y la oferta armada leen las mismas bases punto por punto.

const exigencia = (
  que: string,
  pagina: number,
  ia: Exigencia["ia"] = "conseguir",
): Exigencia => ({
  clave: claveDeExigencia(que),
  que,
  pagina,
  ia,
  detalle: null,
});

const EXIGENCIAS = [
  exigencia(
    "Recinto con capacidad mínima para 550 personas, en el radio urbano de Quillón y a no más de 10 km del municipio",
    19,
    "tengo",
  ),
  exigencia(
    "Mesas y sillas o zona de picnic para 550 personas, máximo 10 por mesa",
    19,
  ),
  exigencia("Baños no portátiles y camarines para 550 personas", 19),
  exigencia(
    "Recinto privado y exclusivo para el día de campo, con el ticket de ingreso incluido",
    19,
    "tengo",
  ),
  exigencia(
    "Colación de 17:00 a 18:00 para 550 personas: empanadas de varias variedades de 250 g, en envase sellado o servilleta, más bebida en lata, jugo o café a elección",
    18,
  ),
  exigencia(
    "Línea 2: pantalla LED de 3x2 m con estructura, notebook, audio completo con generador y escenario de 3,60 x 2,40 x 0,80 m",
    19,
  ),
];

const fila = (
  especificacion: string,
  pagina: number,
  origen: FilaDeLaOferta["origen"],
  como = "",
): FilaDeLaOferta => ({ especificacion, pagina, origen, como, productos: [] });

const MATRIZ = [
  fila(
    "Formulario Anexo N°4 Calidad de la oferta, con la totalidad de los requerimientos de las Bases Técnicas",
    12,
    "completar",
  ),
  fila(
    "Complejo turístico/Centro de esparcimiento con capacidad mínima para 550 personas, en el radio urbano de Quillón y a no más de 10 km del edificio municipal",
    19,
    "catalogo",
    "Complejo turístico Valle del Sol, a 1 km del edificio municipal.",
  ),
  fila(
    "Mesas y sillas o zona de picnic para 550 personas, con un máximo de 10 personas por mesa",
    19,
    "subcontratar",
    "Mesas y sillas para 550 personas, con un máximo de 10 personas por mesa.",
  ),
  fila(
    "Baños (no portátiles) y camarines con capacidad para 550 personas",
    19,
    "catalogo",
  ),
  fila(
    "Recinto privado, con exclusividad para el día de campo; ticket diario de ingreso al lugar",
    19,
    "catalogo",
  ),
  fila(
    "Colación media tarde 17:00 a 18:00 horas: empanadas diferentes variedades de 250 g c/u en envase sellado o envueltas en servilleta; bebida en lata, jugo o café",
    18,
    "catalogo",
  ),
  fila(
    "Línea N°2: pantalla LED 3x2 m con estructura y notebook; audio completo con generador; escenario de 3,60 x 2,40 x 0,80 m",
    19,
    "completar",
    "[COMPLETAR: Valle del Sol postula solo a la Línea N°1; esta especificación no forma parte de la oferta]",
  ),
];

const documento = (
  nombre: string,
  estado: FilaDelChecklist["estado"],
  cuando: FilaDelChecklist["cuando"] = "con_la_oferta",
): FilaDelChecklist => ({
  nombre,
  parte: "administrativa",
  cuando,
  obligatorio: true,
  condicion: "",
  carpeta: "otro",
  pagina: 8,
  estado,
  detalle: null,
});

const DOCUMENTOS = [
  documento("Formulario N°1 Identificación del oferente", "firmado"),
  documento("Patente municipal", "en_tu_carpeta"),
  documento("Programa de integridad y ética empresarial", "en_tu_carpeta"),
  documento(
    "Certificación de que el personal conoce el programa de integridad",
    "falta",
  ),
  documento("Formulario N°3 Experiencia del oferente", "firmado"),
  documento("Formulario N°4 Calidad de la oferta", "firmado"),
  documento("Formulario N°5 Oferta económica", "hecho"),
  documento("Set fotográfico", "falta", "al_pagar"),
];

describe("cada exigencia con la línea de la oferta que la cubre", () => {
  const cubre = ofertaDeCadaExigencia(EXIGENCIAS, MATRIZ);

  it("se juntan por lo que dicen, sin confundir los dos recintos ni tomar los formularios", () => {
    expect(EXIGENCIAS.map((e) => cubre.get(e.clave)?.origen)).toEqual([
      "catalogo",
      "subcontratar",
      "catalogo",
      "catalogo",
      "catalogo",
      "completar",
    ]);
    expect(cubre.get(EXIGENCIAS[0].clave)?.especificacion).toMatch(
      /^Complejo turístico/,
    );
    expect(cubre.get(EXIGENCIAS[3].clave)?.especificacion).toMatch(
      /^Recinto privado/,
    );
  });

  it("un solo estado: manda lo que marcaste, después la oferta y al final la IA", () => {
    const [recinto, mesas, , , , linea2] = EXIGENCIAS;
    expect(estadoDeExigencia(mesas, undefined, cubre.get(mesas.clave))).toBe(
      "subcontratar",
    );
    expect(estadoDeExigencia(mesas, "lo_tengo", cubre.get(mesas.clave))).toBe(
      "lo_tienes",
    );
    expect(estadoDeExigencia(linea2, undefined, cubre.get(linea2.clave))).toBe(
      "no_va",
    );
    expect(estadoDeExigencia(recinto, undefined, undefined)).toBe(
      "ia_lo_tienes",
    );
    expect(estadoDeExigencia(mesas, undefined, undefined)).toBe("ia_conseguir");
    expect(
      estadoDeExigencia({ ia: null }, undefined, fila("x", 1, "completar")),
    ).toBe("por_definir");
    expect(estadoDeExigencia({ ia: null }, "no_puedo", undefined)).toBe(
      "no_puedes",
    );
  });

  it("el resumen y el sello de las exigencias", () => {
    const estados = EXIGENCIAS.map((e) =>
      estadoDeExigencia(e, undefined, cubre.get(e.clave)),
    );
    expect(resumenDeLasExigencias(estados)).toBe(
      "6 exigencias: 1 por subcontratar · 4 de tu catálogo · 1 no va",
    );
    expect(selloDeLasExigencias(estados)).toEqual({
      tono: "ojo",
      texto: "1 por subcontratar",
    });
    expect(selloDeLasExigencias(["catalogo", "no_va"])).toEqual({
      tono: "bien",
      texto: "todo cubierto",
    });
    expect(selloDeLasExigencias(["catalogo", "no_puedes"])).toEqual({
      tono: "mal",
      texto: "1 que no puedes",
    });
    expect(selloDeLasExigencias([])).toBeNull();
  });
});

describe("cómo vas en cada criterio", () => {
  const vas = {
    precio: {
      tono: "bien" as const,
      texto: "Calza: 0,3 % bajo el presupuesto",
    },
    experiencia: selloDeLaExperiencia({
      piden: true,
      confirmada: true,
      contratos: 8,
      pide: 6,
    }),
    exigencias: { tono: "ojo" as const, texto: "1 por subcontratar" },
    documentos: selloDeLosDocumentos(DOCUMENTOS),
    integridad: selloDeLaIntegridad(DOCUMENTOS),
  };

  it("cada criterio de la 5040-14-LE26 con lo que lo mide", () => {
    expect(
      [
        "Calidad de la oferta",
        "Oferta económica",
        "Experiencia del oferente",
        "Cumplimiento de requisitos formales",
        "Programa de integridad y ética empresarial",
        "Plazo de entrega",
      ].map((c) => comoVasEn(c, vas)?.texto ?? null),
    ).toEqual([
      "1 por subcontratar",
      "Calza: 0,3 % bajo el presupuesto",
      "8 contratos: puntaje máximo",
      "5 de 7 listos",
      "falta 1 de 2",
      null,
    ]);
  });

  it("la experiencia: sin confirmar, bajo el máximo o sin que la pidan", () => {
    expect(
      selloDeLaExperiencia({
        piden: true,
        confirmada: false,
        contratos: 0,
        pide: 6,
      }),
    ).toEqual({ tono: "ojo", texto: "por confirmar" });
    expect(
      selloDeLaExperiencia({
        piden: true,
        confirmada: true,
        contratos: 4,
        pide: 6,
      }),
    ).toEqual({ tono: "ojo", texto: "4 contratos de 6 para el máximo" });
    expect(
      selloDeLaExperiencia({
        piden: false,
        confirmada: false,
        contratos: 0,
        pide: 0,
      }),
    ).toBeNull();
  });
});

describe("lo que te deja fuera, con su estado", () => {
  const c = {
    filas: DOCUMENTOS,
    precio: {
      tono: "bien" as const,
      texto: "Calza: 0,3 % bajo el presupuesto",
    },
    exigencias: { tono: "ojo" as const, texto: "1 por subcontratar" },
  };

  it("los N° de los formularios que nombra; la línea no cuenta", () => {
    expect(
      numerosDeFormularios(
        "Sin los Formularios N°3 (con respaldos), N°4 o N°5 quedas fuera de bases.",
      ),
    ).toEqual([3, 4, 5]);
    expect(
      numerosDeFormularios("Ofertar más que el monto de la Línea N°1."),
    ).toEqual([]);
    expect(numerosDeFormularios("Sin el Anexo 3 firmado.")).toEqual([3]);
  });

  it("cada causa de las bases reales con lo que la resuelve", () => {
    expect(
      [
        "Sin los Formularios N°3 (con respaldos), N°4 o N°5 quedas fuera de bases.",
        "Ofertar más que el monto disponible de la línea ($17.200.000 en la Línea 1).",
        "No ofrecer el 100% de los servicios de la línea postulada.",
        "Sin patente municipal la oferta se descarta.",
        "Ofertar más de $12.000.000 con IVA queda fuera de bases.",
        "No completar en 48 horas los documentos que te pidan por foro inverso.",
      ].map((t) => estadoDeLoQueTeDejaFuera(t, c)),
    ).toEqual([
      { tono: "ojo", texto: "N°5 falta firmar" },
      { tono: "bien", texto: "calza" },
      { tono: "ojo", texto: "1 por subcontratar" },
      { tono: "bien", texto: "en tu carpeta" },
      { tono: "bien", texto: "calza" },
      null,
    ]);
  });

  it("si un formulario falta, manda eso; varios se nombran juntos", () => {
    const filas = [
      documento("Formulario N°3 Experiencia", "falta"),
      documento("Formulario N°5 Oferta económica", "falta"),
      documento("Formulario N°4 Calidad", "hecho"),
    ];
    expect(
      estadoDeLoQueTeDejaFuera("Sin los Formularios N°3, N°4 o N°5.", {
        ...c,
        filas,
      }),
    ).toEqual({ tono: "mal", texto: "N°3 y N°5 faltan" });
  });
});

describe("lo que dice cada línea de la oferta", () => {
  it("solo un dato por completar, ese dato; entre medio, marcado", () => {
    expect(
      textoDeLaOferta(
        "[COMPLETAR: Valle del Sol postula solo a la Línea N°1; esta especificación no forma parte de la oferta]",
      ),
    ).toBe(
      "Valle del Sol postula solo a la Línea N°1; esta especificación no forma parte de la oferta",
    );
    expect(
      textoDeLaOferta(
        "Show de baile inspirado en [COMPLETAR: película o temática del show], de 40 minutos.",
      ),
    ).toBe(
      "Show de baile inspirado en [por definir: película o temática del show], de 40 minutos.",
    );
    expect(textoDeLaOferta("Salón climatizado para 160.")).toBe(
      "Salón climatizado para 160.",
    );
  });
});
