import { describe, expect, it } from "vitest";
import type { EstadoDeLaExperiencia } from "../../services/experiencia.service";
import { avisoDeExperiencia } from "./reglasDeLaExperiencia";

// «ARMAR POSTULACIÓN» SIN CONFIRMAR LA EXPERIENCIA (decisión 86, 27-10): la
// elige la IA al armar y la pantalla avisa solo si no alcanza o si no se
// pudo elegir.

const conRespaldo = (n: number, sin = 0) =>
  [
    ...Array.from({ length: n }, () => true),
    ...Array.from({ length: sin }, () => false),
  ].map((con_respaldo, i) => ({
    clave: `mp:${i}`,
    de: "mi_empresa",
    con_respaldo,
    numero: `OC-${i}`,
    mandante: "Municipalidad de Quillón",
    contrato: "Evento",
    anio: 2025,
    monto: 1_000_000,
    fuente: "mercado_publico",
    archivo: null,
  }));

const estado = (
  trabajo: Record<string, unknown> | null,
  piden = true,
): EstadoDeLaExperiencia =>
  ({ piden, trabajo }) as unknown as EstadoDeLaExperiencia;

const lista = (pide: number, elegidas: ReturnType<typeof conRespaldo>) => ({
  estado: "listo",
  error: null,
  resultado: {
    pide,
    periodo: "",
    condiciones: "",
    nota: "",
    faltan: [],
    elegidas,
  },
});

describe("el aviso de la experiencia (decisión 86)", () => {
  it("si las bases no la piden o todavía no se eligió, nada", () => {
    expect(avisoDeExperiencia(undefined)).toBeNull();
    expect(avisoDeExperiencia(estado(lista(6, []), false))).toBeNull();
    expect(avisoDeExperiencia(estado(null))).toBeNull();
    expect(
      avisoDeExperiencia(estado({ estado: "procesando", resultado: null })),
    ).toBeNull();
  });

  it("alcanza para el puntaje máximo: nada", () => {
    expect(avisoDeExperiencia(estado(lista(6, conRespaldo(8))))).toBeNull();
  });

  it("no alcanza: cuántos hay con respaldo y cuántos piden; los sin respaldo no cuentan", () => {
    expect(avisoDeExperiencia(estado(lista(6, conRespaldo(2, 1))))).toMatch(
      /^La IA encontró 2 contratos con respaldo y las bases dan el puntaje máximo con 6\. Sube órdenes de compra/,
    );
    expect(avisoDeExperiencia(estado(lista(0, [])))).toMatch(
      /^La IA no encontró experiencia con respaldo\./,
    );
  });

  it("si no se pudo elegir, lo dice", () => {
    expect(
      avisoDeExperiencia(
        estado({ estado: "error", error: "Sin saldo", resultado: null }),
      ),
    ).toBe("No se pudo elegir la experiencia: Sin saldo. Vuelve a armar.");
  });
});
