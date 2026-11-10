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
import * as solicitudes from "../../services/solicitudes.service";
import FacturaNueva from "./FacturaNueva";

// LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.22), como la maqueta del
// 06-11: en su propia pantalla, a crédito 30 días si no se dice, con el
// destinatario buscado en Clientes (por el nombre o el RUT) o creado nuevo.
// Desde el 07-11 (§9.23) también la emite recepción, solo con el tarifario.

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
vi.mock("../../components/FileViewLink", () => ({
  default: ({ title }: { title: string }) => <span>ver {title}</span>,
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ permisos: ["clientes", "boletas"] }),
}));
vi.mock("../../services/boletas.service", () => ({
  getTarifario: () =>
    Promise.resolve([
      {
        id: 5,
        nombre: "Cabaña 6 personas, temporada media",
        precio: 140000,
        unidad: "noche",
        activo: true,
      },
    ]),
}));
vi.mock("../../services/solicitudes.service", () => ({
  solicitarBoleta: vi.fn(),
  solicitarFactura: vi.fn(),
  getSolicitudesDelTurno: vi.fn().mockResolvedValue({ solicitudes: [] }),
  getSolicitudes: vi.fn().mockResolvedValue({ pendientes: 0, solicitudes: [] }),
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
  emision: { desde: "2026-10-01", hasta: "2026-11-06" },
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

const abrir = (esAdmin = true, solicita = false, vista = VISTA) => {
  f.getClientesParaFacturar.mockResolvedValue(CLIENTES);
  f.revisarFacturaSinEvento.mockResolvedValue(vista);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FacturaNueva
        esAdmin={esAdmin}
        solicita={solicita}
        quedarse={!esAdmin}
        onVolver={() => {}}
        onEmitida={() => {}}
      />
    </QueryClientProvider>,
  );
};

const ultimaRevision = () => {
  const llamadas = f.revisarFacturaSinEvento.mock.calls;
  return llamadas[llamadas.length - 1]?.[0] as facturas.DtePedido;
};

describe("La factura de «Nuevo DTE»", () => {
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
    // §9.32: la condición de pago, en una lista; debajo, el vencimiento.
    expect(
      within(
        screen.getByRole("group", { name: "Condición de pago" }),
      ).getByRole("button", { name: /Crédito 30 días/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("vence 06-12-2026")).toBeInTheDocument();
  });

  it("la fecha de emisión se elige dentro del rango que da el motor (§9.32)", async () => {
    abrir();
    const fecha = (await screen.findByLabelText(
      "Fecha de emisión",
    )) as HTMLInputElement;
    expect(fecha).toHaveValue("2026-11-06");
    expect(fecha).toHaveAttribute("min", "2026-10-01");
    expect(fecha).toHaveAttribute("max", "2026-11-06");
    fireEvent.change(fecha, { target: { value: "2026-10-31" } });
    await waitFor(
      () =>
        expect(ultimaRevision()).toMatchObject({
          fecha_emision: "2026-10-31",
        }),
      { timeout: 2000 },
    );
  });

  it("a 45 días avisa lo de la ley; al contado no tiene vencimiento", async () => {
    abrir();
    // La lista de la casa: se abre con lo elegido y se pincha la opción.
    const condicion = await screen.findByRole("group", {
      name: "Condición de pago",
    });
    fireEvent.click(
      within(condicion).getByRole("button", { name: /Crédito 30 días/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Crédito 45 días/ }));
    expect(screen.getByText(/Más de 30 días solo si/)).toBeInTheDocument();
    fireEvent.click(
      within(condicion).getByRole("button", { name: /Crédito 45 días/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Contado/ }));
    expect(screen.queryByText(/^vence/)).not.toBeInTheDocument();
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

  it("recepción (§9.23): solo del tarifario, con su precio fijo, y sin descuento", async () => {
    const usuario = userEvent.setup();
    abrir(false);
    expect(
      await screen.findByText("Elige del tarifario cada línea, o quítala."),
    ).toBeInTheDocument();
    // Ni la casilla a mano ni la del descuento.
    expect(screen.queryByPlaceholderText("Descripción")).toBeNull();
    expect(screen.queryByText("Desc. %")).toBeNull();
    expect(screen.queryByRole("button", { name: /Del tarifario/ })).toBeNull();
    await usuario.click(
      await screen.findByRole("button", { name: /Elegir del tarifario/ }),
    );
    const lista = within(
      document.querySelector("[data-lista-scroll]") as HTMLElement,
    );
    await usuario.click(
      lista.getByRole("button", { name: /Cabaña 6 personas/ }),
    );
    expect(screen.getByTitle("El precio del tarifario")).toHaveTextContent(
      "$140.000",
    );
    expect(
      screen.queryByText("Elige del tarifario cada línea, o quítala."),
    ).toBeNull();
    await waitFor(
      () =>
        expect(ultimaRevision().lineas).toEqual([
          expect.objectContaining({
            tarifario_id: 5,
            descripcion: "Cabaña 6 personas, temporada media",
            precio: 140000,
            cantidad: 1,
          }),
        ]),
      { timeout: 2000 },
    );
  });

  it("recepción (§9.46): a crédito también «Enviar solicitud», no emite", async () => {
    const usuario = userEvent.setup();
    vi.mocked(solicitudes.solicitarFactura).mockResolvedValue({
      total: 166600,
    } as never);
    abrir(false, true, { ...VISTA, ok: true, faltan: [] });
    await usuario.click(
      await screen.findByRole("button", { name: /Elegir del tarifario/ }),
    );
    await usuario.click(
      within(
        document.querySelector("[data-lista-scroll]") as HTMLElement,
      ).getByRole("button", { name: /Cabaña 6 personas/ }),
    );
    const crear = await screen.findByRole("button", {
      name: "Crear documento",
    });
    await waitFor(() => expect(crear).toBeEnabled(), { timeout: 3000 });
    await usuario.click(crear);
    await usuario.click(
      await screen.findByRole("button", { name: "Enviar solicitud" }),
    );
    await waitFor(() =>
      expect(solicitudes.solicitarFactura).toHaveBeenCalledWith(
        expect.objectContaining({ forma_de_pago: 2, plazo_dias: 30 }),
      ),
    );
    expect(f.emitirFacturaSinEvento).not.toHaveBeenCalled();
  });

  it("el administrador escribe a mano y también puede tomar del tarifario", async () => {
    abrir();
    expect(
      await screen.findByPlaceholderText("Descripción"),
    ).toBeInTheDocument();
    expect(screen.getByText("Desc. %")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: /Del tarifario/ }),
    );
    expect(
      screen.getByText("Elige del tarifario cada línea, o quítala."),
    ).toBeInTheDocument();
  });
});
