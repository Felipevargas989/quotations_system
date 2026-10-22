import { describe, it, expect } from "vitest";
import { filasSinEvento, vaEnLaFila } from "./bandasDelStaff";
import type { Asignacion } from "../../types/people.types";

/**
 * LAS DOS BANDAS LAS DECIDE EL TIPO DE CADA JORNADA (Felipe, 21-10-2026):
 * "si es staff (o freelance) queda siempre abajo; si es planta, queda en
 * planta". El caso real: Cecilia, freelance, quedó en "Personal de
 * planta" porque Ana Luisa es de planta en el mismo cargo, Personal aseo.
 */
const ASEO = 9;
const GARZON = 4;
const VIEJO = 77; // un cargo que ya no está activo
const catalogo = [
  { id: ASEO, name: "Personal aseo", type: "personal", is_active: true },
  { id: GARZON, name: "Garzón", type: "personal", is_active: true },
  { id: VIEJO, name: "Cargo antiguo", type: "personal", is_active: false },
];

const jornada = (p: Partial<Asignacion>): Asignacion =>
  ({
    id: 1,
    quotation_id: null,
    person_id: 1,
    day: "2026-10-21",
    role_id: ASEO,
    kind: "planta",
    status: "confirmado",
    amount: null,
    ...p,
  }) as Asignacion;

const anaLuisa = jornada({ id: 1, person_id: 10, kind: "planta" });
const cecilia = jornada({ id: 2, person_id: 4, kind: "freelance", amount: 25000 });

describe("filasSinEvento", () => {
  it("un cargo con planta y freelance sale en las dos bandas", () => {
    const filas = filasSinEvento(catalogo, [anaLuisa, cecilia], []);
    expect(filas.map((f) => [f.cargo, f.ocasional])).toEqual([
      ["Personal aseo", false],
      ["Personal aseo", true],
    ]);
  });

  it("Cecilia va en la fila de staff y Ana Luisa en la de planta", () => {
    const [planta, staff] = filasSinEvento(catalogo, [anaLuisa, cecilia], []);
    expect(vaEnLaFila(cecilia, staff, catalogo)).toBe(true);
    expect(vaEnLaFila(cecilia, planta, catalogo)).toBe(false);
    expect(vaEnLaFila(anaLuisa, planta, catalogo)).toBe(true);
    expect(vaEnLaFila(anaLuisa, staff, catalogo)).toBe(false);
  });

  it("solo planta: la banda de staff igual existe, vacía, para el «+ cargo»", () => {
    const filas = filasSinEvento(catalogo, [anaLuisa], []);
    expect(filas.map((f) => [f.cargoId, f.ocasional])).toEqual([
      [ASEO, false],
      [-1, true],
    ]);
  });

  it("un cargo sumado a mano va a staff aunque tenga planta", () => {
    const filas = filasSinEvento(catalogo, [anaLuisa], [ASEO, GARZON]);
    expect(filas.map((f) => [f.cargo, f.ocasional])).toEqual([
      ["Personal aseo", false],
      ["Garzón", true],
      ["Personal aseo", true],
    ]);
  });

  it("un cargo que ya no está activo sale como «Sin cargo» en su banda", () => {
    const vieja = jornada({ id: 3, role_id: VIEJO, kind: "freelance" });
    const filas = filasSinEvento(catalogo, [vieja], []);
    expect(filas.map((f) => [f.cargo, f.ocasional])).toEqual([["Sin cargo", true]]);
    expect(vaEnLaFila(vieja, filas[0], catalogo)).toBe(true);
  });
});

describe("vaEnLaFila en un evento", () => {
  it("en un evento manda evento + cargo, sea planta o freelance", () => {
    const fila = {
      quotationId: "q1",
      evento: "#500",
      cargoId: GARZON,
      cargo: "Garzón",
      necesita: new Map(),
      sinRepartir: 0,
      diasDelEvento: new Set<string>(),
    };
    const dePlanta = jornada({ quotation_id: "q1", role_id: GARZON, kind: "planta" });
    const freelance = jornada({ quotation_id: "q1", role_id: GARZON, kind: "freelance" });
    const otroEvento = jornada({ quotation_id: "q2", role_id: GARZON });
    expect(vaEnLaFila(dePlanta, fila, catalogo)).toBe(true);
    expect(vaEnLaFila(freelance, fila, catalogo)).toBe(true);
    expect(vaEnLaFila(otroEvento, fila, catalogo)).toBe(false);
  });
});
