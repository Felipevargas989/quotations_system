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
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import DocumentosConIA from "./DocumentosConIA";
import MiPostulacion from "./MiPostulacion";

// CREAR DOCUMENTOS CON IA Y FIRMAR (doc 17, sprint 3, paso 4). Felipe,
// 17-10: los anexos del comprador llenos con IA, la firma en dos tiempos y
// la propuesta técnica. Los servicios van de mentira: sin Supabase ni la
// API.

const WORD =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const archivo = (
  id: number,
  nombre: string,
  origen: "subido" | "generado" | "firmado" = "subido",
) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${id}`,
  tipo: nombre.endsWith(".pdf") ? "application/pdf" : WORD,
  bytes: 106_493,
  origen,
  viene_de: null,
  creado_en: "2026-10-17T13:11:33.000Z",
  subido_por: null,
  quien: null,
});

const TRABAJO = {
  id: 9,
  tipo: "anexos",
  parametros: {},
  estado: "listo",
  resultado: {
    resumen: "Llené los anexos 1 a 5; el 6 (UTP) no aplica.",
    documentos: [
      {
        adjunto_id: 50,
        nombre: "Formularios_Anexos - lleno.docx",
        que_se_hizo: "Anexos 1 a 5 llenos.",
        pendientes: ["Las órdenes de compra de la experiencia"],
      },
    ],
    pendientes: ["El monto de la oferta"],
    descartados: [],
    no_entregados: [],
  },
  archivos: [],
  no_leidos: [],
  modelo: "claude-opus-5-5",
  tokens_entrada: 130_000,
  tokens_salida: 5_000,
  costo_usd: 0.28,
  error: null,
  creado_en: "2026-10-17T15:00:00.000Z",
  terminado_en: "2026-10-17T15:05:00.000Z",
};

vi.mock("../../services/oportunidades.service", () => ({
  getCotizacionDeLaPostulacion: vi.fn(),
  getAdjuntos: vi.fn(),
  getAnalisis: vi.fn(),
  getGeneraciones: vi.fn(),
  generarAnexos: vi.fn(),
  getOferente: vi.fn(),
  crearPropuestaTecnica: vi.fn(),
  firmarDocumentos: vi.fn(),
  subirAdjunto: vi.fn(),
  borrarAdjunto: vi.fn(),
}));
// La oferta armada (decisión 33): sin ella, ningún documento queda
// desactualizado.
vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/storage.service", () => ({
  resolveStorageUrl: vi.fn(),
}));

const s = vi.mocked(servicio);

beforeEach(() => {
  s.getAdjuntos.mockImplementation((_id, seccion) =>
    Promise.resolve(
      seccion === "postulacion"
        ? [
            archivo(50, "Formularios_Anexos - lleno.docx", "generado"),
            archivo(51, "Formularios_Anexos - firmado.docx", "firmado"),
            archivo(52, "Patente.pdf"),
          ]
        : [
            archivo(4, "Bases.pdf"),
            archivo(6, "Formularios_Anexos.docx"),
            archivo(7, "Anexo 7.docx"),
          ],
    ),
  );
  s.getAnalisis.mockResolvedValue({ id: 5, estado: "listo" } as never);
  s.getCotizacionDeLaPostulacion.mockResolvedValue({
    cotizacion: null,
    presupuesto: null,
    propuesta: null,
  });
  s.getOferente.mockResolvedValue({
    oferente: {
      razon_social: "VALLE DEL SOL QUILLON SPA",
      rut: "77.701.305-K",
    },
  } as never);
  s.getGeneraciones.mockResolvedValue({
    anexos: TRABAJO,
    firma: null,
    propuesta: null,
  } as never);
  s.generarAnexos.mockResolvedValue({
    ...TRABAJO,
    id: 10,
    estado: "procesando",
  } as never);
  s.firmarDocumentos.mockResolvedValue({
    ...TRABAJO,
    id: 11,
    tipo: "firma",
    estado: "procesando",
    resultado: null,
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("Crear documentos con IA", () => {
  it("sin casillas: con un análisis anterior se llenan los Word y se pide volver a analizar por los PDF; se manda solo el total (19-10)", async () => {
    pintar(<DocumentosConIA oportunidadId={40} />);

    expect(
      await screen.findByText(
        "Se llenan los Word de «Bases y anexos». Si hay formularios en PDF, vuelve a analizar las bases para que la IA los encuentre.",
      ),
    ).toBeInTheDocument();
    // Felipe, 19-10: "que me traiga los PDF y me los marque, creo que eso
    // es lo innecesario". Los archivos los elige el motor.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("Bases.pdf")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Monto total de la oferta, con IVA (opcional)"),
      { target: { value: "11900000" } },
    );
    expect(
      await screen.findByText("Neto $10.000.000 + IVA $1.900.000."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Volver a generar/ }));
    await waitFor(() =>
      expect(s.generarAnexos).toHaveBeenCalledWith(40, {
        monto_total: 11_900_000,
      }),
    );
    expect(
      await screen.findByText(/La IA está llenando los anexos/),
    ).toBeInTheDocument();
  });

  it("la oferta parte con el total de la cotización de la postulación (decisión 29)", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue({
      cotizacion: {
        id: "q-612",
        numero: 612,
        estado: "solicitada",
        cliente: null,
        catalogo: 6_007_500,
        descuento: 507_500,
        total: 5_500_000,
      },
      presupuesto: null,
      propuesta: null,
    });
    pintar(<DocumentosConIA oportunidadId={40} />);
    expect(
      await screen.findByText("Neto $4.621.849 + IVA $878.151."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Volver a generar/ }));
    await waitFor(() =>
      expect(s.generarAnexos).toHaveBeenCalledWith(40, {
        monto_total: 5_500_000,
      }),
    );
  });

  it("formularios solo en PDF y sin análisis: pide analizar y no deja generar", async () => {
    s.getAdjuntos.mockResolvedValue([archivo(4, "Bases.pdf")] as never);
    s.getAnalisis.mockResolvedValue(null);
    pintar(<DocumentosConIA oportunidadId={40} />);
    expect(
      await screen.findByText(
        "Analiza las bases para que la IA encuentre los formularios.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volver a generar/ }),
    ).toBeDisabled();
  });

  it("si el análisis no encontró formularios y no hay Word, lo dice y no deja generar", async () => {
    s.getAdjuntos.mockResolvedValue([archivo(4, "Bases.pdf")] as never);
    s.getAnalisis.mockResolvedValue({
      id: 5,
      estado: "listo",
      resultado: { formularios: [] },
    } as never);
    pintar(<DocumentosConIA oportunidadId={40} />);
    expect(
      await screen.findByText("Las bases no traen formularios para llenar."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volver a generar/ }),
    ).toBeDisabled();
  });

  it("con el análisis, la lista de formularios con su archivo y página, y nada que marcar: el motor elige (18 y 19-10)", async () => {
    s.getAnalisis.mockResolvedValue({
      id: 5,
      estado: "listo",
      resultado: {
        formularios: [
          {
            nombre: "Formulario N°1 - Identificación del oferente",
            archivo: "Bases.pdf",
            paginas: "16",
            aplica: true,
            por_que_no_aplica: "",
            se_entrega_en: "administrativa",
          },
          {
            nombre: "Formulario UTP",
            archivo: "Bases.pdf",
            paginas: "18",
            aplica: false,
            por_que_no_aplica: "Postulas sola",
            se_entrega_en: "administrativa",
          },
          {
            nombre: "Formulario N°5 - Oferta económica",
            archivo: "",
            paginas: "",
            aplica: true,
            por_que_no_aplica: "",
            se_entrega_en: "economica",
          },
        ],
      },
    } as never);
    pintar(<DocumentosConIA oportunidadId={40} />);

    expect(
      await screen.findByText("Formulario N°1 - Identificación del oferente"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/pág\. 16 · se entrega en la parte administrativa/),
    ).toBeInTheDocument();
    expect(screen.getByText(/No aplica: Postulas sola/)).toBeInTheDocument();
    expect(
      screen.getByText(/No viene en lo que subiste.*y vuelve a analizar\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Los Word se llenan en el mismo archivo; los que vienen en PDF se reescriben en Word, iguales al original.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Volver a generar/ }));
    await waitFor(() => expect(s.generarAnexos).toHaveBeenCalledWith(40, {}));
  });

  it("sin razón social o RUT en «Mi empresa», lo dice y no deja generar", async () => {
    s.getOferente.mockResolvedValue({
      oferente: { razon_social: null, rut: null },
    } as never);
    pintar(<DocumentosConIA oportunidadId={40} />);
    expect(
      await screen.findByText(/Primero llena «Mi empresa»/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir a «Mi empresa»" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volver a generar/ }),
    ).toBeDisabled();
  });

  it("sin monto avisa que la oferta queda en blanco; lo que hizo la IA sale con lo que falta completar", async () => {
    pintar(<DocumentosConIA oportunidadId={40} />);
    expect(
      await screen.findByText(/la IA nunca pone un precio/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Llené los anexos 1 a 5; el 6 (UTP) no aplica."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Las órdenes de compra de la experiencia"),
    ).toBeInTheDocument();
    expect(screen.getByText("Lo que te toca completar")).toBeInTheDocument();
    expect(screen.getByText(/costó US\$0,28/)).toBeInTheDocument();
  });

  it("la propuesta técnica espera el análisis de las bases", async () => {
    s.getAnalisis.mockResolvedValue(null);
    pintar(<DocumentosConIA oportunidadId={40} />);
    expect(
      await screen.findByRole("button", { name: /Crear propuesta técnica/ }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Primero analiza las bases: la propuesta/),
    ).toBeInTheDocument();
  });
});

describe("Mi postulación: la firma en dos tiempos", () => {
  it("cada Word sin firma lleva su sello y «Firmar», que pregunta antes; lo firmado y los PDF no", async () => {
    pintar(
      <MiPostulacion
        oportunidadId={40}
        codigo="1532886-5-LE26"
        tipo="licitacion"
      />,
    );

    // El nombre se muestra sin guiones bajos (17-10); el original queda en
    // el texto al pasar el mouse.
    expect(
      await screen.findByText("Formularios Anexos - lleno.docx"),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle("Formularios_Anexos - lleno.docx"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hecho con IA · sin firma")).toBeInTheDocument();
    expect(screen.getByText("Firmado")).toBeInTheDocument();
    const botones = screen.getAllByRole("button", { name: /Firmar/ });
    expect(botones).toHaveLength(1);

    fireEvent.click(botones[0]);
    expect(
      screen.getByText("¿Ya lo revisaste? Se le pone la foto de la firma."),
    ).toBeInTheDocument();
    expect(s.firmarDocumentos).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, firmar" }));
    await waitFor(() =>
      expect(s.firmarDocumentos).toHaveBeenCalledWith(40, [50]),
    );
    expect(
      await screen.findByText(/La IA está poniendo la firma/),
    ).toBeInTheDocument();
  });
});
