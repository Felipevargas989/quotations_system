// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/postulacion.service";
import type { DatosDeRespaldo } from "../../services/postulacion.service";
import RespaldoDeExperiencia from "./RespaldoDeExperiencia";
import {
  esOrdenDeCompra,
  RESPALDO_VACIO,
  resumenDelRespaldo,
} from "./respaldos";

// LOS RESPALDOS DE EXPERIENCIA (decisión 34, 19-10): con el número de una
// orden de compra, Eventia trae el resto de su ficha pública.

vi.mock("../../services/postulacion.service", () => ({
  leerOrdenDeCompra: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

let ultimo: DatosDeRespaldo = RESPALDO_VACIO;
function Envoltura() {
  const [datos, setDatos] = useState<DatosDeRespaldo>(RESPALDO_VACIO);
  ultimo = datos;
  return <RespaldoDeExperiencia datos={datos} onChange={setDatos} />;
}

describe("El respaldo de experiencia", () => {
  it("con un número de orden de compra trae mandante, contrato, año y monto, y avisa si es de otro proveedor", async () => {
    s.leerOrdenDeCompra.mockResolvedValue({
      orden: {
        numero: "4352-103-SE23",
        contrato:
          "CONTRATACION SERVICIO DE COCTELERIA Y CENA BAILABLE DIA DEL FUNCIONARIO",
        mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
        unidad: "ADQUISICIONES Y FINANZAS",
        fecha: "2023-10-20",
        anio: 2023,
        monto: 11_782_499,
        estado: "Aceptada",
        licitacion: "4352-18-LE23",
        rut_proveedor: "77.701.305-K",
      },
      aviso: "Esta orden de compra es de otro proveedor (RUT 77.701.305-K).",
    });
    render(<Envoltura />);
    const boton = screen.getByRole("button", {
      name: "Completar desde Mercado Público",
    });
    expect(boton).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText("N° de orden de compra o de factura"),
      { target: { value: "4352-103-se23" } },
    );
    expect(boton).toBeEnabled();
    fireEvent.click(boton);

    await waitFor(() =>
      expect(ultimo).toEqual({
        numero: "4352-103-SE23",
        mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
        contrato:
          "CONTRATACION SERVICIO DE COCTELERIA Y CENA BAILABLE DIA DEL FUNCIONARIO",
        anio: 2023,
        monto: 11_782_499,
        fuente: "mercado_publico",
      }),
    );
    expect(s.leerOrdenDeCompra).toHaveBeenCalledWith("4352-103-se23");
    expect(
      screen.getByText(
        "Esta orden de compra es de otro proveedor (RUT 77.701.305-K).",
      ),
    ).toBeInTheDocument();
  });

  it("una factura no es orden de compra: se escribe a mano", () => {
    expect(esOrdenDeCompra("4352-103-SE23")).toBe(true);
    expect(esOrdenDeCompra(" 1030177-163-ag23 ")).toBe(true);
    expect(esOrdenDeCompra("F-1520")).toBe(false);
    expect(
      resumenDelRespaldo({
        numero: "4352-103-SE23",
        mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
        contrato: "Cena",
        anio: 2023,
        monto: 11_782_499,
        fuente: "mercado_publico",
      }),
    ).toBe(
      "N° 4352-103-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · 2023 · $11.782.499",
    );
  });
});
