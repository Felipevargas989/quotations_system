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

  it("la razón de la prioridad va en violeta, nunca en amarillo; el alto valor ya no es prioridad (decisión 64)", () => {
    pintar(oportunidad({ alertas: ["comuna_cercana", "alto_valor"] }));
    const razon = screen.getByText("Comuna cercana");
    expect(razon.className).toContain("bg-violet-50");
    expect(razon.className).not.toMatch(/amber/);
    expect(screen.queryByText("Alto valor")).not.toBeInTheDocument();
  });

  it("el cierre va a la derecha junto a los botones, en rojo, en negrita y con reloj (decisión 116)", () => {
    pintar(oportunidad());
    const urgencia = screen.getByText("Cierra en 11 h");
    expect(urgencia.className).toContain("font-semibold");
    expect(urgencia.querySelector("svg")).not.toBeNull();
    const cierre = urgencia.closest("p");
    expect(cierre?.className).toContain("text-red-600");
    // En la misma columna que «Me interesa» y «Descartar».
    expect(cierre?.parentElement?.querySelector("button")?.textContent).toBe(
      "Me interesa",
    );
  });

  it("lo ya cerrado y lo que no informa cierre van en gris y sin reloj (decisión 116)", () => {
    pintar(
      oportunidad({
        proceso: {
          ...oportunidad().proceso,
          fecha_cierre: new Date(Date.now() - HORA).toISOString(),
        } as Oportunidad["proceso"],
      }),
    );
    const cerrada = screen.getByText("Cerrada");
    expect(cerrada.closest("p")?.className).toContain("text-gray-500");
    expect(cerrada.querySelector("svg")).toBeNull();

    cleanup();
    pintar(
      oportunidad({
        proceso: {
          ...oportunidad().proceso,
          fecha_cierre: null,
        } as Oportunidad["proceso"],
      }),
    );
    expect(
      screen.getByText("Sin cierre informado").closest("p")?.className,
    ).toContain("text-gray-500");
  });

  it("sin «Ver resumen»: la fila entera abre el resumen; una seguida dice en qué va en Mercado Público (19-10)", () => {
    pintar(
      oportunidad({
        estado: "seguida",
        proceso: {
          ...oportunidad().proceso,
          estado: "Cerrada",
        } as Oportunidad["proceso"],
      }),
    );
    expect(
      screen.queryByRole("button", { name: /Ver resumen/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("En seguimiento · Mercado Público: Cerrada"),
    ).toBeInTheDocument();
  });

  it("lo que dijo el revisor va primero: «Bases leídas» en verde si se puede, «No es para ti» en burdeo si piden otro lugar, y nada sin leer (decisión 129)", () => {
    pintar(
      oportunidad({ segun_las_bases: true, se_hace_en_el_complejo: "si" }),
    );
    const leidas = screen.getByText("Bases leídas");
    expect(leidas.className).toContain("bg-emerald-50");
    // Antes que la comuna cercana: siempre en el mismo lugar.
    expect(
      leidas.compareDocumentPosition(screen.getByText("Comuna cercana")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("No es para ti")).not.toBeInTheDocument();

    cleanup();
    pintar(
      oportunidad({
        semaforo: "rojo",
        segun_las_bases: true,
        se_hace_en_el_complejo: "no",
        razon: "Según las bases, piden el servicio en el gimnasio municipal.",
      }),
    );
    expect(screen.getByText("No es para ti").className).toContain(
      "bg-rose-900",
    );
    expect(
      screen.getByText(
        "Según las bases, piden el servicio en el gimnasio municipal.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bases leídas")).not.toBeInTheDocument();

    cleanup();
    pintar(oportunidad({ se_hace_en_el_complejo: "si" }));
    expect(screen.queryByText("Bases leídas")).not.toBeInTheDocument();
    expect(screen.queryByText("No es para ti")).not.toBeInTheDocument();

    // La lectura corta que no está segura (decisión 132): leída, sigue.
    cleanup();
    pintar(
      oportunidad({ segun_las_bases: true, se_hace_en_el_complejo: "dudoso" }),
    );
    expect(screen.getByText("Bases leídas")).toBeInTheDocument();
    expect(screen.queryByText("No es para ti")).not.toBeInTheDocument();
  });
});
