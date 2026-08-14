import { describe, expect, it } from "vitest";
import {
  cuentaRutDesde,
  digitoVerificador,
  formatearMientrasEscribe,
  formatearRut,
  limpiarRut,
  normalizarRut,
  revisarRut,
  rutEsValido,
} from "./rut";

// LA REGLA DEL RUT, CON CANDADO.
//
// ⚠ ESTAS PRUEBAS SON GEMELAS de `api-rest/src/people/tests/rut.spec.ts`.
//    Este repo no tiene paquete compartido, así que la regla vive dos
//    veces. Si acá se agrega un caso, allá también.
//
// Los RUT de prueba NO son inventados: 7.093.990-8 es el de Avelina
// Pereira y 17.938.019-6 el de Camila Carvajal, los dos sacados de la
// hoja de proveedores del Excel "04 Nomina de Pagos".

describe("El dígito verificador", () => {
  it.each([
    ["7093990", "8"],
    ["17938019", "6"],
    ["15402881", "1"],
    ["19221045", "3"],
    ["19221047", "K"],
  ])("de %s es %s", (numero, esperado) => {
    expect(digitoVerificador(numero)).toBe(esperado);
  });
});

describe("RUT que están bien", () => {
  it.each([
    "7093990-8",
    "7.093.990-8",
    "70939908",
    "17.938.019-6",
    "19221047-K",
    "19221047-k",
  ])("%s es válido", (valor) => {
    expect(rutEsValido(valor)).toBe(true);
  });

  it("adentro siempre se guarda con K mayúscula y sin puntos", () => {
    expect(normalizarRut("19.221.047-k")).toBe("19221047-K");
    expect(normalizarRut("7.093.990-8")).toBe("7093990-8");
    expect(normalizarRut("70939908")).toBe("7093990-8");
  });
});

describe("RUT que están mal", () => {
  it("el dígito verificador equivocado no pasa", () => {
    // Real: Fernando Cortés Cortés aparece en la hoja de compras como
    // 10.071.580-9 y su dígito NO es 9. Se ve normal y el banco lo
    // rechaza igual.
    expect(revisarRut("10071580-9")).toBe("digito");
    expect(revisarRut("7093990-1")).toBe("digito");
  });

  it("una cifra de más no pasa", () => {
    // Real: "77.7171.350-2" de Comercial Naranja, con un dígito de más.
    expect(revisarRut("777171350-2")).toBe("forma");
  });

  it("vacío avisa que falta, no que está malo", () => {
    expect(revisarRut("")).toBe("vacio");
    expect(revisarRut("   ")).toBe("vacio");
  });

  it("muy corto no pasa", () => {
    expect(revisarRut("123-4")).toBe("forma");
  });
});

describe("Los RUT que pasan la matemática pero no son de nadie", () => {
  it("55.555.555-5 se rechaza — el SII lo reserva para extranjeros sin RUT", () => {
    expect(digitoVerificador("55555555")).toBe("5"); // el cálculo SÍ da
    expect(revisarRut("55555555-5")).toBe("reservado"); // y aun así no pasa
  });

  it.each([
    "11111111-1",
    "22222222-2",
    "33333333-3",
    "44444444-4",
    "66666666-6",
    "77777777-7",
    "88888888-8",
    "99999999-9",
  ])("%s se rechaza aunque el cálculo dé bien", (valor) => {
    const [numero, dv] = valor.split("-");
    expect(digitoVerificador(numero)).toBe(dv);
    expect(revisarRut(valor)).toBe("reservado");
  });
});

describe("Limpiar y mostrar", () => {
  it("limpiar bota puntos, guiones y espacios", () => {
    expect(limpiarRut(" 7.093.990-8 ")).toBe("70939908");
  });

  it("mostrar le pone los puntos de vuelta", () => {
    expect(formatearRut("7093990-8")).toBe("7.093.990-8");
    expect(formatearRut("17938019-6")).toBe("17.938.019-6");
  });

  it("lo que no es RUT se devuelve tal cual, sin romper la pantalla", () => {
    expect(formatearRut("no soy un rut")).toBe("no soy un rut");
  });
});

// ---------------------------------------------------------------------
// Lo que solo existe en la pantalla
// ---------------------------------------------------------------------

describe("Mientras se escribe", () => {
  it("no adivina el guion hasta que hay cuerpo suficiente", () => {
    expect(formatearMientrasEscribe("7")).toBe("7");
    expect(formatearMientrasEscribe("709")).toBe("709");
    expect(formatearMientrasEscribe("7093990")).toBe("7093990");
  });

  it("cuando ya se puede, separa solo", () => {
    expect(formatearMientrasEscribe("70939908")).toBe("7.093.990-8");
    expect(formatearMientrasEscribe("179380196")).toBe("17.938.019-6");
  });

  it("NUNCA se come un carácter de lo que la persona tecleó", () => {
    // Esta es la regla que hace que el campo no pelee con quien escribe.
    for (const entrada of ["7", "70", "709", "7093", "70939", "709399", "7093990", "70939908"]) {
      expect(limpiarRut(formatearMientrasEscribe(entrada))).toBe(entrada);
    }
  });

  it("da lo mismo si lo pegan con puntos", () => {
    expect(formatearMientrasEscribe("7.093.990-8")).toBe("7.093.990-8");
  });
});

describe("La CuentaRUT de BancoEstado", () => {
  it("su número es el RUT sin el dígito verificador", () => {
    // Lo dice ChileAtiende: "El número de tu CuentaRUT es tu RUN sin
    // dígito verificador".
    expect(cuentaRutDesde("17.938.019-6")).toBe("17938019");
    expect(cuentaRutDesde("7093990-8")).toBe("7093990");
  });

  it("si el RUT termina en K, la K simplemente no va", () => {
    expect(cuentaRutDesde("19221047-K")).toBe("19221047");
  });

  it("sin RUT legible no inventa un número", () => {
    expect(cuentaRutDesde("cualquier cosa")).toBeNull();
  });
});
