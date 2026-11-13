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
import * as boletas from "../../services/boletas.service";
import * as caja from "../../services/caja.service";
import * as solicitudes from "../../services/solicitudes.service";
import BoletaNueva from "./BoletaNueva";

// LA BOLETA EN SU PROPIA PANTALLA (doc 19 §9.22, sprint 3), como la
// maqueta: qué se cobra, el huésped y el total a pagar; «Crear documento»
// la muestra tal como saldrá, y desde el 08-11 (§9.33) «Emitir» emite: la
// vista previa ya es la revisión.

vi.mock("../../services/boletas.service", () => ({
  getTarifario: vi.fn(),
  revisarBoletaSuelta: vi.fn(),
  emitirBoletaSuelta: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../services/caja.service", () => ({
  getCaja: vi.fn(),
}));
vi.mock("../../services/storage.service", () => ({
  resolveStorageUrl: vi.fn(),
}));
vi.mock("../../services/solicitudes.service", () => ({
  solicitarBoleta: vi.fn(),
  solicitarFactura: vi.fn(),
  getSolicitudesDelTurno: vi.fn().mockResolvedValue({ solicitudes: [] }),
  getSolicitudes: vi.fn().mockResolvedValue({ pendientes: 0, solicitudes: [] }),
}));
const b = vi.mocked(boletas);

const VISTA = {
  ok: true,
  problemas: [],
  avisos: [],
  faltan: [],
  folio: 501,
  fecha: "2026-11-06",
  emisor: { nombre: "Valle del Sol Quillón SpA", rut: "77701305-K" },
  lineas: [
    {
      descripcion: "Cabaña 4 · Cabaña 4 personas temporada alta",
      descripcionLarga: null,
      cantidad: 1,
      precio: 130000,
    },
  ],
  montos: { neto: 109244, exento: 0, iva: 20756, total: 130000 },
  observaciones: [],
  correo: null,
  ambiente: "prueba" as const,
};

beforeEach(() => {
  b.getTarifario.mockResolvedValue([
    {
      id: 1,
      nombre: "Cabaña 4 personas temporada alta",
      precio: 130000,
      unidad: "noche",
      activo: true,
      orden: 0,
    },
  ]);
  b.revisarBoletaSuelta.mockResolvedValue(VISTA);
  b.emitirBoletaSuelta.mockResolvedValue({
    boleta: {
      id: 77,
      folio: 501,
      estado: "emitido",
      total: 130000,
      pdf_path: null,
    },
    aviso: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const abrir = ({
  esAdmin = false,
  quedarse = false,
  conCaja = false,
  solicita = false,
} = {}) => {
  const onEmitida = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BoletaNueva
        esAdmin={esAdmin}
        conCaja={conCaja}
        solicita={solicita}
        quedarse={quedarse}
        onVolver={() => {}}
        onEmitida={onEmitida}
      />
    </QueryClientProvider>,
  );
  return { onEmitida };
};

const armarUna = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: /Elegir del tarifario/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Cabaña 4 personas temporada alta/ }),
  );
};

/** §9.43: con qué pagó y a qué correo va (obligatorio desde el §9.45). */
const pagoYEnvio = ({ correo = "" } = {}) => {
  fireEvent.click(
    within(screen.getByRole("group", { name: "Medio de pago" })).getByRole(
      "button",
      { name: /Elegir el medio de pago/ },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Efectivo/ }));
  if (correo)
    fireEvent.change(screen.getByLabelText("Correo para enviarle la boleta"), {
      target: { value: correo },
    });
};

