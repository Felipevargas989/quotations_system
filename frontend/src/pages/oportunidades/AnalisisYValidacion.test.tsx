// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import AnalisisDeBases from "./AnalisisDeBases";
import ValidacionDeDocumentos from "./ValidacionDeDocumentos";

// LO QUE PIDEN LAS BASES Y VALIDAR DOCUMENTOS (doc 17, sprint 3, pasos 1 y
// 3), ordenados el 17-10. Felipe: "destacar criterios es importante", "lo
// más importante validar documentos" y "quedó muy desordenado... difícil de
// leer". Los servicios van de mentira: sin Supabase ni la API.

const RESULTADO = {
  resumen: "Ceremonia y cena para 160 funcionarios.",
  lugar: "lo propone el oferente",
  se_puede_en_el_complejo: "si",
  monto: 12_000_000,
  monto_detalle: "IVA incluido",
  fechas: [{ que: "Cierre de ofertas", cuando: "19-10-2026 16:00" }],
  criterios: [
    { nombre: "Experiencia", peso: "20%", como_se_evalua: "años" },
    { nombre: "Oferta económica", peso: "45%", como_se_evalua: "precio" },
    { nombre: "Integridad", peso: "5%", como_se_evalua: "programa" },
  ],
  requisitos: [
    {
      que: "Boleta de garantía",
      tipo: "garantia",
      obligatorio: true,
      documento: "Bases.pdf",
      pagina: 9,
    },
    {
      que: "Anexo N°1 firmado",
      tipo: "administrativo",
      obligatorio: true,
      documento: "Formularios_Anexos.docx",
      pagina: 0,
    },
    {
      que: "Programa de integridad",
      tipo: "administrativo",
      obligatorio: false,
      documento: "Bases.pdf",
      pagina: 11,
    },
  ],
  garantias: ["Fiel cumplimiento: 5% del contrato"],
  te_dejan_fuera: ["Sin la boleta de garantía quedas fuera de bases"],
  condiciones: ["Multa de 1% por día de atraso"],
  fecha_del_servicio: "viernes 30 de octubre, 18:00 a 02:00",
  personas: 160,
};

const ANALISIS = {
  id: 5,
  estado: "listo",
  resultado: RESULTADO,
  archivos: [{ id: 1, nombre: "Bases.pdf" }],
  no_leidos: [],
  modelo: "claude-opus-5-5",
  tokens_entrada: 100_000,
  tokens_salida: 5_000,
  costo_usd: 0.5,
  error: null,
  creado_en: "2026-10-17T13:00:00.000Z",
  terminado_en: "2026-10-17T13:02:00.000Z",
};

const VALIDACION = {
  ...ANALISIS,
  id: 8,
  resultado: {
    resumen: "Falta la boleta de garantía; el Anexo 1 no tiene firma.",
    listo: "no",
    requisitos: [
      {
        que: "Boleta de garantía",
        estado: "falta",
        donde: "",
        observacion: "No está en la postulación.",
      },
      {
        que: "Anexo N°1 firmado",
        estado: "revisar",
        donde: "Anexo1.pdf",
        observacion: "Sin firma.",
      },
      {
        que: "Programa de integridad",
        estado: "cumple",
        donde: "Integridad.pdf",
        observacion: "Bien.",
      },
    ],
    otros_problemas: ["El RUT del Anexo 3 no es el de la empresa."],
  },
};

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(() => Promise.resolve([{ id: 1 }])),
  getAnalisis: vi.fn(),
  pedirAnalisis: vi.fn(),
  getValidacion: vi.fn(),
  pedirValidacion: vi.fn(),
}));

const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (ui: ReactElement, analisis: unknown = ANALISIS) => {
  s.getAnalisis.mockResolvedValue(analisis as never);
  s.getValidacion.mockResolvedValue(VALIDACION as never);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
};

describe("Lo que piden las bases", () => {
  it("cómo te evalúan: de más peso a menos, con el % a la vista y el detalle plegado", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} />);
    const titulo = await screen.findByText("Cómo te evalúan");
    const lista = within(titulo.parentElement as HTMLElement).getAllByRole(
      "listitem",
    );
    expect(lista.map((li) => li.textContent)).toEqual([
      "Oferta económica45%",
      "Experiencia20%",
      "Integridad5%",
    ]);
    expect(screen.queryByText("precio")).toBeNull();
    fireEvent.click(screen.getByText("Ver cómo se calcula cada uno"));
    expect(screen.getByText("precio")).toBeInTheDocument();
  });

  it("arriba lo que te deja fuera; las demás condiciones, plegadas", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} />);
    expect(
      await screen.findByText(
        "Sin la boleta de garantía quedas fuera de bases",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Multa de 1% por día de atraso")).toBeNull();
    fireEvent.click(screen.getByText(/Otras condiciones \(1\)/));
    expect(
      screen.getByText("Multa de 1% por día de atraso"),
    ).toBeInTheDocument();
  });

  it("una sola lista: cada requisito con lo que dijo la validación, y filtros con su conteo", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} />);
    const boleta = (await screen.findByText("Boleta de garantía")).closest(
      "li",
    ) as HTMLElement;
    expect(within(boleta).getByText("Falta")).toBeInTheDocument();
    expect(within(boleta).getByText("Garantía · pág. 9")).toBeInTheDocument();
    expect(screen.getByText("Sin firma. · Anexo1.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Faltan 1" }));
    expect(screen.queryByText("Anexo N°1 firmado")).toBeNull();
    expect(screen.getByText("Boleta de garantía")).toBeInTheDocument();
    expect(screen.getByText(/costó US\$0,50/)).toBeInTheDocument();
  });

  it("un análisis anterior al 17-10 muestra sus avisos plegados y pide volver a analizar", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} />, {
      ...ANALISIS,
      resultado: {
        ...RESULTADO,
        te_dejan_fuera: undefined,
        condiciones: undefined,
        alertas: ["Multa de 1% por día de atraso"],
      },
    });
    expect(
      await screen.findByText(/Avisos \(1\)\. Vuelve a analizar/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lo que te puede dejar fuera")).toBeNull();
  });
});

describe("Validar documentos", () => {
  it("el veredicto arriba, con los conteos, y solo lo que hay que arreglar", async () => {
    pintar(<ValidacionDeDocumentos oportunidadId={40} />);
    expect(
      await screen.findByText("Todavía no: falta algo obligatorio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 cumplen · 1 faltan · 1 por revisar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Falta")).toBeInTheDocument();
    expect(screen.getByText("Revisar")).toBeInTheDocument();
    expect(screen.queryByText("Programa de integridad")).toBeNull();
    expect(
      screen.getByText("El RUT del Anexo 3 no es el de la empresa."),
    ).toBeInTheDocument();
  });
});
