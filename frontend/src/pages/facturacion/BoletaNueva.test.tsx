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
vi.mock("../../services/storage.service", () => ({
  resolveStorageUrl: vi.fn(),
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

const abrir = ({ esAdmin = false, quedarse = false } = {}) => {
  const onEmitida = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BoletaNueva
        esAdmin={esAdmin}
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
  fireEvent.change(screen.getByPlaceholderText("Ej.: Cabaña 4"), {
    target: { value: "Cabaña 4" },
  });
};

/** §9.43: con qué pagó y a qué correo va (o «Sin correo: la imprimo»). */
const pagoYEnvio = ({ correo = "", imprimir = false } = {}) => {
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
  if (imprimir)
    fireEvent.click(screen.getByLabelText("Sin correo: la imprimo"));
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
      cabana: "Cabaña 4",
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

  it("sin la lista a la vista (recepción), se queda con la última y una boleta en blanco", async () => {
    abrir({ quedarse: true });
    await armarUna();
    // Sin correo: se imprime (§9.43).
    pagoYEnvio({ imprimir: true });
    expect(
      screen.getByLabelText("Correo para enviarle la boleta"),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    expect(b.revisarBoletaSuelta).toHaveBeenCalledWith(
      expect.objectContaining({ correo: null, medio_de_pago: "efectivo" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Emitir boleta" }),
    );
    expect(
      await screen.findByText(/Boleta N° 501 emitida por \$130\.000/),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ej.: Cabaña 4")).toHaveValue("");
    expect(screen.queryByText("Así sale la boleta")).not.toBeInTheDocument();
    // Iba a imprimirse y su PDF todavía no llega: lo dice.
    expect(
      screen.getByText("El PDF todavía no llega para imprimirla."),
    ).toBeInTheDocument();
    // La siguiente parte en blanco: sin medio de pago y con el correo.
    expect(
      screen.getByLabelText("Correo para enviarle la boleta"),
    ).toBeEnabled();
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
});
