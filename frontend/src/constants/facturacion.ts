import type { Ambiente } from "../services/facturas.service";

/**
 * FACTURACIÓN: LO QUE CABE EN LA FACTURA Y LAS REFERENCIAS (doc 19)
 *
 * ⚠ GEMELO: existe una copia en el motor —
 *   `api-rest/src/facturacion/datos-del-receptor.ts` (los largos) y
 *   `api-rest/src/facturacion/referencias.ts` (las referencias).
 * Este repo no tiene paquete compartido entre motor y app, así que viven
 * dos veces a propósito. **Si se cambian acá, se cambian allá.**
 */

/** Los largos del archivo de facturacion.cl: lo que se guarda en la ficha
 *  cabe ENTERO en la factura, sin cortes a escondidas. */
export const LARGO_MAXIMO = {
  razon_social: 100,
  giro: 40,
  direccion: 60,
  comuna: 20,
  ciudad: 20,
  correo_facturacion: 200,
} as const;

/** Las referencias que puede exigir un cliente en su factura (códigos del
 *  SII, formato DTE 2.2). «HES» es un código propio: el SII no lo valida. */
export const REFERENCIAS_QUE_PIDE = [
  { codigo: "801", nombre: "Orden de compra" },
  { codigo: "802", nombre: "Nota de pedido" },
  { codigo: "803", nombre: "Contrato" },
  { codigo: "805", nombre: "Proceso ChileCompra" },
  { codigo: "806", nombre: "Ficha ChileCompra" },
  { codigo: "HES", nombre: "Hoja de entrada de servicio" },
] as const;

/** Los plazos del crédito de la factura (doc 19 §9.22): 30 días es el
 *  máximo de la ley de pago a 30 días (Ley 19.983); 45 y 60, con las bases
 *  de una licitación o un acuerdo inscrito. Gemelo del motor
 *  (`facturas/borrador.ts`). */
export const PLAZOS_DE_PAGO = [30, 45, 60] as const;

export const nombreDeReferencia = (codigo: string): string =>
  REFERENCIAS_QUE_PIDE.find((r) => r.codigo === codigo)?.nombre ?? codigo;

/** Lo que no vale ante el SII lo dice: «(simulada)», «(de prueba)» (doc 19
 *  §9.18). No es gemelo del motor. */
const NOMBRE_DEL_AMBIENTE: Record<Ambiente, string> = {
  simulado: "simulada",
  prueba: "de prueba",
  produccion: "",
};

export const marcaDelAmbiente = (ambiente: Ambiente) =>
  NOMBRE_DEL_AMBIENTE[ambiente] ? ` (${NOMBRE_DEL_AMBIENTE[ambiente]})` : "";
