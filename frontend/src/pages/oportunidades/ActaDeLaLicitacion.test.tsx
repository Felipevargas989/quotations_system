// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ActaDeLaLicitacion from "./ActaDeLaLicitacion";

// QUIÉN GANÓ, SEGÚN EL ACTA (decisión 30 del doc 17, 19-10): la gira de
// estudio que Felipe sigue sin postular. Datos inventados.

afterEach(cleanup);

const ACTA = {
  informada: "05/11/2026 10:12",
  monto_adjudicado: 56_034_300,
  items: [
    {
      numero: 1,
      producto: "Servicios de viajes",
      especificacion: "Gira de estudio 4° medio: Pucón y Valdivia, 5 días",
      cantidad: 1,
      ofertas: [
        {
          rut: "77.987.654-K",
          proveedor: "VIAJES ANDINOS SPA",
          detalle: "Programa en Pucón con excursiones",
          precio_unitario: 61_500_000,
          cantidad_adjudicada: 0,
          total_adjudicado: 0,
          adjudicada: false,
        },
        {
          rut: "76.123.456-7",
          proveedor: "TURISMO DEL SUR LIMITADA",
          detalle: "Bus, alojamiento y alimentación completa",
          precio_unitario: 56_034_300,
          cantidad_adjudicada: 1,
          total_adjudicado: 56_034_300,
          adjudicada: true,
        },
      ],
    },
  ],
};

describe("Quién ganó, según el acta", () => {
  it("dice quién ganó y muestra todas las ofertas, el ganador primero, con su precio y lo que ofreció", () => {
    render(
      <ActaDeLaLicitacion
        acta={ACTA}
        seguida
        estadoEnMercadoPublico="Adjudicada"
      />,
    );
    expect(
      screen.getByText(
        "Informada el 05/11/2026 10:12 · Monto neto adjudicado: $56.034.300 · Ganó TURISMO DEL SUR LIMITADA",
      ),
    ).toBeInTheDocument();
    const proveedores = screen
      .getAllByText(/SPA|LIMITADA/)
      .filter((e) => e.tagName === "SPAN")
      .map((e) => e.textContent);
    expect(proveedores).toEqual([
      "TURISMO DEL SUR LIMITADA",
      "VIAJES ANDINOS SPA",
    ]);
    expect(screen.getByText("Ganó")).toBeInTheDocument();
    expect(
      screen.getByText("Bus, alojamiento y alimentación completa"),
    ).toBeInTheDocument();
  });

  it("seguida y sin acta todavía: lo dice, con el estado en Mercado Público; sin seguir ni acta, nada", () => {
    render(
      <ActaDeLaLicitacion
        acta={null}
        seguida
        estadoEnMercadoPublico="Cerrada"
      />,
    );
    expect(screen.getByText("En seguimiento")).toBeInTheDocument();
    expect(
      screen.getByText("Hoy en Mercado Público: Cerrada."),
    ).toBeInTheDocument();
    cleanup();
    const { container } = render(
      <ActaDeLaLicitacion
        acta={null}
        seguida={false}
        estadoEnMercadoPublico={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
