// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "../../types/people.types";
import PersonaForm from "./PersonaForm";

// EL TIPO DE UNA FICHA QUE YA EXISTE SE CAMBIA POR LA VENTANA «DESDE»
// (doc 10 §12, 17-11-2026): elegir otro tipo abre la ventana, y guardar la
// ficha ya no lo cambia de pasada.

afterEach(cleanup);

const sofia = {
  id: 19,
  company_id: 1,
  name: "Sofía",
  rut: null,
  phone: null,
  email: null,
  bank_code: null,
  account_type: null,
  account_number: null,
  default_role_id: null,
  default_kind: "freelance",
  default_starts_at: null,
  default_ends_at: null,
  default_break_minutes: null,
  days_off: null,
  weekly_schedule: null,
  status: "activa",
  blocked_reason: null,
  notes: null,
  created_at: "",
  updated_at: "",
  historial_tipo: [
    { kind: "planta", anterior: "freelance", desde: "2099-11-01" },
  ],
} as unknown as Persona;

const armar = () => {
  const onGuardar = vi.fn();
  const onCambiarTipo = vi.fn();
  render(
    <PersonaForm
      persona={sofia}
      cargos={[]}
      guardando={false}
      onGuardar={onGuardar}
      onCancelar={vi.fn()}
      onCambiarTipo={onCambiarTipo}
    />,
  );
  return { onGuardar, onCambiarTipo };
};

describe("PersonaForm y la ventana «Desde»", () => {
  it("elegir otro tipo abre la ventana en vez de cambiarlo", async () => {
    const { onCambiarTipo } = armar();
    await userEvent.click(screen.getByRole("button", { name: /Freelance/ }));
    await userEvent.click(await screen.findByText("Planta"));
    expect(onCambiarTipo).toHaveBeenCalledWith("planta");
  });

  it("dice el cambio que viene y deja listos sus días de planta", () => {
    armar();
    expect(screen.getByText("Pasa a planta el 01-11")).toBeInTheDocument();
    expect(
      screen.getByText("Días que trabaja y a qué hora"),
    ).toBeInTheDocument();
  });

  it("guardar la ficha no manda el tipo", () => {
    const { onGuardar } = armar();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar.mock.calls[0][0].default_kind).toBeUndefined();
  });
});
