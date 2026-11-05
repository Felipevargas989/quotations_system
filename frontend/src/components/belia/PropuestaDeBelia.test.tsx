// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PropuestaDeBelia from "./PropuestaDeBelia";
import type { PropuestaEnPantalla } from "./useBelia";

// LA TARJETA PARA CORREGIR UN CLIENTE MAL CLASIFICADO (doc 21 §6): el antes
// y el después del tipo o del nombre, con «Sí, cambiar».

const tarjeta = (
  c: Partial<PropuestaEnPantalla> = {},
): PropuestaEnPantalla => ({
  id: "p1",
  tipo: "cliente",
  numero: null,
  cliente: "Fundación INDAE",
  cotizacion_id: null,
  enlace: "/clients/c2",
  resumen: "Es una empresa privada, no una persona",
  lineas: [
    {
      dia: "Cliente",
      que: "Tipo",
      quita: ["Particulares"],
      agrega: ["Empresas"],
    },
  ],
  avisos: ["Al dejar de ser particular, recepción ya no ve sus cotizaciones."],
  se_puede_deshacer: false,
  vence_at: "2026-11-05T05:00:00Z",
  estado: "pendiente",
  ...c,
});

const pintar = (p: PropuestaEnPantalla, onAplicar = vi.fn()) =>
  render(
    <MemoryRouter>
      <PropuestaDeBelia
        p={p}
        esLaAbierta={false}
        onAplicar={onAplicar}
        onDescartar={vi.fn()}
        onDeshacer={vi.fn()}
      />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("la tarjeta de un cliente mal clasificado", () => {
  it("muestra el antes y el después, el aviso y «Sí, cambiar»", () => {
    const onAplicar = vi.fn();
    pintar(tarjeta(), onAplicar);
    expect(screen.getByText(/Corregir el cliente/)).toBeInTheDocument();
    expect(screen.getByText("− Particulares")).toBeInTheDocument();
    expect(screen.getByText("+ Empresas")).toBeInTheDocument();
    expect(screen.getByText(/recepción ya no ve/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cambiar" }));
    expect(onAplicar).toHaveBeenCalled();
  });

  it("aplicada, dice «Cambiado» y no ofrece deshacer", () => {
    pintar(tarjeta({ estado: "aplicada" }));
    expect(screen.getByText("Cambiado")).toBeInTheDocument();
    expect(screen.queryByText("Deshacer")).not.toBeInTheDocument();
  });
});
