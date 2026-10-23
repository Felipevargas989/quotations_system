// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FichaDeOportunidad } from "../../services/oportunidades.service";
import FichaEnUnaMirada from "./FichaEnUnaMirada";

// EL TÍTULO LARGO EN UNA LÍNEA (23-10). Felipe, con el catamarán: "esto se
// desordenó donde el título es muy grande"; de las dos maneras que vio,
// eligió la B: el título cortado con «…» en una línea, completo al pasar el
// mouse. Antes la fila se partía: el punto quedaba solo arriba y
// «Prioridad» solo abajo.

vi.mock("./useResponsables", () => ({ useResponsables: () => [] }));
vi.mock("./Ganadores", () => ({ default: () => null }));

afterEach(cleanup);

const NOMBRE =
  "Servicio de arriendo de catamarán, alojamiento para prensa y colaciones para el Sudamericano de Canotaje – Depto. de Deportes y Recreación";

const ficha = {
  id: 3219,
  codigo: "1346350-37-COT26",
  estado: "postulada",
  semaforo: "amarillo",
  alertas: ["comuna_cercana"],
  responsable_id: null,
  se_hace_en_el_complejo: null,
  historia_pendiente: 0,
  anterior: null,
  proceso: {
    codigo: "1346350-37-COT26",
    tipo: "compra_agil",
    nombre: NOMBRE,
    organismo: "MUNICIPALIDAD DE QUILLÓN",
    comuna: null,
    region: "Ñuble",
    monto: 7_150_000,
    fecha_publicacion: "2026-10-20T12:00:00Z",
    fecha_cierre: "2026-10-23T16:00:00Z",
  },
} as unknown as FichaDeOportunidad;

describe("La cabecera de la ficha con un título largo", () => {
  it("el título va en una sola línea, cortado, con el nombre completo al pasar el mouse; el punto y «Prioridad» quedan en su misma fila", () => {
    render(
      <FichaEnUnaMirada
        ficha={ficha}
        bases={null}
        guardando={false}
        onGuardar={vi.fn()}
      />,
    );
    const titulo = screen.getByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent(NOMBRE);
    expect(titulo).toHaveAttribute("title", NOMBRE);
    expect(titulo).toHaveClass("truncate", "min-w-0");
    const fila = titulo.parentElement!;
    expect(fila).not.toHaveClass("flex-wrap");
    expect(fila).toContainElement(screen.getByText("Prioridad"));
    expect(fila.firstElementChild).toHaveClass("shrink-0");
  });
});
