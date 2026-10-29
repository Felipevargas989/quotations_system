// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as contactos from "../services/clientContacts.service";
import * as cotizaciones from "../services/quotations.service";
import SelectorDeContacto from "./SelectorDeContacto";
import { puedeCambiarContacto } from "../utils/puedeCambiarContacto";

// EL CONTACTO COMO LISTA PLEGABLE (29-10-2026): se elige y queda guardado,
// con un parche que lleva solo `contact_name` (nunca la plata).

vi.mock("../services/clientContacts.service", () => ({
  getClientContacts: vi.fn(),
  createClientContact: vi.fn(),
}));
vi.mock("../services/quotations.service", () => ({
  updateQuotation: vi.fn(),
}));
let rol = "administrador";
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ company: { id: 1 }, userRole: rol }),
}));
vi.mock("./toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const c = vi.mocked(contactos);
const q = vi.mocked(cotizaciones);

beforeEach(() => {
  rol = "administrador";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const persona = (id: number, name: string, email: string | null) =>
  ({ id, name, email, phone: null, client_id: "c1" }) as never;

const dibujar = async (
  props: Partial<Parameters<typeof SelectorDeContacto>[0]> = {},
) => {
  c.getClientContacts.mockResolvedValue([
    persona(1, "Yasna", "yasna@x.cl"),
    persona(2, "María Pérez", "maria@x.cl"),
    persona(3, "Jorge Soto", null),
  ]);
  const onCambiado = vi.fn();
  render(
    <SelectorDeContacto
      quotationId="q1"
      clientId="c1"
      estado="enviada"
      actual="Yasna"
      onCambiado={onCambiado}
      {...props}
    />,
  );
  await waitFor(() => expect(c.getClientContacts).toHaveBeenCalledWith("c1"));
  return onCambiado;
};

const abrir = () =>
  fireEvent.click(screen.getByRole("button", { name: /Yasna/ }));

describe("puedeCambiarContacto", () => {
  it("ventas mientras se vende; una aceptada, solo administrador y operaciones", () => {
    expect(puedeCambiarContacto("vendedor", "enviada")).toBe(true);
    expect(puedeCambiarContacto("vendedor", "aceptada")).toBe(false);
    expect(puedeCambiarContacto("operaciones", "aceptada")).toBe(true);
    expect(puedeCambiarContacto("administrador", "aceptada")).toBe(true);
  });
  it("realizado y anulado, nadie; recepción, tampoco", () => {
    expect(puedeCambiarContacto("administrador", "realizada")).toBe(false);
    expect(puedeCambiarContacto("administrador", "cancelada")).toBe(false);
    expect(puedeCambiarContacto("recepcion", "enviada")).toBe(false);
  });
});

describe("SelectorDeContacto", () => {
  it("sin permiso es el nombre a secas", () => {
    rol = "vendedor";
    render(
      <SelectorDeContacto
        quotationId="q1"
        clientId="c1"
        estado="aceptada"
        actual="Yasna"
        onCambiado={vi.fn()}
      />,
    );
    expect(screen.getByText("Yasna")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(c.getClientContacts).not.toHaveBeenCalled();
  });

  it("al elegir, guarda solo el contacto y avisa a la ficha", async () => {
    q.updateQuotation.mockResolvedValue({ data: {} as never, error: null });
    const onCambiado = await dibujar();
    abrir();
    expect(await screen.findByText("sin correo")).toBeInTheDocument();
    fireEvent.click(screen.getByText("María Pérez"));
    await waitFor(() => expect(onCambiado).toHaveBeenCalled());
    expect(q.updateQuotation).toHaveBeenCalledWith(
      { contact_name: "María Pérez" },
      "q1",
    );
  });

  it("elegir al mismo no guarda nada", async () => {
    await dibujar();
    abrir();
    fireEvent.click(await screen.findByText("yasna@x.cl"));
    expect(q.updateQuotation).not.toHaveBeenCalled();
  });

  it("«+ Nuevo contacto» crea la persona y la deja de contacto", async () => {
    q.updateQuotation.mockResolvedValue({ data: {} as never, error: null });
    c.createClientContact.mockResolvedValue({
      data: persona(9, "Ana Rojas", "ana@x.cl"),
      error: null,
    });
    const onCambiado = await dibujar();
    abrir();
    fireEvent.click(await screen.findByText("+ Nuevo contacto"));
    fireEvent.change(screen.getByPlaceholderText("Ej: Juanita Pérez"), {
      target: { value: "Ana Rojas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onCambiado).toHaveBeenCalled());
    expect(c.createClientContact).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "c1", name: "Ana Rojas" }),
    );
    expect(q.updateQuotation).toHaveBeenCalledWith(
      { contact_name: "Ana Rojas" },
      "q1",
    );
  });

  it("en Particulares con su persona no ofrece «Nuevo contacto»", async () => {
    await dibujar({ clientType: "Particulares" });
    abrir();
    await screen.findByText("María Pérez");
    expect(screen.queryByText("+ Nuevo contacto")).not.toBeInTheDocument();
  });
});
