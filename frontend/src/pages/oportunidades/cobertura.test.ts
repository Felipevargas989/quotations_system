import { describe, expect, it } from "vitest";
import type { CorridaDelRadar } from "../../services/oportunidades.service";
import { coberturaDe } from "./cobertura";

// «¿ESTÁ TODO?» (Felipe, 18-10: "¿cómo sé que está trayendo todas?").

const TERMINO = "2026-10-17T22:17:35Z"; // 19:17 de Chile
const AHORA = Date.parse("2026-10-17T23:00:00Z");

const corrida = (
  resumen: CorridaDelRadar["resumen"],
  extra: Partial<CorridaDelRadar> = {},
): CorridaDelRadar => ({
  id: 2,
  origen: "reloj",
  estado: "ok",
  empezo_en: "2026-10-17T21:07:00Z",
  termino_en: TERMINO,
  resumen,
  error: null,
  ...extra,
});

describe("¿Está todo?", () => {
  it("lo de la pasada de las 18:00 del 17-10: faltan licitaciones por traer", () => {
    expect(
      coberturaDe(
        [
          corrida({
            licitaciones: {
              estado: "cortada",
              activas: 4885,
              nuevas: 3986,
              pendientes: 3086,
              sin_detalle: 0,
            },
            compras_agiles: { estado: "ok", listadas: 750, pendientes: 0 },
            lectura: { sin_leer: 0 },
          }),
        ],
        AHORA,
      ),
    ).toEqual({
      tono: "faltan",
      texto:
        "Faltan 3.086 de 4.885 licitaciones de Chile: entran en las próximas pasadas",
    });
  });

  it("lo que Mercado Público no entregó y lo sin leer también cuentan", () => {
    expect(
      coberturaDe(
        [
          corrida({
            licitaciones: {
              estado: "ok",
              activas: 4900,
              pendientes: 0,
              sin_detalle: 2,
            },
            compras_agiles: { estado: "ok", listadas: 800, pendientes: 0 },
            lectura: { sin_leer: 12 },
          }),
        ],
        AHORA,
      )?.texto,
    ).toBe(
      "Faltan 2 de 4.900 licitaciones de Chile · 12 sin leer: entran en las próximas pasadas",
    );
  });

  it("al día: lo dice con los números", () => {
    expect(
      coberturaDe(
        [
          corrida({
            licitaciones: { estado: "ok", activas: 4900, pendientes: 0 },
            compras_agiles: { estado: "ok", listadas: 812, pendientes: 0 },
            lectura: { sin_leer: 0 },
          }),
        ],
        AHORA,
      ),
    ).toEqual({
      tono: "al_dia",
      texto:
        "Al día: 4.900 licitaciones de Chile y 812 compras ágiles de tus regiones",
    });
  });

  it("si Mercado Público no respondió, no dice «al día»", () => {
    expect(
      coberturaDe(
        [
          corrida({
            licitaciones: { estado: "caida", activas: 0 },
            compras_agiles: { estado: "ok", listadas: 800 },
          }),
        ],
        AHORA,
      ),
    ).toEqual({
      tono: "atrasado",
      texto:
        "La última pasada no trajo las licitaciones: Mercado Público no respondió",
    });
  });

  it("cada parte, según su último intento: las compras ágiles que llegaron en una pasada que se cayó después borran el aviso viejo (18-10)", () => {
    // Lo de la noche del 18-10: a las 18:07 Mercado Público no respondió
    // las compras ágiles; a las 23:07 sí llegaron (650), pero esa pasada se
    // cayó en la lectura y sus licitaciones nunca corrieron.
    const de1807 = corrida({
      licitaciones: { estado: "ok", activas: 4888, pendientes: 0 },
      compras_agiles: { estado: "caida", listadas: 0 },
      lectura: { sin_leer: 0 },
    });
    const de2307 = corrida(
      {
        licitaciones: { estado: "ok", activas: 0, pendientes: 0 },
        compras_agiles: { estado: "ok", listadas: 650, pendientes: 0 },
        lectura: { sin_leer: 0 },
      },
      { id: 11, estado: "error" },
    );
    expect(coberturaDe([de2307, de1807], AHORA)).toEqual({
      tono: "al_dia",
      texto:
        "Al día: 4.888 licitaciones de Chile y 650 compras ágiles de tus regiones",
    });
  });

  it("seis horas sin una pasada buena: avisa", () => {
    const seisHorasDespues = Date.parse(TERMINO) + 6 * 3_600_000;
    expect(
      coberturaDe(
        [corrida({ licitaciones: { estado: "ok", activas: 4900 } })],
        seisHorasDespues,
      ),
    ).toEqual({
      tono: "atrasado",
      texto: "El radar no termina bien una pasada desde hace 6 h",
    });
  });

  it("sin ninguna pasada buena todavía, no dice nada", () => {
    expect(coberturaDe([], AHORA)).toBeNull();
    expect(
      coberturaDe([corrida(null, { estado: "abandonada" })], AHORA),
    ).toBeNull();
  });
});
