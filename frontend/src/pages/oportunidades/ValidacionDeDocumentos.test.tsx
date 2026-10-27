// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import ValidacionDeDocumentos from "./ValidacionDeDocumentos";

// «VALIDAR TODO», EL PASO 3 DE «MI POSTULACIÓN» (decisiones 79, 83, 84,
// 85 y 88 del doc 17). Salió de AnalisisYValidacion.test.tsx el 26-10, cuando
// ese archivo pasó las 800 líneas. Los servicios van de mentira.

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

const CARPETA = [
  {
    id: 1,
    tipo: "patente",
    nombre: "Patente 2026.pdf",
    vence: "2026-12-31",
    creado_en: "2026-07-01T12:00:00.000Z",
  },
  {
    id: 2,
    tipo: "inicio_actividades",
    nombre: "Inicio actividades.pdf",
    vence: "2026-10-01",
    creado_en: "2026-01-01T12:00:00.000Z",
  },
];

const POSTULACION = [
  { id: 10, nombre: "Anexo_N1_Identificacion.pdf", origen: "firmado" },
  { id: 11, nombre: "Programa de Probidad.pdf", origen: "subido" },
];

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  getAnalisis: vi.fn(),
  getValidacion: vi.fn(),
  pedirValidacion: vi.fn(),
  getGeneraciones: vi.fn(),
  getOferente: vi.fn(),
}));

