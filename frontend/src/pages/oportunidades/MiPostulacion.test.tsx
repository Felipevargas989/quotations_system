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
import * as servicio from "../../services/oportunidades.service";
import { sinFirmarDeLaUltimaVuelta, sinLosWordYaFirmados } from "./firmarTodos";
import MiPostulacion from "./MiPostulacion";

// MI POSTULACIÓN (19-10): «Firmar» en cada Word sin firma y «Firmar todos»
// para lo último que hizo la IA; cada firmado queda en PDF. Desde la
// decisión 79 (26-10) es «2 Tus documentos»: cada uno con su estado y,
// debajo, lo que falta o hay que revisar.

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  getGeneraciones: vi.fn(),
  getValidacion: vi.fn().mockResolvedValue(null),
  firmarDocumentos: vi.fn(),
  subirAdjunto: vi.fn(),
  borrarAdjunto: vi.fn(),
}));
vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../../components/FileViewLink", () => ({ default: () => null }));
vi.mock("./descargas", () => ({ descargarDelBalde: vi.fn() }));
vi.mock("./EditorDeWord", () => ({
  default: ({ adjunto }: { adjunto: servicio.AdjuntoDeOportunidad }) => (
    <p>Editando {adjunto.nombre}</p>
  ),
}));
const s = vi.mocked(servicio);

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<servicio.AdjuntoDeOportunidad> = {},
) =>
  ({
    id,
    nombre,
    ruta: `c1/oportunidades/40/postulacion/x_${id}`,
    tipo: "",
    bytes: 1000,
    seccion: "postulacion",
    origen: "generado",
    viene_de: 6,
    creado_en: "2026-10-19T17:00:00.000Z",
    subido_por: null,
    quien: null,
    ...extra,
  }) as servicio.AdjuntoDeOportunidad;

const POSTULACION = [
  archivo(21, "Formulario N°1 - Identificación del oferente - lleno.docx"),
  archivo(22, "Formulario N°2 - Declaración jurada - lleno.docx"),
  archivo(23, "Formulario N°3 - Experiencia - lleno.docx"),
  archivo(24, "Formulario N°1 - Identificación del oferente - firmado.pdf", {
    origen: "firmado",
    viene_de: 21,
  }),
  // De una vuelta anterior: no entra en «Firmar todos».
  archivo(9, "Formularios_Anexos - lleno.docx"),
];

const GENERACIONES = {
  anexos: {
    id: 30,
    tipo: "anexos",
    estado: "listo",
    resultado: {
      documentos: [21, 22, 23].map((adjunto_id) => ({
        adjunto_id,
        nombre: "",
        que_se_hizo: "",
        pendientes:
          adjunto_id === 22
            ? [
                "RUT del representante legal: quedó en blanco.",
                "Firma del representante legal.",
              ]
            : [],
      })),
    },
  },
  firma: null,
  propuesta: null,
} as unknown as servicio.GeneracionesDeOportunidad;

beforeEach(() => {
  s.getAdjuntos.mockResolvedValue(POSTULACION);
  s.getGeneraciones.mockResolvedValue(GENERACIONES);
  s.firmarDocumentos.mockResolvedValue({
    id: 31,
    tipo: "firma",
    estado: "procesando",
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (congelada = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MiPostulacion oportunidadId={40} congelada={congelada} />
    </QueryClientProvider>,
  );

describe("Mi postulación", () => {
  it("«Tus documentos»: cada uno con su estado y, debajo, lo que falta (decisión 79)", async () => {
    pintar();
    expect(await screen.findByText("1 de 4 firmados.")).toBeInTheDocument();
    expect(screen.getByText("firmado")).toBeInTheDocument();
    expect(screen.getByText("por completar")).toBeInTheDocument();
    // El 23 y el de antes, sin nada pendiente.
    expect(screen.getAllByText("por firmar")).toHaveLength(2);
    expect(
      screen.getByText("RUT del representante legal: quedó en blanco."),
    ).toBeInTheDocument();
    // La línea de firma de la IA no se repite: va una sola, al final.
    expect(screen.queryByText("Firma del representante legal.")).toBeNull();
    expect(screen.getByText("Falta la firma.")).toBeInTheDocument();
  });

  it("«Abrir» muestra el Word sin firmar para verlo y editarlo (decisión 78)", async () => {
    pintar();
    const botones = await screen.findAllByRole("button", { name: "Abrir" });
    // Los Word sin firmar (22, 23 y el de antes); el PDF firmado no.
    expect(botones).toHaveLength(3);
    fireEvent.click(botones[0]);
    expect(
      await screen.findByText(
        "Editando Formulario N°2 - Declaración jurada - lleno.docx",
      ),
    ).toBeInTheDocument();
  });

  it("postulada, ya no se abre para editar", async () => {
    pintar(true);
    await screen.findAllByRole("button", { name: /^Firmar$/ });
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("«Firmar todos» firma lo último que hizo la IA que no está firmado", async () => {
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Firmar todos \(2\)/ }),
    );
    expect(s.firmarDocumentos).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /A cada uno se le pone la foto de la firma y queda en PDF/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, firmar todos" }));
    await waitFor(() =>
      expect(s.firmarDocumentos).toHaveBeenCalledWith(40, [22, 23]),
    );
  });

  it("lo que se firma de la última vuelta: sin los ya firmados ni los de antes", () => {
    expect(sinFirmarDeLaUltimaVuelta(GENERACIONES, POSTULACION)).toEqual([
      22, 23,
    ]);
    expect(sinFirmarDeLaUltimaVuelta(null, POSTULACION)).toEqual([]);
  });

  it("el Word ya firmado no se ve: queda su PDF firmado (decisión 57)", async () => {
    expect(sinLosWordYaFirmados(POSTULACION).map((a) => a.id)).toEqual([
      22, 23, 24, 9,
    ]);
    pintar();
    expect(
      await screen.findByText(
        /Formulario N°1 - Identificación del oferente - firmado/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Formulario N°1 - Identificación del oferente - lleno/,
      ),
    ).toBeNull();
    // Si se borra el firmado, el Word vuelve a aparecer para firmarlo.
    expect(
      sinLosWordYaFirmados(POSTULACION.filter((a) => a.id !== 24)).map(
        (a) => a.id,
      ),
    ).toContain(21);
  });
});
