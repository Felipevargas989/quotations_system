import { describe, it, expect } from "vitest";
import { compromisoVigente } from "./compromisoVigente";

/**
 * EL COMPROMISO VIGENTE (28-10-2026). Felipe, en Post-Venta: "pincho listo
 * y se corre hacia abajo… no ponerle listo todo el historial".
 */
const nota = (
  dia: string,
  proximo: string | null,
  cumplido: string | null = null,
) => ({
  created_at: `${dia}T12:00:00Z`,
  next_contact_date: proximo,
  next_contact_done_at: cumplido,
});

describe("compromisoVigente", () => {
  it("manda la nota más nueva con fecha", () => {
    const notas = [
      nota("2026-08-26", "2026-08-31"),
      nota("2026-09-01", "2026-09-14"),
      nota("2026-09-22", "2026-09-29"),
    ];
    expect(compromisoVigente(notas)?.next_contact_date).toBe("2026-09-29");
  });

  it("con «Listo» en la más nueva no queda nada vivo: no aparece la anterior", () => {
    const notas = [
      nota("2026-09-01", "2026-09-14"),
      nota("2026-09-08", "2026-09-21"),
      nota("2026-09-22", "2026-09-29", "2026-10-28T15:00:00Z"),
    ];
    expect(compromisoVigente(notas)).toBeNull();
  });

  it("una nota sin fecha no mueve el compromiso (07-08)", () => {
    const notas = [
      nota("2026-09-22", "2026-09-29"),
      nota("2026-10-01", null),
      nota("2026-10-05", null),
    ];
    expect(compromisoVigente(notas)?.next_contact_date).toBe("2026-09-29");
  });

  it("sin notas con fecha no hay compromiso", () => {
    expect(compromisoVigente([nota("2026-10-01", null)])).toBeNull();
    expect(compromisoVigente([])).toBeNull();
  });
});
