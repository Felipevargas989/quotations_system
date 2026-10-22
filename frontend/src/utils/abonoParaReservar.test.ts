import { describe, it, expect } from "vitest";
import { lineaDelAbono, pctDeAbono } from "./abonoParaReservar";
import { buildQuotationPrintDoc } from "./quotationPrintDoc";

/**
 * EL ABONO PARA RESERVAR LA FECHA (Felipe, 22-10-2026): el % vive en la
 * configuración de la empresa (migración 160) y la hoja de la cotización
 * lo muestra bajo el TOTAL, calculado sobre el total con IVA sin propina.
 */
describe("lineaDelAbono", () => {
  it("calcula el abono sobre el total y lo dice con su %", () => {
    expect(lineaDelAbono(2220700, 30)).toBe(
      "La fecha queda reservada solo al recibir el abono del 30%: $666.210.",
    );
  });

  it("lee el % que llega como texto desde la base", () => {
    expect(lineaDelAbono(1000000, "12.50")).toBe(
      "La fecha queda reservada solo al recibir el abono del 12,5%: $125.000.",
    );
  });

  it("sin % configurado, en cero o sin total, no sale", () => {
    expect(lineaDelAbono(1000000, null)).toBeNull();
    expect(lineaDelAbono(1000000, undefined)).toBeNull();
    expect(lineaDelAbono(1000000, "0.00")).toBeNull();
    expect(lineaDelAbono(0, 30)).toBeNull();
    expect(pctDeAbono(150)).toBeNull();
  });
});

describe("la hoja de la cotización", () => {
  const cotizacion = {
    quotation_number: 552,
    people_count: 10,
    created_at: "2026-10-22",
    event_date: "2026-10-23",
    total_amount: 1190000,
    subtotal_amount: 1190000,
    items: { fixed_services: [], variable_services: [] },
  };

  it("con % en la empresa, la línea sale bajo el total", () => {
    const { body } = buildQuotationPrintDoc(
      cotizacion,
      { name: "Empresa de prueba", abono_reserva_pct: "30.00" },
      null,
    );
    expect(body).toContain(
      "La fecha queda reservada solo al recibir el abono del 30%: $357.000.",
    );
  });

  it("sin % en la empresa, la hoja queda como siempre", () => {
    const { body } = buildQuotationPrintDoc(
      cotizacion,
      { name: "Empresa de prueba" },
      null,
    );
    expect(body).not.toContain("queda reservada");
  });
});
