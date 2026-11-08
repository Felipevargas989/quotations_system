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
import type { Receptor } from "../../../services/facturas.service";
import CamposDelReceptor from "./CamposDelReceptor";

// EL RUT QUE LLENA TODO (doc 19 §9.27; Felipe, 07-11: «¿cómo lo podemos
// hacer para que al momento de facturar, el sistema cargue todo solo con el
// RUT?»).

const buscarRazonSocial = vi.fn();
vi.mock("../../../services/facturas.service", () => ({
  buscarRazonSocial: (rut: string) => buscarRazonSocial(rut),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VACIO: Receptor = {
  rut: "",
  razon_social: "",
  giro: null,
  direccion: null,
  comuna: null,
  ciudad: null,
  correo: null,
};

const CCU_DEL_SII = {
  rut: "90413000-1",
  razon_social: "COMPANIA CERVECERIAS UNIDAS S.A.",
  giro: "ALQUILER DE BIENES INMUEBLES AMOBLADOS",
  direccion: "AVDA. VITACURA 2670 P. 23",
  comuna: "LAS CONDES",
  ciudad: "SANTIAGO",
  correo_facturacion: null,
  referencias_exigidas: [],
  cliente: null,
  origen: "sii",
  giros: [
    "ALQUILER DE BIENES INMUEBLES AMOBLADOS",
    "ACTIVIDADES COMBINADAS DE SERVICIOS",
  ],
};

function ConEstado({ inicial }: { readonly inicial: Receptor }) {
  const [r, setR] = useState(inicial);
  return (
    <CamposDelReceptor
      receptor={r}
      onChange={(campo, valor) => setR((x) => ({ ...x, [campo]: valor }))}
      onLlenar={(datos) => setR((x) => ({ ...x, ...datos }))}
    />
  );
}

const casilla = (etiqueta: string) =>
  screen.getByLabelText(new RegExp(`^${etiqueta}`)) as HTMLInputElement;

describe("El RUT que llena todo", () => {
  it("con un RUT válido trae la nómina del SII, lo dice y ofrece sus otras actividades", async () => {
    buscarRazonSocial.mockResolvedValue(CCU_DEL_SII);
    render(<ConEstado inicial={VACIO} />);
    fireEvent.change(casilla("RUT"), { target: { value: "90.413.000-1" } });
    await waitFor(() =>
      expect(casilla("Razón social").value).toBe(
        "COMPANIA CERVECERIAS UNIDAS S.A.",
      ),
    );
    expect(buscarRazonSocial).toHaveBeenCalledWith("90413000-1");
    expect(casilla("Dirección").value).toBe("AVDA. VITACURA 2670 P. 23");
    expect(casilla("Comuna").value).toBe("LAS CONDES");
    expect(
      screen.getByText(/Llenado con la nómina del SII/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "ACTIVIDADES COMBINADAS DE SERVICIOS",
      }),
    );
    expect(casilla("Giro").value).toBe("ACTIVIDADES COMBINADAS DE SERVICIOS");
  });

  it("lo escrito a mano no se pisa", async () => {
    buscarRazonSocial.mockResolvedValue(CCU_DEL_SII);
    render(<ConEstado inicial={{ ...VACIO, razon_social: "CCU" }} />);
    fireEvent.change(casilla("RUT"), { target: { value: "90413000-1" } });
    await waitFor(() => expect(casilla("Comuna").value).toBe("LAS CONDES"));
    expect(casilla("Razón social").value).toBe("CCU");
  });

  it("un RUT incompleto no se busca", async () => {
    render(<ConEstado inicial={VACIO} />);
    fireEvent.change(casilla("RUT"), { target: { value: "90.413" } });
    await new Promise((r) => setTimeout(r, 450));
    expect(buscarRazonSocial).not.toHaveBeenCalled();
  });

  it("de una factura anterior (§9.29): dice cuál, y si la razón social viene cortada", async () => {
    buscarRazonSocial.mockResolvedValue({
      rut: "65123456-5",
      razon_social: "JUNTA DE VECINOS N 2 VILLA LOS AROMOS DE LA COMUNA",
      giro: "ORGANIZACION COMUNITARIA",
      direccion: "LOS AROMOS 123",
      comuna: "QUILLON",
      ciudad: "QUILLON",
      correo_facturacion: null,
      referencias_exigidas: [],
      cliente: null,
      origen: "factura",
      giros: [],
      factura: {
        folio: 379,
        fecha_emision: "2026-11-01",
        razon_social_cortada: true,
      },
    });
    render(<ConEstado inicial={VACIO} />);
    fireEvent.change(casilla("RUT"), { target: { value: "65.123.456-5" } });
    await waitFor(() =>
      expect(casilla("Giro").value).toBe("ORGANIZACION COMUNITARIA"),
    );
    expect(
      screen.getByText(
        "Llenado con tu factura N° 379 del 01-11-2026: revisa que siga igual. La razón social viene cortada en el PDF: complétala.",
      ),
    ).toBeInTheDocument();
  });
});
