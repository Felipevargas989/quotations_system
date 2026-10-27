import { limpio, monto } from '../historia/acta';

// EL RESPALDO DE EXPERIENCIA DESDE UNA ORDEN DE COMPRA (decisión 34 del doc
// 17, 19-10). Felipe bajaba a mano sus órdenes de compra para el anexo de
// experiencia; la ficha pública de cada una (DetailsPurchaseOrder.aspx) se
// abre sin código y trae número, nombre, fecha, comprador, proveedor y
// total. Se lee por los ids de cada campo, que son fijos (lblTitleNumberAq,
// lnkBuyerSocialReasonValue...), no por el diseño de la página. Una orden
// que no existe devuelve la misma página con los campos vacíos.

/** "4352-103-SE23", "1030177-163-AG23": unidad, correlativo, tipo y año. */
export const CODIGO_DE_ORDEN = /^\d{1,9}-\d{1,7}-[A-Z]{2}\d{2}$/;

export type OrdenDeCompra = {
  numero: string;
  /** El nombre de la orden: lo que se contrató. */
  contrato: string;
  /** La razón social del comprador. */
  mandante: string | null;
  unidad: string | null;
  /** AAAA-MM-DD, la fecha de envío. */
  fecha: string | null;
  anio: number | null;
  /** El total de la orden, con impuestos, en pesos. */
  monto: number | null;
  estado: string | null;
  /** La licitación de donde viene, si viene de una. */
  licitacion: string | null;
  rut_proveedor: string | null;
  /** La razón social del proveedor (decisión 92: quién ganó). */
  proveedor: string | null;
};

const campo = (html: string, id: string): string => {
  const m = html.match(
    new RegExp(`<(span|a)[^>]*id="${id}"[^>]*>([\\s\\S]*?)</\\1>`),
  );
  return m ? limpio(m[2]) : '';
};

/** Lee la ficha (su HTML); null si la orden no existe. */
export function leerOrdenDeCompra(html: string): OrdenDeCompra | null {
  const numero =
    campo(html, 'lblTitleNumberAq') || campo(html, 'lblNumberPOValue');
  if (!numero) return null;
  const f = campo(html, 'lblCreationDatePOValue').match(
    /^(\d{2})-(\d{2})-(\d{4})$/,
  );
  return {
    numero,
    contrato: campo(html, 'lblTitleNameAq') || campo(html, 'lblNamePOValue'),
    mandante: campo(html, 'lnkBuyerSocialReasonValue') || null,
    unidad: campo(html, 'lblBuyerOrganizationValue') || null,
    fecha: f ? `${f[3]}-${f[2]}-${f[1]}` : null,
    anio: f ? Number(f[3]) : null,
    monto: monto(campo(html, 'lblTotalAmountShow')),
    estado: campo(html, 'lblStatusPOValue') || null,
    licitacion: campo(html, 'lblProvenienceValue') || null,
    rut_proveedor: campo(html, 'lblRutValueP') || null,
    proveedor: campo(html, 'lblSocialReasonValueP') || null,
  };
}

const FICHA_DE_LA_ORDEN =
  'https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC=';

/** La ficha pública de una orden de compra; solo con un código válido. */
export async function bajarOrdenDeCompra(codigo: string): Promise<string> {
  if (!CODIGO_DE_ORDEN.test(codigo)) {
    throw new Error('no es un número de orden de compra');
  }
  const respuesta = await fetch(
    `${FICHA_DE_LA_ORDEN}${encodeURIComponent(codigo)}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Eventia; orden de compra pública)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!respuesta.ok) {
    throw new Error(`la ficha de la orden respondió ${respuesta.status}`);
  }
  return respuesta.text();
}
