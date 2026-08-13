import { describe, expect, it } from "vitest";
import {
  formatFechaEvento,
  formatMomento,
  hoyEnChile,
  hoyEnChileMas,
} from "./dates";

// EL BUG DE LA #423, CON CANDADO
//
// Este bug se arregló TRES veces en 323 días y volvió las tres. La
// última: la lista decía "13 al 17" y adentro decía "14 al 18". Vivía
// en la ficha del cliente, el plan de pagos y la encuesta pública — la
// que ve el cliente.
//
// La causa nunca fue descuido. Las fechas de evento se guardan a
// medianoche UTC; leerlas en hora chilena (que va detrás) las corre un
// día hacia atrás. Cualquiera que escriba `new Date(fecha)` a mano
// reintroduce el bug sin darse cuenta.
//
// Estas pruebas son el candado. Si alguien vuelve a mezclar los dos
// relojes, fallan acá y no en la cara del cliente.

describe("formatFechaEvento — la fecha del evento NO se corre un día", () => {
  it("un evento del 14 dice 14, no 13", () => {
    expect(formatFechaEvento("2026-08-14T00:00:00.000Z")).toBe("14/08/2026");
  });

  it("aguanta la fecha sin hora, como la manda la base", () => {
    expect(formatFechaEvento("2026-08-14")).toBe("14/08/2026");
  });

  it("el primero de mes no se cae al mes anterior", () => {
    expect(formatFechaEvento("2026-01-01T00:00:00.000Z")).toBe("01/01/2026");
  });

  it("sin fecha muestra la raya, no 'Invalid Date'", () => {
    expect(formatFechaEvento(null)).toBe("—");
    expect(formatFechaEvento(undefined)).toBe("—");
    expect(formatFechaEvento("")).toBe("—");
  });

  it("una fecha rota tampoco escupe 'Invalid Date'", () => {
    expect(formatFechaEvento("no soy una fecha")).toBe("—");
  });

  it("el texto de 'sin fecha' se puede cambiar por pantalla", () => {
    expect(formatFechaEvento(null, "corto", "Por definir")).toBe("Por definir");
  });
});

describe("formatFechaEvento — los formatos que antes se escribían a mano", () => {
  const dia = "2026-08-14T00:00:00.000Z"; // viernes

  it("largoSinDia es el que usa la encuesta pública", () => {
    expect(formatFechaEvento(dia, "largoSinDia")).toBe("14 de agosto de 2026");
  });

  it("largo trae el día de la semana", () => {
    expect(formatFechaEvento(dia, "largo")).toContain("14 de agosto de 2026");
    expect(formatFechaEvento(dia, "largo").toLowerCase()).toContain("viernes");
  });

  it("todos los formatos dicen 14 — ninguno se corre", () => {
    for (const f of ["corto", "medio", "largo", "largoSinDia", "diaMes"] as const) {
      expect(formatFechaEvento(dia, f)).toContain("14");
    }
  });
});

describe("formatMomento — un instante SÍ va en hora chilena", () => {
  it("las 21:40 del 13 en Chile son el 13, aunque en Londres ya sea 14", () => {
    // 2026-08-14T01:40Z = 2026-08-13 21:40 en Chile (UTC-4)
    expect(formatMomento("2026-08-14T01:40:00.000Z")).toBe("13/08/2026");
  });

  it("y por eso NO se puede usar para fechas de evento", () => {
    // El mismo dato leído con la función equivocada da otro día. Esta
    // prueba existe para dejar la trampa a la vista de quien lea el
    // archivo, no porque el comportamiento esté mal.
    const medianocheUTC = "2026-08-14T00:00:00.000Z";
    expect(formatFechaEvento(medianocheUTC)).toBe("14/08/2026");
    expect(formatMomento(medianocheUTC)).toBe("13/08/2026");
  });

  it("sin fecha muestra la raya", () => {
    expect(formatMomento(null)).toBe("—");
  });
});

describe("hoyEnChile — el reloj de Londres no manda", () => {
  it("entrega el formato que esperan los campos de fecha", () => {
    expect(hoyEnChile()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("hoyEnChileMas(2) es dos días después, no dos horas", () => {
    const hoy = new Date(`${hoyEnChile()}T12:00:00Z`);
    const pasado = new Date(`${hoyEnChileMas(2)}T12:00:00Z`);
    const dias = Math.round(
      (pasado.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(dias).toBe(2);
  });

  it("hoyEnChileMas(0) es hoy", () => {
    expect(hoyEnChileMas(0)).toBe(hoyEnChile());
  });

  it("cruza el fin de mes sin inventar un día 32", () => {
    expect(hoyEnChileMas(20)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hoyEnChileMas(400)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
