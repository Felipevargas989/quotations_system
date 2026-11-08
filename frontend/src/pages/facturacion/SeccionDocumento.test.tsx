// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DtePedido, VistaPrevia } from "../../services/facturas.service";
import SeccionDocumento from "./SeccionDocumento";

// LA SECCIÓN «DOCUMENTO» (doc 19 §9.32): el tipo, de dónde se llena, la
// fecha de emisión con su rango y la condición de pago, en listas.

afterEach(() => cleanup());

const PEDIDA: DtePedido = {
  tipo: 33,
  orden_de_compra_id: null,
  receptor: {
    rut: "",
    razon_social: "",
    giro: null,
    direccion: null,
    comuna: null,
    ciudad: null,
    correo: null,
  },
  lineas: [],
  referencias: [],
  pedir_siempre: [],
  forma_de_pago: 2,
  plazo_dias: 30,
};

const VISTA = {
  fecha: "2026-11-08",
  pago: { forma: 2, dias: 30, vencimiento: "2026-12-08" },
  emision: { desde: "2026-10-01", hasta: "2026-11-08" },
} as VistaPrevia;

describe("La sección Documento", () => {
  it("en «Nuevo DTE» el tipo va fijo, y la fecha se elige dentro del rango del motor", () => {
    const onChange = vi.fn();
    render(
      <SeccionDocumento pedida={PEDIDA} vista={VISTA} onChange={onChange} />,
    );
    expect(screen.getByText("Factura electrónica")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Tipo" }),
    ).not.toBeInTheDocument();
    const fecha = screen.getByLabelText("Fecha de emisión");
    expect(fecha).toHaveAttribute("min", "2026-10-01");
    expect(fecha).toHaveAttribute("max", "2026-11-08");
    fireEvent.change(fecha, { target: { value: "2026-10-15" } });
    expect(onChange).toHaveBeenCalledWith({ fecha_emision: "2026-10-15" });
    expect(screen.getByText("vence 08-12-2026")).toBeInTheDocument();
  });

  it("la condición de pago es una lista: crédito a 30, 45 o 60 días, o contado", () => {
    const onChange = vi.fn();
    render(
      <SeccionDocumento pedida={PEDIDA} vista={VISTA} onChange={onChange} />,
    );
    const condicion = screen.getByRole("combobox", {
      name: "Condición de pago",
    });
    fireEvent.change(condicion, { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith({ forma_de_pago: 2, plazo_dias: 60 });
    fireEvent.change(condicion, { target: { value: "contado" } });
    expect(onChange).toHaveBeenCalledWith({
      forma_de_pago: 1,
      plazo_dias: null,
    });
  });

  it("en el evento, el tipo y de dónde se llena, en listas", () => {
    const onTipo = vi.fn();
    const onFuente = vi.fn();
    render(
      <SeccionDocumento
        pedida={PEDIDA}
        vista={VISTA}
        onChange={vi.fn()}
        onTipo={onTipo}
        fuentes={[
          { valor: "12", etiqueta: "OC N° 4500123" },
          { valor: "cotizacion", etiqueta: "Cotización N° 423" },
        ]}
        fuente="12"
        onFuente={onFuente}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), {
      target: { value: "39" },
    });
    expect(onTipo).toHaveBeenCalledWith(39);
    fireEvent.change(screen.getByRole("combobox", { name: "Se llena desde" }), {
      target: { value: "cotizacion" },
    });
    expect(onFuente).toHaveBeenCalledWith("cotizacion");
  });

  it("la boleta va con la fecha del día, sin condición de pago", () => {
    render(
      <SeccionDocumento
        pedida={{ ...PEDIDA, tipo: 39 }}
        vista={{ ...VISTA, emision: null, pago: null }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("08-11-2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Condición de pago" }),
    ).not.toBeInTheDocument();
  });
});
