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
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PorFacturar from "./PorFacturar";

// «POR FACTURAR» (doc 19 §9.21): los eventos con algo por emitir. Lo
// facturado fuera de Eventia (§9.24): «Ya está facturado», abajo plegado, y
// «Devolver». Desde el 08-11 (§9.31): el buscador amplio, la fila solo con
// sus columnas y «Facturar seleccionados», que abre la revisión.

let eventos: unknown[] = [];
let fuera: unknown[] = [];
let facturados: unknown[] = [];
vi.mock("./consultas", () => ({
  LLAVE_POR_FACTURAR: ["facturacion", "por-facturar"],
  usePorFacturar: () => ({
    isPending: false,
    isError: false,
    data: {
      ambiente: "simulado",
      desde: "2026-08-08",
      eventos,
      facturados,
      facturados_fuera: fuera,
    },
  }),
}));
const marcarFacturadoFuera = vi.fn().mockResolvedValue({ ok: true });
const devolverAPorFacturar = vi.fn().mockResolvedValue({ ok: true });
const leerOrdenesPendientes = vi
  .fn()
  .mockResolvedValue({ leidas: 0, sin_leer: [] });
vi.mock("../../services/facturas.service", () => ({
  marcarFacturadoFuera: (id: string) => marcarFacturadoFuera(id),
  devolverAPorFacturar: (id: string) => devolverAPorFacturar(id),
  leerOrdenesPendientes: () => leerOrdenesPendientes(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./RevisionDeLaFacturacion", () => ({
  default: ({
    eventos,
    noLeidas,
  }: {
    eventos: { numero: number }[];
    noLeidas: { nombre: string }[];
  }) => (
    <p>
      revisar: {eventos.map((e) => e.numero).join(", ")}
      {noLeidas.length
        ? ` · no leídas: ${noLeidas.map((n) => n.nombre).join(", ")}`
        : ""}
    </p>
  ),
}));

afterEach(() => {
  cleanup();
  eventos = [];
  fuera = [];
  facturados = [];
  vi.clearAllMocks();
});

const EVENTO = {
  id: "ev-473",
  numero: 473,
  estado: "realizada",
  tipoDeEvento: "Seminario",
  fecha: "2026-08-10",
  cliente: "Municipalidad",
  total: 1245000,
  emitido: 0,
  queda: 1245000,
  ocs: 1,
};

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PorFacturar />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Por facturar", () => {
  it("cada evento con su total, lo emitido y lo que queda; en la fila, solo «Ya está facturado» (§9.31)", () => {
    eventos = [
      {
        id: "ev-501",
        numero: 501,
        estado: "aceptada",
        tipoDeEvento: "Paseo fin de año",
        fecha: "2026-12-06",
        cliente: "CCU",
        total: 1000000,
        emitido: 400000,
        queda: 600000,
        ocs: 1,
      },
    ];
    abrir();
    expect(screen.getByRole("link", { name: "#501" })).toHaveAttribute(
      "href",
      "/post-venta/ev-501",
    );
    expect(screen.getByText("$1.000.000")).toBeInTheDocument();
    expect(screen.getByText("$400.000")).toBeInTheDocument();
    expect(screen.getByText("$600.000")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ya está facturado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Facturar$/ }),
    ).not.toBeInTheDocument();
  });

  it("marca uno o varios y «Facturar seleccionados» abre la revisión con ellos (§9.31)", () => {
    eventos = [501, 502].map((numero) => ({
      id: `ev-${numero}`,
      numero,
      estado: "aceptada",
      tipoDeEvento: null,
      fecha: "2026-12-06",
      cliente: "CCU",
      total: 100000,
      emitido: 0,
      queda: 100000,
      ocs: 0,
    }));
    abrir();
    expect(
      screen.getByRole("button", { name: /Facturar seleccionados/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar seleccionados (2)" }),
    );
    expect(screen.getByText("revisar: 501, 502")).toBeInTheDocument();
  });

  it("sin nada pendiente, lo dice desde cuándo mira", () => {
    abrir();
    expect(
      screen.getByText(/Todos los eventos desde el 08-08-2026 están emitidos/),
    ).toBeInTheDocument();
  });

  it("la fila, solo con sus columnas: «Con OC», y sus OC y la factura en Documentos van a la revisión (§9.31)", () => {
    eventos = [
      {
        ...EVENTO,
        tiene_factura_en_documentos: true,
        ordenes: [
          {
            id: 1,
            numero: "4500123",
            total: 1245000,
            facturado: 0,
            queda: 1245000,
            estado: "pendiente",
          },
        ],
      },
    ];
    abrir();
    expect(screen.getByText("Con OC")).toBeInTheDocument();
    expect(
      screen.queryByText("Tiene factura en Documentos"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/OC 4500123/)).not.toBeInTheDocument();
  });

  it("pendiente o parcial con el % facturado (§9.26), sin repetir la OC en la fila (§9.31)", () => {
    eventos = [
      {
        ...EVENTO,
        id: "ev-118",
        numero: 118,
        cliente: "CCU",
        total: 20000000,
        emitido: 10000000,
        queda: 10000000,
        ocs: 2,
        facturacion: "parcial",
        porcentaje_facturado: 50,
        ordenes: [
          {
            id: 1,
            numero: "4500001",
            total: 10000000,
            facturado: 10000000,
            queda: 0,
            estado: "facturado",
          },
          {
            id: 2,
            numero: "4500002",
            total: 10000000,
            facturado: 0,
            queda: 10000000,
            estado: "pendiente",
          },
        ],
        se_factura: { oc: "4500002", monto: 10000000 },
      },
      { ...EVENTO, facturacion: "pendiente" },
    ];
    abrir();
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("50 % facturado")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.queryByText("facturada")).not.toBeInTheDocument();
    expect(screen.queryByText("OC 4500002")).not.toBeInTheDocument();
  });

  it("la primera lectura: BelIA lee sola las OC sin leer, y lo que no pudo llega a la revisión (§9.26 y §9.31)", async () => {
    eventos = [{ ...EVENTO, ocs_sin_leer: 2 }];
    leerOrdenesPendientes.mockResolvedValueOnce({
      leidas: 1,
      sin_leer: [
        {
          documento_id: 9,
          nombre: "oc.pdf",
          motivo: "no encontró el total",
          quotation_id: "ev-473",
          numero: 473,
        },
      ],
    });
    abrir();
    expect(
      screen.getByText(/BelIA está leyendo 2 órdenes de compra/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(/BelIA está leyendo/),
      ).not.toBeInTheDocument(),
    );
    expect(leerOrdenesPendientes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Marcar el #473" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar seleccionados (1)" }),
    );
    expect(
      screen.getByText("revisar: 473 · no leídas: oc.pdf"),
    ).toBeInTheDocument();
  });

  it("sin OC por leer no le pide nada a BelIA", () => {
    eventos = [EVENTO];
    abrir();
    expect(leerOrdenesPendientes).not.toHaveBeenCalled();
  });

  it("los facturados completos en Eventia van abajo, plegados (§9.26)", () => {
    facturados = [
      { ...EVENTO, emitido: 1245000, queda: 0, facturacion: "facturado" },
    ];
    abrir();
    fireEvent.click(
      screen.getByRole("button", { name: /Facturados en Eventia \(1\)/ }),
    );
    expect(screen.getByText("Facturado")).toBeInTheDocument();
  });

  it("«Ya está facturado» pregunta antes y lo saca de la lista", async () => {
    eventos = [EVENTO];
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Ya está facturado" }));
    expect(
      screen.getByText("¿Ya se facturó fuera de Eventia?"),
    ).toBeInTheDocument();
    expect(marcarFacturadoFuera).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, sacarlo" }));
    await waitFor(() =>
      expect(marcarFacturadoFuera).toHaveBeenCalledWith("ev-473"),
    );
  });

  it("el buscador encuentra por contacto, RUT, N° de cotización y OC (§9.31)", () => {
    eventos = [
      {
        ...EVENTO,
        id: "ev-501",
        numero: 501,
        cliente: "CCU",
        contacto: "María Pérez",
        ruts: ["90413000-1"],
        ordenes: [
          {
            id: 1,
            numero: "4500123",
            total: 1245000,
            facturado: 0,
            queda: 1245000,
            estado: "pendiente",
            rut: "99554560-8",
          },
        ],
      },
      { ...EVENTO, id: "ev-502", numero: 502, cliente: "Linde", contacto: "Juan Soto" },
    ];
    abrir();
    const buscar = (texto: string) =>
      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar" }), {
        target: { value: texto },
      });
    const se = (n: number) => screen.queryByRole("link", { name: `#${n}` });
    buscar("maria");
    expect(se(501)).toBeInTheDocument();
    expect(se(502)).not.toBeInTheDocument();
    buscar("90.413.000");
    expect(se(501)).toBeInTheDocument();
    buscar("995545608");
    expect(se(501)).toBeInTheDocument();
    buscar("502");
    expect(se(502)).toBeInTheDocument();
    expect(se(501)).not.toBeInTheDocument();
    buscar("4500123");
    expect(se(501)).toBeInTheDocument();
    buscar("nadie");
    expect(
      screen.getByText("Ningún evento por facturar coincide con «nadie»."),
    ).toBeInTheDocument();
  });

  it("lo facturado fuera queda abajo, plegado, con quién lo marcó y «Devolver»", async () => {
    fuera = [
      {
        ...EVENTO,
        marcado_por: "Felipe",
        marcado_en: "2026-11-07T20:00:00Z",
      },
    ];
    abrir();
    // Sin pendientes, igual se ve lo facturado fuera.
    expect(screen.getByText(/están emitidos/)).toBeInTheDocument();
    const plegado = screen.getByRole("button", {
      name: /Facturados fuera de Eventia \(1\)/,
    });
    expect(screen.queryByText("Felipe · 7 nov.")).not.toBeInTheDocument();
    fireEvent.click(plegado);
    expect(screen.getByText("Felipe · 7 nov.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    await waitFor(() =>
      expect(devolverAPorFacturar).toHaveBeenCalledWith("ev-473"),
    );
  });
});
