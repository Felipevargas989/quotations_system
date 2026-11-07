/**
 * LAS UNIDADES DEL TARIFARIO DE LAS BOLETAS (doc 19 §9.16, D3)
 *
 * ⚠ GEMELO: viven también en el motor —
 *   `api-rest/src/facturacion/boletas/boleta.dto.ts` (UNIDADES_DEL_TARIFARIO).
 * Este repo no tiene paquete compartido entre motor y app, así que viven
 * dos veces a propósito. **Si se cambian acá, se cambian allá.**
 */
export const UNIDADES_DEL_TARIFARIO = [
  { valor: "noche", plural: "noches" },
  { valor: "persona", plural: "personas" },
  { valor: "día", plural: "días" },
  { valor: "hora", plural: "horas" },
  { valor: "unidad", plural: "unidades" },
] as const;

export const pluralDeLaUnidad = (unidad: string): string =>
  UNIDADES_DEL_TARIFARIO.find((u) => u.valor === unidad)?.plural ?? unidad;
