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

/** El monto de una columna («Facturado», «Esta factura», «Queda»). */
const monto = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: "dt" }).nextElementSibling
    ?.textContent;

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
    expect(monto("Facturado")).toBe("$0");
    expect(monto("Esta factura")).toBe("$4.000.000");
    expect(monto("Queda")).toBe("$6.000.000");
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
    expect(monto("Facturado")).toBe("$4.000.000");
    expect(monto("Esta factura")).toBe("$6.000.000");
    expect(monto("Queda")).toBe("$0");
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
    // El recuadro sigue azul; lo que hay que mirar va en su franja ámbar.
    expect(
      screen
        .getByText("Con esta factura se pasa del evento por $840.000")
        .closest("p"),
    ).toHaveClass("bg-amber-100");
    expect(screen.getByText("Lo del evento")).toHaveClass("text-blue-900");
  });

  it("sin el documento todavía, muestra lo facturado y lo que queda", () => {
    render(
      <LoDelEvento evento={evento(595_000, 0)} noLeidas={[]} vista={null} />,
    );
    expect(monto("Facturado")).toBe("$0");
    expect(monto("Esta factura")).toBe("—");
    expect(monto("Queda")).toBe("$595.000");
  });

  it("la OC del documento con su propia barra, y el evento aparte (Felipe, 08-11: «son dos cosas distintas»)", () => {
    const santoTomas: facturas.EventoPorFacturar = {
      ...evento(11_301_417, 2_805_800),
      numero: 481,
      ordenes: [
        {
          id: 4,
          numero: "33000132942",
          total: 5_611_559,
          facturado: 2_805_800,
          queda: 2_805_759,
          estado: "parcial",
        },
        {
          id: 5,
          numero: "32000066941",
          total: 5_239_858,
          facturado: 0,
          queda: 5_239_858,
          estado: "pendiente",
        },
      ],
    };
    render(
      <LoDelEvento
        evento={santoTomas}
        noLeidas={[]}
        vista={vista(2_805_759)}
        tipo={33}
        ocActual={4}
      />,
    );
    expect(texto()).toContain("OC 33000132942 $5.611.559");
    expect(texto()).toContain("Evento #481 $11.301.417");
    const columna = (etiqueta: string) =>
      screen
        .getAllByText(etiqueta, { selector: "dt" })
        .map((dt) => dt.nextElementSibling?.textContent);
    // Primero la OC: lo facturado de ella, esta factura y lo que le queda.
    expect(columna("Facturado")).toEqual(["$2.805.800", "$2.805.800"]);
    expect(columna("Queda")).toEqual(["$0", "$5.689.858"]);
    // Abajo, solo las otras OC.
    expect(screen.getByText(/OC 32000066941/)).toBeInTheDocument();
    expect(texto()).not.toContain("esta factura");
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
    expect(monto("Esta boleta")).toBe("$100.000");
  });

  it("siempre azul, también con lo que falta, que va en su franja (08-11)", () => {
    render(
      <LoDelEvento
        evento={evento(1_428_000, 0)}
        noLeidas={[]}
        vista={{
          ...vista(1_428_000),
          ok: false,
          faltan: [{ campo: "receptor.giro", texto: "el giro" }],
        }}
        tipo={33}
      />,
    );
    expect(screen.getByText("Lo del evento")).toHaveClass("text-blue-900");
    expect(
      screen
        .getByText("Falta el giro: corrígelo antes de aprobar")
        .closest("p"),
    ).toHaveClass("bg-amber-100");
  });
});
