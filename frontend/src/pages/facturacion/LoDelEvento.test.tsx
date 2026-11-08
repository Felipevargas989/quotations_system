// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type * as facturas from "../../services/facturas.service";
import LoDelEvento from "./LoDelEvento";

// LA BARRA DE LO FACTURADO (doc 19 §9.34; Felipe, 08-11: *"una barrita de
// lo que ya está facturado (ejemplo Rudel debo meter una OC de adelanto de
// 4M) y el resto queda pendiente"*).

afterEach(cleanup);

const evento = (
  total: number,
  emitido: number,
): facturas.EventoPorFacturar => ({
  id: "ev-1",
  numero: 501,
  estado: "aceptada",
  tipoDeEvento: null,
  fecha: "2026-12-06",
  cliente: "Rudel",
  total,
  emitido,
  queda: Math.max(0, total - emitido),
  ocs: 0,
});

const vista = (total: number): facturas.VistaPrevia => ({
  ok: true,
  montos: { neto: 0, exento: 0, iva: 0, total },
  lineas: [],
  observaciones: [],
  avisos: [],
  problemas: [],
  faltan: [],
  folio: 50,
  fecha: "2026-11-08",
  emisor: { nombre: null, rut: null },
  ambiente: "simulado",
});

const texto = () => document.body.textContent ?? "";

describe("Lo del evento: la barra de lo facturado", () => {
  it("el adelanto de Rudel: lo facturado, esta factura y lo que queda", () => {
    render(
      <LoDelEvento
        evento={evento(10_000_000, 0)}
        noLeidas={[]}
        vista={vista(4_000_000)}
        tipo={33}
      />,
    );
    expect(screen.getByText("Lo del evento")).toBeInTheDocument();
    expect(texto()).toContain("Evento $10.000.000");
    expect(texto()).toContain(
      "Facturado $0 · Esta factura $4.000.000 · Queda $6.000.000",
    );
    expect(texto()).not.toContain("se pasa del evento");
  });

  it("la segunda factura cuenta lo ya facturado y cierra el evento", () => {
    render(
      <LoDelEvento
        evento={evento(10_000_000, 4_000_000)}
        noLeidas={[]}
        vista={vista(6_000_000)}
        tipo={33}
      />,
    );
    expect(texto()).toContain(
      "Facturado $4.000.000 · Esta factura $6.000.000 · Queda $0",
    );
  });

  it("si con esta se pasa del total del evento, lo dice en ámbar (la #460)", () => {
    render(
      <LoDelEvento
        evento={evento(1_640_000, 0)}
        noLeidas={[]}
        vista={vista(2_480_000)}
        tipo={33}
      />,
    );
    expect(
      screen.getByText("Con esta factura se pasa del evento por $840.000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Lo del evento")).toHaveClass("text-amber-900");
  });

  it("sin el documento todavía, muestra lo facturado y lo que queda", () => {
    render(
      <LoDelEvento evento={evento(595_000, 0)} noLeidas={[]} vista={null} />,
    );
    expect(texto()).toContain("Facturado $0 · Queda $595.000");
  });

  it("la boleta se nombra como boleta", () => {
    render(
      <LoDelEvento
        evento={evento(300_000, 0)}
        noLeidas={[]}
        vista={vista(100_000)}
        tipo={39}
      />,
    );
    expect(texto()).toContain("Esta boleta $100.000");
  });
});
