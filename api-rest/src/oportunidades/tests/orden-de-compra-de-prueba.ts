// La ficha pública de una orden de compra de Mercado Público, recortada a
// los campos que lee Eventia (decisión 34). Datos reales y públicos: la
// 4352-103-SE23, el Día del Funcionario 2023 de Quillón, bajada el 19-10.

export const FICHA_DE_LA_ORDEN = `
<span id="lblPrincipalSubtitle">Orden de Compra. N&ordm;</span>
<span id="lblTitleNumberAq">4352-103-SE23</span>
<span id="lblTitleNameAq">CONTRATACION SERVICIO DE COCTELERIA Y CENA BAILABLE DIA DEL FUNCIONARIO</span>
<span id="lblStatusPOValue" class="texto13Azul">Aceptada</span>
<span id="lblCreationDatePOValue" class="texto13Azul">20-10-2023</span>
<span id="lblNamePOValue" class="texto13Azul">CONTRATACION SERVICIO DE COCTELERIA Y CENA BAILABLE DIA DEL FUNCIONARIO</span>
<span id="lblProvenienceValue" class="texto13Azul">4352-18-LE23</span>
<span id="lblBuyerOrganizationValue" class="texto13Azul">ADQUISICIONES Y FINANZAS</span>
<a id="lnkBuyerSocialReasonValue" class="link-style" href="https://comprador.mercadopublico.cl/ficha/69.141.400-0" target="_blank">ILUSTRE MUNICIPALIDAD DE QUILLON</a>
<span id="lblSocialReasonValueP" class="texto13Azul">VALLE DEL SOL QUILLON SPA</span>
<span id="lblRutValueP" class="texto13Azul">77.701.305-K</span>
<span id="lblAmountShow" class="cssLabelsItemData">$ 9.901.260</span>
<span id="lblTotalAmountShow" class="cssTotalText">$ 11.782.499</span>
`;

/** Lo que devuelve Mercado Público cuando la orden no existe: la misma
 *  página, con los campos vacíos. */
export const FICHA_VACIA = `
<span id="lblPrincipalSubtitle">Orden de Compra. N&ordm;</span>
<span id="lblTitleNumberAq"></span>
<span id="lblTitleNameAq"></span>
<span id="lblNumberPOValue" class="texto13Azul"></span>
`;
