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
  getResumenDeCierres: vi.fn(),
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
  c.getResumenDeCierres.mockResolvedValue({
    desde: "2026-11-09T23:30:00.000Z",
    efectivo_que_falta: 0,
    perdido_entre_turnos: 0,
    por_revisar: 1,
  });
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
  it("la lista con su estado en una palabra; el resultado de la revisión, en el title (§9.54)", async () => {
    abrir();
    expect(await screen.findByText("Por revisar")).toBeInTheDocument();
    const revisados = screen.getAllByText("Revisado");
    expect(revisados.map((e) => e.getAttribute("title"))).toEqual([
      "Revisado · cuadra",
      "Revisado · faltan $1.000",
    ]);
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
      screen.getByText("sencillo + ventas + ingresos − retiros − gastos"),
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
    expect(screen.getByText("Sobran $26.850")).toHaveAttribute(
      "title",
      "$26.850 más que el cierre anterior",
    );
  });

  it("§9.53: sin cierre anterior, solo con cuánto se abrió", async () => {
    c.getCierre.mockResolvedValue({ ...CIERRE, apertura: null });
    await abrirElDetalle();
    expect(lineaDeApertura()).toHaveTextContent(/^Abrió con \$20\.000$/);
  });

  // §9.54: la cadena del efectivo, con el caso real de producción (16-11).
  const DOMINGO: caja.CierreEnLaLista = {
    ...LISTA[2],
    id: 5,
    abierta_en: "2026-11-15T15:00:00Z",
    cerrada_en: "2026-11-15T23:00:00Z",
    sencillo_inicial: 26850,
    estado: "revisada",
    diferencia: 0,
    apertura: null,
    debia_tener: 26850,
    cerro_con: 26850,
    diferencia_efectivo: 0,
    diferencia_otros: 0,
  };
  const TURNO_A: caja.CierreEnLaLista = {
    ...LISTA[0],
    id: 6,
    abierta_en: "2026-11-16T14:22:00Z",
    cerrada_en: "2026-11-16T22:11:00Z",
    sencillo_inicial: 26850,
    estado: "por_revisar",
    apertura: { cierre_anterior: 26850, diferencia: 0 },
    debia_tener: 26850,
    cerro_con: 0,
    diferencia_efectivo: -26850,
    diferencia_otros: 0,
  };
  const TURNO_B: caja.CierreEnLaLista = {
    ...LISTA[0],
    id: 7,
    abierta_en: "2026-11-16T22:56:00Z",
    cerrada_en: null,
    cerrada_por_nombre: null,
    sencillo_inicial: 26850,
    estado: "abierta",
    declarado: null,
    diferencia: null,
    apertura: { cierre_anterior: 0, diferencia: 26850 },
    debia_tener: null,
    cerro_con: null,
    diferencia_efectivo: null,
    diferencia_otros: null,
  };

  it("§9.54: cada turno en efectivo (abrió con, debía tener, cerró con) y las franjas entre turnos", async () => {
    c.getCierres.mockResolvedValue([TURNO_B, TURNO_A, DOMINGO]);
    abrir();
    expect(await screen.findByText("Debía tener")).toBeInTheDocument();
    expect(screen.getByText("Cerró con")).toBeInTheDocument();
    expect(screen.getByText("Tarjetas y transf.")).toBeInTheDocument();
    const filas = screen.getAllByRole("row").slice(1);
    // B (abierta) · franja B–A · A · domingo (entre A y el domingo calza:
    // sin franja).
    expect(filas).toHaveLength(4);
    const [b, entreBA, a, domingo] = filas;
    // El abierto: solo la hora de apertura y «—» en lo que no se muestra.
    expect(within(b).getByText("Abierta")).toBeInTheDocument();
    expect(within(b).getAllByText("—")).toHaveLength(4);
    expect(within(b).getByRole("button").textContent).toMatch(
      /^\S+ \d{2}-\d{2} · \d{2}:\d{2}$/,
    );
    // A abrió con 26.850, debía tener 26.850 y cerró con 0.
    expect(a).toHaveTextContent("$26.850$26.850$0");
    expect(within(a).getByText("Faltan $26.850")).toHaveClass("text-red-700");
    expect(within(a).getByText("Cuadra")).toBeInTheDocument();
    expect(within(a).getByText("Por revisar")).toBeInTheDocument();
    expect(within(a).getByRole("button").textContent).toMatch(
      /^\S+ \d{2}-\d{2} · \d{2}:\d{2} a \d{2}:\d{2}$/,
    );
    // Entre A (cerró con 0) y B (abrió con 26.850): aparecieron, en ámbar.
    expect(entreBA).toHaveTextContent(
      "Entre turnosAparecieron $26.850 que el cierre anterior no declaró",
    );
    expect(within(entreBA).getByText("Entre turnos")).toHaveClass(
      "text-amber-800",
    );
    // Entre el domingo y A pasó completo: no hay franja.
    expect(screen.getAllByText("Entre turnos")).toHaveLength(1);
    // El más viejo no lleva franja debajo.
    expect(within(domingo).getAllByText("Cuadra")).toHaveLength(2);
    expect(within(domingo).getByText("Revisado")).toBeInTheDocument();
  });

  it("§9.54: si abrió con menos que el cierre anterior, la franja va en rojo", async () => {
    c.getCierres.mockResolvedValue([
      { ...TURNO_A, apertura: { cierre_anterior: 30000, diferencia: -3150 } },
      DOMINGO,
    ]);
    abrir();
    const franja = (
      await screen.findByText(/entre el cierre y la apertura/)
    ).closest("tr") as HTMLElement;
    expect(franja).toHaveTextContent(
      "Faltan $3.150 entre el cierre y la apertura",
    );
    expect(within(franja).getByText("Entre turnos")).toHaveClass(
      "text-red-700",
    );
  });

  it("§9.54: las tres cifras de los 7 días, con su color", async () => {
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-09T23:30:00.000Z",
      efectivo_que_falta: -26850,
      perdido_entre_turnos: 0,
      por_revisar: 1,
    });
    abrir();
    const cifra = async (etiqueta: string) =>
      (await screen.findByText(etiqueta)).previousElementSibling as HTMLElement;
    expect(await cifra("Efectivo que falta, 7 días")).toHaveTextContent(
      "−$26.850",
    );
    expect(await cifra("Efectivo que falta, 7 días")).toHaveClass(
      "text-red-700",
    );
    expect(await cifra("Perdido entre turnos")).toHaveTextContent("$0");
    expect(await cifra("Perdido entre turnos")).toHaveClass("text-green-700");
    expect(await cifra("Turnos por revisar")).toHaveTextContent("1");
  });

  it("§9.54: si sobra efectivo en la semana, va con +", async () => {
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-09T23:30:00.000Z",
      efectivo_que_falta: 500,
      perdido_entre_turnos: -2000,
      por_revisar: 0,
    });
    abrir();
    expect(
      (await screen.findByText("Efectivo que falta, 7 días"))
        .previousElementSibling,
    ).toHaveTextContent("+$500");
    expect(
      screen.getByText("Perdido entre turnos").previousElementSibling,
    ).toHaveTextContent("−$2.000");
  });

  it("§9.55: el turno y su franja son una unidad: se resaltan juntos y la franja abre el mismo detalle", async () => {
    c.getCierres.mockResolvedValue([
      { ...TURNO_A, apertura: { cierre_anterior: 30000, diferencia: -3150 } },
      DOMINGO,
    ]);
    abrir();
    const franja = (
      await screen.findByText(/entre el cierre y la apertura/)
    ).closest("tr") as HTMLElement;
    const grupo = franja.closest("tbody") as HTMLElement;
    expect(grupo).toHaveClass("group");
    // El turno A y su franja, en el mismo grupo.
    expect(within(grupo).getAllByRole("row")).toHaveLength(2);
    expect(within(grupo).getByText("Por revisar")).toBeInTheDocument();
    fireEvent.click(franja);
    await waitFor(() => expect(c.getCierre).toHaveBeenCalledWith(6));
  });

  it("§9.55: con el panel de la caja, la fila «Abierta» lo abre en vez del detalle", async () => {
    const onAbrirLaCaja = vi.fn();
    c.getCierres.mockResolvedValue([TURNO_B, TURNO_A]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CierresDeCaja onAbrirLaCaja={onAbrirLaCaja} />
      </QueryClientProvider>,
    );
    fireEvent.click((await screen.findByText("Abierta")).closest("tr")!);
    expect(onAbrirLaCaja).toHaveBeenCalledTimes(1);
    expect(c.getCierre).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Por revisar").closest("tr")!);
    await waitFor(() => expect(c.getCierre).toHaveBeenCalledWith(6));
  });

  it("§9.56: los gastos van aparte, con su total y su fila en ámbar", async () => {
    c.getCierre.mockResolvedValue({
      ...CIERRE,
      cuadre: { ...CIERRE.cuadre, gastos: 4500 },
      movimientos: [
        ...(CIERRE.movimientos ?? []),
        {
          id: 3,
          tipo: "gasto" as const,
          monto: 4500,
          motivo: "Taxi al banco",
          creado_por_nombre: "Ana",
          creado_en: "2026-11-09T16:00:00Z",
        },
      ],
    });
    abrir();
    fireEvent.click((await screen.findByText("Por revisar")).closest("tr")!);
    const seccion = (await screen.findByText("Movimientos del turno"))
      .parentElement as HTMLElement;
    expect(seccion).toHaveTextContent("Gastos −$4.500");
    const gasto = within(seccion)
      .getByText("Taxi al banco")
      .closest("li") as HTMLElement;
    expect(within(gasto).getByText("Gasto")).toHaveClass("text-amber-800");
    expect(gasto).toHaveTextContent("−$4.500");
  });
});

