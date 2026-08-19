import { describe, expect, it } from "vitest";
import { cosechaDelMes, perteneceAlMes, type QCosecha } from "./tendencias";

// LA MISMA TABLA, DOS PREGUNTAS (Felipe, 18-08): pinchar Cotizaciones
// por Mes abre "quién cotizó ese mes"; pinchar Eventos por Mes abre "qué
// eventos se hicieron ese mes". Estos tests fijan la diferencia.

const q = (extra: Partial<QCosecha>): QCosecha =>
  ({
    id: "x",
    quotation_number: 1,
    created_at: "2025-08-10T12:00:00Z",
    event_date: "2025-11-20",
    quotation_status: "realizada",
    total_amount: 100,
    event_type: "Paseo fin de año",
    contact_name: "Ana",
    clients: { name: "CCU", client_type: "Empresas" },
    ...extra,
  }) as unknown as QCosecha;

describe("perteneceAlMes", () => {
  it("mirada 'cotizado': manda la fecha de creación", () => {
    expect(perteneceAlMes(q({}), "2025-08", "cotizado")).toBe(true);
    expect(perteneceAlMes(q({}), "2025-11", "cotizado")).toBe(false);
  });
  it("mirada 'evento': manda la fecha del evento, y solo confirmados", () => {
    expect(perteneceAlMes(q({}), "2025-11", "evento")).toBe(true);
    expect(perteneceAlMes(q({}), "2025-08", "evento")).toBe(false);
    expect(
      perteneceAlMes(q({ quotation_status: "rechazada" }), "2025-11", "evento"),
    ).toBe(false);
    expect(
      perteneceAlMes(q({ quotation_status: "aceptada" }), "2025-11", "evento"),
    ).toBe(true);
  });
});

describe("cosechaDelMes con mirada", () => {
  const filas = [
    q({ id: "a", quotation_number: 1 }), // cotizada ago-25, evento nov-25, realizada
    q({ id: "b", quotation_number: 2, created_at: "2025-11-02T12:00:00Z", event_date: "2025-11-28", quotation_status: "rechazada" }),
    q({ id: "c", quotation_number: 3, created_at: "2025-11-15T12:00:00Z", event_date: "2026-01-10", quotation_status: "aceptada" }),
  ];
  it("por defecto es la cosecha de siempre: quién cotizó ese mes", () => {
    expect(cosechaDelMes(filas, "2025-11").map((f) => f.numero)).toEqual([2, 3]);
  });
  it("mirada evento: qué eventos se hicieron ese mes (la rechazada no cuenta)", () => {
    expect(cosechaDelMes(filas, "2025-11", "evento").map((f) => f.numero)).toEqual([1]);
    expect(cosechaDelMes(filas, "2026-01", "evento").map((f) => f.numero)).toEqual([3]);
  });
});
