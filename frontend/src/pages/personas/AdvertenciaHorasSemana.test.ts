import { describe, it, expect } from "vitest";
import { diasConExceso, resumenSemanaDePlanta } from "./AdvertenciaHorasSemana";
import type { Asignacion, Persona } from "../../types/people.types";

/**
 * LAS HORAS DE LA SEMANA DE PLANTA (capítulo 11; caso Sofía, 10-11-2026).
 *
 * El caso real: Sofía, planta de recepción con libres el martes y el
 * miércoles, tiene una jornada definida de 42 h. La semana del 1 al 7 de
 * noviembre trabajó 6 días, también el miércoles 4, su libre: 51 h. La
 * liquidación la trajo además a Ecofor y a FDN Canotaje esos mismos días,
 * como planta, para la propina. La casilla de Planificación sumaba esas
 * filas y le daba 128 h.
 */
const sofia = {
  id: 19,
  name: "Sofía",
  default_kind: "planta",
  days_off: [2, 3],
  default_starts_at: null,
  default_ends_at: null,
  default_break_minutes: null,
  weekly_schedule: {
    "0": { in: "10:00", out: "19:00" },
    "1": { in: "10:00", out: "19:00" },
    "4": { in: "10:00", out: "19:00" },
    "5": { in: "10:00", out: "20:00" },
    "6": { in: "10:00", out: "20:00" },
  },
} as unknown as Persona;

let siguiente = 1;
const jornada = (
  day: string,
  starts_at: string,
  ends_at: string,
  extra: Partial<Asignacion> = {},
): Asignacion => ({
  id: siguiente++,
  quotation_id: null,
  person_id: 19,
  day,
  role_id: 32,
  kind: "planta",
  starts_at,
  ends_at,
  break_minutes: 60,
  status: "confirmado",
  amount: null,
  notes: null,
  tip_amount: null,
  tip_pool_id: null,
  payroll_id: null,
  tip_payroll_id: null,
  ...extra,
});

const ECOFOR = "ecofor";
const CANOTAJE = "canotaje";

const dias = (desde: number, hasta: number) =>
  Array.from(
    { length: hasta - desde + 1 },
    (_, i) => `2026-11-${String(desde + i).padStart(2, "0")}`,
  );

/** Sus días de staff de esa semana, como quedaron en producción. */
const semanaDel1Al7 = [
  jornada("2026-11-01", "10:00", "19:00", { ajuste: "trabaja" }),
  jornada("2026-11-02", "10:00", "19:00"),
  jornada("2026-11-04", "11:00", "21:00", { ajuste: "trabaja" }),
  jornada("2026-11-05", "10:00", "19:00"),
  jornada("2026-11-06", "10:00", "20:00"),
  jornada("2026-11-07", "10:00", "20:00", { ajuste: "trabaja" }),
];

/** Lo que la liquidación trajo a los eventos: el mismo turno, otra fila. */
const traidasALosEventos = [
  jornada("2026-11-01", "10:00", "19:00", { quotation_id: ECOFOR }),
  jornada("2026-11-02", "10:00", "19:00", { quotation_id: ECOFOR }),
  jornada("2026-11-04", "11:00", "21:00", { quotation_id: ECOFOR }),
  jornada("2026-11-05", "10:00", "19:00", { quotation_id: ECOFOR }),
  jornada("2026-11-06", "10:00", "20:00", { quotation_id: ECOFOR }),
  jornada("2026-11-04", "11:00", "21:00", { quotation_id: CANOTAJE }),
  jornada("2026-11-05", "10:00", "19:00", { quotation_id: CANOTAJE }),
  jornada("2026-11-06", "10:00", "20:00", { quotation_id: CANOTAJE }),
  jornada("2026-11-07", "10:00", "20:00", { quotation_id: CANOTAJE }),
];

describe("resumenSemanaDePlanta", () => {
  it("su jornada definida: 42 h (cinco días con una hora de colación)", () => {
    expect(resumenSemanaDePlanta(sofia, "2026-11-04", []).definidas).toBe(42);
  });

  it("suma sus días de staff: 51 h", () => {
    expect(
      resumenSemanaDePlanta(sofia, "2026-11-04", semanaDel1Al7).horas,
    ).toBe(51);
  });

  it("la planta que la liquidación trae a un evento no suma: 51 h, no 128", () => {
    const crudas = [...semanaDel1Al7, ...traidasALosEventos];
    expect(resumenSemanaDePlanta(sofia, "2026-11-04", crudas).horas).toBe(51);
  });

  it("tampoco suman el freelance, la fila solo-propina ni el día que descansa", () => {
    const otras = [
      jornada("2026-11-03", "10:00", "19:00", {
        kind: "freelance",
        amount: 25000,
      }),
      jornada("2026-11-03", "10:00", "19:00", {
        quotation_id: ECOFOR,
        kind: "freelance",
        solo_propina: true,
        no_tip: true,
      }),
      jornada("2026-11-03", "10:00", "19:00", { ajuste: "descansa" }),
    ];
    expect(resumenSemanaDePlanta(sofia, "2026-11-04", otras).horas).toBe(0);
  });
});

describe("diasConExceso (el reloj rojo)", () => {
  it("marca solo el miércoles 4, su libre, con las horas reales de la semana", () => {
    const crudas = [...semanaDel1Al7, ...traidasALosEventos];
    const marcas = diasConExceso(sofia, dias(1, 7), crudas);
    expect([...marcas.keys()]).toEqual(["2026-11-04"]);
    expect(marcas.get("2026-11-04")).toContain("51 h de planta");
    expect(marcas.get("2026-11-04")).toContain("9 h extra");
  });

  it("la semana siguiente quedó corta (descansó el domingo 8 y el sábado 14): sin reloj", () => {
    const semanaDel8Al14 = [
      jornada("2026-11-08", "10:00", "19:00", { ajuste: "descansa" }),
      jornada("2026-11-09", "10:00", "19:00"),
      jornada("2026-11-10", "09:00", "19:00", { ajuste: "trabaja" }),
      jornada("2026-11-12", "10:00", "19:00"),
      jornada("2026-11-13", "10:00", "20:00"),
      jornada("2026-11-14", "10:00", "20:00", { ajuste: "descansa" }),
    ];
    expect(
      resumenSemanaDePlanta(sofia, "2026-11-10", semanaDel8Al14).horas,
    ).toBe(34);
    expect(diasConExceso(sofia, dias(8, 14), semanaDel8Al14).size).toBe(0);
  });
});
