import { describe, expect, it } from "vitest";
import { avisosVigentes, citaDe } from "./reglasDeLosAvisos";
import type { DetalleDelDocumento } from "./notasDeLaPostulacion";

// LOS AVISOS DE UN FORMULARIO, AL DÍA (26-10). Felipe: "si son cosas que se
// corrigieron se deben eliminar, si no solo generan bulla".

const TEXTO = `FORMULARIO N°3 EXPERIENCIA
SERV. DE ALIMENTACIÓN Y PROD. DE EVENTO, PERSONAS MAYORES ADWARDS
CORPORACION DE ASISTENCIA JUDICIAL DE LA REGION DEL BIO BIO
FIRMA DEL OFERENTE`;

const detalle = (
  notas: string[],
  ocultas: string[] = [],
): DetalleDelDocumento => ({
  estado: "por_revisar",
  notas: notas.map((texto) => ({ texto, tono: "revisar" })),
  aviso: null,
  ocultas: ocultas.map((texto) => ({ texto, tono: "revisar" })),
});

const textos = (vigentes: ReturnType<typeof avisosVigentes>) =>
  vigentes.notas.map((n) => n.texto);

describe("lo que cita una nota", () => {
  it("el primer texto entre comillas, de cualquier tipo", () => {
    expect(
      citaDe(
        "Formulario N°3, fila 5: 'personas mayores Adwards' parece un error. Revisen (por ejemplo, 'Awards').",
      ),
    ).toBe("personas mayores Adwards");
    expect(citaDe("Línea N°2 dice «No aplica».")).toBe("No aplica");
    expect(citaDe('Dice "IVA" sin el monto.')).toBeNull();
    expect(citaDe("Falta el jugo como alternativa.")).toBeNull();
  });
});

describe("los avisos que siguen vigentes", () => {
  const ADWARDS =
    "Formulario N°3, fila 5: 'personas mayores Adwards' parece un error de escritura.";
  const BIOBIO =
    "Formulario N°3: 'Región del Bio Bio' queda mejor como 'Región del Biobío'.";
  const JUGO = "Falta el jugo como alternativa.";

  it("lo corregido se va apenas desaparece lo que citaba; lo demás se queda", () => {
    const ahora = TEXTO.replace("ADWARDS", "AWARDS");
    expect(
      textos(
        avisosVigentes(
          detalle([ADWARDS, BIOBIO, JUGO, "Falta la firma."]),
          { base: TEXTO, ahora },
          0,
        ),
      ),
    ).toEqual([BIOBIO, JUGO]);
  });

  it("un [COMPLETAR] se va cuando ya no queda ninguno en el documento", () => {
    const PISCINA = "[COMPLETAR] medidas de la piscina de niños.";
    const COMPLETAR_EL_PLAZO = "Hay que completar el plazo de ejecución.";
    const d = detalle([PISCINA, COMPLETAR_EL_PLAZO]);
    expect(textos(avisosVigentes(d, { base: TEXTO, ahora: TEXTO }, 1))).toEqual(
      [PISCINA, COMPLETAR_EL_PLAZO],
    );
    // «completar» sin corchetes no es la marca: se queda.
    expect(textos(avisosVigentes(d, { base: TEXTO, ahora: TEXTO }, 0))).toEqual(
      [COMPLETAR_EL_PLAZO],
    );
  });

  it("una nota al día que cita algo que no está en el documento no se toca", () => {
    const DE_LAS_BASES =
      "Formulario N°3: las bases piden 'copia de las órdenes de compra'.";
    expect(
      textos(
        avisosVigentes(
          detalle([DE_LAS_BASES]),
          { base: TEXTO, ahora: TEXTO },
          0,
        ),
      ),
    ).toEqual([DE_LAS_BASES]);
  });

  it("lo de antes de tus cambios: vuelve si lo citado sigue ahí; lo que no se puede comprobar se cuenta", () => {
    const ahora = TEXTO.replace("ADWARDS", "AWARDS");
    const vigentes = avisosVigentes(
      detalle([], [ADWARDS, BIOBIO, JUGO, "Cubre todo, pero falta el plazo."]),
      { base: ahora, ahora },
      0,
    );
    expect(textos(vigentes)).toEqual([BIOBIO]);
    expect(vigentes.porRevisar).toBe(2);
  });

  it("sin notas de ese formulario, nada", () => {
    expect(avisosVigentes(undefined, { base: TEXTO, ahora: TEXTO }, 0)).toEqual(
      { notas: [], porRevisar: 0 },
    );
  });
});
