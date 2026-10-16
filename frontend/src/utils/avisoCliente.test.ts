import { describe, expect, it } from "vitest";
import {
  CoincidenciaCliente,
  admiteOtroContacto,
  coincidenciasDe,
  datosParaRevisar,
  detalleDeCoincidencia,
  tituloDelAviso,
} from "./avisoCliente";

// Casos reales del 16-10-2026 (René Neira, Nueva Esperanza, UBB).
const rene: CoincidenciaCliente = {
  cliente_id: "rene",
  nombre: "Rejuveneciendo a la vida",
  tipo: "Club Adulto Mayor",
  motivos: ["telefono"],
  persona: { id: 436, nombre: "René Neira" },
  cotizacion: 590,
};

describe("aviso de cliente parecido", () => {
  it("reconoce el 409 del portero y deja pasar los otros errores", () => {
    const parecido = {
      response: {
        status: 409,
        data: { codigo: "CLIENTE_PARECIDO", coincidencias: [rene] },
      },
    };
    expect(coincidenciasDe(parecido)).toEqual([rene]);
    expect(coincidenciasDe({ response: { status: 409, data: {} } })).toBeNull();
    expect(coincidenciasDe(new Error("red caída"))).toBeNull();
  });

  it("el título dice qué calzó", () => {
    expect(tituloDelAviso([rene])).toBe("Este teléfono ya está en Eventia");
    expect(tituloDelAviso([{ ...rene, motivos: ["correo", "telefono"] }])).toBe(
      "Este correo y este teléfono ya están en Eventia",
    );
    expect(
      tituloDelAviso([{ ...rene, motivos: ["nombre"], persona: null }]),
    ).toBe("Ya hay un cliente con un nombre parecido");
  });

  it("el detalle nombra a la persona y al cliente, sin la cotización", () => {
    expect(detalleDeCoincidencia(rene)).toBe(
      "Es René Neira, contacto del cliente «Rejuveneciendo a la vida». ¿Es el mismo cliente?",
    );
    expect(
      detalleDeCoincidencia({
        ...rene,
        nombre: "Universidad del Bío-Bío",
        motivos: ["dominio"],
        persona: null,
        cotizacion: 574,
      }),
    ).toBe(
      "Ya tienes a «Universidad del Bío-Bío», con ese mismo correo de institución. ¿Sumar a esta persona ahí?",
    );
  });

  it("mientras se escribe, solo se revisan datos completos", () => {
    expect(datosParaRevisar({ email: "judiaz@cc", phone: "9 95" })).toBeNull();
    expect(datosParaRevisar({ name: "CC" })).toBeNull();
    expect(datosParaRevisar({ name: "CCU" })).toEqual({ name: "CCU" });
    expect(
      datosParaRevisar({
        name: "CCU Chile",
        email: " judiaz@ccu.cl ",
        phone: "+56 9 5095 5947",
        contact_email: "",
      }),
    ).toEqual({
      name: "CCU Chile",
      email: "judiaz@ccu.cl",
      phone: "+56 9 5095 5947",
    });
  });

  it("a un Particular no se le suman contactos (una sola persona)", () => {
    expect(admiteOtroContacto(rene)).toBe(true);
    expect(admiteOtroContacto({ ...rene, tipo: "Particulares" })).toBe(false);
  });
});
