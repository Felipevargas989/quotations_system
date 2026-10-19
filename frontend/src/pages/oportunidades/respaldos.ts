import type { DatosDeRespaldo } from "../../services/postulacion.service";

// LOS RESPALDOS DE EXPERIENCIA (decisión 34 del doc 17, 19-10): una orden de
// compra o una factura de la carpeta de la empresa, con lo que pide el
// anexo de experiencia. Piezas sin pantalla, aparte del componente.

export const TIPO_RESPALDO = "respaldo_experiencia";

/** "4352-103-SE23": la misma forma que acepta el motor. */
const CODIGO_DE_ORDEN = /^\d{1,9}-\d{1,7}-[A-Z]{2}\d{2}$/;

export const esOrdenDeCompra = (numero: string): boolean =>
  CODIGO_DE_ORDEN.test(numero.trim().toUpperCase());

export const RESPALDO_VACIO: DatosDeRespaldo = {
  numero: "",
  mandante: null,
  contrato: null,
  anio: null,
  monto: null,
  fuente: "manual",
};

/** "N° 4352-103-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · 2023 ·
 *  $11.782.499", para la lista de la carpeta. */
export const resumenDelRespaldo = (d: DatosDeRespaldo): string =>
  [
    `N° ${d.numero}`,
    d.mandante,
    d.anio ? String(d.anio) : null,
    d.monto !== null ? `$${d.monto.toLocaleString("es-CL")}` : null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(" · ");