// «GASTOS DE 7 DÍAS» (doc 19 §9.57). Felipe, 19-11, con la maqueta: *"sí me
// tinca, hagámoslo"*. La cuarta tarjeta, en la misma fila que las otras
// tres; al tocarla, en qué se gastó.
describe("los gastos de 7 días (§9.57)", () => {
  const GASTOS = [
    {
      id: 2,
      turno_id: 30,
      monto: 3500,
      motivo: "Pan para el desayuno",
      creado_por_nombre: "Rosa",
      creado_en: "2026-11-19T13:10:00Z",
    },
    {
      id: 1,
      turno_id: 29,
      monto: 8000,
      motivo: "Taxi al banco",
      creado_por_nombre: "Ana",
      creado_en: "2026-11-18T15:00:00Z",
    },
  ];
  const cifra = async (etiqueta: string) =>
    (await screen.findByText(etiqueta)).previousElementSibling as HTMLElement;

  it("la cuarta tarjeta, en la misma fila y con el mismo aspecto, en ámbar si hay gastos", async () => {
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-12T15:00:00.000Z",
      efectivo_que_falta: 0,
      perdido_entre_turnos: 0,
      por_revisar: 1,
      gastos: 11500,
      lista_de_gastos: GASTOS,
    });
    abrir();
    const valor = await cifra("Gastos de 7 días");
    expect(valor).toHaveTextContent("−$11.500");
    expect(valor).toHaveClass("text-amber-700");
    const tarjeta = valor.parentElement as HTMLElement;
    const otra = (await cifra("Turnos por revisar"))
      .parentElement as HTMLElement;
    // Mismo lugar (la misma fila) y la misma tarjeta blanca.
    expect(tarjeta.parentElement).toBe(otra.parentElement);
    expect(tarjeta.parentElement).toHaveClass("lg:grid-cols-4");
    for (const clase of ["rounded-lg", "border", "bg-white", "px-4", "py-3"])
      expect(tarjeta).toHaveClass(clase);
  });

  it("al tocarla, la lista del más nuevo al más viejo con el día, quién, en qué y el monto", async () => {
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-12T15:00:00.000Z",
      efectivo_que_falta: 0,
      perdido_entre_turnos: 0,
      por_revisar: 1,
      gastos: 11500,
      lista_de_gastos: GASTOS,
    });
    abrir();
    const tarjeta = (await cifra("Gastos de 7 días")).closest(
      "button",
    ) as HTMLElement;
    fireEvent.click(tarjeta);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Gastos de 7 días")).toBeInTheDocument();
    expect(panel).toHaveTextContent("−$11.500 en 2 gastos");
    const filas = within(panel).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("Pan para el desayuno");
    expect(filas[0]).toHaveTextContent("Rosa");
    expect(filas[0]).toHaveTextContent("19-11");
    expect(filas[0]).toHaveTextContent("−$3.500");
    expect(filas[1]).toHaveTextContent("Taxi al banco");
    expect(filas[1]).toHaveTextContent("Ana");
    expect(filas[1]).toHaveTextContent("18-11");
    expect(filas[1]).toHaveTextContent("−$8.000");
  });

  it("sin gastos: «$0» en verde y la tarjeta no abre nada", async () => {
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-12T15:00:00.000Z",
      efectivo_que_falta: 0,
      perdido_entre_turnos: 0,
      por_revisar: 1,
      gastos: 0,
      lista_de_gastos: [],
    });
    abrir();
    const valor = await cifra("Gastos de 7 días");
    expect(valor).toHaveTextContent("$0");
    expect(valor).toHaveClass("text-green-700");
    expect(valor.closest("button")).toBeNull();
    fireEvent.click(valor.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("con el motor de antes (sin el dato), solo las tres cifras de siempre", async () => {
    abrir();
    await screen.findByText("Turnos por revisar");
    expect(screen.queryByText("Gastos de 7 días")).toBeNull();
  });
});
