// LOS CRITERIOS CON QUE SE EVALÚA (decisión 95 del doc 17, 27-10). Felipe:
// "cuando analizo la base, esto tiene que identificar si es una licitación
// o una compra ágil. Si es licitación, trae los criterios de evaluación de
// la base. Si es compra ágil, los de la ley... y al momento de comparar
// ofertas, ocupa el mismo criterio de evaluación que ya está identificado".
// Y: "usa los de él; si no, lo de la ley". La Directiva 35/2025 de
// ChileCompra lo permite: el comprador puede fijar otros criterios en la
// solicitud; si no los fija, gana la cotización más económica que cumpla lo
// técnico. El análisis los guarda así, y la pantalla, la validación y la
// comparación los toman de aquí (también de un análisis de antes).

export type CriterioDeEvaluacion = {
  nombre: string;
  peso: string;
  como_se_evalua: string;
  /** El de la ley: una compra ágil cuya solicitud no trae criterios. */
  de_la_ley?: boolean;
};

export const CRITERIO_DE_LA_LEY: CriterioDeEvaluacion = {
  nombre: 'Menor precio',
  peso: '100%',
  como_se_evalua:
    'La solicitud no trae criterios: por ley gana la cotización más económica que cumpla los requisitos técnicos mínimos. Si eligen otra, deben justificarlo con parámetros objetivos (Ley 19.886, artículo 97 del reglamento y Directiva 35 de ChileCompra).',
  de_la_ley: true,
};

/** Los criterios de las bases o de la solicitud; en una compra ágil que no
 *  trae ninguno, el de la ley. */
export const criteriosDeEvaluacion = <T extends { nombre: string }>(
  criterios: T[] | null | undefined,
  tipo: string | null | undefined,
): Array<T | CriterioDeEvaluacion> =>
  Array.isArray(criterios) && criterios.length > 0
    ? criterios
    : tipo === 'compra_agil'
      ? [CRITERIO_DE_LA_LEY]
      : [];
