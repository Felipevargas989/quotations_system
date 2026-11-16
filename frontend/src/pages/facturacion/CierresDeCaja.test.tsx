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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as caja from "../../services/caja.service";
import CierresDeCaja from "./CierresDeCaja";

// LOS CIERRES DE LA CAJA, PARA REVISARLOS (doc 19 §9.43, sprint 2): la
// lista con su estado y cada cierre con lo declarado, lo esperado y la
// diferencia por medio de pago; el medio de pago se corrige ahí y se marca
// revisado.

vi.mock("../../services/caja.service", () => ({
  getCaja: vi.fn(),
  abrirCaja: vi.fn(),
  anotarRetiro: vi.fn(),
  cerrarCaja: vi.fn(),
  getCierres: vi.fn(),
  getCierre: vi.fn(),
  corregirMedio: vi.fn(),
  revisarCierre: vi.fn(),
}));
const c = vi.mocked(caja);

const BASE = {
  abierta_por_nombre: "Ana",
  sencillo_inicial: 20000,
  cerrada_por_nombre: "Ana",
  revisado_por_nombre: null,
  revisado_en: null,
  vendido: 367500,
  diferencias: [],
};

const LISTA: caja.CierreEnLaLista[] = [
  {
    ...BASE,
    id: 7,
    abierta_en: "2026-11-09T12:02:00Z",
    cerrada_en: "2026-11-09T21:05:00Z",
    estado: "por_revisar",
    declarado: 337500,
    diferencia: 0,
  },
  {
    ...BASE,
    id: 6,
    abierta_en: "2026-11-08T12:00:00Z",
    cerrada_en: "2026-11-08T21:00:00Z",
    estado: "revisada",
    declarado: 512000,
    diferencia: 0,
  },
  {
    ...BASE,
    id: 5,
    abierta_en: "2026-11-07T12:00:00Z",
    cerrada_en: "2026-11-07T21:00:00Z",
    estado: "revisada",
    declarado: 688500,
    diferencia: -1000,
  },
];

const linea = (
  medio: caja.LineaDelCuadre["medio"],
  esperado: number,
  declarado: number,
) => ({
  medio,
  vendido: esperado,
  esperado,
  declarado,
  diferencia: declarado - esperado,
  documentos: 1,
});

const CIERRE: caja.CierreDeCaja = {
  ...BASE,
  id: 7,
  abierta_en: "2026-11-09T12:02:00Z",
  cerrada_en: "2026-11-09T21:05:00Z",
  estado: "por_revisar",
  comentario: null,
  nota_revision: null,
  cuadre: {
    lineas: [
      linea("efectivo", 67500, 67500),
      linea("debito", 130000, 135000),
      linea("credito", 100000, 95000),
      linea("transferencia", 40000, 40000),
    ],
    vendido: 367500,
    ingresos: 30000,
    retiros: 50000,
    esperado: 337500,
    declarado: 337500,
    diferencia: 0,
    porConfirmar: 0,
    vendidoPorItem: [
      {
        tarifario_id: 26,
        nombre: "Ticket diario, temporada media",
        cantidad: 19,
        monto: 142500,
      },
    ],
  },
  documentos: [
    {
      id: 30,
      tipo: 39,
      folio: 45012,
      estado: "emitido",
      total: 5000,
      medio_de_pago: "credito",
      emitido_en: "2026-11-09T15:00:00Z",
      solicitud_id: null,
    },
  ],
  retiros: [
    {
      id: 1,
      monto: 50000,
      motivo: "Entregado a administración",
      creado_en: "2026-11-09T17:30:00Z",
    },
  ],
  movimientos: [
    {
      id: 1,
      tipo: "retiro" as const,
      monto: 50000,
      motivo: "Entregado a administración",
      creado_por_nombre: null,
      creado_en: "2026-11-09T17:30:00Z",
    },
    {
      id: 2,
      tipo: "ingreso" as const,
      monto: 30000,
      motivo: "Sencillo que mandó Felipe",
      creado_por_nombre: "Ana",
      creado_en: "2026-11-09T15:10:00Z",
    },
  ],
  correcciones: [],
};

