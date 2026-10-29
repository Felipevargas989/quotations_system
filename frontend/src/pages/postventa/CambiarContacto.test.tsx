// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as contactos from "../../services/clientContacts.service";
import * as cotizaciones from "../../services/quotations.service";
import CambiarContacto from "./CambiarContacto";

// «CAMBIAR CONTACTO» EN POST-VENTA (29-10-2026): se cambia solo el mandante,
// con un parche que lleva solo `contact_name` (nunca la plata).

vi.mock("../../services/clientContacts.service", () => ({
  getClientContacts: vi.fn(),
  createClientContact: vi.fn(),
}));
vi.mock("../../services/quotations.service", () => ({
  updateQuotation: vi.fn(),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ company: { id: 1 } }),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const c = vi.mocked(contactos);
const q = vi.mocked(cotizaciones);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const persona = (id: number, name: string, email: string | null) =>
  ({ id, name, email, phone: null, client_id: "c1" }) as never;

const abrir = async () => {
  c.getClientContacts.mockResolvedValue([
    persona(1, "Yasna", "yasna@x.cl"),
    persona(2, "María Pérez", "maria@x.cl"),
    persona(3, "Jorge Soto", null),
  ]);
  const onCambiado = vi.fn();
  render(
    <CambiarContacto
      quotationId="q1"
      clientId="c1"
      actual="Yasna"
      onCambiado={onCambiado}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /cambiar/i }));
  await screen.findByText("María Pérez");
  return onCambiado;
};

describe("CambiarContacto", () => {
  it("lista las personas del cliente con el actual marcado y quién no tiene correo", async () => {
    await abrir();
    expect(c.getClientContacts).toHaveBeenCalledWith("c1");
    expect(screen.getByText("· actual")).toBeInTheDocument();
    expect(screen.getByText("· sin correo")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.find((r) => r.checked)?.parentElement).toHaveTextContent(
      "Yasna",
    );
  });

  it("guarda solo el contacto y avisa a la ficha", async () => {
    q.updateQuotation.mockResolvedValue({ data: {} as never, error: null });
    const onCambiado = await abrir();
    fireEvent.click(screen.getByText("María Pérez"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onCambiado).toHaveBeenCalled());
    expect(q.updateQuotation).toHaveBeenCalledWith(
      { contact_name: "María Pérez" },
      "q1",
    );
  });

  it("sin cambio no guarda nada", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(q.updateQuotation).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /cambiar/i }),
    ).toBeInTheDocument();
  });

  it("si el motor lo rechaza, lo dice y no cierra", async () => {
    q.updateQuotation.mockResolvedValue({
      data: {} as never,
      error: new Error("no"),
    });
    const onCambiado = await abrir();
    fireEvent.click(screen.getByText("Jorge Soto"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText(/No se pudo cambiar el contacto/);
    expect(onCambiado).not.toHaveBeenCalled();
  });

  it("una persona nueva queda elegida para guardar", async () => {
    c.createClientContact.mockResolvedValue({
      data: persona(9, "Ana Rojas", "ana@x.cl"),
      error: null,
    });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: /nuevo contacto/i }));
    fireEvent.change(screen.getByPlaceholderText("Nombre *"), {
      target: { value: "Ana Rojas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
    await screen.findByText("Ana Rojas");
    expect(c.createClientContact).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "c1", name: "Ana Rojas" }),
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.find((r) => r.checked)?.parentElement).toHaveTextContent(
      "Ana Rojas",
    );
  });
});

describe("CambiarContacto en Particulares", () => {
  it("con su persona, no ofrece «Nuevo contacto»", async () => {
    c.getClientContacts.mockResolvedValue([persona(1, "Juan Díaz", null)]);
    render(
      <CambiarContacto
        quotationId="q1"
        clientId="c1"
        actual="Juan Díaz"
        clientType="Particulares"
        onCambiado={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cambiar/i }));
    await screen.findByText("Juan Díaz");
    expect(screen.queryByText(/nuevo contacto/i)).not.toBeInTheDocument();
  });
});
