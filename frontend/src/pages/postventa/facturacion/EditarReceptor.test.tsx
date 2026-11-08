// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BorradorDelDte,
  DtePedido,
} from "../../../services/facturas.service";
import EditarReceptor from "./EditarReceptor";

// El RUT que llena todo (§9.27) tiene sus propias pruebas.
vi.mock("../../../services/facturas.service", () => ({
  buscarRazonSocial: vi.fn().mockResolvedValue(null),
}));

// LAS REFERENCIAS DEL DTE (doc 19 §9.20). Felipe, 05-11: el tipo en su
// caja, la fecha bajo su título, «+ Agregar referencia» como un botón azul
// chico y sin el check de «pedirla siempre» («no tiene sentido»).

afterEach(cleanup);

const PEDIDA: DtePedido = {
  tipo: 33,
  orden_de_compra_id: 1,
  receptor: {
    rut: "65175242-6",
    razon_social: "Corporación Centro de Formación Técnica Santo Tomás",
    giro: "EDUCACION",
    direccion: "Av. Vicuña Mackenna 4835",
    comuna: "San Joaquín",
    ciudad: "Santiago",
    correo: null,
  },
  lineas: [],
  referencias: [{ tipo: "801", folio: "33000132941", fecha: "2026-10-14" }],
  pedir_siempre: ["801"],
};

const abrir = (poner = vi.fn()) => {
  render(
    <EditarReceptor
      pedida={PEDIDA}
      inicial={{ razones: [] } as unknown as BorradorDelDte}
      otra={false}
      elegirLaRazon={false}
      poner={poner}
      ponerReceptor={vi.fn()}
      elegirRazon={vi.fn()}
    />,
  );
  return poner;
};

describe("Las referencias", () => {
  it("van en columnas con su título, y el tipo en su caja", () => {
    abrir();
    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.getByText("Folio")).toBeInTheDocument();
    expect(screen.getByText("Fecha")).toBeInTheDocument();
    expect(screen.getByText("Motivo (opcional)")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /801 · Orden de compra/ }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("33000132941")).toBeInTheDocument();
  });

  it("«+ Agregar referencia» suma la que sigue, sin N° ni fecha", () => {
    const poner = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Agregar referencia" }));
    expect(poner).toHaveBeenCalledWith({
      referencias: [
        { tipo: "801", folio: "33000132941", fecha: "2026-10-14" },
        { tipo: "802", folio: "", fecha: "" },
      ],
    });
  });
});
