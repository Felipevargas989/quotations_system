import { describe, expect, it } from "vitest";
import {
  avisoAlGuardar,
  cuandoEsElServicio,
  separarGanadas,
} from "./servicioDeLaGanada";

// LA PESTAÑA «GANADAS» (decisión 100, 28-10): por cumplir hasta el último
// día del servicio; cumplidas desde el día siguiente.

const ganada = (id: number, dias: string[]) => ({
  id,
  servicio: { texto: "…", dias },
});

describe("Las ganadas", () => {
  it("por cumplir, del próximo servicio al más lejano y las sin fecha al final; cumplidas, la más reciente primero", () => {
    const { porCumplir, cumplidas } = separarGanadas(
      [
        ganada(1, ["2026-11-26"]),
        ganada(2, ["2026-10-27"]),
        // Empezó el 25 y sigue el 30: aún por cumplir.
        ganada(3, ["2026-10-25", "2026-10-30"]),
        ganada(4, ["2026-10-28"]),
        { id: 5, servicio: null },
        ganada(6, ["2026-10-20"]),
      ],
      "2026-10-28",
    );
    expect(porCumplir.map((m) => m.id)).toEqual([4, 3, 1, 5]);
    expect(cumplidas.map((m) => m.id)).toEqual([2, 6]);
  });

  it("cuándo es: hoy o mañana, urgente; si no, en cuántos días", () => {
    // La 1030177-85-COT26, el día del servicio.
    expect(
      cuandoEsElServicio(
        {
          texto: "28 de octubre 2026, hora por confirmar",
          dias: ["2026-10-28"],
        },
        "2026-10-28",
      ),
    ).toEqual({ texto: "hoy", dia: "2026-10-28", urgente: true });
    expect(
      cuandoEsElServicio({ texto: "", dias: ["2026-10-29"] }, "2026-10-28"),
    ).toMatchObject({ texto: "mañana", urgente: true });
    // Varios días: el próximo que viene.
    expect(
      cuandoEsElServicio(
        { texto: "", dias: ["2026-11-25", "2026-12-19"] },
        "2026-11-30",
      ),
    ).toEqual({ texto: "en 19 días", dia: "2026-12-19", urgente: false });
  });

  it("sin fecha en las bases, o ya pasado, no dice cuándo", () => {
    expect(
      cuandoEsElServicio(
        { texto: "Contrato de 6 meses", dias: [] },
        "2026-10-28",
      ),
    ).toBeNull();
    expect(
      cuandoEsElServicio({ texto: "", dias: ["2026-10-27"] }, "2026-10-28"),
    ).toBeNull();
    expect(cuandoEsElServicio(null, "2026-10-28")).toBeNull();
  });

  it("decisión 104: al marcarla ganada, el aviso dice si su cotización quedó aceptada", () => {
    expect(
      avisoAlGuardar({
        id: 5171,
        cotizacion_aceptada: { numero: 679, vence: "2026-11-27" },
      }),
    ).toBe(
      "Guardado. La cotización N° 679 quedó aceptada, con una cuota que vence el viernes 27 de noviembre.",
    );
    expect(avisoAlGuardar({ id: 5171, cotizacion_aceptada: null })).toBe(
      "Guardado.",
    );
    expect(avisoAlGuardar(undefined)).toBe("Guardado.");
  });
});
