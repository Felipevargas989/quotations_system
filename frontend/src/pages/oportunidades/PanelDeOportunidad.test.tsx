// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Oportunidad } from "../../services/oportunidades.service";
import PanelDeOportunidad from "./PanelDeOportunidad";

// EL PANEL DE DETALLE (Felipe, 17-10: "pinchar un modal con el detalle,
// la opción de ver la ficha; ahí podríamos poner un en estudio o
// descartar"). La ficha completa no se pide en la prueba: lo de arriba
// sale de la fila.

// Sin importar el servicio de verdad: arrastraría el cliente de Supabase,
// que pide sus variables al cargarse.
vi.mock("../../services/oportunidades.service", () => ({
  getFichaDeOportunidad: vi.fn(() => new Promise(() => {})),
}));

afterEach(cleanup);

const funcionario = (parcial: Partial<Oportunidad> = {}): Oportunidad => ({
  id: 40,
  codigo: "1532886-5-LE26",
  semaforo: "amarillo",
  etiquetas: ["evento", "alimentacion"],
  se_hace_en_el_complejo: "dudoso",
  razon: "Ceremonia y cena para 160 funcionarios; no dice dónde.",
  alertas: ["comuna_cercana", "alto_valor"],
  estado: "nueva",
  responsable_id: null,
  leida_en: null,
  proceso: {
    tipo: "licitacion",
    nombre: "Ceremonia y Cena Día del Funcionario",
    organismo: "I MUNICIPALIDAD DE QUILLON",
    organismo_codigo: "1532886",
    unidad: null,
    comuna: "Quillón",
    region: "Región del Ñuble",
    monto: 12_000_000,
    fecha_publicacion: "2026-10-09T16:24:00.000Z",
    fecha_cierre: "2026-10-19T19:00:00.000Z",
    estado: "Publicada",
  },
  anterior: null,
  ...parcial,
});

const pintar = (o: Oportunidad, onDecidir = vi.fn(), onCerrar = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PanelDeOportunidad
          o={o}
          ocupado={false}
          onDecidir={onDecidir}
          onCerrar={onCerrar}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onDecidir, onCerrar };
};

describe("PanelDeOportunidad", () => {
  it("muestra lo de la fila al tiro: nombre, código, prioridad, organismo y monto", () => {
    pintar(funcionario());
    expect(
      screen.getByText("Ceremonia y Cena Día del Funcionario"),
    ).toBeInTheDocument();
    expect(screen.getByText("1532886-5-LE26")).toBeInTheDocument();
    expect(screen.getByText("Prioridad")).toBeInTheDocument();
    expect(screen.getByText("I MUNICIPALIDAD DE QUILLON")).toBeInTheDocument();
    expect(screen.getByText(/12\.000\.000/)).toBeInTheDocument();
  });

  it("una nueva: Me interesa la pasa a en estudio y Descartar la descarta", () => {
    const { onDecidir } = pintar(funcionario());
    fireEvent.click(screen.getByRole("button", { name: "Me interesa" }));
    expect(onDecidir).toHaveBeenCalledWith("en_estudio");
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onDecidir).toHaveBeenCalledWith("descartada");
  });

  it("una descartada se recupera; siempre está Ver ficha completa", () => {
    const { onDecidir } = pintar(funcionario({ estado: "descartada" }));
    expect(screen.queryByRole("button", { name: "Me interesa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(onDecidir).toHaveBeenCalledWith("nueva");
    expect(
      screen.getByRole("link", { name: "Ver ficha completa" }),
    ).toHaveAttribute("href", "/oportunidades/40");
  });

  it("Escape cierra", () => {
    const { onCerrar } = pintar(funcionario());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalled();
  });
});
