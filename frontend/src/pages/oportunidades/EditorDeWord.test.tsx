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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as editor from "../../services/editorDelWord.service";
import * as servicio from "../../services/oportunidades.service";
import type { AdjuntoDeOportunidad } from "../../services/oportunidades.service";
import * as descargas from "./descargas";
import EditorDeWord from "./EditorDeWord";

// EL DOCUMENTO DE LA POSTULACIÓN, VERLO Y EDITARLO EN UNA SOLA PANTALLA
// (decisión 78): se ve con su encabezado y su logo, se escribe encima, se
// guarda sin cerrar, se vuelve a validar y se firma ahí mismo; salir con
// cambios pregunta.

vi.mock("../../services/editorDelWord.service", () => ({
  abrirElWord: vi.fn(),
  guardarElWord: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getValidacion: vi.fn(),
  pedirValidacion: vi.fn(),
}));
vi.mock("./descargas", () => ({ descargarDelBalde: vi.fn() }));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const e = vi.mocked(editor);
const s = vi.mocked(servicio);
const d = vi.mocked(descargas);

const ADJUNTO = {
  id: 13,
  nombre: "Formulario N°4 - Calidad de la oferta - lleno.docx",
  ruta: "c1/oportunidades/40/postulacion/x.docx",
  editado_en: null,
} as AdjuntoDeOportunidad;

const GUARDADO = {
  ...ADJUNTO,
  ruta: "c1/oportunidades/40/postulacion/y.docx",
  editado_en: "2026-10-24T21:00:00.000Z",
} as AdjuntoDeOportunidad;

const LOGO = "data:image/png;base64,iVBORw0KGgo=";

const WORD: editor.WordParaEditar = {
  version: "a".repeat(40),
  encabezado: [
    {
      tipo: "parrafo",
      id: 0,
      editable: false,
      motivo: "está en el encabezado",
      formato: { b: false, i: false, u: false },
      tramos: [{ t: "MUNICIPALIDAD DE QUILLÓN", b: true, i: false, u: false }],
      imagenes: [{ src: LOGO, ancho: 60 }],
    },
  ],
  bloques: [
    {
      tipo: "parrafo",
      id: 0,
      editable: true,
      formato: { b: false, i: false, u: false },
      alineacion: "centro",
      tramos: [{ r: 0, t: "FORMULARIO N°4", b: true, i: false, u: false }],
    },
    {
      tipo: "tabla",
      filas: [
        [
          {
            ancho: 75,
            bloques: [
              {
                tipo: "parrafo",
                id: 1,
                editable: true,
                formato: { b: false, i: false, u: false },
                tramos: [
                  {
                    r: 0,
                    t: "[COMPLETAR: tamaño de la piscina]",
                    b: false,
                    i: false,
                    u: false,
                  },
                ],
              },
            ],
          },
          {
            bloques: [
              {
                tipo: "parrafo",
                id: 2,
                editable: false,
                motivo: "tiene un vínculo",
                formato: { b: false, i: false, u: false },
                tramos: [
                  {
                    t: "www.valledelsol.cl",
                    b: false,
                    i: false,
                    u: false,
                  },
                ],
              },
            ],
          },
        ],
      ],
    },
  ],
};

let onCerrar: ReturnType<typeof vi.fn<() => void>>;
let onFirmar: ReturnType<typeof vi.fn<(id: number) => void>>;

