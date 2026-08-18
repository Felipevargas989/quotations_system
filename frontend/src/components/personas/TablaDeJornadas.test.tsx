// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TablaDeJornadas, { tituloDelMonto } from "./TablaDeJornadas";
import type { Asignacion } from "../../types/people.types";

// LA TABLA DE JORNADAS (Felipe, 18-08): una sola tabla con títulos para
// las dos pantallas de liquidación. Estos tests fijan lo que la ordena.

const fila = (extra: Partial<Asignacion>): Asignacion =>
  ({
    id: 1,
    company_id: 1,
    quotation_id: null,
    person_id: 1,
    day: "2026-08-18",
    kind: "planta",
    role_id: 1,
    amount: null,
    status: "confirmado",
    starts_at: "09:00:00",
    ends_at: "19:00:00",
    break_minutes: 60,
    tip_amount: null,
    no_tip: false,
    people: { id: 1, name: "Camila Carvajal", rut: null, default_kind: "planta" },
    management_resources: { id: 1, name: "Administrador" },
    ...extra,
  }) as unknown as Asignacion;

afterEach(cleanup);

describe("tituloDelMonto", () => {
  it("solo planta → Asignación extra; solo freelance → Jornada; mezcla → Monto", () => {
    expect(tituloDelMonto([fila({ kind: "planta" })])).toBe("Asignación extra");
    expect(tituloDelMonto([fila({ kind: "freelance" })])).toBe("Jornada");
    expect(
      tituloDelMonto([fila({ kind: "planta" }), fila({ id: 2, kind: "freelance" })]),
    ).toBe("Monto");
  });
});

describe("TablaDeJornadas", () => {
  it("pinta los títulos de columna y la fila con sus datos", () => {
    render(
      <TablaDeJornadas
        secciones={[{ filas: [fila({})] }]}
        onCambiar={vi.fn()}
        onSacar={vi.fn()}
      />,
    );
    for (const t of ["Persona", "Cargo", "Entrada", "Salida", "Colación", "Horas", "Propina"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText("Asignación extra")).toBeInTheDocument();
    expect(screen.getByText("Camila Carvajal")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    // 09:00–19:00 con 1 h de colación son 9 h.
    expect(screen.getByText("9 h")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sin propina" })).toBeInTheDocument();
  });

  it("el chip sin propina llama a onCambiar con no_tip invertido", async () => {
    const onCambiar = vi.fn();
    render(
      <TablaDeJornadas
        secciones={[{ filas: [fila({ id: 7, no_tip: false })] }]}
        onCambiar={onCambiar}
        onSacar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "sin propina" }));
    expect(onCambiar).toHaveBeenCalledWith(7, { no_tip: true });
  });

  it("sacar pide confirmar antes de llamar a onSacar", async () => {
    const onSacar = vi.fn();
    render(
      <TablaDeJornadas
        secciones={[{ filas: [fila({ id: 9 })] }]}
        onCambiar={vi.fn()}
        onSacar={onSacar}
        preguntaSacar={(n) => `¿${n} no se presentó?`}
        textoSacar="Sacar del día"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Sacar a Camila/ }));
    expect(onSacar).not.toHaveBeenCalled();
    expect(screen.getByText("¿Camila Carvajal no se presentó?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sacar del día" }));
    expect(onSacar).toHaveBeenCalledWith(9);
  });

  it("cerrada: solo se lee — sin relojes, sin caja de monto, sin papelera", () => {
    render(
      <TablaDeJornadas
        secciones={[{ filas: [fila({ amount: 10000, no_tip: true })] }]}
        cerrada
        onCambiar={vi.fn()}
        onSacar={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Entrada de/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Asignación extra de/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sacar a/ })).not.toBeInTheDocument();
    expect(screen.getByText("$10.000")).toBeInTheDocument();
    expect(screen.getByText("sin propina")).toBeInTheDocument();
  });

  it("varias secciones: el título del día una vez por sección, los encabezados una sola vez", () => {
    render(
      <TablaDeJornadas
        secciones={[
          { titulo: "sáb 14 ago", filas: [fila({ id: 1 })] },
          { titulo: "dom 15 ago", filas: [fila({ id: 2 })] },
        ]}
        onCambiar={vi.fn()}
        onSacar={vi.fn()}
      />,
    );
    expect(screen.getByText("sáb 14 ago")).toBeInTheDocument();
    expect(screen.getByText("dom 15 ago")).toBeInTheDocument();
    expect(screen.getAllByText("Persona")).toHaveLength(1);
  });
});
