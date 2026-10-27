import type { ResultadoDeBases } from "../../services/oportunidades.service";

// LOS CRITERIOS CON QUE SE EVALÚA (decisión 95 del doc 17, 27-10), lo mismo
// que `criterios-de-evaluacion.ts` del motor. Felipe: "si es licitación,
// trae los criterios de evaluación de la base; si es compra ágil, los de la
// ley", y "usa los de él; si no, lo de la ley". El análisis nuevo ya los
// guarda así; aquí se completa uno de antes, para que la pantalla diga lo
// mismo que la validación y la comparación.

type Criterio = ResultadoDeBases["criterios"][number];

export const CRITERIO_DE_LA_LEY: Criterio & { de_la_ley: true } = {
  nombre: "Menor precio",
  peso: "100%",
  como_se_evalua:
    "La solicitud no trae criterios: por ley gana la cotización más económica que cumpla los requisitos técnicos mínimos. Si eligen otra, deben justificarlo con parámetros objetivos (Ley 19.886, artículo 97 del reglamento y Directiva 35 de ChileCompra).",
  de_la_ley: true,
};

/** Los criterios de las bases o de la solicitud; en una compra ágil que no
 *  trae ninguno, el de la ley. */
export const criteriosDeEvaluacion = (
  criterios: Criterio[] | null | undefined,
  tipo: string | null | undefined,
): Criterio[] =>
  Array.isArray(criterios) && criterios.length > 0
    ? criterios
    : tipo === "compra_agil"
      ? [CRITERIO_DE_LA_LEY]
      : [];

/** ¿Es el de la ley? El análisis lo guarda con `de_la_ley`. */
export const esDeLaLey = (c: Criterio): boolean =>
  (c as { de_la_ley?: boolean }).de_la_ley === true;
