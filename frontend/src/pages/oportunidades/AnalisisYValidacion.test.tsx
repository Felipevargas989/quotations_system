// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as exigenciasServicio from "../../services/exigencias.service";
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
  getAdjuntos: vi.fn(),
  getAnalisis: vi.fn(),
  pedirAnalisis: vi.fn(),
  getValidacion: vi.fn(),
  pedirValidacion: vi.fn(),
  getOferente: vi.fn(),
  actualizarOportunidad: vi.fn(),
}));
vi.mock("../../services/exigencias.service", () => ({
  marcarExigencia: vi.fn(),
}));

const s = vi.mocked(servicio);
const ex = vi.mocked(exigenciasServicio);

/** La carpeta de «Mi empresa»: la patente vigente y el inicio de
 *  actividades vencido antes del cierre. */
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

/** «Mi postulación»: el Anexo 1 firmado y el programa subido a mano. */
const POSTULACION = [
  { id: 10, nombre: "Anexo_N1_Identificacion.pdf", origen: "firmado" },
  { id: 11, nombre: "Programa de Probidad.pdf", origen: "subido" },
];

const FICHA = {
  estado: "en_estudio",
  exigencias_marcadas: {},
  proceso: { fecha_cierre: "2026-10-19T19:00:00.000Z" },
} as unknown as Parameters<typeof AnalisisDeBases>[0]["ficha"];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (ui: ReactElement, analisis: unknown = ANALISIS) => {
  s.getAnalisis.mockResolvedValue(analisis as never);
  s.getValidacion.mockResolvedValue(VALIDACION as never);
  s.getAdjuntos.mockImplementation((_id, seccion) =>
    Promise.resolve(
      (seccion === "postulacion" ? POSTULACION : [{ id: 1 }]) as never,
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

describe("Lo que piden las bases", () => {
  it("cómo te evalúan: de más peso a menos, con el % a la vista y el detalle plegado", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />);
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
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />);
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

  it("documentos a presentar: cada uno cruzado con tu carpeta y tu postulación", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />, {
      ...ANALISIS,
      resultado: {
        ...RESULTADO,
        documentos: [
          {
            nombre: "Formulario Anexo N°1 Identificación",
            parte: "administrativa",
            cuando: "con_la_oferta",
            obligatorio: true,
            condicion: "",
            carpeta: "formulario",
            pagina: 16,
          },
          {
            nombre: "Patente municipal",
            parte: "administrativa",
            cuando: "con_la_oferta",
            obligatorio: true,
            condicion: "",
            carpeta: "patente",
            pagina: 9,
          },
          {
            nombre: "Inicio de actividades",
            parte: "administrativa",
            cuando: "con_la_oferta",
            obligatorio: true,
            condicion: "",
            carpeta: "inicio_actividades",
            pagina: 9,
          },
          {
            nombre: "Programa de integridad",
            parte: "administrativa",
            cuando: "con_la_oferta",
            obligatorio: false,
            condicion: "",
            carpeta: "programa_integridad",
            pagina: 11,
          },
          {
            nombre: "Certificado DICOM",
            parte: "administrativa",
            cuando: "al_adjudicar",
            obligatorio: true,
            condicion: "emitido hace menos de 15 días",
            carpeta: "otro",
            pagina: 20,
          },
        ],
      },
    });
    // Espera la carpeta y la postulación, que se piden aparte.
    expect(
      await screen.findByText("Con la oferta: 3 de 4 listos"),
    ).toBeInTheDocument();
    const anexo = screen
      .getByText("Formulario Anexo N°1 Identificación")
      .closest("li") as HTMLElement;
    expect(within(anexo).getByText("Firmado")).toBeInTheDocument();
    const patente = screen
      .getByText("Patente municipal")
      .closest("li") as HTMLElement;
    expect(within(patente).getByText("En tu carpeta")).toBeInTheDocument();
    const inicio = screen
      .getByText("Inicio de actividades")
      .closest("li") as HTMLElement;
    expect(within(inicio).getByText("Vencido")).toBeInTheDocument();
    const programa = screen
      .getByText("Programa de integridad")
      .closest("li") as HTMLElement;
    expect(within(programa).getByText("En tu postulación")).toBeInTheDocument();
    // El DICOM va aparte: se pide al adjudicar, con su vigencia, y todavía
    // no va en rojo.
    const dicom = screen
      .getByText("Certificado DICOM")
      .closest("li") as HTMLElement;
    expect(within(dicom).getByText("Pendiente")).toBeInTheDocument();
    expect(
      screen.getByText("Al adjudicar o firmar el contrato"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/emitido hace menos de 15 días/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vuelve a analizar las bases/)).toBeNull();
    expect(screen.getByText(/costó US\$0,50/)).toBeInTheDocument();
  });

  it("un análisis sin checklist arma el de los documentos que nombra y pide volver a analizar", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />);
    expect(await screen.findByText("En tu postulación")).toBeInTheDocument();
    expect(screen.getByText(/Vuelve a analizar las bases/)).toBeInTheDocument();
    const boleta = screen
      .getByText("Boleta de garantía")
      .closest("li") as HTMLElement;
    expect(within(boleta).getByText("Falta")).toBeInTheDocument();
    const programa = screen
      .getByText("Programa de integridad")
      .closest("li") as HTMLElement;
    expect(within(programa).getByText("En tu postulación")).toBeInTheDocument();
  });

  it("un análisis anterior al 17-10 muestra sus avisos plegados y pide volver a analizar", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />, {
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

describe("Exigencias de la licitación", () => {
  const CON_TECNICOS = {
    ...RESULTADO,
    requisitos: [
      ...RESULTADO.requisitos,
      {
        que: "Cena con plateada o salmón",
        tipo: "tecnico",
        obligatorio: true,
        documento: "Bases.pdf",
        pagina: 19,
      },
      {
        que: "Exclusividad del recinto",
        tipo: "tecnico",
        obligatorio: true,
        documento: "Bases.pdf",
        pagina: 18,
      },
      {
        que: "Certificado de la SEREMI de Salud",
        tipo: "tecnico",
        obligatorio: true,
        documento: "Bases.pdf",
        pagina: 18,
      },
    ],
    cumplimiento: {
      resumen: "Tienes la cena; la exclusividad hay que revisarla.",
      agenda_de: "2026-10-30",
      items: [
        {
          requisito: 1,
          que: "Cena con plateada o salmón",
          estado: "tengo",
          con_que: "Menú guardado [Cena] Plateada",
          por_que: "",
        },
        {
          requisito: 2,
          que: "Exclusividad del recinto",
          estado: "conseguir",
          con_que: "",
          por_que: "Ese día tienes otro evento.",
        },
        {
          requisito: 3,
          que: "Certificado de la SEREMI de Salud",
          estado: "conseguir",
          con_que: "",
          por_que: "",
        },
      ],
    },
  };

  it("la lista con lo que sugiere la IA; los documentos van al checklist", async () => {
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />, {
      ...ANALISIS,
      resultado: CON_TECNICOS,
    });
    const cena = (
      await screen.findByText("Cena con plateada o salmón")
    ).closest("li") as HTMLElement;
    expect(within(cena).getByText("IA: Lo tienes")).toBeInTheDocument();
    expect(
      within(cena).getByText(/Con: Menú guardado \[Cena\] Plateada/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ese día tienes otro evento\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText("0 lo tienes · 0 no puedes · 2 por revisar"),
    ).toBeInTheDocument();
    // El certificado es un documento: no se marca como exigencia.
    const exigencias = screen
      .getByText("Exigencias de la licitación")
      .closest("div.p-3") as HTMLElement;
    expect(
      within(exigencias).queryByText("Certificado de la SEREMI de Salud"),
    ).toBeNull();
  });

  it("marcar ✓ lo tengo se guarda; ✗ no puedo ofrece desistir", async () => {
    ex.marcarExigencia.mockResolvedValueOnce({
      "cena con plateada o salmon": "lo_tengo",
    });
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />, {
      ...ANALISIS,
      resultado: CON_TECNICOS,
    });
    const cena = (
      await screen.findByText("Cena con plateada o salmón")
    ).closest("li") as HTMLElement;
    fireEvent.click(within(cena).getByRole("button", { name: /Lo tengo/ }));
    await waitFor(() =>
      expect(ex.marcarExigencia).toHaveBeenCalledWith(
        40,
        "cena con plateada o salmon",
        "lo_tengo",
      ),
    );
    cleanup();

    pintar(
      <AnalisisDeBases
        oportunidadId={40}
        ficha={{
          ...FICHA,
          exigencias_marcadas: { "exclusividad del recinto": "no_puedo" },
        }}
      />,
      { ...ANALISIS, resultado: CON_TECNICOS },
    );
    expect(
      await screen.findByText(/Marcaste que no puedes cumplir/),
    ).toBeInTheDocument();
    const exclusividad = screen
      .getByText("Exclusividad del recinto")
      .closest("li") as HTMLElement;
    expect(
      within(exclusividad).getByRole("button", { name: /No puedo/ }),
    ).toHaveAttribute("aria-pressed", "true");
    s.actualizarOportunidad.mockResolvedValueOnce({} as never);
    fireEvent.click(
      screen.getByRole("button", { name: "Desistir de esta licitación" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, desistir" }));
    await waitFor(() =>
      expect(s.actualizarOportunidad).toHaveBeenCalledWith(40, {
        estado: "descartada",
      }),
    );
  });

  it("dos marcas seguidas van de a una, en orden (19-10: se pisaban)", async () => {
    let soltarLaPrimera: (v: Record<string, string>) => void = () => {};
    ex.marcarExigencia
      .mockImplementationOnce(
        () =>
          new Promise((resolver) => {
            soltarLaPrimera = resolver;
          }) as never,
      )
      .mockResolvedValueOnce({
        "cena con plateada o salmon": "lo_tengo",
        "exclusividad del recinto": "no_puedo",
      });
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />, {
      ...ANALISIS,
      resultado: CON_TECNICOS,
    });
    const cena = (
      await screen.findByText("Cena con plateada o salmón")
    ).closest("li") as HTMLElement;
    const exclusividad = screen
      .getByText("Exclusividad del recinto")
      .closest("li") as HTMLElement;
    fireEvent.click(within(cena).getByRole("button", { name: /Lo tengo/ }));
    fireEvent.click(
      within(exclusividad).getByRole("button", { name: /No puedo/ }),
    );
    await waitFor(() => expect(ex.marcarExigencia).toHaveBeenCalledTimes(1));
    // La segunda espera a que el motor guarde la primera.
    await new Promise((r) => setTimeout(r, 50));
    expect(ex.marcarExigencia).toHaveBeenCalledTimes(1);
    soltarLaPrimera({ "cena con plateada o salmon": "lo_tengo" });
    await waitFor(() => expect(ex.marcarExigencia).toHaveBeenCalledTimes(2));
    expect(ex.marcarExigencia).toHaveBeenLastCalledWith(
      40,
      "exclusividad del recinto",
      "no_puedo",
    );
  });

  it("ya postulada no se desiste; sin exigencias técnicas no aparece", async () => {
    pintar(
      <AnalisisDeBases
        oportunidadId={40}
        ficha={{
          ...FICHA,
          estado: "postulada",
          exigencias_marcadas: { "exclusividad del recinto": "no_puedo" },
        }}
      />,
      { ...ANALISIS, resultado: CON_TECNICOS },
    );
    expect(
      await screen.findByText(/Marcaste que no puedes cumplir/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Desistir de esta licitación" }),
    ).toBeNull();
    cleanup();
    pintar(<AnalisisDeBases oportunidadId={40} ficha={FICHA} />);
    await screen.findByText("Cómo te evalúan");
    expect(screen.queryByText("Exigencias de la licitación")).toBeNull();
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
