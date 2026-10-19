import { describe, expect, it } from "vitest";
import type { Generacion } from "../../services/oportunidades.service";
import type { TrabajoDeOferta } from "../../services/postulacion.service";
import { vueltaDeLaPostulacion } from "./vueltaDeLaPostulacion";

// «Armar postulación» (decisión 35, 19-10): en qué va cada paso. Un
// documento es de esta vuelta si se pidió después de la oferta.

const OFERTA = {
  id: 21,
  estado: "listo",
  creado_en: "2026-10-19T17:00:00.000Z",
  terminado_en: "2026-10-19T17:04:00.000Z",
  parametros: { postulacion: { total: 11_900_000, propuesta: true } },
} as unknown as TrabajoDeOferta;

const trabajo = (estado: string, creado_en: string) =>
  ({ id: 30, estado, creado_en }) as unknown as Generacion;

const AHORA = Date.parse("2026-10-19T17:05:00.000Z");

describe("La vuelta de «Armar postulación»", () => {
  it("una oferta que no salió de «Armar postulación» no es una vuelta", () => {
    expect(
      vueltaDeLaPostulacion({ ...OFERTA, parametros: {} }, null, AHORA),
    ).toBeNull();
    expect(vueltaDeLaPostulacion(null, null, AHORA)).toBeNull();
  });

  it("mientras se arma la oferta, los documentos esperan", () => {
    const v = vueltaDeLaPostulacion(
      { ...OFERTA, estado: "procesando", terminado_en: null },
      { anexos: trabajo("listo", "2026-10-18T12:00:00.000Z") } as never,
      AHORA,
    );
    expect(v).toMatchObject({
      total: 11_900_000,
      oferta: "trabajando",
      anexos: { estado: "espera", generacion: null },
      enCurso: true,
    });
  });

  it("los documentos de esta vuelta cuentan; los de antes, no", () => {
    const v = vueltaDeLaPostulacion(
      OFERTA,
      {
        anexos: trabajo("procesando", "2026-10-19T17:04:05.000Z"),
        propuesta: trabajo("listo", "2026-10-18T12:00:00.000Z"),
      } as never,
      AHORA,
    );
    expect(v?.anexos.estado).toBe("trabajando");
    expect(v?.propuesta.estado).toBe("espera");
    expect(v?.enCurso).toBe(true);
  });

  it("todo listo, o la propuesta no va: ya no hay nada en curso", () => {
    const v = vueltaDeLaPostulacion(
      {
        ...OFERTA,
        parametros: { postulacion: { total: 11_900_000, propuesta: false } },
      },
      { anexos: trabajo("listo", "2026-10-19T17:04:05.000Z") } as never,
      AHORA,
    );
    expect(v).toMatchObject({
      anexos: { estado: "listo" },
      propuesta: { estado: "no_va" },
      enCurso: false,
    });
  });

  it("lo que falló con la cotización vinculada se dice aparte", () => {
    const v = vueltaDeLaPostulacion(
      {
        ...OFERTA,
        parametros: {
          postulacion: {
            total: 10_800_000,
            propuesta: true,
            problemas: [
              "La cotización vinculada: Tu precio ($10.800.000) es mayor que tu catálogo ($9.296.000).",
            ],
          },
        },
      },
      null,
      AHORA,
    );
    expect(v?.avisos).toEqual([
      "La cotización vinculada: Tu precio ($10.800.000) es mayor que tu catálogo ($9.296.000).",
    ]);
    expect(v?.anexos.estado).toBe("espera");
  });

  it("lo que no alcanzó a partir, o no aparece en 3 minutos, se puede reintentar", () => {
    const conProblema = vueltaDeLaPostulacion(
      {
        ...OFERTA,
        parametros: {
          postulacion: {
            total: 11_900_000,
            propuesta: true,
            problemas: ["Los anexos: No hay formularios para llenar."],
          },
        },
      },
      null,
      AHORA,
    );
    expect(conProblema?.anexos).toEqual({
      estado: "error",
      generacion: null,
      problema: "Los anexos: No hay formularios para llenar.",
    });
    const tarde = vueltaDeLaPostulacion(
      OFERTA,
      null,
      Date.parse("2026-10-19T17:08:00.000Z"),
    );
    expect(tarde?.propuesta).toMatchObject({
      estado: "error",
      problema: "No alcanzó a partir: reinténtalo.",
    });
    expect(tarde?.enCurso).toBe(false);
  });
});
