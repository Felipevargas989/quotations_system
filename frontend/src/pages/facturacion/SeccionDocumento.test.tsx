// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DtePedido, VistaPrevia } from "../../services/facturas.service";
import SeccionDocumento from "./SeccionDocumento";

/** Elige en una lista de la casa: abre la del campo y pincha la opción. */
const elegir = (campo: string, actual: RegExp, opcion: RegExp) => {
  fireEvent.click(
    within(screen.getByRole("group", { name: campo })).getByRole("button", {
      name: actual,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: opcion }));
};

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
      screen.queryByRole("group", { name: "Tipo" }),
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
    elegir("Condición de pago", /Crédito 30 días/, /Crédito 60 días/);
    expect(onChange).toHaveBeenCalledWith({
      forma_de_pago: 2,
      plazo_dias: 60,
      medio_de_pago: null,
    });
    elegir("Condición de pago", /Crédito 30 días/, /^Contado/);
    expect(onChange).toHaveBeenCalledWith({
      forma_de_pago: 1,
      plazo_dias: null,
    });
    // A crédito no se pregunta con qué se pagó (§9.43).
    expect(
      screen.queryByRole("group", { name: "Medio de pago" }),
    ).not.toBeInTheDocument();
  });

  it("al contado, el medio de pago en su lista, para cuadrar la caja (§9.43)", () => {
    const onChange = vi.fn();
    render(
      <SeccionDocumento
        pedida={{ ...PEDIDA, forma_de_pago: 1, plazo_dias: null }}
        vista={VISTA}
        onChange={onChange}
      />,
    );
    elegir("Medio de pago", /Elegir el medio de pago/, /^Débito/);
    expect(onChange).toHaveBeenCalledWith({ medio_de_pago: "debito" });
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
    elegir("Tipo", /Factura electrónica/, /Boleta electrónica/);
    expect(onTipo).toHaveBeenCalledWith(39);
    elegir("Se llena desde", /OC N° 4500123/, /Cotización N° 423/);
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
      screen.queryByRole("group", { name: "Condición de pago" }),
    ).not.toBeInTheDocument();
  });
});
