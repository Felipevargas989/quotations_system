// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderAsync } from "docx-preview";
import { afterEach, describe, expect, it, vi } from "vitest";
import VisorDeWord from "./VisorDeWord";

// EL WORD SE LEE EN EVENTIA (decisión 46, 19-10), aislado: sin el HTML
// incrustado de un Word y con los enlaces controlados.

vi.mock("docx-preview", () => ({ renderAsync: vi.fn() }));
const dibujar = vi.mocked(renderAsync);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const responder = (ok: boolean) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 403,
      blob: () => Promise.resolve(new Blob(["PK"])),
    }),
  );

describe("El visor de Word", () => {
  it("lo dibuja en una sombra, sin HTML incrustado, y desactiva los enlaces peligrosos", async () => {
    responder(true);
    dibujar.mockImplementation((_datos, cuerpo) => {
      (cuerpo as HTMLElement).innerHTML =
        '<p>Formulario N°1</p><a href="javascript:robar()">clic</a><a href="https://www.mercadopublico.cl">MP</a>';
      return Promise.resolve();
    });
    render(
      <VisorDeWord url="https://balde/f.docx?t=1" titulo="Formulario N°1" />,
    );
    await waitFor(() => expect(dibujar).toHaveBeenCalled());
    const [, , , opciones] = dibujar.mock.calls[0];
    expect(opciones).toMatchObject({ renderAltChunks: false });
    const anfitrion = screen.getByRole("document", { name: "Formulario N°1" });
    const sombra = anfitrion.shadowRoot as ShadowRoot;
    await waitFor(() => expect(sombra.textContent).toContain("Formulario N°1"));
    const [mal, bien] = Array.from(sombra.querySelectorAll("a"));
    await waitFor(() => expect(mal.hasAttribute("href")).toBe(false));
    expect(bien.getAttribute("target")).toBe("_blank");
    // Lo de la página no se mezcla con el Word.
    expect(document.body.textContent).not.toContain("clic");
  });

  it("si no se puede bajar o dibujar, dice que se descargue", async () => {
    responder(false);
    render(<VisorDeWord url="https://balde/f.docx?t=1" titulo="Anexo" />);
    expect(
      await screen.findByText(/No se pudo mostrar este Word aquí/),
    ).toBeInTheDocument();
    expect(dibujar).not.toHaveBeenCalled();
  });
});
