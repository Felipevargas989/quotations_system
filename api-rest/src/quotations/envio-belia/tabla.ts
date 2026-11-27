import { escaparHtml } from 'src/email/templates/utils';
import {
  adultosDe,
  fijos,
  ninosDe,
  personasDelGrupo,
  porPersona,
  totalesDeCotizacion,
} from '../correo-cotizacion';
import type { Quotation } from '../entities/quotation.entity';

// LA TABLA VERDE DE LA CASA (doc 20 §19; skill correos-valle-del-sol, oficial
// desde el 07-10-2026): cabecera #23443a, bordes #d9d4c7, y neto, IVA y total
// DENTRO de la tabla, con el total en crema. Las cifras salen de Eventia, con
// la misma cuenta del correo tipo y de la hoja (`totalesDeCotizacion`): una
// fila por público con su valor por persona, los parciales y cada fijo. La IA
// nunca escribe un número de esta tabla.

const clp = (n: number): string =>
  '$' + Math.round(n || 0).toLocaleString('es-CL');

const FUENTE =
  "font-family:Aptos,Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt";
const CELDA = 'padding:7px 10px;border:1px solid #d9d4c7;';
const CABECERA = 'padding:7px 10px;border:1px solid #23443a;';

type Fila = { item: string; cantidad: string; unitario: number; total: number };

/** Las filas de detalle, en el orden de la hoja. */
export const filasDeLaTabla = (q: Quotation): Fila[] => {
  const t = totalesDeCotizacion(q);
  const adultos = adultosDe(q);
  const ninos = ninosDe(q);
  const filas: Fila[] = [];
  const personas = (n: number) => n.toLocaleString('es-CL');
  if (adultos > 0 && t.perAdulto > 0) {
    filas.push({
      item: ninos > 0 ? 'Valor por persona, adultos' : 'Valor por persona',
      cantidad: personas(adultos),
      unitario: t.perAdulto,
      total: t.totAdultos,
    });
  }
  if (ninos > 0 && t.perNino > 0) {
    filas.push({
      item: 'Valor por persona, niños',
      cantidad: personas(ninos),
      unitario: t.perNino,
      total: t.totNinos,
    });
  }
  for (const g of t.parciales) {
    const n = personasDelGrupo(g, q);
    filas.push({
      item: g.category || 'Servicio',
      cantidad: personas(n),
      unitario: porPersona(g),
      total: porPersona(g) * n,
    });
  }
  for (const f of fijos(q)) {
    const qty = f.quantity || 1;
    filas.push({
      item: f.nombre || 'Servicio',
      cantidad: String(qty),
      unitario: f.precio || 0,
      total: (f.precio || 0) * qty,
    });
  }
  return filas;
};

/** La tabla en HTML con estilos en línea (Outlook ignora las hojas). */
export const tablaVerde = (q: Quotation): string => {
  const t = totalesDeCotizacion(q);
  const esc = escaparHtml;
  const detalle = filasDeLaTabla(q).map(
    (f) =>
      `<tr><td align="left" style="${CELDA}">${esc(f.item)}</td>` +
      `<td align="center" style="${CELDA}">${esc(f.cantidad)}</td>` +
      `<td align="right" style="${CELDA}white-space:nowrap">${clp(f.unitario)}</td>` +
      `<td align="right" style="${CELDA}white-space:nowrap">${clp(f.total)}</td></tr>`,
  );
  const resumen = (rotulo: string, monto: string, crema = false) =>
    `<tr${crema ? ' style="background:#f3efe4"' : ''}>` +
    `<td colspan="3" align="right" style="${CELDA}">${crema ? `<b>${rotulo}</b>` : rotulo}</td>` +
    `<td align="right" style="${CELDA}white-space:nowrap">${crema ? `<b>${monto}</b>` : monto}</td></tr>`;
  const filas = [...detalle];
  if (t.descuento > 0) {
    filas.push(resumen('Subtotal', clp(t.subtotal)));
    filas.push(resumen('Descuento', `−${clp(t.descuento)}`));
  }
  filas.push(resumen('Neto', clp(t.neto)));
  filas.push(resumen('IVA (19%)', clp(t.iva)));
  if (t.propina > 0) {
    filas.push(resumen('Total con IVA incluido', clp(t.totalConIva)));
    filas.push(
      resumen(
        `Propina sugerida (${String(t.tipPct)}% de la alimentación)`,
        clp(t.propina),
      ),
    );
    filas.push(resumen('Total', clp(t.totalConIva + t.propina), true));
  } else {
    filas.push(resumen('Total con IVA incluido', clp(t.totalConIva), true));
  }
  return (
    `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:0 0 14px 0;${FUENTE}">` +
    '<tr style="background:#23443a;color:#ffffff">' +
    `<th align="left" style="${CABECERA}">&Iacute;tem</th>` +
    `<th align="center" style="${CABECERA}">Cantidad</th>` +
    `<th align="right" style="${CABECERA}">Valor unitario</th>` +
    `<th align="right" style="${CABECERA}">Total</th></tr>` +
    filas.join('') +
    '</table>'
  );
};

/** La tabla en texto, para la tarjeta de BelIA y para la IA. */
export const tablaEnTexto = (q: Quotation): string => {
  const t = totalesDeCotizacion(q);
  const lineas = filasDeLaTabla(q).map(
    (f) => `${f.item}: ${f.cantidad} × ${clp(f.unitario)} = ${clp(f.total)}`,
  );
  if (t.descuento > 0) lineas.push(`Descuento: −${clp(t.descuento)}`);
  lineas.push(`Neto ${clp(t.neto)} · IVA ${clp(t.iva)}`);
  lineas.push(`Total con IVA incluido: ${clp(t.totalConIva)}`);
  if (t.propina > 0) {
    lineas.push(
      `Propina sugerida: ${clp(t.propina)} · Total: ${clp(t.totalConIva + t.propina)}`,
    );
  }
  return lineas.join('\n');
};

/** El total que ve el cliente, para la tarjeta. */
export const totalEnPesos = (q: Quotation): string => {
  const t = totalesDeCotizacion(q);
  return clp(t.totalConIva + t.propina);
};
