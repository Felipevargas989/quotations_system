// Un acta pública de adjudicación de prueba (decisión 30 del doc 17): la
// forma del acta real (los ids de cada campo), con datos inventados.

const oferta = (
  item: string,
  of: string,
  o: {
    proveedor: string;
    detalle: string;
    precio: string;
    cantidad: string;
    total: string;
    estado: string;
  },
) => `
<tr class="cssPRCGridViewRow"><td><a id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_lnkViewProvider" href="#"><span id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_lblOrganization">${o.proveedor}</span></a></td>
<td><span id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_lblSupplierComment">${o.detalle}</span></td>
<td align="center"><span id="grdItemOC_${item}_ucAward_gvLines_${of}_lblSymbol">$</span>&nbsp;<span id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_lblTotalNetPrice">${o.precio}</span></td>
<td align="center"><span id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_txtAwardedQuantity">${o.cantidad}</span></td>
<td align="center"><span id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_lblTotalNetAward">${o.total}</span></td>
<td align="center"><span id="grdItemOC_${item}_ucAward_gvLines_${of}_gvLines_lblIsSelected" style="color:Green">${o.estado}</span></td></tr>`;

export const ACTA_DE_PRUEBA = `<html><body>
<span>Resolución de Acta de Adjudicación</span> Adquisición Nº 4239-33-LE26
<td>Adjudicación Informada en portal el 05/11/2026 10:12</td>
<td>Monto Neto Adjudicado</td><td>$ 56.034.300</td>
<span>Resultado de la Adjudicación</span>
<table id="grdItemOC">
<span id="grdItemOC_ctl02_ucAward__lblNumber">1</span>
<span id="grdItemOC_ctl02_ucAward__LblSchemaTittle">Servicios de viajes</span>
<span style="color:#809FF3"><span id="grdItemOC_ctl02_ucAward_lblDescription">Gira de estudio 4° medio: Pucón y Valdivia, 5 días, 45 alumnos &amp; 3 profesores</span></span>
<span id="grdItemOC_ctl02_ucAward__LblRBICuantityNumber">1</span>
${oferta('ctl02', 'ctl02', {
  proveedor: '76.123.456-7 TURISMO DEL SUR LIMITADA',
  detalle: 'Bus, alojamiento en hostal y alimentación completa',
  precio: '56034300',
  cantidad: '1',
  total: '56034300',
  estado: 'Adjudicada',
})}
${oferta('ctl02', 'ctl03', {
  proveedor: '77.987.654-K VIAJES ANDINOS SPA',
  detalle: 'Programa en Pucón con excursiones',
  precio: '61.500.000',
  cantidad: '0',
  total: '0',
  estado: 'No Adjudicada',
})}
</table></body></html>`;