beforeEach(() => {
  onCerrar = vi.fn<() => void>();
  onFirmar = vi.fn<(id: number) => void>();
  e.abrirElWord.mockResolvedValue(WORD);
  e.guardarElWord.mockResolvedValue(GUARDADO);
  s.getValidacion.mockResolvedValue(null);
  s.pedirValidacion.mockResolvedValue({
    id: 5,
    estado: "procesando",
  } as never);
  d.descargarDelBalde.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (adjunto = ADJUNTO, conFirma = true) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EditorDeWord
        oportunidadId={40}
        adjunto={adjunto}
        onCerrar={onCerrar}
        onFirmar={conFirma ? onFirmar : undefined}
      />
    </QueryClientProvider>,
  );

/** Escribe en un párrafo: cambia el texto de su pedazo y avisa. */
const escribir = (id: number, texto: string) => {
  const el = document.querySelector<HTMLElement>(`[data-p="${id}"]`);
  const span = el?.querySelector("span");
  if (!el || !span) throw new Error(`sin párrafo ${id}`);
  span.textContent = texto;
  fireEvent.input(el);
};

const CAMBIO = [
  {
    id: 1,
    tramos: [{ r: 0, t: "12 x 6 metros", b: false, i: false, u: false }],
  },
];

describe("El documento, para verlo y editarlo", () => {
  it("se ve con su encabezado y su logo, lo pendiente en amarillo y lo que no se edita", async () => {
    pintar();
    expect(await screen.findByText("FORMULARIO N°4")).toBeInTheDocument();
    expect(screen.getByText("MUNICIPALIDAD DE QUILLÓN")).toBeInTheDocument();
    expect(document.querySelector(`img[src="${LOGO}"]`)).not.toBeNull();
    expect(screen.getByText("[COMPLETAR: tamaño de la piscina]").tagName).toBe(
      "MARK",
    );
    expect(screen.getByText(/Queda 1 por completar/)).toBeInTheDocument();
    expect(
      screen.getByText("www.valledelsol.cl").closest("[title]"),
    ).toHaveAttribute("title", expect.stringContaining("No se edita aquí"));
    expect(document.querySelector('[data-p="0"]')).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });

  it("«Guardar» manda solo el párrafo que cambió y la pantalla sigue abierta", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    escribir(1, "12 x 6 metros");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    expect(screen.queryByText(/por completar/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(e.guardarElWord).toHaveBeenCalledWith(
        40,
        13,
        "a".repeat(40),
        CAMBIO,
      ),
    );
    // Se relee el Word guardado, en su ruta nueva, sin cerrar.
    await waitFor(() => expect(e.abrirElWord).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("alinear a la derecha el párrafo del cursor se ve al tiro y se guarda", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    const p = document.querySelector<HTMLElement>('[data-p="1"]');
    if (!p) throw new Error("sin párrafo");
    const rango = document.createRange();
    rango.selectNodeContents(p);
    rango.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(rango);
    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Alinear a la derecha" }),
    );
    expect(p.style.textAlign).toBe("right");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(e.guardarElWord).toHaveBeenCalledWith(40, 13, "a".repeat(40), [
        {
          id: 1,
          tramos: [
            {
              r: 0,
              t: "[COMPLETAR: tamaño de la piscina]",
              b: false,
              i: false,
              u: false,
            },
          ],
          alineacion: "derecha",
        },
      ]),
    );
  });

  it("«Volver a validar» guarda primero y pide la validación", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    escribir(1, "12 x 6 metros");
    fireEvent.click(screen.getByRole("button", { name: /Volver a validar/ }));
    await waitFor(() => expect(s.pedirValidacion).toHaveBeenCalledWith(40));
    expect(e.guardarElWord).toHaveBeenCalledWith(
      40,
      13,
      "a".repeat(40),
      CAMBIO,
    );
    expect(
      await screen.findByText(/Validando tus documentos contra las bases/),
    ).toBeInTheDocument();
  });

  it("una validación de antes de editar avisa que hay que volver a validar", async () => {
    s.getValidacion.mockResolvedValue({
      id: 4,
      estado: "listo",
      creado_en: "2026-10-24T20:00:00.000Z",
      resultado: {
        resumen: "Falta firmar el Formulario N°4.",
        listo: "casi",
        requisitos: [
          {
            que: "Formulario N°4",
            estado: "revisar",
            donde: "",
            observacion: "",
          },
        ],
        otros_problemas: ["Formulario N°4: «prespuesto» debe ser presupuesto."],
      },
    } as never);
    pintar(GUARDADO, false);
    expect(
      await screen.findByText("Falta firmar el Formulario N°4."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/es de antes de tus últimos cambios/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Formulario N°4: «prespuesto» debe ser presupuesto."),
    ).toBeInTheDocument();
    // Sin onFirmar no se firma desde aquí.
    expect(screen.queryByRole("button", { name: /Firmar/ })).toBeNull();
  });

  it("«Firmar» avisa lo pendiente y firma lo que se ve", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    fireEvent.click(screen.getByRole("button", { name: /Firmar/ }));
    expect(
      screen.getByText(/Quedan 1 por completar\. ¿Ya lo revisaste\?/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, firmar" }));
    await waitFor(() => expect(onFirmar).toHaveBeenCalledWith(13));
    expect(e.guardarElWord).not.toHaveBeenCalled();
    expect(onCerrar).toHaveBeenCalled();
  });

  it("«Firmar» con cambios sin guardar los guarda primero", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    escribir(1, "12 x 6 metros");
    fireEvent.click(screen.getByRole("button", { name: /Firmar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, firmar" }));
    await waitFor(() => expect(onFirmar).toHaveBeenCalledWith(13));
    expect(e.guardarElWord).toHaveBeenCalledWith(
      40,
      13,
      "a".repeat(40),
      CAMBIO,
    );
  });

  it("«Descargar» sin cambios baja el Word tal cual", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    fireEvent.click(screen.getByRole("button", { name: /Descargar/ }));
    await waitFor(() =>
      expect(d.descargarDelBalde).toHaveBeenCalledWith(
        ADJUNTO.ruta,
        ADJUNTO.nombre,
      ),
    );
    expect(e.guardarElWord).not.toHaveBeenCalled();
  });

  it("al escribir encima del [COMPLETAR], el amarillo que copia el navegador se apaga", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    const marca = document.querySelector("mark[data-completar]");
    if (!marca) throw new Error("sin pendiente");
    // Lo que hace Chrome: borra el marcador y le copia el fondo a lo nuevo.
    const nuevo = document.createElement("span");
    nuevo.style.backgroundColor = "rgb(254, 240, 138)";
    nuevo.textContent = "12 x 6 metros";
    marca.replaceWith(nuevo);
    fireEvent.input(document.querySelector('[data-p="1"]') as HTMLElement);
    expect(nuevo.style.backgroundColor).toBe("");
    expect(screen.queryByText(/por completar/)).not.toBeInTheDocument();
  });

  it("salir con cambios pregunta antes", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    escribir(0, "FORMULARIO N°4 (corregido)");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tienes cambios sin guardar. ¿Salir sin guardarlos?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(onCerrar).toHaveBeenCalled();
  });
});
