import { describe, it, expect } from "vitest";
import { estadoDelConcepto, porConceptoDe } from "./porConcepto";
import type { Asignacion, NominaDetalle } from "../../types/people.types";

/**
 * EL HISTÓRICO CUENTA POR EVENTO Y DÍA DE STAFF (Felipe, 08-09): una
 * nómina abierta dice qué pagó, no a quién; el pago se marca por
 * persona y el concepto suma lo que sus personas ya cobraron.
 */
const fila = (p: Partial<Asignacion>): Asignacion =>
  ({
    id: 1,
    quotation_id: null,
    person_id: 1,
    day: "2026-08-17",
    role_id: null,
    kind: "freelance",
    starts_at: null,
    ends_at: null,
    break_minutes: null,
    status: "confirmado",
    amount: null,
    notes: null,
    tip_amount: null,
    tip_pool_id: null,
    payroll_id: 9,
    tip_payroll_id: null,
    ...p,
  }) as Asignacion;

const nomina = (
  jornadas: Asignacion[],
  propinas: Asignacion[],
  pagos: NominaDetalle["pagos"],
): NominaDetalle =>
  ({ id: 9, label: "Nómina", created_at: "", jornadas, propinas, pagos }) as NominaDetalle;

describe("porConceptoDe", () => {
  it("agrupa por evento y por día de staff, contando personas una vez", () => {
    const r = porConceptoDe(
      nomina(
        [
          fila({ id: 1, quotation_id: "q1", person_id: 1, amount: 30000 }),
          fila({ id: 2, quotation_id: "q1", person_id: 2, amount: 30000 }),
          fila({ id: 3, quotation_id: null, day: "2026-08-17", person_id: 1, amount: 25000 }),
        ],
        [fila({ id: 4, quotation_id: "q1", person_id: 1, tip_amount: 5000 })],
        [],
      ),
    );
    expect(r.map((c) => c.llave)).toEqual(["ev:q1", "dia:2026-08-17"]);
    expect(r[0]).toMatchObject({ personas: 2, totalJornada: 60000, totalPropina: 5000 });
    expect(r[1]).toMatchObject({ personas: 1, totalJornada: 25000, totalPropina: 0 });
  });

  it("lo pagado sale de las marcas por persona, con la última fecha", () => {
    const r = porConceptoDe(
      nomina(
        [
          fila({ id: 1, quotation_id: "q1", person_id: 1, amount: 30000 }),
          fila({ id: 2, quotation_id: "q1", person_id: 2, amount: 30000 }),
        ],
        [fila({ id: 3, quotation_id: "q1", person_id: 1, tip_amount: 5000 })],
        [
          { id: 1, payroll_id: 9, person_id: 1, jornada_paid: true, propina_paid: true, paid_at: "2026-08-18T10:00:00Z" },
          { id: 2, payroll_id: 9, person_id: 2, jornada_paid: false, propina_paid: false, paid_at: null },
        ],
      ),
    );
    expect(r[0]).toMatchObject({ pagadoJornada: 30000, pagadoPropina: 5000, pagadoEl: "2026-08-18T10:00:00Z" });
    expect(estadoDelConcepto(r[0])).toBe("parcial");
  });

  it("pagado del todo y pendiente", () => {
    const todo = porConceptoDe(
      nomina(
        [fila({ id: 1, quotation_id: "q1", person_id: 1, amount: 30000 })],
        [],
        [{ id: 1, payroll_id: 9, person_id: 1, jornada_paid: true, propina_paid: false, paid_at: "2026-08-18" }],
      ),
    );
    expect(estadoDelConcepto(todo[0])).toBe("pagado");
    const nada = porConceptoDe(
      nomina([fila({ id: 1, quotation_id: "q1", person_id: 1, amount: 30000 })], [], []),
    );
    expect(estadoDelConcepto(nada[0])).toBe("pendiente");
  });

  it("días de staff del más nuevo al más viejo, después de los eventos", () => {
    const r = porConceptoDe(
      nomina(
        [
          fila({ id: 1, day: "2026-08-15", amount: 1 }),
          fila({ id: 2, day: "2026-08-17", amount: 1 }),
          fila({ id: 3, quotation_id: "q1", amount: 1 }),
        ],
        [],
        [],
      ),
    );
    expect(r.map((c) => c.llave)).toEqual(["ev:q1", "dia:2026-08-17", "dia:2026-08-15"]);
  });
});
