// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Oportunidad } from "../../services/oportunidades.service";
import FilaDeOportunidad from "./FilaDeOportunidad";

// LA BANDEJA, UN COLOR POR SIGNIFICADO (19-10, decisión 31; Felipe: "el
// amarillo de los prioritarios se mezcla con el amarillo del semáforo").

const HORA = 3_600_000;

const oportunidad = (extra: Partial<Oportunidad> = {}): Oportunidad =>
  ({
    id: 87,
    codigo: "4364-13-LE26",
    semaforo: "verde",
    etiquetas: ["evento"],
    alertas: ["comuna_cercana"],
    razon: "Celebración para un grupo cerrado.",
    estado: "nueva",
    anterior: null,
    proceso: {
      tipo: "licitacion",
      nombre: "Producción de Evento día del Profesor",
      organismo: "I MUNICIPALIDAD DE QUILLON",
      monto: null,
      region: "Región del Ñuble",
      fecha_cierre: new Date(Date.now() + 11 * HORA).toISOString(),
    },
    ...extra,
  }) as unknown as Oportunidad;

const pintar = (o: Oportunidad) =>
  render(
    <MemoryRouter>
      <ul>
        <FilaDeOportunidad
          o={o}
          ocupado={false}
          onDecidir={vi.fn()}
          onAbrir={vi.fn()}
        />
      </ul>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("Una fila de la bandeja", () => {
  it("el semáforo es la franja y la tinta de la fila, y se dice para quien no la ve", () => {
    pintar(oportunidad());
    const fila = screen.getByRole("listitem");
    expect(fila).toHaveAttribute("data-semaforo", "verde");
    expect(fila.className).toContain("border-l-green-500");
    expect(fila.className).toContain("bg-green-50/70");
    expect(screen.getByText("Verde.")).toHaveClass("sr-only");

    cleanup();
    pintar(oportunidad({ semaforo: "amarillo" }));
    expect(screen.getByRole("listitem").className).toContain(
      "border-l-amber-400",
    );
  });

  it("las razones de la prioridad van en violeta, nunca en amarillo", () => {
    pintar(oportunidad({ alertas: ["comuna_cercana", "alto_valor"] }));
    for (const razon of ["Comuna cercana", "Alto valor"]) {
      expect(screen.getByText(razon).className).toContain("bg-violet-50");
      expect(screen.getByText(razon).className).not.toMatch(/amber/);
    }
  });

  it("lo que cierra pronto va con reloj y sin rojo: el rojo es de las rojas", () => {
    pintar(oportunidad());
    const urgencia = screen.getByText(/cierra en 11 h/);
    expect(urgencia.className).toContain("font-semibold");
    expect(urgencia.className).not.toMatch(/red/);
    expect(urgencia.querySelector("svg")).not.toBeNull();
  });
});
