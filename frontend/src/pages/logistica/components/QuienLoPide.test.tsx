// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuienLoPide from "./QuienLoPide";
import { pedidosPorInsumo } from "./pedidosPorInsumo";

// QUÉ COTIZACIÓN PIDE CADA INSUMO (20-10-2026). Felipe: "al lado de cada
// item, podría aparecer un detalle de qué cotización necesita ese
// servicio" y "cuando sea todas pon igual el nro de cotización".

afterEach(cleanup);

const evento = (
  id: string,
  numero: number,
  cliente: string,
  fecha: string,
) => ({
  id,
  quotation_number: numero,
  client_name: cliente,
  event_date: fecha,
});

const eventos = [
  evento("a", 554, "CCU", "2026-10-21T00:00:00+00:00"),
  evento("b", 552, "Erika Díaz", "2026-10-23T00:00:00+00:00"),
  evento("c", 460, "Municipalidad de Quillón", "2026-10-29T00:00:00+00:00"),
];

// Carne molida (10) la piden las tres; champiñón (20), solo la 552.
const uso: Record<string, Map<number, number>> = {
  a: new Map([[10, 1.5]]),
  b: new Map([
    [10, 2],
    [20, 1.36],
  ]),
  c: new Map([[10, 6.123]]),
};
const provisionados: Record<string, Set<number>> = { b: new Set([10]) };

const armar = () =>
  pedidosPorInsumo(
    eventos,
    (id) => uso[id],
    (id) => provisionados[id],
  );

describe("pedidosPorInsumo", () => {
  it("junta por insumo las cotizaciones que lo piden, en el orden de la tabla", () => {
    const m = armar();
    expect(m.get(10)?.map((p) => p.numero)).toEqual([554, 552, 460]);
    expect(m.get(20)?.map((p) => p.numero)).toEqual([552]);
  });

  it("cada una con su cantidad y si ya está provisionado para ella", () => {
    const carne = armar().get(10) ?? [];
    expect(carne.map((p) => p.cantidad)).toEqual([1.5, 2, 6.123]);
    expect(carne.map((p) => p.provisionado)).toEqual([false, true, false]);
  });
});

describe("QuienLoPide", () => {
  it("aunque la pidan todas, muestra el número de cada cotización", () => {
    render(<QuienLoPide pedidos={armar().get(10) ?? []} unidad="kg" />);
    expect(screen.getByText("#554")).toBeInTheDocument();
    expect(screen.getByText("#552")).toBeInTheDocument();
    expect(screen.getByText("#460")).toBeInTheDocument();
    expect(screen.queryByText(/todas/)).not.toBeInTheDocument();
  });

  it("verde la provisionada y gris la que falta", () => {
    render(<QuienLoPide pedidos={armar().get(10) ?? []} unidad="kg" />);
    expect(screen.getByText("#552")).toHaveClass("bg-green-100");
    expect(screen.getByText("#460")).toHaveClass("bg-gray-100");
  });

  it("al pasar el mouse: cliente, fecha, cuánto pide y si falta", () => {
    render(<QuienLoPide pedidos={armar().get(10) ?? []} unidad="kg" />);
    const detalle =
      screen.getByText("#460").closest("[title]")?.getAttribute("title") ?? "";
    expect(detalle).toMatch(/^#460 · Municipalidad de Quillón · 29 oct/);
    expect(detalle).toContain("6,12 kg");
    expect(detalle).toContain("por comprar");
  });

  it("sin cotizaciones no dibuja nada", () => {
    const { container } = render(<QuienLoPide pedidos={[]} unidad="kg" />);
    expect(container).toBeEmptyDOMElement();
  });
});
