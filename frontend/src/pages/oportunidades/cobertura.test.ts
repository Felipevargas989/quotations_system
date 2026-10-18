import { describe, expect, it } from "vitest";
import type { CorridaDelRadar } from "../../services/oportunidades.service";
import { coberturaDe } from "./cobertura";

// «¿ESTÁ TODO?» (Felipe, 18-10: "¿cómo sé que está trayendo todas?").

const TERMINO = "2026-10-17T22:17:35Z"; // 19:17 de Chile
const AHORA = Date.parse("2026-10-17T23:00:00Z");

const corrida = (
  resumen: CorridaDelRadar["resumen"],
  termino: string = TERMINO,
): CorridaDelRadar => ({
  id: 2,
  origen: "reloj",
  estado: "ok",
  empezo_en: "2026-10-17T21:07:00Z",
  termino_en: termino,
  resumen,
  error: null,
});

describe("¿Está todo?", () => {
  it("lo de la pasada de las 18:00 del 17-10: faltan licitaciones por traer", () => {
    expect(
      coberturaDe(
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
        AHORA,
      )?.texto,
    ).toBe(
      "Faltan 2 de 4.900 licitaciones de Chile · 12 sin leer: entran en las próximas pasadas",
    );
  });

  it("al día: lo dice con los números", () => {
    expect(
      coberturaDe(
        corrida({
          licitaciones: { estado: "ok", activas: 4900, pendientes: 0 },
          compras_agiles: { estado: "ok", listadas: 812, pendientes: 0 },
          lectura: { sin_leer: 0 },
        }),
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
        corrida({
          licitaciones: { estado: "caida", activas: 0 },
          compras_agiles: { estado: "ok", listadas: 800 },
        }),
        AHORA,
      ),
    ).toEqual({
      tono: "atrasado",
      texto:
        "La última pasada no trajo las licitaciones: Mercado Público no respondió",
    });
  });

  it("seis horas sin una pasada buena: avisa", () => {
    const seisHorasDespues = Date.parse(TERMINO) + 6 * 3_600_000;
    expect(
      coberturaDe(
        corrida({ licitaciones: { estado: "ok", activas: 4900 } }),
        seisHorasDespues,
      ),
    ).toEqual({
      tono: "atrasado",
      texto: "El radar no termina bien una pasada desde hace 6 h",
    });
  });

  it("sin ninguna pasada buena todavía, no dice nada", () => {
    expect(coberturaDe(undefined, AHORA)).toBeNull();
  });
});
