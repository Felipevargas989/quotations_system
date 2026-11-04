/**
 * LAS REFERENCIAS QUE PUEDE EXIGIR UN CLIENTE (doc 19 §9.3)
 *
 * ⚠ GEMELO: existe una copia en
 *   `frontend/src/constants/referenciasTributarias.ts`
 * Este repo no tiene paquete compartido entre motor y app, así que la
 * lista vive dos veces a propósito. **Si se cambia acá, se cambia allá.**
 *
 * Son códigos del formato DTE del SII (versión 2.2, TpoDocRef). «HES»
 * (hoja de entrada de servicio) es un código propio: el SII no lo valida.
 * Lo que exige cada cliente queda en su ficha (`clients.referencias_exigidas`,
 * migración 184): CCU pide la orden de compra y la nota de pedido.
 */
export const REFERENCIAS_QUE_PIDE = [
  { codigo: '801', nombre: 'Orden de compra' },
  { codigo: '802', nombre: 'Nota de pedido' },
  { codigo: '803', nombre: 'Contrato' },
  { codigo: '805', nombre: 'Proceso ChileCompra' },
  { codigo: '806', nombre: 'Ficha ChileCompra' },
  { codigo: 'HES', nombre: 'Hoja de entrada de servicio' },
] as const;

export const CODIGOS_DE_REFERENCIA: string[] = REFERENCIAS_QUE_PIDE.map(
  (r) => r.codigo,
);
