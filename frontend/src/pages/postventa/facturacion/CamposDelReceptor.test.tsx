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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Receptor } from "../../../services/facturas.service";
import CamposDelReceptor from "./CamposDelReceptor";

// EL RUT QUE LLENA TODO (doc 19 §9.27; Felipe, 07-11: «¿cómo lo podemos
// hacer para que al momento de facturar, el sistema cargue todo solo con el
// RUT?»). Y desde el 08-11, el RUT arriba: lo que trae queda achurado,
// «Corregir datos» lo abre y el giro se elige de una lista.

const buscarRazonSocial = vi.fn();
vi.mock("../../../services/facturas.service", () => ({
  buscarRazonSocial: (rut: string) => buscarRazonSocial(rut),
}));

beforeAll(() => {
  // La lista desplegable deja a la vista lo elegido; jsdom no desplaza.
  Element.prototype.scrollIntoView = vi.fn();
});

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

const escribirRut = async (rut: string, llega: () => void) => {
  fireEvent.change(casilla("RUT"), { target: { value: rut } });
  await waitFor(llega);
};

describe("El RUT que llena todo", () => {
  it("con un RUT válido trae la nómina del SII y lo dice", async () => {
    buscarRazonSocial.mockResolvedValue(CCU_DEL_SII);
    render(<ConEstado inicial={VACIO} />);
    await escribirRut("90.413.000-1", () =>
      expect(casilla("Razón social").value).toBe(
        "COMPANIA CERVECERIAS UNIDAS S.A.",
      ),
    );
    expect(buscarRazonSocial).toHaveBeenCalledWith("90413000-1");
    expect(casilla("Dirección").value).toBe("AVDA. VITACURA 2670 P. 23");
    expect(casilla("Comuna").value).toBe("LAS CONDES");
    expect(
      screen.getByText("Llenado con la nómina del SII."),
    ).toBeInTheDocument();
  });

  it("lo escrito a mano no se pisa ni se achura", async () => {
    buscarRazonSocial.mockResolvedValue(CCU_DEL_SII);
    render(<ConEstado inicial={{ ...VACIO, razon_social: "CCU" }} />);
    await escribirRut("90413000-1", () =>
      expect(casilla("Comuna").value).toBe("LAS CONDES"),
    );
    expect(casilla("Razón social").value).toBe("CCU");
    expect(casilla("Razón social")).not.toHaveAttribute("readonly");
    expect(casilla("Comuna")).toHaveAttribute("readonly");
  });

  it("un RUT incompleto no se busca", async () => {
    render(<ConEstado inicial={VACIO} />);
    fireEvent.change(casilla("RUT"), { target: { value: "90.413" } });
    await new Promise((r) => setTimeout(r, 450));
    expect(buscarRazonSocial).not.toHaveBeenCalled();
  });
});

describe("El RUT arriba (Felipe, 08-11: «hazlo así»)", () => {
  it("el RUT va primero, antes que la razón social", () => {
    render(<ConEstado inicial={VACIO} />);
    const rut = casilla("RUT");
    const razon = casilla("Razón social");
    expect(
      rut.compareDocumentPosition(razon) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("lo que trae el RUT queda achurado y «Corregir datos» lo abre", async () => {
    buscarRazonSocial.mockResolvedValue({ ...CCU_DEL_SII, giros: [] });
    render(<ConEstado inicial={VACIO} />);
    await escribirRut("90.413.000-1", () =>
      expect(casilla("Razón social")).toHaveAttribute("readonly"),
    );
    for (const c of ["Giro", "Dirección", "Comuna", "Ciudad"])
      expect(casilla(c)).toHaveAttribute("readonly");
    // Los correos, siempre abiertos.
    expect(casilla("Correos")).not.toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Corregir datos" }));
    expect(casilla("Dirección")).not.toHaveAttribute("readonly");
    fireEvent.change(casilla("Dirección"), {
      target: { value: "LOS CARRERA 123" },
    });
    expect(casilla("Dirección").value).toBe("LOS CARRERA 123");
    expect(
      screen.queryByRole("button", { name: "Corregir datos" }),
    ).not.toBeInTheDocument();
  });

  it("con más de una actividad, el giro se elige de una lista", async () => {
    buscarRazonSocial.mockResolvedValue(CCU_DEL_SII);
    render(<ConEstado inicial={VACIO} />);
    await escribirRut("90.413.000-1", () =>
      expect(screen.getByText("2 actividades en el SII")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /ALQUILER DE BIENES INMUEBLES AMOBLADOS/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /ACTIVIDADES COMBINADAS DE SERVICIOS/,
      }),
    );
    expect(
      screen.getByRole("button", {
        name: /ACTIVIDADES COMBINADAS DE SERVICIOS/,
      }),
    ).toBeInTheDocument();
    // «Corregir datos» deja escribir otro giro.
    fireEvent.click(screen.getByRole("button", { name: "Corregir datos" }));
    expect(casilla("Giro").value).toBe("ACTIVIDADES COMBINADAS DE SERVICIOS");
  });

  it("otro RUT reemplaza lo que trajo el anterior; si no lo encuentra, lo vacía", async () => {
    buscarRazonSocial
      .mockResolvedValueOnce({ ...CCU_DEL_SII, giros: [] })
      .mockResolvedValueOnce(null);
    render(<ConEstado inicial={{ ...VACIO, correo: "pagos@ccu.cl" }} />);
    await escribirRut("90.413.000-1", () =>
      expect(casilla("Comuna").value).toBe("LAS CONDES"),
    );
    await escribirRut("96.930.440-6", () =>
      expect(casilla("Razón social").value).toBe(""),
    );
    expect(buscarRazonSocial).toHaveBeenLastCalledWith("96930440-6");
    expect(casilla("Comuna").value).toBe("");
    expect(casilla("Razón social")).not.toHaveAttribute("readonly");
    // Lo escrito a mano se queda.
    expect(casilla("Correos").value).toBe("pagos@ccu.cl");
  });

  it("sin correo, avisa que queda guardado en el cliente al emitir", () => {
    render(<ConEstado inicial={VACIO} />);
    expect(
      screen.getByText(
        "Queda guardado en el cliente al emitir: la próxima vez se llena solo.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(casilla("Correos"), {
      target: { value: "pagos@empresa.cl" },
    });
    expect(
      screen.queryByText(/Queda guardado en el cliente al emitir/),
    ).not.toBeInTheDocument();
  });
});
