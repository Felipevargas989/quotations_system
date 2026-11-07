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
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as facturas from "../../services/facturas.service";
import FacturaNueva from "./FacturaNueva";

// LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.22), como la maqueta del
// 06-11: en su propia pantalla, a crédito 30 días si no se dice, con el
// destinatario buscado en Clientes (por el nombre o el RUT) o creado nuevo.

vi.mock("../../services/facturas.service", () => ({
  getClientesParaFacturar: vi.fn(),
  revisarFacturaSinEvento: vi.fn(),
  emitirFacturaSinEvento: vi.fn(),
}));
vi.mock("../../services/clientTypes.service", () => ({
  clientTypesQueryOptions: {
    queryKey: ["clientTypes"],
    queryFn: () =>
      Promise.resolve([
        { id: 1, name: "Particulares" },
        { id: 2, name: "Empresas" },
      ]),
  },
}));
vi.mock("../../services/razonesSociales.service", () => ({
  createRazonSocial: vi.fn(),
}));
vi.mock("../../hooks/useCrearCliente", () => ({
  useCrearCliente: () => ({ enviar: vi.fn(), cargando: false, aviso: null }),
}));
const f = vi.mocked(facturas);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VISTA: facturas.VistaPrevia = {
  ok: false,
  montos: { neto: 0, exento: 0, iva: 0, total: 0 },
  lineas: [],
  observaciones: [],
  avisos: [],
  problemas: [],
  faltan: [{ campo: "detalle:0", texto: "la descripción" }],
  folio: 43,
  fecha: "2026-11-06",
  emisor: { nombre: "Valle del Sol Quillón SpA", rut: null },
  ambiente: "simulado",
  pago: { forma: 2, dias: 30, vencimiento: "2026-12-06" },
};

const CLIENTES: facturas.ClienteParaFacturar[] = [
  {
    id: "ccu",
    nombre: "CCU",
    tipo: "Empresas",
    contacto: { nombre: "Jorge Muñoz", correo: "jm@ccu.cl", telefono: null },
    razones: [
      {
        id: 7,
        rut: "90413000-1",
        razon_social: "Compañía Cervecerías Unidas S.A.",
        giro: "Elaboración de cervezas",
        direccion: "Av. Vitacura 2670",
        comuna: "Las Condes",
        ciudad: "Santiago",
        correo_facturacion: "facturas@ccu.cl",
        referencias_exigidas: ["802"],
      },
    ],
  },
  {
    id: "sin-datos",
    nombre: "Colegio Los Naranjos",
    tipo: "Colegios & Universidades",
    contacto: null,
    razones: [],
  },
];

const abrir = () => {
  f.getClientesParaFacturar.mockResolvedValue(CLIENTES);
  f.revisarFacturaSinEvento.mockResolvedValue(VISTA);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FacturaNueva puedeEmitir onVolver={() => {}} onEmitida={() => {}} />
    </QueryClientProvider>,
  );
};

const ultimaRevision = () => {
  const llamadas = f.revisarFacturaSinEvento.mock.calls;
  return llamadas[llamadas.length - 1]?.[0] as facturas.DtePedido;
};

describe("La factura de «Nuevo documento»", () => {
  it("parte a crédito 30 días, con el vencimiento a la vista", async () => {
    abrir();
    expect(
      await screen.findByText("Nueva factura electrónica"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(ultimaRevision()).toMatchObject({
        tipo: 33,
        forma_de_pago: 2,
        plazo_dias: 30,
        cliente_id: null,
      }),
    );
    expect(screen.getByRole("radio", { name: "Crédito" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByText("06-12-2026")).toBeInTheDocument();
  });

  it("a 45 días avisa lo de la ley; al contado no queda por cobrar", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("radio", { name: "45 días" }));
    expect(screen.getByText(/Más de 30 días solo si/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Contado" }));
    expect(screen.getByText(/no queda por cobrar/)).toBeInTheDocument();
    await waitFor(
      () =>
        expect(ultimaRevision()).toMatchObject({
          forma_de_pago: 1,
          plazo_dias: null,
        }),
      { timeout: 2000 },
    );
  });

  it("el cliente se busca por el RUT sin puntos y trae su razón social y lo que pide", async () => {
    const usuario = userEvent.setup();
    abrir();
    await usuario.click(
      await screen.findByRole("button", {
        name: /Busca el cliente por nombre o RUT/,
      }),
    );
    await usuario.type(screen.getByPlaceholderText("Nombre o RUT"), "90413000");
    const lista = within(
      document.querySelector("[data-lista-scroll]") as HTMLElement,
    );
    await usuario.click(
      lista.getByRole("button", { name: /Compañía Cervecerías Unidas/ }),
    );
    expect(screen.getByText(/Contacto: Jorge Muñoz/)).toBeInTheDocument();
    await waitFor(
      () =>
        expect(ultimaRevision()).toMatchObject({
          cliente_id: "ccu",
          receptor: expect.objectContaining({
            rut: "90413000-1",
            razon_social: "Compañía Cervecerías Unidas S.A.",
          }),
          referencias: [{ tipo: "802", folio: "", fecha: "" }],
          pedir_siempre: ["802"],
        }),
      { timeout: 2000 },
    );
  });

  it("un cliente sin datos de facturación abre sus casillas para completarlos", async () => {
    const usuario = userEvent.setup();
    abrir();
    await usuario.click(
      await screen.findByRole("button", {
        name: /Busca el cliente por nombre o RUT/,
      }),
    );
    const lista = within(
      document.querySelector("[data-lista-scroll]") as HTMLElement,
    );
    await usuario.click(
      lista.getByRole("button", { name: /Colegio Los Naranjos/ }),
    );
    expect(
      screen.getByDisplayValue("Colegio Los Naranjos"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("12.345.678-9")).toBeInTheDocument();
    expect(
      screen.getByText(/quedan en la ficha de Colegio Los Naranjos/),
    ).toBeInTheDocument();
  });

  it("«Crear cliente nuevo» pide los datos de facturación, el tipo de cliente y el contacto", async () => {
    abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: "Crear cliente nuevo" }),
    );
    expect(screen.getByText("Datos de facturación")).toBeInTheDocument();
    expect(screen.getByText("En Clientes")).toBeInTheDocument();
    expect(screen.getByText("Tipo de cliente")).toBeInTheDocument();
    expect(screen.getByText("Nombre del contacto")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Empresas/ }),
    ).toBeInTheDocument();
  });
});
