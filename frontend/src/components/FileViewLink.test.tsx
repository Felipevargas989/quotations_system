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
import * as storage from "../services/storage.service";
import FileViewLink from "./FileViewLink";

// EL VISOR DE LA CASA: PDF, imágenes y, desde el 19-10 (decisión 46), Word,
// con lo que quien lo usa suma junto a Descargar (en «Mi postulación»,
// Firmar: leer y firmar sin descargar).

vi.mock("../services/storage.service", () => ({
  resolveStorageUrl: vi.fn(),
}));
vi.mock("./VisorDeWord", () => ({
  default: ({ url }: { url: string }) => <p>Word en pantalla: {url}</p>,
}));
const s = vi.mocked(storage);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FileViewLink", () => {
  it("un Word se ve aquí mismo, con las acciones de quien lo usa y Descargar", async () => {
    s.resolveStorageUrl.mockResolvedValue("https://balde/firmado?token=1");
    render(
      <FileViewLink
        url="c1/oportunidades/84/postulacion/x_Formulario N°1 - lleno.docx"
        title="Formulario N°1 - lleno.docx"
        acciones={<button type="button">Firmar</button>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(
      await screen.findByText(
        "Word en pantalla: https://balde/firmado?token=1",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Firmar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descargar/ })).toHaveAttribute(
      "href",
      "https://balde/firmado?token=1&download=",
    );
    // La ventana de la casa: Escape cierra.
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText(/Word en pantalla/)).not.toBeInTheDocument(),
    );
  });

  it("un PDF va en el visor del navegador", async () => {
    s.resolveStorageUrl.mockResolvedValue("https://balde/bases.pdf?token=2");
    render(
      <FileViewLink url="c1/oportunidades/84/x_Bases.pdf" title="Bases" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    const marco = await screen.findByTitle("Bases");
    expect(marco.tagName).toBe("IFRAME");
    expect(marco).toHaveAttribute("src", "https://balde/bases.pdf?token=2");
  });
});
