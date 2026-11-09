// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiYaEntro from "./SiYaEntro";

// SI YA ENTRÓ, DERECHO ADENTRO (Felipe, 09-11-2026). Lo que estas pruebas
// cuidan: que el visitante sin sesión vea la página pública sin esperar, que
// quien trae la sesión pase a SU pantalla, y que una sesión vencida no deje
// a nadie mirando un esqueleto.

const sesion = vi.hoisted(() => ({
  valor: {
    user: null as { id: string } | null,
    userRole: null as string | null,
    loading: false,
    roleLoading: false,
  },
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => sesion.valor }));

const LLAVE = "sb-prueba-auth-token";

const pintar = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <SiYaEntro>
              <p>La portada pública</p>
            </SiYaEntro>
          }
        />
        <Route path="/dashboard" element={<p>El Dashboard</p>} />
        <Route path="/requests" element={<p>Los Requerimientos</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  sesion.valor = {
    user: null,
    userRole: null,
    loading: false,
    roleLoading: false,
  };
});
afterEach(cleanup);

describe("SiYaEntro", () => {
  it("sin sesión guardada muestra la página al instante, aunque todavía se esté cargando", () => {
    sesion.valor.loading = true;
    pintar();
    expect(screen.getByText("La portada pública")).toBeInTheDocument();
  });

  it("con la sesión iniciada, el administrador pasa al Dashboard", () => {
    localStorage.setItem(LLAVE, "x");
    sesion.valor = {
      user: { id: "1" },
      userRole: "administrador",
      loading: false,
      roleLoading: false,
    };
    pintar();
    expect(screen.getByText("El Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("La portada pública")).toBeNull();
  });

  it("con la sesión iniciada, los demás cargos pasan a Requerimientos", () => {
    localStorage.setItem(LLAVE, "x");
    sesion.valor = {
      user: { id: "2" },
      userRole: "vendedor",
      loading: false,
      roleLoading: false,
    };
    pintar();
    expect(screen.getByText("Los Requerimientos")).toBeInTheDocument();
  });

  it("mientras se confirma la sesión guardada no muestra la portada ni salta a ninguna parte", () => {
    localStorage.setItem(LLAVE, "x");
    sesion.valor.loading = true;
    pintar();
    expect(screen.queryByText("La portada pública")).toBeNull();
    expect(screen.queryByText("El Dashboard")).toBeNull();
    expect(screen.queryByText("Los Requerimientos")).toBeNull();
  });

  it("espera el cargo antes de decidir a dónde va", () => {
    localStorage.setItem(LLAVE, "x");
    sesion.valor = {
      user: { id: "3" },
      userRole: null,
      loading: false,
      roleLoading: true,
    };
    pintar();
    expect(screen.queryByText("Los Requerimientos")).toBeNull();
    expect(screen.queryByText("El Dashboard")).toBeNull();
  });

  it("si lo guardado venció, muestra la página de siempre", () => {
    localStorage.setItem(LLAVE, "x");
    sesion.valor = {
      user: null,
      userRole: null,
      loading: false,
      roleLoading: false,
    };
    pintar();
    expect(screen.getByText("La portada pública")).toBeInTheDocument();
  });

  it("si el cargo no llega nunca, igual entra: a Requerimientos, como al iniciar sesión", () => {
    localStorage.setItem(LLAVE, "x");
    sesion.valor = {
      user: { id: "4" },
      userRole: null,
      loading: false,
      roleLoading: false,
    };
    pintar();
    expect(screen.getByText("Los Requerimientos")).toBeInTheDocument();
  });
});
