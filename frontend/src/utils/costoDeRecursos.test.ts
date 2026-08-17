import { describe, it, expect } from "vitest";
import { costoDeRecursos } from "./costoDeRecursos";

/**
 * La cuenta que alimenta el costo del evento en Gestión, el margen en
 * Servicios y el gasto del Dashboard. Vivía copiada en las tres y solo
 * una estaba al día: el mismo evento mostraba dos números distintos en
 * dos pestañas de la misma ventana (revisión del 16-08).
 *
 * Los casos salen del documento de arquitectura, capítulo "El costo se
 * calcula por EVENTO, no por día".
 */
describe("costoDeRecursos", () => {
  const linea = (p: Partial<Parameters<typeof costoDeRecursos>[0][0]>) => ({
    resource_id: 1,
    price_fixed: 0,
    price_per_person: 0,
    quantity: 1,
    ...p,
  });

  it("solo fijo: fijo × unidades-día", () => {
    // Un toldo a $100.000 en 3 días = $300.000.
    expect(
      costoDeRecursos([linea({ price_fixed: 100000, quantity: 3 })], 80),
    ).toBe(300000);
  });

  it("solo variable: variable × personas × unidades-día", () => {
    // Masajes a $8.000 por persona, 80 personas, 2 días.
    expect(
      costoDeRecursos([linea({ price_per_person: 8000, quantity: 2 })], 80),
    ).toBe(1280000);
  });

  it("mixto: el fijo se cobra UNA VEZ, aunque vaya en varios días", () => {
    // Catering: $50.000 de instalación + $1.000 por persona, 80
    // personas, 2 días = $210.000. Es el caso del documento.
    const dosDias = [
      linea({ resource_id: 7, price_fixed: 50000, price_per_person: 1000 }),
      linea({ resource_id: 7, price_fixed: 50000, price_per_person: 1000 }),
    ];
    expect(costoDeRecursos(dosDias, 80)).toBe(210000);
  });

  it("la cuenta vieja cobraba la instalación dos veces", () => {
    // Deja constancia de la diferencia que se corrigió: línea por línea
    // daban $260.000 en vez de $210.000.
    const dosDias = [
      linea({ resource_id: 7, price_fixed: 50000, price_per_person: 1000 }),
      linea({ resource_id: 7, price_fixed: 50000, price_per_person: 1000 }),
    ];
    const cuentaVieja = dosDias.reduce(
      (s, l) =>
        s +
        (Number(l.price_fixed) + Number(l.price_per_person) * 80) *
          Number(l.quantity),
      0,
    );
    expect(cuentaVieja).toBe(260000);
    expect(costoDeRecursos(dosDias, 80)).toBe(210000);
  });

  it("el personal suma cada línea con su propio valor", () => {
    // Sin parte variable, dos jornadas del mismo cargo a valores
    // distintos suman exacto: $27.000 × 2 + $25.000 = $79.000.
    const garzones = [
      linea({ resource_id: 3, price_fixed: 27000, quantity: 2 }),
      linea({ resource_id: 3, price_fixed: 25000, quantity: 1 }),
    ];
    expect(costoDeRecursos(garzones, 50)).toBe(79000);
  });

  it("recursos distintos no se mezclan", () => {
    expect(
      costoDeRecursos(
        [
          linea({ resource_id: 1, price_fixed: 10000 }),
          linea({ resource_id: 2, price_fixed: 20000 }),
        ],
        50,
      ),
    ).toBe(30000);
  });

  it("aguanta los números que llegan como texto desde la base", () => {
    expect(
      costoDeRecursos(
        [linea({ price_fixed: "100000", quantity: "3" as never })],
        80,
      ),
    ).toBe(300000);
  });

  it("sin líneas, no hay costo", () => {
    expect(costoDeRecursos([], 80)).toBe(0);
  });
});
