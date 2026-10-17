// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalisisDeBases from "./AnalisisDeBases";
import ValidacionDeDocumentos from "./ValidacionDeDocumentos";

// LO QUE PIDEN LAS BASES Y VALIDAR DOCUMENTOS (doc 17, sprint 3, pasos 1 y
// 3). Felipe, 17-10: "destacar criterios es importante" y "lo más
// importante validar documentos". Los servicios van de mentira: sin
// Supabase ni la API.

const ANALISIS = {
  id: 5,
  estado: "listo",
  resultado: {
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
    ],
    garantias: ["Fiel cumplimiento: 5% del contrato"],
    alertas: ["Multa de 1% por día de atraso"],
  },
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
    ],
    otros_problemas: ["El RUT del Anexo 3 no es el de la empresa."],
  },
};

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(() => Promise.resolve([{ id: 1 }])),
  getAnalisis: vi.fn(() => Promise.resolve(ANALISIS)),
  pedirAnalisis: vi.fn(),
  getValidacion: vi.fn(() => Promise.resolve(VALIDACION)),
  pedirValidacion: vi.fn(),
}));

afterEach(cleanup);

const pintar = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );

describe("Lo que piden las bases", () => {
  it("los criterios van primero, de más peso a menos, con el % a la vista", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} />);
    const tabla = await screen.findByRole("table");
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(
      filas.map((f) => within(f).getAllByRole("cell")[0].textContent),
    ).toEqual(["Oferta económica", "Experiencia", "Integridad"]);
    expect(within(filas[0]).getByText("45%")).toBeInTheDocument();
  });

  it("el checklist por tipo, con documento y página; las alertas y lo que costó", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} />);
    expect(await screen.findByText("Administrativos")).toBeInTheDocument();
    // "Garantías" sale dos veces: el grupo del checklist y la lista de
    // boletas y pólizas.
    expect(screen.getAllByText("Garantías")).toHaveLength(2);
    expect(screen.getByText("Bases.pdf · pág. 9")).toBeInTheDocument();
    expect(
      screen.getByText("Multa de 1% por día de atraso"),
    ).toBeInTheDocument();
    expect(screen.getByText(/costó US\$0,50/)).toBeInTheDocument();
  });
});

describe("Validar documentos", () => {
  it("el veredicto arriba, con los conteos, y cada requisito con su estado", async () => {
    pintar(<ValidacionDeDocumentos oportunidadId={40} />);
    expect(
      await screen.findByText("Todavía no: falta algo obligatorio"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 faltan · 1 por revisar")).toBeInTheDocument();
    expect(screen.getByText("Falta")).toBeInTheDocument();
    expect(screen.getByText("Revisar")).toBeInTheDocument();
    expect(
      screen.getByText("El RUT del Anexo 3 no es el de la empresa."),
    ).toBeInTheDocument();
  });
});
