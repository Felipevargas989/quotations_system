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
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as experiencia from "../../services/experiencia.service";
import * as memoria from "../../services/loQueSabemos.service";
import * as servicio from "../../services/oportunidades.service";
import * as postulacion from "../../services/postulacion.service";
import ArmarPostulacion from "./ArmarPostulacion";
import LoQueSabemosDeTuEmpresa from "./LoQueSabemosDeTuEmpresa";
import PreguntasDeLaLicitacion from "./PreguntasDeLaLicitacion";

// LAS PREGUNTAS ANTES DE ARMAR Y «LO QUE EVENTIA SABE DE TU EMPRESA»
// (decisión 119, parte 3, 07-11). Felipe: "vuelvo a la licitación, me
// aparece el modal de lo que me falta, yo respondo las preguntas y lo
// genera. Pero una vez que ya lo generó, en la siguiente cotización no me
// vuelve a preguntar si tengo ramplas".

vi.mock("../../services/oportunidades.service", () => ({
  getAnalisis: vi.fn(),
  getOferente: vi.fn(),
  getGeneraciones: vi.fn(),
  generarAnexos: vi.fn(),
  crearPropuestaTecnica: vi.fn(),
  getCotizacionDeLaPostulacion: vi.fn(),
}));
vi.mock("../../services/postulacion.service", () => ({
  armarPostulacion: vi.fn(),
  getOfertaDeLaPostulacion: vi.fn(),
  responderYArmar: vi.fn(),
}));
vi.mock("../../services/experiencia.service", () => ({
  getExperiencia: vi.fn(),
}));
vi.mock("../../services/loQueSabemos.service", () => ({
  getLoQueSabemos: vi.fn(),
  cambiarLoQueSabemos: vi.fn(),
  borrarLoQueSabemos: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);
const p = vi.mocked(postulacion);
const x = vi.mocked(experiencia);
const m = vi.mocked(memoria);

const PREGUNTAS = [
  {
    clave: "recinto con rampa de acceso universal",
    exigencia: "Recinto con rampa de acceso universal",
    pregunta: "¿Tienes rampa de acceso para sillas de ruedas?",
  },
  {
    clave: "vasos de color amarillo",
    exigencia: "Vasos de color amarillo",
    pregunta: "Vasos de color amarillo",
  },
];

/** El armado detenido sin oferta todavía: una fila en «error», sin
 *  oferta, con el precio y las preguntas. */
const DETENIDA = {
  id: 30,
  estado: "error",
  error: "Faltan 2 respuestas sobre tu empresa.",
  creado_en: "2026-11-07T17:00:00.000Z",
  terminado_en: "2026-11-07T17:00:05.000Z",
  parametros: { detenida: { total: 1_190_000, preguntas: PREGUNTAS } },
  resultado: null,
};

beforeEach(() => {
  s.getAnalisis.mockResolvedValue({
    id: 1,
    estado: "listo",
    resultado: { formularios: [] },
  } as never);
  s.getOferente.mockResolvedValue({
    oferente: { razon_social: "VALLE DEL SOL", rut: "77.701.305-K" },
  } as never);
  s.getGeneraciones.mockResolvedValue({
    anexos: null,
    firma: null,
    propuesta: null,
  });
  s.getCotizacionDeLaPostulacion.mockResolvedValue({
    cotizacion: null,
    presupuesto: null,
    propuesta: null,
    faltan: [],
    fechas: null,
  });
  x.getExperiencia.mockResolvedValue({ piden: false, trabajo: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conTodo = (hijo: ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{hijo}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("Las preguntas antes de armar", () => {
  it("al volver a la licitación se abre solo, y responder arma con el precio", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue(DETENIDA as never);
    p.responderYArmar.mockResolvedValue({
      id: 31,
      estado: "procesando",
      creado_en: "2026-11-07T17:01:00.000Z",
      terminado_en: null,
      parametros: { postulacion: { total: 1_190_000, propuesta: true } },
      resultado: null,
    } as never);
    conTodo(<ArmarPostulacion oportunidadId={40} />);

    expect(
      await screen.findByText("Antes de armar, responde esto"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Faltan 2 respuestas sobre tu empresa para armar."),
    ).toBeInTheDocument();
    // Las palabras de las bases, solo si la pregunta las cambió.
    expect(
      screen.getByText("Las bases: «Recinto con rampa de acceso universal»"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Las bases: «Vasos de color amarillo»")).toBe(
      null,
    );

    const guardar = screen.getByRole("button", { name: "Guardar y armar" });
    expect(guardar).toBeDisabled();
    const [tengo] = screen.getAllByRole("button", { name: "Lo tengo" });
    fireEvent.click(tengo);
    fireEvent.change(
      screen.getByLabelText(
        "Detalle de «¿Tienes rampa de acceso para sillas de ruedas?»",
      ),
      { target: { value: " en la entrada principal " } },
    );
    expect(guardar).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "No puedo" })[1]);
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);

    await waitFor(() =>
      expect(p.responderYArmar).toHaveBeenCalledWith(40, 1_190_000, [
        {
          clave: PREGUNTAS[0].clave,
          pregunta: PREGUNTAS[0].pregunta,
          exigencia: PREGUNTAS[0].exigencia,
          respuesta: "lo_tengo",
          detalle: "en la entrada principal",
        },
        {
          clave: PREGUNTAS[1].clave,
          pregunta: PREGUNTAS[1].pregunta,
          exigencia: PREGUNTAS[1].exigencia,
          respuesta: "no_puedo",
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByText("Antes de armar, responde esto")).toBe(null),
    );
  });

  it("un «No puedo» por una parte dice que lo demás se ofrece, y manda la parte (decisión 121)", async () => {
    // La 2656-97-LE26: el modal preguntó solo por los baños del salón.
    const SALON = {
      clave: "salon de cena: escenario y banos para personas con discapacidad",
      exigencia:
        "Salón de cena: escenario y baños para personas con discapacidad",
      pregunta:
        "¿Tienes baños para personas con discapacidad junto al salón de cena?",
      parte: "los baños para personas con discapacidad",
    };
    p.getOfertaDeLaPostulacion.mockResolvedValue({
      ...DETENIDA,
      parametros: { detenida: { total: 1_190_000, preguntas: [SALON] } },
    } as never);
    p.responderYArmar.mockResolvedValue({
      id: 31,
      estado: "procesando",
      creado_en: "2026-11-09T05:00:00.000Z",
      terminado_en: null,
      parametros: { postulacion: { total: 1_190_000, propuesta: true } },
      resultado: null,
    } as never);
    conTodo(<ArmarPostulacion oportunidadId={40} />);

    await screen.findByText("Antes de armar, responde esto");
    expect(screen.queryByText(/Se ofrece todo lo demás/)).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: "No puedo" }));
    expect(
      screen.getByText(
        "Se ofrece todo lo demás, sin los baños para personas con discapacidad.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y armar" }));

    await waitFor(() =>
      expect(p.responderYArmar).toHaveBeenCalledWith(40, 1_190_000, [
        {
          clave: SALON.clave,
          pregunta: SALON.pregunta,
          exigencia: SALON.exigencia,
          respuesta: "no_puedo",
          parte: SALON.parte,
        },
      ]),
    );
  });

  it("«Ahora no» lo cierra y «Responder» lo vuelve a abrir", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue(DETENIDA as never);
    conTodo(<ArmarPostulacion oportunidadId={40} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ahora no" }));
    expect(screen.queryByText("Antes de armar, responde esto")).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect(
      screen.getByText("Antes de armar, responde esto"),
    ).toBeInTheDocument();
    expect(p.responderYArmar).not.toHaveBeenCalled();
  });

  it("en la página: «Responder» le pide el modal a la página, que lo abre una vez por visita", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue(DETENIDA as never);
    const responder = vi.fn();
    conTodo(<ArmarPostulacion oportunidadId={40} onResponder={responder} />);
    fireEvent.click(await screen.findByRole("button", { name: "Responder" }));
    expect(responder).toHaveBeenCalledTimes(1);
    // El modal no es de «Armar postulación»: lo muestra la página.
    expect(screen.queryByText("Antes de armar, responde esto")).toBe(null);
  });

  it("la página lo abre sola al entrar, en la pestaña que sea, y una sola vez", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue(DETENIDA as never);
    const abrir = vi.fn();
    const ficha = {
      id: 40,
      estado: "en_estudio",
      exigencias_marcadas: {},
    } as never;
    const { rerender } = conTodo(
      <PreguntasDeLaLicitacion
        ficha={ficha}
        abierta={false}
        onAbrir={abrir}
        onCerrar={vi.fn()}
      />,
    );
    await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PreguntasDeLaLicitacion
            ficha={ficha}
            abierta
            onAbrir={abrir}
            onCerrar={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("al volver a armar, lo armado antes sigue a la vista y el aviso va debajo", async () => {
    // Lo armado antes: la oferta y sus documentos, listos.
    const listo = (id: number) => ({
      id,
      estado: "listo",
      creado_en: "2026-11-07T17:01:00.000Z",
      terminado_en: "2026-11-07T17:05:00.000Z",
      parametros: {},
      resultado: null,
    });
    s.getGeneraciones.mockResolvedValue({
      anexos: listo(50),
      firma: null,
      propuesta: listo(51),
    } as never);
    p.getOfertaDeLaPostulacion.mockResolvedValue({
      ...DETENIDA,
      id: 25,
      estado: "listo",
      error: null,
      parametros: {
        postulacion: { total: 990_000, propuesta: true },
        detenida: { total: 1_190_000, preguntas: PREGUNTAS },
      },
    } as never);
    conTodo(<ArmarPostulacion oportunidadId={40} />);
    expect(
      await screen.findByText("Antes de armar, responde esto"),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$990\.000 con IVA/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Volver a armar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Faltan 2 respuestas sobre tu empresa para armar."),
    ).toBeInTheDocument();
  });

  it("lo marcado en «Bases y criterios» ya no se pregunta", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue(DETENIDA as never);
    conTodo(
      <ArmarPostulacion
        oportunidadId={40}
        marcas={{ [PREGUNTAS[0].clave]: "lo_tengo" }}
      />,
    );
    expect(
      await screen.findByText("Falta 1 respuesta sobre tu empresa para armar."),
    ).toBeInTheDocument();
    expect(screen.queryByText(PREGUNTAS[0].pregunta)).toBe(null);
    expect(screen.getAllByText(PREGUNTAS[1].pregunta).length).toBeGreaterThan(
      0,
    );
  });

  it("al apretar «Armar postulación» y faltar respuestas, abre el modal al tiro", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue(null);
    p.armarPostulacion.mockResolvedValue(DETENIDA as never);
    conTodo(<ArmarPostulacion oportunidadId={40} />);
    fireEvent.change(await screen.findByLabelText("Precio total, con IVA"), {
      target: { value: "1190000" },
    });
    const armar = screen.getByRole("button", { name: "Armar postulación" });
    await waitFor(() => expect(armar).toBeEnabled());
    fireEvent.click(armar);
    expect(
      await screen.findByText("Antes de armar, responde esto"),
    ).toBeInTheDocument();
  });
});

describe("Lo que Eventia sabe de tu empresa", () => {
  const RAMPA = {
    id: 7,
    clave: "rampa",
    pregunta: "¿Tienes rampa de acceso para sillas de ruedas?",
    exigencia: "Recinto con rampa de acceso universal",
    respuesta: "lo_tengo" as const,
    detalle: "en la entrada principal",
    oportunidad_id: 40,
    oportunidad: { codigo: "2705-1740-COT26" },
    creado_en: "2026-11-07T17:00:00.000Z",
    actualizado_en: "2026-11-07T17:00:00.000Z",
  };

  it("muestra cada respuesta con su detalle y de qué licitación salió", async () => {
    m.getLoQueSabemos.mockResolvedValue([RAMPA]);
    conTodo(<LoQueSabemosDeTuEmpresa />);
    expect(await screen.findByText(RAMPA.pregunta)).toBeInTheDocument();
    expect(screen.getByText(/en la entrada principal/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "2705-1740-COT26" }),
    ).toHaveAttribute("href", "/oportunidades/40");
    expect(screen.getByRole("button", { name: /Lo tengo/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("se cambia la respuesta y el detalle, y se borra con confirmación", async () => {
    m.getLoQueSabemos.mockResolvedValue([RAMPA]);
    m.cambiarLoQueSabemos.mockImplementation(async (id, cambios) => ({
      ...RAMPA,
      ...cambios,
      id,
    }));
    m.borrarLoQueSabemos.mockResolvedValue(undefined);
    conTodo(<LoQueSabemosDeTuEmpresa />);

    fireEvent.click(await screen.findByRole("button", { name: /No puedo/ }));
    await waitFor(() =>
      expect(m.cambiarLoQueSabemos).toHaveBeenCalledWith(7, {
        respuesta: "no_puedo",
      }),
    );
    // Apretar la ya marcada no la deja en blanco.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /No puedo/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /No puedo/ }));
    expect(m.cambiarLoQueSabemos).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    fireEvent.change(screen.getByLabelText(`Detalle de «${RAMPA.pregunta}»`), {
      target: { value: "solo en el salón chico" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(m.cambiarLoQueSabemos).toHaveBeenLastCalledWith(7, {
        detalle: "solo en el salón chico",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: `Borrar «${RAMPA.pregunta}»` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(m.borrarLoQueSabemos).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText(RAMPA.pregunta)).toBe(null));
  });

  it("sin respuestas, lo dice", async () => {
    m.getLoQueSabemos.mockResolvedValue([]);
    conTodo(<LoQueSabemosDeTuEmpresa />);
    expect(await screen.findByText(/Todavía nada/)).toBeInTheDocument();
  });
});
