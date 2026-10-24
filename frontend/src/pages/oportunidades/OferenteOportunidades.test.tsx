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
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import OferenteOportunidades from "./OferenteOportunidades";

// LO QUE VENDE LA EMPRESA, JUNTO A SUS INSTALACIONES (Felipe, 19-10: "lo
// que vende tu empresa debería estar en instalaciones"): las tres
// descripciones que lee la IA, juntas y con un solo botón; al guardar «lo
// que vende» no se tocan regiones ni comunas.

vi.mock("../../services/oportunidades.service", () => ({
  getOferente: vi.fn(),
  guardarOferente: vi.fn(),
  getConfigOportunidades: vi.fn(),
  guardarConfigOportunidades: vi.fn(),
}));
vi.mock("./FirmaDelOferente", () => ({ default: () => null }));
vi.mock("./DocumentosDeEmpresa", () => ({ default: () => null }));
vi.mock("./ClientesQueSeMuestran", () => ({ default: () => null }));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VISTA = {
  oferente: {
    razon_social: "Valle del Sol Quillon SPA",
    rut: "77.701.305-K",
    giro: null,
    direccion: null,
    comuna: null,
    region: null,
    telefono: null,
    correo: null,
    representante_nombre: null,
    representante_rut: null,
    representante_cargo: null,
    experiencia: "Día del Funcionario Quillón 2023.",
    instalaciones: "Salón Cúpula para 300 personas.",
    firma_ruta: null,
    firma_subida_en: null,
  },
  empresa: { nombre: "Valle del Sol", banco: null },
  documentos: [],
};

const CONFIG = {
  regiones: ["Ñuble", "Biobío"],
  comunas_cercanas: ["Quillón", "Bulnes"],
  perfil: "Valle del Sol vende eventos y alojamiento.",
  umbral_alto_valor: 3_000_000,
  correo_avisos: "contacto@valledelsolquillon.cl",
};

describe("Mi empresa: lo que vende, junto a las instalaciones", () => {
  it("va justo después de Instalaciones y se guarda con «Guardar datos» sin tocar regiones ni comunas", async () => {
    s.getOferente.mockResolvedValue(VISTA as never);
    s.getConfigOportunidades.mockResolvedValue(CONFIG as never);
    s.guardarConfigOportunidades.mockResolvedValue(CONFIG as never);
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <OferenteOportunidades />
      </QueryClientProvider>,
    );
    const campo = await screen.findByLabelText("Lo que vende tu empresa");
    await waitFor(() => expect(campo).toHaveValue(CONFIG.perfil));

    // Las tres descripciones juntas, en orden.
    const textos = [...container.querySelectorAll("textarea")].map(
      (t) => (t as HTMLTextAreaElement).value,
    );
    expect(textos).toEqual([
      VISTA.oferente.experiencia,
      VISTA.oferente.instalaciones,
      CONFIG.perfil,
    ]);

    const guardar = screen.getByRole("button", { name: "Guardar datos" });
    expect(guardar).toBeDisabled();
    fireEvent.change(campo, {
      target: {
        value: "Valle del Sol vende eventos, alojamiento y almuerzos.",
      },
    });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() =>
      expect(s.guardarConfigOportunidades).toHaveBeenCalledWith({
        regiones: ["Ñuble", "Biobío"],
        comunas_cercanas: ["Quillón", "Bulnes"],
        perfil: "Valle del Sol vende eventos, alojamiento y almuerzos.",
      }),
    );
    // Solo cambió «lo que vende»: los datos del oferente no se mandan.
    expect(s.guardarOferente).not.toHaveBeenCalled();
  });

  it("la página web no se escribe aquí: se ve la de Configuración de empresa (decisión 47)", async () => {
    s.getOferente.mockResolvedValue({
      ...VISTA,
      empresa: { ...VISTA.empresa, sitio_web: "www.valledelsolquillon.cl" },
    } as never);
    s.getConfigOportunidades.mockResolvedValue(CONFIG as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OferenteOportunidades />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("www.valledelsolquillon.cl"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Página web")).not.toBeInTheDocument();
    expect(
      screen.getByText("Se cambian en Configuración de empresa."),
    ).toBeInTheDocument();
  });
});
