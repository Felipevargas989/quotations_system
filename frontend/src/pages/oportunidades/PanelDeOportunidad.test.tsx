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
import type { Oportunidad } from "../../services/oportunidades.service";
import * as servicio from "../../services/oportunidades.service";
import PanelDeOportunidad from "./PanelDeOportunidad";

// EL PANEL DE DETALLE (Felipe, 17-10: "pinchar un modal con el detalle,
// la opción de ver la ficha; ahí podríamos poner un en estudio o
// descartar"). La ficha completa no se pide en la prueba: lo de arriba
// sale de la fila.

// Sin importar el servicio de verdad: arrastraría el cliente de Supabase,
// que pide sus variables al cargarse.
vi.mock("../../services/oportunidades.service", () => ({
  getFichaDeOportunidad: vi.fn(() => new Promise(() => {})),
  actualizarOportunidad: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../services/users.service", () => ({
  getUsers: vi.fn(() =>
    Promise.resolve({
      data: [
        { id: "p-1", full_name: "Felipe Vargas", role: "administrador" },
        { id: "p-2", full_name: "Camila", role: "administrador" },
        { id: "p-3", full_name: "Recepción", role: "recepcion" },
      ],
      error: null,
    }),
  ),
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

  it("el presupuesto va arriba; si el comprador no lo publicó, lo dice (Felipe, 17-10)", () => {
    pintar(funcionario());
    expect(screen.getByText("Presupuesto")).toBeInTheDocument();
    expect(screen.getAllByText(/12\.000\.000/)).toHaveLength(1);
    cleanup();
    pintar(
      funcionario({
        proceso: { ...funcionario().proceso, monto: null },
      }),
    );
    expect(
      screen.getByText("No publicado: búscalo en las bases"),
    ).toBeInTheDocument();
  });

  it("lleva el sello de su tipo: Licitación o Compra ágil (Felipe, 17-10)", () => {
    pintar(funcionario());
    expect(screen.getByText("Licitación").className).toContain("indigo");
    cleanup();
    pintar(
      funcionario({
        proceso: { ...funcionario().proceso, tipo: "compra_agil" },
      }),
    );
    expect(screen.getByText("Compra ágil").className).toContain("violet");
  });

  it("una compra ágil sin detalle avisa que se está trayendo de Mercado Público", async () => {
    vi.mocked(servicio.getFichaDeOportunidad).mockResolvedValueOnce({
      ...funcionario({
        proceso: { ...funcionario().proceso, tipo: "compra_agil" },
      }),
      proceso: {
        ...funcionario().proceso,
        tipo: "compra_agil",
        codigo: "1234-56-COT26",
        descripcion: null,
        moneda: "CLP",
        fechas: {},
        productos: [],
        adjudicacion: null,
        primera_vez_visto: "2026-10-17T21:00:00.000Z",
        actualizado_en: "2026-10-17T21:00:00.000Z",
      },
      detalle_mp: "trayendo",
      leida_con: null,
      notas: null,
      quotation_id: null,
      actualizado_en: "2026-10-17T21:00:00.000Z",
    } as unknown as Awaited<ReturnType<typeof servicio.getFichaDeOportunidad>>);
    pintar(funcionario());
    expect(
      await screen.findByText(
        "Trayendo la descripción y los productos desde Mercado Público…",
      ),
    ).toBeInTheDocument();
  });

  it("una nueva: Me interesa la pasa a en estudio y Descartar la descarta", () => {
    const { onDecidir } = pintar(funcionario());
    fireEvent.click(screen.getByRole("button", { name: "Me interesa" }));
    expect(onDecidir).toHaveBeenCalledWith("en_estudio");
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onDecidir).toHaveBeenCalledWith("descartada");
  });

  it("Seguir la deja «En seguimiento» sin postularla, y una seguida se puede dejar de seguir (19-10, decisión 30)", () => {
    const { onDecidir } = pintar(funcionario());
    fireEvent.click(screen.getByRole("button", { name: /Seguir/ }));
    expect(onDecidir).toHaveBeenCalledWith("seguida");
    cleanup();
    const otra = pintar(funcionario({ estado: "seguida" }));
    expect(
      screen.queryByRole("button", { name: /Me interesa/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dejar de seguir" }));
    expect(otra.onDecidir).toHaveBeenCalledWith("nueva");
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

  it("se abre al costado, con todo el alto (como Licify)", () => {
    pintar(funcionario());
    const ventana = screen.getByRole("dialog");
    expect(ventana.className).toContain("h-full");
    expect(ventana.parentElement?.className).toContain("justify-end");
  });

  it("Asignar: el responsable sale de los administradores y se guarda al elegirlo", async () => {
    pintar(funcionario());
    fireEvent.click(screen.getByText("Asignar a…"));
    expect(await screen.findByText("Camila")).toBeInTheDocument();
    expect(screen.queryByText("Recepción")).toBeNull();
    fireEvent.click(screen.getByText("Camila"));
    await waitFor(() =>
      expect(servicio.actualizarOportunidad).toHaveBeenCalledWith(40, {
        responsable_id: "p-2",
      }),
    );
  });

  it("Escape cierra", () => {
    const { onCerrar } = pintar(funcionario());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalled();
  });
});
