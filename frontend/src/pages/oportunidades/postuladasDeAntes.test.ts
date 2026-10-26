import { describe, expect, it } from "vitest";
import type { GeneracionesDeOportunidad } from "../../services/oportunidades.service";
import { pedidoDeLosAnexos, precioDeLosAnexos } from "./postuladasDeAntes";

// LAS POSTULADAS ANTES DE «ARMAR POSTULACIÓN» (26-10). Los datos son los de
// la 1532886-5-LE26, postulada la mañana del 19-10.

const ANEXOS = {
  anexos: {
    id: 1,
    tipo: "anexos",
    estado: "listo",
    parametros: { adjuntos: [3], monto_total: 11_930_000 },
    resultado: {
      resumen: "",
      documentos: [],
      descartados: [],
      no_entregados: [],
      pendientes: [
        "Firma del representante legal en cada formulario (Anexos 1 a 5).",
        "Subcontratar y cotizar: audiovisual (amplificación, micrófonos, consola de 12 canales), escenarios (ceremonia con faldón y 4x3 m), sillas y mesas, mantelería, fotógrafo, generador eléctrico con combustible.",
        "El cierre es hoy 19-10-2026 a las 15:01.",
      ],
    },
  },
  firma: null,
  propuesta: null,
} as unknown as GeneracionesDeOportunidad;

describe("lo de los anexos de una postulada de antes", () => {
  it("el precio con que se llenaron", () => {
    expect(precioDeLosAnexos(ANEXOS)).toBe(11_930_000);
    expect(precioDeLosAnexos(null)).toBeNull();
    expect(
      precioDeLosAnexos({
        ...ANEXOS,
        anexos: { ...ANEXOS.anexos!, parametros: {} },
      }),
    ).toBeNull();
  });

  it("el pedido al proveedor, cosa por cosa, sin partir lo que va entre paréntesis", () => {
    expect(pedidoDeLosAnexos(ANEXOS)).toEqual([
      "Audiovisual (amplificación, micrófonos, consola de 12 canales)",
      "Escenarios (ceremonia con faldón y 4x3 m)",
      "Sillas y mesas",
      "Mantelería",
      "Fotógrafo",
      "Generador eléctrico con combustible",
    ]);
    expect(pedidoDeLosAnexos(null)).toEqual([]);
  });
});
