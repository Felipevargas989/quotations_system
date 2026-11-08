// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as facturas from "../../../services/facturas.service";
import EmitirDte from "./EmitirDte";

// EMITIR DTE (doc 19 §9.20). Felipe, 05-11: "puedo elegir si el DTE es una
// factura, una boleta y punto". La factura se llena desde la OC que BelIA
// leyó de Documentos; la boleta, desde la cotización.

vi.mock("../../../services/facturas.service", () => ({
  prepararDte: vi.fn(),
  armarBorradorDeDte: vi.fn(),
  revisarDte: vi.fn(),
  emitirDte: vi.fn(),
}));
const f = vi.mocked(facturas);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VISTA: facturas.VistaPrevia = {
  ok: true,
  montos: { neto: 1200000, exento: 0, iva: 228000, total: 1428000 },
  lineas: [],
  observaciones: [],
  avisos: [],
  problemas: [],
  faltan: [],
  folio: 43,
  fecha: "2026-11-05",
  emisor: { nombre: "Valle del Sol Quillón SpA", rut: null },
  ambiente: "simulado",
};

const borrador = (tipo: facturas.TipoDeDte): facturas.BorradorDelDte => ({
  pedida: {
    tipo,
    orden_de_compra_id: tipo === 33 ? 12 : null,
    receptor: {
      rut: tipo === 33 ? "90413000-1" : "",
      razon_social: tipo === 33 ? "Compañía Cervecerías Unidas S.A." : "",
      giro: null,
      direccion: null,
      comuna: null,
      ciudad: null,
      correo: tipo === 33 ? null : "novios@gmail.com",
    },
    lineas: [
      {
        descripcion: "Paseo fin de año CCU",
        descripcion_larga: null,
        cantidad: 400,
        precio: 3570,
      },
    ],
    referencias:
      tipo === 33
        ? [{ tipo: "801", folio: "4500918822", fecha: "2026-10-01" }]
        : [],
    pedir_siempre: [],
  },
  origenes: {
    receptor: "ficha",
    detalle: tipo === 33 ? "orden_de_compra" : "cotizacion",
  },
  leidoDe:
    tipo === 33
      ? ["OC 4500918822.pdf", "cotización N° 408"]
      : ["cotización N° 408"],
  oc:
    tipo === 33 ? { numero: "4500918822", total: 1428000, facturado: 0 } : null,
  evento: { numero: 408, total: 1428000, facturado: 0, cliente: "CCU" },
  razones: [],
  vista: VISTA,
});

const preparado = () => {
  f.prepararDte.mockResolvedValue({
    tipo: 33,
    ocs: [
      {
        id: 12,
        numero: "4500918822",
        fecha: "2026-10-01",
        razon_social: "Compañía Cervecerías Unidas S.A.",
        total: 1428000,
        facturado: 0,
      },
    ],
    sin_leer: [
      {
        documento_id: 9,
        nombre: "OC escaneada.pdf",
        motivo: "no encontró la fecha",
      },
    ],
    evento: { numero: 408, total: 1428000, facturado: 0, cliente: "CCU" },
  });
  f.armarBorradorDeDte.mockImplementation((_q, tipo) =>
    Promise.resolve(borrador(tipo)),
  );
};

const abrir = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EmitirDte
        quotationId="q-408"
        puedeEmitir
        onCerrar={() => {}}
        onEmitido={() => {}}
      />
    </QueryClientProvider>,
  );

describe("Emitir DTE", () => {
  it("se llena desde la OC que BelIA leyó de Documentos, con sus personas y su precio", async () => {
    preparado();
    abrir();
    expect(
      await screen.findByText("Factura armada por BelIA"),
    ).toBeInTheDocument();
    // Sin «Qué parte», todo lo que queda (§9.26).
    expect(f.armarBorradorDeDte).toHaveBeenCalledWith("q-408", 33, 12, null);
    expect(
      screen.getByRole("button", { name: /OC N° 4500918822 · queda/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("• «OC escaneada.pdf»: no encontró la fecha."),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Paseo fin de año CCU"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("400")).toBeInTheDocument();
    expect(screen.getByText("Total a pagar")).toBeInTheDocument();
  });

  it("la boleta no va contra la OC: se llena desde la cotización y pide el correo", async () => {
    preparado();
    abrir();
    await screen.findByText("Factura armada por BelIA");
    fireEvent.click(screen.getByRole("button", { name: "Boleta" }));
    expect(
      await screen.findByText("Boleta armada por BelIA"),
    ).toBeInTheDocument();
    expect(f.armarBorradorDeDte).toHaveBeenLastCalledWith(
      "q-408",
      39,
      null,
      null,
    );
    expect(
      screen.queryByRole("button", { name: /OC N° 4500918822/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("novios@gmail.com")).toBeInTheDocument();
    expect(
      screen.queryByText("Editar receptor y referencias"),
    ).not.toBeInTheDocument();
  });
});

// §9.26 (Felipe, 07-11): «el cliente emite OC por todo el monto pero pide
// facturar un % primero y otro % después (50 % y 50 % es un caso habitual,
// también puede ser 30 % y 70 %)».
describe("Qué parte se factura", () => {
  it("el 50 % de la OC le pide a BelIA esa parte, y dice de qué base", async () => {
    preparado();
    abrir();
    await screen.findByText("Factura armada por BelIA");
    expect(
      screen.getByText(/de la OC N° 4500918822: \$1\.428\.000/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "50 %" }));
    await waitFor(() =>
      expect(f.armarBorradorDeDte).toHaveBeenLastCalledWith(
        "q-408",
        33,
        12,
        50,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Todo lo que queda" }));
    await waitFor(() =>
      expect(f.armarBorradorDeDte).toHaveBeenLastCalledWith(
        "q-408",
        33,
        12,
        null,
      ),
    );
  });

  it("en la revisión de «Facturar seleccionados» dice «Aprobar» y devuelve lo corregido, sin emitir (§9.31)", async () => {
    preparado();
    const alAprobar = vi.fn();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <EmitirDte
          quotationId="q-408"
          puedeEmitir
          onCerrar={() => {}}
          onEmitido={() => {}}
          alAprobar={alAprobar}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    expect(alAprobar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 33,
        pedida: expect.objectContaining({ tipo: 33, orden_de_compra_id: 12 }),
        vista: expect.objectContaining({ ok: true }),
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Ver cómo sale" }),
    ).not.toBeInTheDocument();
    expect(f.emitirDte).not.toHaveBeenCalled();
  });
});
