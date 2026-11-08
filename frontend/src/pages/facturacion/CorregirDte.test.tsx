// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as facturas from "../../services/facturas.service";
import CorregirDte from "./CorregirDte";
import type { RevisadoParaLaMasiva } from "./revisarUnoParaLaMasiva";

// «CORREGIR» (doc 19 §9.32; Felipe, 08-11: *"no me gustan todos estos
// chip"*): el mismo documento por secciones, con casillas y listas; lo que
// falta, en rojo en su casilla; para facturar una parte, se cambia el monto.

vi.mock("../../services/facturas.service", () => ({
  armarBorradorDeDte: vi.fn(),
  revisarDte: vi.fn(),
  buscarRazonSocial: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
const f = vi.mocked(facturas);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const vista = (ok: boolean): facturas.VistaPrevia => ({
  ok,
  montos: { neto: 2084034, exento: 0, iva: 395966, total: 2480000 },
  lineas: [],
  observaciones: [],
  avisos: [],
  problemas: [],
  faltan: ok ? [] : [{ campo: "giro", texto: "el giro" }],
  folio: 381,
  fecha: "2026-11-08",
  emisor: { nombre: null, rut: null },
  ambiente: "simulado",
  pago: { forma: 2, dias: 30, vencimiento: "2026-12-08" },
  emision: { desde: "2026-10-01", hasta: "2026-11-08" },
});

const pedida = (razon: string, oc: number | null): facturas.DtePedido => ({
  tipo: 33,
  orden_de_compra_id: oc,
  receptor: {
    rut: "69141400-0",
    razon_social: razon,
    giro: null,
    direccion: "18 de Septiembre 250",
    comuna: "Quillón",
    ciudad: "Quillón",
    correo: null,
  },
  lineas: [
    {
      descripcion: "Servicio de catering",
      descripcion_larga: null,
      cantidad: 1,
      precio: 2480000,
    },
  ],
  referencias: [{ tipo: "801", folio: "1213301-49-AG26", fecha: "2026-05-15" }],
  pedir_siempre: [],
  forma_de_pago: 2,
  plazo_dias: 30,
});

const borrador = (p: facturas.DtePedido): facturas.BorradorDelDte => ({
  pedida: p,
  origenes: { receptor: "orden_de_compra", detalle: "orden_de_compra" },
  leidoDe: [],
  oc: null,
  evento: { numero: 423, total: 3440000, facturado: 0, cliente: "JOKER" },
  razones: [],
  vista: vista(false),
});

const INICIAL: RevisadoParaLaMasiva = {
  tipo: 33,
  pedida: pedida("ILUSTRE MUNICIPALIDAD DE QUILLON", 12),
  vista: vista(false),
  preparacion: {
    tipo: 33,
    ocs: [
      {
        id: 12,
        numero: "1213301-49-AG26",
        fecha: "2026-05-15",
        razon_social: "ILUSTRE MUNICIPALIDAD DE QUILLON",
        total: 2480000,
        facturado: 0,
      },
    ],
    sin_leer: [],
    evento: { numero: 423, total: 3440000, facturado: 0, cliente: "JOKER" },
  },
  borrador: borrador(pedida("ILUSTRE MUNICIPALIDAD DE QUILLON", 12)),
};

const abrir = (onCambio = vi.fn()) => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CorregirDte quotationId="ev-423" inicial={INICIAL} onCambio={onCambio} />
    </QueryClientProvider>,
  );
  return onCambio;
};

describe("Corregir: el documento con casillas", () => {
  it("parte de lo que se revisa, con las secciones de «Nuevo DTE» y sin chips", () => {
    abrir();
    for (const s of [
      "Documento",
      "Destinatario",
      "Ítems",
      "Referencias",
      "Totales",
    ])
      expect(screen.getByRole("heading", { name: s })).toBeInTheDocument();
    // Las listas son las de la casa: muestran lo elegido.
    expect(
      within(screen.getByRole("group", { name: "Tipo" })).getByRole("button", {
        name: /Factura electrónica/,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Se llena desde" })).getByRole(
        "button",
        { name: /OC N° 1213301-49-AG26/ },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Servicio de catering"),
    ).toBeInTheDocument();
    // Salieron los chips de «Qué parte».
    expect(screen.queryByText("Qué parte")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "50 %" }),
    ).not.toBeInTheDocument();
  });

  it("lo que falta va en rojo en su casilla", () => {
    abrir();
    expect(screen.getByText(/· falta/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Giro/)).toHaveClass("!border-red-400");
  });

  it("al corregir, el motor revisa y sube lo corregido, listo para aprobar", async () => {
    f.revisarDte.mockResolvedValue(vista(true));
    const onCambio = abrir();
    fireEvent.change(screen.getByLabelText(/^Giro/), {
      target: { value: "MUNICIPALIDAD" },
    });
    await waitFor(() =>
      expect(onCambio).toHaveBeenLastCalledWith(
        expect.objectContaining({
          listo: true,
          dte: expect.objectContaining({
            pedida: expect.objectContaining({
              receptor: expect.objectContaining({ giro: "MUNICIPALIDAD" }),
            }),
          }),
        }),
      ),
    );
    expect(f.revisarDte).toHaveBeenCalledWith(
      "ev-423",
      expect.objectContaining({ orden_de_compra_id: 12 }),
    );
  });

  it("otra fuente le pide a BelIA el documento de nuevo, y se queda con la fecha elegida", async () => {
    f.revisarDte.mockResolvedValue(vista(true));
    f.armarBorradorDeDte.mockResolvedValue(
      borrador({
        ...pedida("JOKER SERVICIOS SPA", null),
        lineas: [
          {
            descripcion: "Estadía y alimentación",
            descripcion_larga: null,
            cantidad: 1,
            precio: 3440000,
          },
        ],
      }),
    );
    abrir();
    fireEvent.change(screen.getByLabelText("Fecha de emisión"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Se llena desde" })).getByRole(
        "button",
        { name: /OC N° 1213301-49-AG26/ },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Cotización N° 423/ }));
    await waitFor(() =>
      expect(f.armarBorradorDeDte).toHaveBeenCalledWith("ev-423", 33, null),
    );
    expect(
      await screen.findByDisplayValue("Estadía y alimentación"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha de emisión")).toHaveValue("2026-10-31");
  });
});
