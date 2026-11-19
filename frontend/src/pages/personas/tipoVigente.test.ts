import { describe, expect, it } from "vitest";
import type {
  CambioDeTipo,
  ResultadoDelCambio,
} from "../../types/people.types";
import {
  diaYMes,
  historialReciente,
  lineaDeOrigen,
  proximoCambio,
  textoDelProximo,
  textosDeLaVentana,
  textosDelOrigen,
} from "./tipoVigente";

// LA VENTANA «DESDE» (doc 10 §12, 17-11-2026). Felipe: "la ventana desde
// desarrollemos en el laboratorio". Sofía pasó a planta el 01-11 y se
// registró después.

const cambio = (over: Partial<CambioDeTipo>): CambioDeTipo => ({
  kind: "planta",
  anterior: "freelance",
  desde: "2026-11-01",
  registrado_en: "2026-11-17T12:00:00Z",
  ...over,
});

const resultado = (over: Partial<ResultadoDelCambio>): ResultadoDelCambio => ({
  kind: "planta",
  anterior: "freelance",
  desde: "2026-11-01",
  futuro: false,
  aPlanta: 0,
  aFreelance: 0,
  quitan: 0,
  sinTocar: 0,
  ...over,
});

describe("el próximo cambio: «Pasa a planta el 01-11»", () => {
  it("toma el más cercano que todavía no rige", () => {
    const persona = {
      historial_tipo: [
        cambio({ desde: "2026-10-01" }),
        cambio({ desde: "2026-12-15", kind: "freelance", anterior: "planta" }),
        cambio({ desde: "2026-11-20" }),
      ],
    };
    const p = proximoCambio(persona, "2026-11-17");
    expect(p?.desde).toBe("2026-11-20");
    expect(textoDelProximo(p as CambioDeTipo)).toBe("Pasa a planta el 20-11");
  });

  it("sin cambios por venir, no hay nada que decir", () => {
    expect(proximoCambio({ historial_tipo: [cambio({})] }, "2026-11-17")).toBe(
      null,
    );
    expect(proximoCambio({}, "2026-11-17")).toBe(null);
  });

  it("el historial se lee de lo más nuevo a lo más viejo", () => {
    const orden = historialReciente([
      cambio({ desde: "2026-10-01" }),
      cambio({ desde: "2026-11-01", kind: "freelance", anterior: "planta" }),
    ]).map((c) => c.desde);
    expect(orden).toEqual(["2026-11-01", "2026-10-01"]);
    expect(diaYMes("2026-11-01")).toBe("01-11");
  });
});

describe("textosDeLaVentana", () => {
  it("fecha pasada a planta: cuántos días cambian y que desde hoy se carga sola", () => {
    const t = textosDeLaVentana(resultado({ aPlanta: 9 }));
    expect(t.lineas).toEqual([
      "9 días de staff desde el 01-11 pasan a planta.",
      "Desde hoy, el sistema le carga sus días de planta.",
    ]);
    expect(t.aviso).toBe(null);
  });

  it("lo que ya está en una nómina se avisa aparte", () => {
    expect(
      textosDeLaVentana(resultado({ aPlanta: 2, sinTocar: 1 })).aviso,
    ).toBe("1 día queda sin tocar: ya está en una liquidación o nómina.");
    expect(textosDeLaVentana(resultado({ sinTocar: 4 })).aviso).toBe(
      "4 días quedan sin tocar: ya están en una liquidación o nómina.",
    );
  });

  it("fecha futura: sigue como estaba hasta ese día", () => {
    const t = textosDeLaVentana(
      resultado({ futuro: true, desde: "2026-12-01" }),
    );
    expect(t.lineas).toEqual([
      "Sigue como freelance hasta ese día.",
      "Desde el 01-12, el sistema le carga sus días de planta.",
    ]);
  });

  it("de planta a freelance: se quitan los del sistema y lo trabajado espera su monto", () => {
    const t = textosDeLaVentana(
      resultado({
        kind: "freelance",
        anterior: "planta",
        quitan: 120,
        aFreelance: 3,
      }),
    );
    expect(t.lineas).toEqual([
      "Se le quitan 120 días de planta que puso el sistema.",
      "3 días que ya trabajó quedan como freelance, esperando su monto.",
    ]);
  });
});

describe("la línea de origen y los textos de «desde cuándo» (§12.1)", () => {
  it("sin historial: su tipo de hoy, desde el inicio", () => {
    expect(
      lineaDeOrigen({ default_kind: "planta", historial_tipo: [] }),
    ).toEqual({ kind: "planta", hasta: null });
  });

  it("con historial: el «anterior» del primer cambio, hasta ese cambio", () => {
    expect(
      lineaDeOrigen({
        default_kind: "freelance",
        historial_tipo: [
          cambio({
            kind: "freelance",
            anterior: "planta",
            desde: "2026-12-01",
          }),
          cambio({
            kind: "planta",
            anterior: "freelance",
            desde: "2026-11-01",
          }),
        ],
      }),
    ).toEqual({ kind: "freelance", hasta: "2026-11-01" });
  });

  it("los días de antes se dicen sin alarma; si nada cambia, también", () => {
    const t = textosDelOrigen({ ...resultado({}), antes: 1 });
    expect(t.lineas).toEqual([
      "Sus días desde el 01-11 ya están como planta.",
      "1 día de antes del 01-11 queda como está.",
    ]);
    expect(t.aviso).toBeNull();
  });
});
