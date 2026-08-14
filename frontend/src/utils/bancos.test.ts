import { describe, expect, it } from "vitest";
import {
  BANCOS,
  CODIGO_BANCOESTADO,
  TIPOS_DE_CUENTA,
  bancoPorCodigo,
  etiquetaTipoCuenta,
  nombreBanco,
} from "./bancos";

// LAS DECISIONES DE FELIPE SOBRE LA LISTA DE BANCOS, CON CANDADO.

describe("Ningún código repetido", () => {
  it("dos instituciones nunca comparten código", () => {
    // Un código repetido manda la plata a otra parte y no se nota hasta
    // que alguien reclama.
    const codigos = BANCOS.map((b) => b.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("todos los códigos son de 3 dígitos, con los ceros adelante", () => {
    // '012', no '12'. Si se guardara como número se perderían los ceros.
    for (const b of BANCOS) {
      expect(b.codigo).toMatch(/^[0-9]{3}$/);
    }
  });
});

describe("El orden lo dictó Felipe, no el alfabeto", () => {
  it("BancoEstado va primero: es el 80%", () => {
    expect(BANCOS[0].nombre).toBe("BancoEstado");
    expect(BANCOS[0].codigo).toBe(CODIGO_BANCOESTADO);
  });

  it("después Falabella y Mercado Pago", () => {
    expect(BANCOS[1].nombre).toBe("Banco Falabella");
    expect(BANCOS[2].nombre).toBe("Mercado Pago");
  });

  it("Coopeuch NO está entre los de siempre — Felipe dijo que no la usa nadie", () => {
    expect(bancoPorCodigo("672")?.grupo).not.toBe("frecuentes");
  });

  it("la banca de empresas va al final, para que nadie la elija sin querer", () => {
    const empresas = BANCOS.filter((b) => b.grupo === "empresas");
    const primeraEmpresa = BANCOS.findIndex((b) => b.grupo === "empresas");
    expect(empresas.length).toBeGreaterThan(0);
    // Después de la primera de empresas no puede venir ninguna frecuente.
    expect(
      BANCOS.slice(primeraEmpresa).some((b) => b.grupo === "frecuentes"),
    ).toBe(false);
  });
});

describe("Los bancos que ya no existen NO están", () => {
  it.each(["Security", "BBVA", "Corpbanca", "Scotiabank Azul", "Chek", "MACH"])(
    "%s no aparece como institución propia",
    (viejo) => {
      // Circulan por internet listas de códigos que todavía los traen.
      // Si alguien elige "Banco Security" hoy, la transferencia no llega.
      expect(BANCOS.some((b) => b.nombre === viejo)).toBe(false);
    },
  );

  it("pero sí se dice en qué quedaron, para poder encontrarlos", () => {
    expect(bancoPorCodigo("028")?.nota).toContain("Security");
    expect(bancoPorCodigo("014")?.nota).toContain("BBVA");
    expect(bancoPorCodigo("053")?.nota).toContain("Chek");
    expect(bancoPorCodigo("016")?.nota).toContain("MACH");
  });
});

describe("Un banco que no esté en la lista no rompe la pantalla", () => {
  it("muestra el código crudo en vez de una casilla vacía", () => {
    expect(nombreBanco("999")).toBe("999");
  });

  it("sin banco, no muestra nada raro", () => {
    expect(nombreBanco(null)).toBe("");
    expect(nombreBanco(undefined)).toBe("");
  });
});

describe("Los tipos de cuenta", () => {
  it("son cuatro opciones y ni una más", () => {
    // En Chile hay TRES tipos de verdad; la CuentaRUT se muestra aparte
    // solo porque su número se llena solo.
    expect(TIPOS_DE_CUENTA).toHaveLength(4);
  });

  it("la CuentaRUT va primera: es la más común", () => {
    expect(TIPOS_DE_CUENTA[0].valor).toBe("cuenta_rut");
  });

  it("no existen 'chequera electrónica' ni 'Cuenta Pro' como tipos", () => {
    // Son nombres de marketing de la cuenta vista. Si aparecieran como
    // opción, la gente elegiría el tipo equivocado y el abono rebota.
    const etiquetas = TIPOS_DE_CUENTA.map((t) => t.etiqueta.toLowerCase()).join(" ");
    expect(etiquetas).not.toContain("chequera");
    expect(etiquetas).not.toContain("pro");
    expect(etiquetas).not.toContain("joven");
  });

  it("un tipo desconocido se muestra crudo, no vacío", () => {
    expect(etiquetaTipoCuenta("inventado")).toBe("inventado");
    expect(etiquetaTipoCuenta(null)).toBe("");
  });
});
