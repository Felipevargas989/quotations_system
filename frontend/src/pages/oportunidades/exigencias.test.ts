import { describe, expect, it } from "vitest";
import type { ResultadoDeBases } from "../../services/oportunidades.service";
import { claveDeExigencia, cuentaDeMarcas, exigenciasDe } from "./exigencias";

// LAS EXIGENCIAS DE LA LICITACIÓN (19-10). Felipe: "un listado de
// exigencias, así como almuerzo, esto... y si marco uno que no puedo,
// bueno, desisto". Lo que es un documento va en el checklist, no aquí.

const requisito = (que: string, pagina: number, tipo = "tecnico") => ({
  que,
  tipo,
  obligatorio: true,
  documento: "Bases.pdf",
  pagina,
});

const REQUISITOS = [
  requisito("Boleta de garantía", 9, "garantia"),
  requisito("Almuerzo con plateada al horno", 18),
  requisito("Exclusividad del recinto", 19),
  requisito("Certificado de la SEREMI de Salud", 20),
] as ResultadoDeBases["requisitos"];

describe("Las exigencias de la licitación", () => {
  it("la clave: sin tildes ni mayúsculas, para que la marca siga a su exigencia", () => {
    expect(claveDeExigencia("  Almuerzo   con PLATEADA al horno ")).toBe(
      "almuerzo con plateada al horno",
    );
    expect(claveDeExigencia("Exclusividad del recinto")).toBe(
      claveDeExigencia("exclusividad del  recinto"),
    );
    expect(claveDeExigencia("x".repeat(500))).toHaveLength(400);
  });

  it("sin «¿Puedo cumplir?»: las exigencias técnicas, sin los documentos", () => {
    const exigencias = exigenciasDe({ requisitos: REQUISITOS });
    expect(exigencias.map((e) => [e.que, e.pagina, e.ia])).toEqual([
      ["Almuerzo con plateada al horno", 18, null],
      ["Exclusividad del recinto", 19, null],
    ]);
  });

  it("con «¿Puedo cumplir?»: lo que sugiere la IA, con su página y con qué", () => {
    const exigencias = exigenciasDe({
      requisitos: REQUISITOS,
      cumplimiento: {
        resumen: "",
        agenda_de: null,
        items: [
          {
            requisito: 1,
            que: "Almuerzo con plateada al horno",
            estado: "tengo",
            con_que: "Menú guardado [Almuerzo] Plateada",
            por_que: "",
          },
          {
            requisito: 2,
            que: "Exclusividad del recinto",
            estado: "no_se_puede",
            con_que: "",
            por_que: "Ese día hay un matrimonio.",
          },
          {
            requisito: 3,
            que: "Certificado de la SEREMI de Salud",
            estado: "conseguir",
            con_que: "",
            por_que: "",
          },
        ],
      },
    } as Pick<ResultadoDeBases, "requisitos" | "cumplimiento">);
    expect(exigencias).toEqual([
      {
        clave: "almuerzo con plateada al horno",
        que: "Almuerzo con plateada al horno",
        pagina: 18,
        ia: "tengo",
        detalle: "Con: Menú guardado [Almuerzo] Plateada",
      },
      {
        clave: "exclusividad del recinto",
        que: "Exclusividad del recinto",
        pagina: 19,
        ia: "no_se_puede",
        detalle: "Ese día hay un matrimonio.",
      },
    ]);
  });

  it("la cotización, la propuesta y las fotos son papeles: no se marcan aquí (decisión 120)", () => {
    // Las exigencias reales de la 2656-97-LE26 (08-11): la primera se coló
    // como pregunta antes de armar.
    const exigencias = exigenciasDe({
      requisitos: [],
      cumplimiento: {
        resumen: "",
        agenda_de: null,
        items: [
          "Cotización general del servicio y fotos del recinto",
          "Propuesta técnica que cumpla todos los requerimientos técnicos",
          "Fotografías del salón, las áreas verdes, el estacionamiento y los baños",
          "Garantizar los 200 servicios aunque asistan menos personas",
          "Menú para 80 personas: vacuno o pechuga a la plancha y opción vegana",
          "Bus con capacidad mínima de 42 pasajeros sentados",
        ].map((que, i) => ({
          requisito: i + 1,
          que,
          estado: "conseguir" as const,
          con_que: "",
          por_que: "",
        })),
      },
    } as Pick<ResultadoDeBases, "requisitos" | "cumplimiento">);
    expect(exigencias.map((e) => e.que)).toEqual([
      "Garantizar los 200 servicios aunque asistan menos personas",
      "Menú para 80 personas: vacuno o pechuga a la plancha y opción vegana",
      "Bus con capacidad mínima de 42 pasajeros sentados",
    ]);
  });

  it("cuenta lo marcado y junta lo que no puedes", () => {
    const exigencias = exigenciasDe({ requisitos: REQUISITOS });
    const cuenta = cuentaDeMarcas(exigencias, {
      "exclusividad del recinto": "no_puedo",
      // Una marca de una exigencia que ya no está no cuenta.
      "show de baile": "lo_tengo",
    });
    expect(cuenta.loTengo).toBe(0);
    expect(cuenta.noPuedo.map((e) => e.que)).toEqual([
      "Exclusividad del recinto",
    ]);
    expect(cuenta.sinMarcar).toBe(1);
  });
});