beforeEach(() => {
  c.getCierres.mockResolvedValue(LISTA);
  c.getCierre.mockResolvedValue(CIERRE);
  c.corregirMedio.mockResolvedValue(CIERRE);
  c.revisarCierre.mockResolvedValue({ ...CIERRE, estado: "revisada" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CierresDeCaja />
    </QueryClientProvider>,
  );

describe("los cierres de la caja (§9.43)", () => {
  it("la lista con su estado en una palabra y el resultado al revisarlo", async () => {
    abrir();
    expect(await screen.findByText("Por revisar")).toBeInTheDocument();
    expect(screen.getByText("Revisado · cuadra")).toBeInTheDocument();
    expect(screen.getByText("Revisado · faltan $1.000")).toBeInTheDocument();
  });

  it("cada cierre: declarado, según Eventia y la diferencia; se corrige el medio y se marca revisado", async () => {
    abrir();
    fireEvent.click((await screen.findByText("Por revisar")).closest("tr")!);
    expect(await screen.findByText("Sobran $5.000")).toBeInTheDocument();
    expect(screen.getByText("Faltan $5.000")).toBeInTheDocument();
    expect(screen.getByText(/se compensan/)).toBeInTheDocument();
    expect(
      screen.getByText("Ticket diario, temporada media"),
    ).toBeInTheDocument();
    // El medio de pago de la boleta 45012, de crédito a débito.
    const fila = screen.getByText(/Boleta 45012/).closest("li") as HTMLElement;
    fireEvent.click(within(fila).getByRole("button", { name: /Crédito/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Débito/ }));
    await waitFor(() =>
      expect(c.corregirMedio).toHaveBeenCalledWith(7, 30, "debito"),
    );
    fireEvent.change(screen.getByLabelText("Nota de la revisión"), {
      target: { value: "Un convenio cargado como crédito" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Marcar revisado" }));
    await waitFor(() =>
      expect(c.revisarCierre).toHaveBeenCalledWith(
        7,
        "Un convenio cargado como crédito",
      ),
    );
  });

  it("§9.51: los ingresos y los retiros en líneas separadas, por hora y con quién los anotó", async () => {
    abrir();
    fireEvent.click((await screen.findByText("Por revisar")).closest("tr")!);
    const seccion = (await screen.findByText("Movimientos del turno"))
      .parentElement as HTMLElement;
    // El total de cada uno y su fila.
    expect(within(seccion).getAllByText("+$30.000")).toHaveLength(2);
    expect(within(seccion).getAllByText("−$50.000")).toHaveLength(2);
    const filas = within(seccion).getAllByRole("listitem");
    // Por hora: el ingreso de las 15:10 antes del retiro de las 17:30.
    expect(filas[0]).toHaveTextContent("Ingreso");
    expect(filas[0]).toHaveTextContent("· Ana");
    expect(filas[1]).toHaveTextContent("Retiro");
    // La fila vieja sin nombre no muestra nada.
    expect(filas[1]).not.toHaveTextContent("·");
    expect(
      screen.getByText("sencillo + ventas + ingresos − retiros"),
    ).toBeInTheDocument();
  });

  // Felipe, 09-11: *"que diga las dos"*. La hora sale en la zona y el
  // formato de quien corre la prueba («18:05» o «06:05 p. m.»): por eso solo
  // su forma.
  const HORA = /a las? \d{2}:\d{2}(?: [ap]\. ?m\.)?/.source;
  const abrirElDetalle = async () => {
    abrir();
    fireEvent.click((await screen.findByText("Por revisar")).closest("tr")!);
    return screen.findByText(/^Abrió (?!con)/);
  };

  it("el detalle dice quién abrió y quién cerró, cada uno con su hora", async () => {
    c.getCierre.mockResolvedValue({ ...CIERRE, cerrada_por_nombre: "Pedro" });
    expect(await abrirElDetalle()).toHaveTextContent(
      new RegExp(`^Abrió Ana ${HORA} · Cerró Pedro ${HORA}$`),
    );
  });

  it("si cerró otro día lo dice, y la que sigue abierta lo dice", async () => {
    c.getCierre.mockResolvedValue({
      ...CIERRE,
      cerrada_por_nombre: "Pedro",
      cerrada_en: "2026-11-10T14:00:00Z",
    });
    expect(await abrirElDetalle()).toHaveTextContent(
      new RegExp(`· Cerró Pedro el .+ ${HORA}$`),
    );
    cleanup();
    c.getCierre.mockResolvedValue({
      ...CIERRE,
      cerrada_por_nombre: null,
      cerrada_en: null,
      estado: "abierta",
    });
    expect(await abrirElDetalle()).toHaveTextContent(
      new RegExp(`^Abrió Ana ${HORA} · Sigue abierta$`),
    );
  });

  // §9.53: con cuánto se abrió y si calza con el cierre anterior.
  const lineaDeApertura = () =>
    screen.getAllByText(/Abrió con/).find((e) => e.tagName === "P");
  it("§9.53: la lista dice con cuánto se abrió y si calza con el cierre anterior", async () => {
    c.getCierres.mockResolvedValue([
      { ...LISTA[0], apertura: { cierre_anterior: 20000, diferencia: 0 } },
      {
        ...LISTA[1],
        apertura: { cierre_anterior: 46850, diferencia: -26850 },
      },
      { ...LISTA[2], apertura: null },
    ]);
    abrir();
    expect(await screen.findByText("Abrió con")).toBeInTheDocument();
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas[0]).toHaveTextContent("$20.000");
    expect(within(filas[0]).getByText("Calza")).toBeInTheDocument();
    expect(within(filas[1]).getByText("Faltan")).toBeInTheDocument();
    expect(
      within(filas[1]).getByText("$26.850 menos que el cierre anterior"),
    ).toBeInTheDocument();
    // El primer turno de la historia no lleva chip.
    expect(filas[2]).toHaveTextContent("$20.000");
    expect(within(filas[2]).queryByText(/Calza|Faltan|Sobran/)).toBeNull();
  });

  it("§9.53: el detalle trae la apertura, la cifra del cierre anterior y el chip", async () => {
    c.getCierre.mockResolvedValue({
      ...CIERRE,
      sencillo_inicial: 26850,
      apertura: { cierre_anterior: 0, diferencia: 26850 },
    });
    await abrirElDetalle();
    expect(lineaDeApertura()).toHaveTextContent(
      "Abrió con $26.850 · cierre anterior $0",
    );
    expect(screen.getByText("Sobran")).toBeInTheDocument();
    expect(
      screen.getByText("$26.850 más que el cierre anterior"),
    ).toBeInTheDocument();
  });

  it("§9.53: sin cierre anterior, solo con cuánto se abrió", async () => {
    c.getCierre.mockResolvedValue({ ...CIERRE, apertura: null });
    await abrirElDetalle();
    expect(lineaDeApertura()).toHaveTextContent(/^Abrió con \$20\.000$/);
  });
});
