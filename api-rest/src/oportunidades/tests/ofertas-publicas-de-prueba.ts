// Las páginas públicas del cuadro de ofertas de la 4364-13-LE26 (Día del
// Profesor), recortadas, como las devolvió Mercado Público el 27-10
// (decisión 96). Los `enc` son los de verdad, cortados.

export const FICHA = `
<script>
  $("#imgCuadroOferta").removeClass('cuadroOferta');
</script>
<div class="iconos00">
  <input type="image" name="imgCuadroOferta" id="imgCuadroOferta" alt="" class="cuadroOferta" href="/Procurement/Modules/RFB/StepsProcessAward/OpeningFrame.aspx?enc=kX7J6JRS7L1df0gSqRuzVOrg%2f0%2fYd5cqq%2bZZm2C" src="../../Includes/images/FichaLight/iconos_licitacion/cuadro-46.png" style="border-width:0px;" />
</div>`;

export const CABECERA = `
<td><img src="../../../Includes/images/resumen-ofertas.gif" onclick="parent.Cuerpo.location=&#39;SupplySummary.aspx?enc=YMeP54yyyMFSHpJzHIb0UDkCQh6bM6%2bAbC&#39;;return false;" /></td>`;

const fila = (
  n: string,
  rut: string,
  quien: string,
  total: string,
  anexos: string[],
) => `
<tr class="cssFwkItemStyle">
  <td><a id="grdSupplies_ctl${n}__GvLblRutProvider" href="javascript:__doPostBack(&#39;grdSupplies$ctl${n}$_GvLblRutProvider&#39;,&#39;&#39;)">${rut}</a></td>
  <td><a id="grdSupplies_ctl${n}__GvLblProvider" href="javascript:__doPostBack(&#39;grdSupplies$ctl${n}$_GvLblProvider&#39;,&#39;&#39;)">${quien}</a></td>
  <td><span id="grdSupplies_ctl${n}_TotalOferta">${total}</span></td>
  <td><span id="grdSupplies_ctl${n}_EstadoOferta">Aceptada</span></td>
</tr>
<tr>
  <td><input type="image" name="grdSupplies$ctl${n}$_GvImgFirma" id="grdSupplies_ctl${n}__GvImgFirma" title="Firma declaración Jurada" onclick="ver_declaracion(&#39;${rut}&#39; , &#39;4364-13-LE26&#39;);" /></td>
  ${anexos
    .map(
      (t) =>
        `<td><input type="image" name="grdSupplies$ctl${n}$_GvImgb${t}Attachment" id="grdSupplies_ctl${n}__GvImgb${t}Attachment" title="Anexos" src="../../../Includes/images/Ofertas/adj.gif" onclick="openPopUp(&#39;/BID/Modules/POPUPS/ViewBidAttachment.aspx?enc=${t}${n}%2bE50%3d%3d&#39;, 800, 520); return false;" style="border-width:0px;" /></td>`,
    )
    .join('\n  ')}
</tr>`;

export const RESUMEN = `
<table id="grdSupplies">
${fila('02', '77.701.305-K', 'Centro de Eventos Valle del Sol', '$ 13.361.345', ['Administrative', 'Technical', 'Economic'])}
${fila('03', '77.067.895-1', 'Sol de Quillón', '$ 13.352.941', ['Administrative'])}
</table>`;

/** La página de un anexo: sus campos ocultos, los archivos y el paginador. */
export const paginaDelAnexo = (
  archivos: Array<[string, string, string]>,
  otras: string[],
  estado = 'dDwtMTEw',
) => `
<form name="form1" method="post" action="./ViewBidAttachment.aspx?enc=Administrative03%2bE50%3d%3d" id="form1">
<input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" />
<input type="hidden" name="__EVENTARGUMENT" id="__EVENTARGUMENT" value="" />
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="/wEPDw${estado}" />
<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="63676FB6" />
<table id="DWNL_grdId">
${archivos
  .map(
    ([n, nombre, kb]) => `<tr class="cssFwkItemStyle">
  <td><input id="DWNL_grdId_ctl${n}_chk" type="checkbox" name="DWNL$grdId$ctl${n}$chk" /></td><td><span id="DWNL_grdId_ctl${n}_File">${nombre}</span></td><td><span id="DWNL_grdId_ctl${n}_Type">Documento para contratar</span></td><td><span id="DWNL_grdId_ctl${n}_FileLength">${kb} KB</span></td><td><input type="image" name="DWNL$grdId$ctl${n}$search" id="DWNL_grdId_ctl${n}_search" title="Ver Anexo" /></td>
</tr>`,
  )
  .join('\n')}
<tr><td>${otras
  .map(
    (p) =>
      `<a href="javascript:__doPostBack(&#39;DWNL$grdId&#39;,&#39;Page$${p}&#39;)" style="color:Black;">${p}</a>`,
  )
  .join('')}</td></tr>
</table>
<input type="text" name="txtCaptcha" />
</form>`;