const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (
  ui: ReactElement,
  analisis: unknown = ANALISIS,
  postulacion: unknown[] = POSTULACION,
  generaciones: unknown = { anexos: null, firma: null, propuesta: null },
  validacion: unknown = VALIDACION,
) => {
  s.getAnalisis.mockResolvedValue(analisis as never);
  s.getValidacion.mockResolvedValue(validacion as never);
  s.getGeneraciones.mockResolvedValue(generaciones as never);
  s.getAdjuntos.mockImplementation((_id, seccion) =>
    Promise.resolve(
      (seccion === "postulacion" ? postulacion : [{ id: 1 }]) as never,
    ),
  );
  s.getOferente.mockResolvedValue({ documentos: CARPETA } as never);
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

describe("Validar todo (decisión 79)", () => {
  it("el veredicto y la última validación en una línea, y solo lo que hay que arreglar", async () => {
    pintar(<ValidacionDeDocumentos oportunidadId={40} />);
    expect(
      await screen.findByText("Todavía no: falta algo obligatorio"),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 de 3 requisitos cumplen/)).toBeInTheDocument();
    // Decisión 85: la boleta que falta y el Anexo N°1, obligatorio, en rojo;
    // el RUT de otro anexo, que es de forma, en amarillo.
    expect(screen.getAllByText("Grave")).toHaveLength(2);
    expect(screen.getByText("Menor")).toBeInTheDocument();
    expect(screen.queryByText("Programa de integridad")).toBeNull();
    expect(
      screen.getByText("El RUT del Anexo 3 no es el de la empresa."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validar todo" })).toBeEnabled();
  });

  it("decisión 84: lo de cada documento va aquí, bajo su nombre, con la firma que falta", async () => {
    pintar(<ValidacionDeDocumentos oportunidadId={40} />, ANALISIS, [
      ...POSTULACION,
      {
        id: 12,
        nombre: "Anexo 3 - Experiencia - firmado.pdf",
        origen: "firmado",
        creado_en: "2026-10-17T12:00:00.000Z",
      },
      {
        id: 13,
        nombre: "Plazo de entrega.docx",
        origen: "subido",
        creado_en: "2026-10-17T12:00:00.000Z",
      },
    ]);
    expect(
      await screen.findByText("Todavía no: falta algo obligatorio"),
    ).toBeInTheDocument();
    // El firmado con un problema: su nombre y, debajo, lo que dijo la IA.
    expect(
      await screen.findByText("Anexo 3 - Experiencia - firmado.pdf"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("El RUT del Anexo 3 no es el de la empresa."),
    ).toBeInTheDocument();
    // El Word sin firmar, aunque la validación no diga nada de él.
    expect(screen.getByText("Plazo de entrega.docx")).toBeInTheDocument();
    expect(screen.getByText("Falta la firma.")).toBeInTheDocument();
    // Lo que no es de ningún documento sigue después.
    expect(screen.getByText("Boleta de garantía")).toBeInTheDocument();
    // El firmado sin problemas y el PDF subido no aparecen.
    expect(screen.queryByText("Anexo_N1_Identificacion.pdf")).toBeNull();
    expect(screen.queryByText("Programa de Probidad.pdf")).toBeNull();
  });

  it("decisión 84: sin validar todavía, igual dice qué falta firmar", async () => {
    pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      ANALISIS,
      [{ id: 13, nombre: "Plazo de entrega.docx", origen: "subido" }],
      undefined,
      "",
    );
    expect(
      await screen.findByText("Plazo de entrega.docx"),
    ).toBeInTheDocument();
    expect(screen.getByText("Falta la firma.")).toBeInTheDocument();
    expect(screen.queryByText(/Bases y criterios/)).toBeNull();
  });

  it("decisión 85: la IA dice qué es grave; lo grave va primero", async () => {
    const vista = pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      {
        ...ANALISIS,
        // Las bases piden solo el Anexo N°1, que ya está firmado: nada
        // falta en el ZIP.
        resultado: {
          ...RESULTADO,
          documentos: [
            {
              nombre: "Formulario N°1 Identificación del oferente",
              parte: "administrativa",
              cuando: "con_la_oferta",
              obligatorio: true,
              condicion: "",
              carpeta: "formulario",
              pagina: 8,
            },
          ],
        },
      },
      POSTULACION,
      undefined,
      {
        ...VALIDACION,
        resultado: {
          ...VALIDACION.resultado,
          listo: "casi",
          requisitos: [
            {
              que: "Programa de integridad",
              estado: "revisar",
              donde: "Integridad.pdf",
              observacion: "Falta la firma del representante legal.",
              gravedad: "grave",
            },
          ],
          otros_graves: [
            "Las bases piden el plazo y ningún documento lo dice.",
          ],
          otros_problemas: ["«Dictament» debería decir «Dictamen»."],
        },
      },
    );
    expect(
      await screen.findByText("Casi lista: faltan detalles"),
    ).toBeInTheDocument();
    const sellos = within(vista.container.querySelector("ul")!)
      .getAllByText(/^(Grave|Menor)$/)
      .map((e) => e.textContent);
    expect(sellos).toEqual(["Grave", "Grave", "Menor"]);
    expect(
      screen.getByText(
        "Falta la firma del representante legal. · Integridad.pdf",
      ),
    ).toBeInTheDocument();
  });

  it("decisión 85: lo que no es obligatorio no sale como falta del ZIP (lo ve la validación)", async () => {
    pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      {
        ...ANALISIS,
        resultado: {
          ...RESULTADO,
          documentos: [
            {
              nombre:
                "Certificación de que el personal conoce el programa de integridad",
              parte: "administrativa",
              cuando: "con_la_oferta",
              obligatorio: false,
              condicion: "",
              carpeta: "dj_trabajadores",
              pagina: 11,
            },
          ],
        },
      },
      POSTULACION,
      undefined,
      { ...VALIDACION, resultado: { ...VALIDACION.resultado, listo: "casi" } },
    );
    expect(
      await screen.findByText("Casi lista: faltan detalles"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Certificación de que el personal conoce el programa de integridad",
      ),
    ).toBeNull();
  });

  it("decisión 85: un formulario que falta en el ZIP es grave y la oferta no está lista", async () => {
    pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      {
        ...ANALISIS,
        resultado: {
          ...RESULTADO,
          documentos: [
            {
              nombre: "Formulario N°4 Calidad de la oferta",
              parte: "tecnica",
              cuando: "con_la_oferta",
              obligatorio: true,
              condicion: "",
              carpeta: "formulario",
              pagina: 8,
            },
          ],
        },
      },
      POSTULACION,
      undefined,
      { ...VALIDACION, resultado: { ...VALIDACION.resultado, listo: "si" } },
    );
    expect(
      await screen.findByText("Formulario N°4 Calidad de la oferta"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No está en tus documentos: vuelve a armar la postulación.",
      ),
    ).toBeInTheDocument();
    // Aunque la última validación dijera que sí, falta algo en el ZIP.
    expect(
      screen.getByText("Todavía no: falta algo obligatorio"),
    ).toBeInTheDocument();
  });

  it("decisión 88: «Para tu empresa» va aparte, como aviso interno, y no cambia el veredicto", async () => {
    pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      // Sin nada obligatorio que falte en el ZIP: el veredicto es el de la IA.
      { ...ANALISIS, resultado: { ...RESULTADO, requisitos: [] } },
      POSTULACION,
      undefined,
      {
        ...VALIDACION,
        resultado: {
          ...VALIDACION.resultado,
          listo: "si",
          requisitos: [],
          otros_problemas: [],
          para_tu_empresa: [
            "Ninguna resolución sanitaria autoriza preparar alimentos: sácala a nombre de la empresa.",
          ],
        },
      },
    );
    expect(await screen.findByText("Para tu empresa")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ninguna resolución sanitaria autoriza preparar alimentos: sácala a nombre de la empresa.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /no van en la postulación ni cambian si puedes postular/,
      ),
    ).toBeInTheDocument();
    // La empresa sigue postulando mientras lo resuelve.
    expect(screen.getByText("Lista para postular")).toBeInTheDocument();
    expect(screen.queryByText("Grave")).toBeNull();
    expect(screen.queryByText("Menor")).toBeNull();
  });

  it("decisión 83: dice cuántos archivos del ZIP leyó; sin validación (el motor responde vacío) no se cae", async () => {
    const delZip = (nombre: string) => ({
      nombre,
      carpeta: "1. Administrativa",
    });
    const vista = pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      ...([ANALISIS, POSTULACION, undefined] as const),
      { ...VALIDACION, archivos: ["A.pdf", "B.pdf", "C.pdf"].map(delZip) },
    );
    expect(
      await screen.findByText(/leyó 3 archivos del ZIP/),
    ).toBeInTheDocument();
    vista.unmount();
    pintar(
      <ValidacionDeDocumentos oportunidadId={40} />,
      ...([ANALISIS, POSTULACION, undefined] as const),
      "",
    );
    expect(
      await screen.findByText(/La IA lee todo lo que va en el ZIP/),
    ).toBeInTheDocument();
  });
});
