import { correoInternoTemplate } from './brandLayout';

/**
 * EL RESUMEN DEL CIERRE DE LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 3).
 * Le llega a quien revisa los cierres (permiso «Revisar cierres de caja»)
 * apenas se cierra la caja, como el resumen de Fudo. Quien cerró no lo
 * recibe: el cierre es ciego.
 */
export type CierreDeCajaParams = {
  companyName?: string | null;
  /** Quién cerró la caja. */
  quien: string;
  /** ISO. */
  abierta: string;
  /** ISO. */
  cerrada: string;
  lineas: {
    medio: string;
    declarado: number;
    esperado: number;
    diferencia: number;
  }[];
  vendido: number;
  /** §9.51: lo que mandaron el dueño o la administradora (no es venta).
   *  Opcional para los llamadores de antes. */
  ingresos?: number;
  retiros: number;
  diferencia: number;
  comentario?: string | null;
  /** §9.49: las pulseras del turno, si la empresa las cuenta y este cierre
   *  las contó. Sin ellas, el correo es el de siempre. */
  pulseras?: {
    deberian: number;
    contadas: number;
    diferencia: number;
  } | null;
  /** §9.53: con cuánto se abrió y, si hubo un cierre anterior, la
   *  diferencia contra lo que ese cierre declaró en efectivo. */
  apertura?: {
    sencillo: number;
    comparada: { cierre_anterior: number; diferencia: number } | null;
  } | null;
};

const NOMBRE: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
};

const pesos = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

const escapar = (t: string) =>
  t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** «cuadra», «faltan $5.000» o «sobran $500». */
const resultado = (d: number) =>
  d === 0 ? 'cuadra' : d < 0 ? `faltan ${pesos(-d)}` : `sobran ${pesos(d)}`;

/** §9.49: «Calza», «Faltan 2» o «Sobran 1», en pulseras. */
const resultadoDePulseras = (d: number) =>
  d === 0 ? 'Calza' : d < 0 ? `Faltan ${-d}` : `Sobran ${d}`;

/** La línea de las pulseras: en rojo si faltan. */
const lineaDePulseras = (p: NonNullable<CierreDeCajaParams['pulseras']>) => {
  const color =
    p.diferencia === 0 ? '#15803d' : p.diferencia < 0 ? '#b91c1c' : '#b45309';
  return `
    <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0 0 6px;">
      Pulseras: deberían quedar ${p.deberian} · contó ${p.contadas} ·
      <strong style="color:${color};">${resultadoDePulseras(p.diferencia)}</strong>
    </p>`;
};

/** §9.53: «Abrió con $26.850 · Calza con el cierre anterior», o «Faltan
 *  $26.850 (el cierre anterior declaró $53.700)», en rojo si no calza. */
const lineaDeApertura = (a: NonNullable<CierreDeCajaParams['apertura']>) => {
  const c = a.comparada;
  const detalle = !c
    ? ''
    : c.diferencia === 0
      ? ' · <strong style="color:#15803d;">Calza</strong> con el cierre anterior'
      : ` · <strong style="color:#b91c1c;">${c.diferencia < 0 ? 'Faltan' : 'Sobran'} ${pesos(Math.abs(c.diferencia))}</strong> (el cierre anterior declaró ${pesos(c.cierre_anterior)})`;
  return `
    <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0 0 6px;">
      Abrió con ${pesos(a.sencillo)}${detalle}
    </p>`;
};

const fechaYHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  });

export const asuntoDelCierre = (p: CierreDeCajaParams) =>
  `Cierre de caja · ${p.quien} · ${resultado(p.diferencia)}`;

export const cierreDeCajaTemplate = (p: CierreDeCajaParams): string => {
  const color = (d: number) =>
    d === 0 ? '#15803d' : d < 0 ? '#b91c1c' : '#b45309';
  const filas = p.lineas
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;">${NOMBRE[l.medio] ?? escapar(l.medio)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;text-align:right;">${pesos(l.declarado)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;text-align:right;">${pesos(l.esperado)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;text-align:right;color:${color(l.diferencia)};">${resultado(l.diferencia)}</td>
      </tr>`,
    )
    .join('');
  const bodyHtml = `
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px;">
      <strong>${escapar(p.quien)}</strong> cerró la caja de recepción
      (${fechaYHora(p.abierta)} a ${fechaYHora(p.cerrada)}).
      Resultado: <strong style="color:${color(p.diferencia)};">${resultado(p.diferencia)}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;margin:0 0 14px;">
      <tr style="color:#6b7280;font-size:12px;">
        <th style="padding:4px 8px;text-align:left;font-weight:500;">Medio</th>
        <th style="padding:4px 8px;text-align:right;font-weight:500;">Declaró</th>
        <th style="padding:4px 8px;text-align:right;font-weight:500;">Según Eventia</th>
        <th style="padding:4px 8px;text-align:right;font-weight:500;">Diferencia</th>
      </tr>${filas}
    </table>
${p.apertura ? lineaDeApertura(p.apertura) : ''}
    <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0 0 6px;">
      Vendido en el turno: ${pesos(p.vendido)} · Ingresos: ${pesos(p.ingresos ?? 0)} · Retiros: ${pesos(p.retiros)}
    </p>${p.pulseras ? lineaDePulseras(p.pulseras) : ''}
    <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0;">
      Comentario: ${p.comentario ? escapar(p.comentario) : 'sin comentario'}
    </p>`;
  return correoInternoTemplate({
    branding: p.companyName ? { companyName: p.companyName } : null,
    titulo: 'Cierre de la caja de recepción',
    bodyHtml,
    cta: {
      text: 'Revisar el cierre',
      link: 'https://www.eventi-app.com/facturacion',
    },
  });
};