describe("la boleta nueva (§9.22, sprint 3)", () => {
  it("del tarifario por su cantidad, el total a pagar, y la vista previa antes de emitir", async () => {
    const { onEmitida } = abrir();
    expect(
      await screen.findByText("Nueva boleta electrónica"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Crear documento" }),
    ).toBeDisabled();
    await armarUna();
    expect(screen.getByText("Noches")).toBeInTheDocument();
    expect(screen.getAllByText("$130.000").length).toBeGreaterThan(0);
    // §9.43: sin el medio de pago ni el correo, todavía no.
    expect(
      screen.getByRole("button", { name: "Crear documento" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Falta el medio de pago y el correo/),
    ).toBeInTheDocument();
    pagoYEnvio({ correo: "huesped@correo.cl" });

    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    await screen.findByText("Así sale la boleta");
    expect(b.revisarBoletaSuelta).toHaveBeenCalledWith({
      lineas: [{ tarifario_id: 1, cantidad: 1 }],
      cabana: null,
      correo: "huesped@correo.cl",
      medio_de_pago: "efectivo",
    });
    expect(
      screen.getByText("Cabaña 4 · Cabaña 4 personas temporada alta"),
    ).toBeInTheDocument();

    // §9.33: «Emitir» emite, sin volver a preguntar.
    expect(b.emitirBoletaSuelta).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Emitir boleta" }));
    expect(screen.queryByText(/¿Emitir la boleta/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onEmitida).toHaveBeenCalledWith(
        expect.objectContaining({ id: 77, folio: 501 }),
      ),
    );
  });

  it("no pregunta por el huésped ni la cabaña: eso vive en Aloha", async () => {
    abrir({ quedarse: true });
    await armarUna();
    expect(screen.queryByRole("heading", { name: /Huésped/ })).toBeNull();
    expect(screen.queryByPlaceholderText("Ej.: Cabaña 4")).toBeNull();
  });

  it("sin la lista a la vista (recepción), se queda con la última y una boleta en blanco", async () => {
    abrir({ quedarse: true });
    await armarUna();
    // §9.45: ya no hay «Sin correo: la imprimo»; sin correo no se arma.
    expect(
      screen.queryByLabelText("Sin correo: la imprimo"),
    ).not.toBeInTheDocument();
    pagoYEnvio();
    expect(
      screen.getByRole("button", { name: "Crear documento" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Falta el correo para enviarle la boleta/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Correo para enviarle la boleta"), {
      target: { value: "huesped@correo.cl" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    expect(b.revisarBoletaSuelta).toHaveBeenCalledWith(
      expect.objectContaining({
        correo: "huesped@correo.cl",
        medio_de_pago: "efectivo",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Emitir boleta" }),
    );
    expect(
      await screen.findByText(/Boleta N° 501 emitida por \$130\.000/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Así sale la boleta")).not.toBeInTheDocument();
    // La siguiente parte en blanco, también el correo.
    expect(screen.getByLabelText("Correo para enviarle la boleta")).toHaveValue(
      "",
    );
  });

  it("recepción con la caja cerrada no emite; abierta, la boleta dice a qué caja entra (§9.43)", async () => {
    vi.mocked(caja.getCaja).mockResolvedValue({ abierta: null });
    abrir({ conCaja: true });
    await armarUna();
    pagoYEnvio({ correo: "huesped@correo.cl" });
    expect(
      await screen.findByText(
        "La caja de recepción está cerrada: ábrela en «Caja» para emitir.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear documento" }),
    ).toBeDisabled();
    cleanup();
    vi.mocked(caja.getCaja).mockResolvedValue({
      abierta: {
        id: 7,
        abierta_por_nombre: "Ana",
        abierta_en: "2026-11-09T12:02:00Z",
        sencillo_inicial: 20000,
        retiros: [],
      },
    });
    abrir({ conCaja: true });
    expect(await screen.findByText(/Caja abierta · Ana/)).toBeInTheDocument();
  });

  it("la línea a mano es solo del administrador", async () => {
    abrir();
    await screen.findByRole("button", { name: /Elegir del tarifario/ });
    expect(screen.queryByText(/Línea a mano/)).not.toBeInTheDocument();
    cleanup();
    abrir({ esAdmin: true });
    expect(
      await screen.findByRole("button", { name: /Línea a mano/ }),
    ).toBeInTheDocument();
  });

  it("recepción no emite: «Enviar solicitud» la guarda para que la emita quien aprueba (§9.45)", async () => {
    vi.mocked(solicitudes.solicitarBoleta).mockResolvedValue({
      id: 9,
      total: 130000,
    } as never);
    abrir({ quedarse: true, solicita: true });
    await armarUna();
    pagoYEnvio({ correo: "huesped@correo.cl" });
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar solicitud" }),
    );
    await waitFor(() =>
      expect(solicitudes.solicitarBoleta).toHaveBeenCalledWith({
        lineas: [{ tarifario_id: 1, cantidad: 1 }],
        cabana: null,
        correo: "huesped@correo.cl",
        medio_de_pago: "efectivo",
      }),
    );
    expect(b.emitirBoletaSuelta).not.toHaveBeenCalled();
  });
});
