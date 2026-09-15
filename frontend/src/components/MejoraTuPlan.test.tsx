// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import MejoraTuPlan from "./MejoraTuPlan";

// LA PANTALLA DE "MEJORA TU PLAN" (14-09-2026, paso 3.2 del roadmap).
//
// Lo que estas pruebas cuidan es que NUNCA le ofrezca al cliente algo que
// no puede comprar: Personal y Marketing no se venden, así que para esos
// dos no aparece ningún botón de mejorar.

afterEach(cleanup);

const pintar = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("MejoraTuPlan", () => {
  it("dice en qué plan está la función y ofrece verlos", () => {
    pintar(<MejoraTuPlan derecho="calendario" />);
    expect(screen.getByText(/Gestiona y Cobra/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver los planes/ })).toBeInTheDocument();
  });

  it("tranquiliza: los datos no se pierden al cambiar de plan", () => {
    pintar(<MejoraTuPlan derecho="post_venta" />);
    expect(screen.getByText(/siguen guardados/i)).toBeInTheDocument();
  });

  it("los márgenes nombran Opera y Crece", () => {
    pintar(<MejoraTuPlan derecho="dashboard_3" />);
    expect(screen.getByText(/Opera y Crece/)).toBeInTheDocument();
  });

  it("Personal NO ofrece mejorar de plan: no se vende", () => {
    pintar(<MejoraTuPlan derecho="personal" />);
    expect(screen.getByText(/no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver los planes/ })).toBeNull();
  });

  it("Marketing tampoco", () => {
    pintar(<MejoraTuPlan derecho="marketing" />);
    expect(screen.queryByRole("button", { name: /Ver los planes/ })).toBeNull();
  });

  it("como recuadro dice lo mismo, para meterlo dentro de una pestaña", () => {
    pintar(<MejoraTuPlan derecho="gestion_y_cocina" variante="recuadro" />);
    expect(screen.getByText(/Opera y Crece/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver los planes/ })).toBeInTheDocument();
  });

  it("concuerda el verbo: plural con plural, singular con singular", () => {
    pintar(<MejoraTuPlan derecho="varios_dias" />);
    expect(screen.getByText(/Los eventos de varios días están en/)).toBeInTheDocument();
    cleanup();
    pintar(<MejoraTuPlan derecho="portal" />);
    expect(screen.getByText(/El portal del cliente está en/)).toBeInTheDocument();
  });
});
