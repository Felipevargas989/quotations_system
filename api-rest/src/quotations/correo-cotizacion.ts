import type { Quotation } from './entities/quotation.entity';

/**
 * EL CORREO TIPO de "Enviar cotización" (doc 13): el cuerpo replica la
 * ESTRUCTURA DE VALORES de la hoja (pedido de Felipe, validación
 * 05-09: "ocupa esta estructura con el formato que ya tienes") —
 * Valores · servicios de alimentación con el valor por persona,
 * Servicios fijos del evento, subtotales en la franja del color
 * secundario y el TOTAL en la barra del color primario. Nunca el neto
 * solo: el bloque Neto + IVA + TOTAL siempre completo.
 *
 * La matemática y las filas calcan las de la hoja
 * (frontend/src/utils/quotationPrintDoc.ts): valor por persona =
 * suma de los grupos completos por público; los grupos parciales van
 * en su propia fila; la propina se recalcula del porcentaje sobre la
 * alimentación. Si la hoja cambia, este archivo cambia con ella.
 *
 * Reglas de la skill de correos hechas código: fecha con día de
 * semana CALCULADO, condiciones neutras que no prometen bloqueo de
 * fecha, sin guion largo en el texto, saludo y cierre cálidos.
 */

const esc = (s: string): string =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const clp = (n: number): string =>
  '$' + Math.round(n || 0).toLocaleString('es-CL');

/** Lo que el correo necesita de la marca (misma MarcaEmpresa). */
export interface MarcaDelCorreo {
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
}

/** Gemela de textoSobre (marketing/plantilla.ts) y de onBrandP en la
 *  hoja: blanco o casi negro según la luminosidad del fondo. */
const textoSobreFondo = (fondo: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(fondo || '').trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255;
  return lum > 0.6 ? '#111827' : '#ffffff';
};

const esClaro = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (
    (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) /
      1000 >
    200
  );
};

/** Los grupos variables reales llevan más campos que el tipo viejo
 *  de la entidad (day/audience/people, como los lee la hoja). */
type GrupoVariable = {
  category?: string;
  audience?: string;
  people?: number;
  items?: { nombre?: string; precio?: number; quantity?: number }[];
};

type ServicioFijo = {
  nombre?: string;
  precio?: number;
  quantity?: number;
  day?: number;
};

const grupos = (q: Quotation): GrupoVariable[] =>
  (q.items?.variable_services || []) as GrupoVariable[];
const fijos = (q: Quotation): ServicioFijo[] =>
  (q.items?.fixed_services || []) as ServicioFijo[];

// ---------- La matemática de la hoja, calcada ----------

const ninosDe = (q: Quotation): number => Number(q.children_count || 0);
const adultosDe = (q: Quotation): number =>
  Math.max(0, Number(q.people_count || 0) - ninosDe(q));

const audienciaDe = (g: GrupoVariable): 'ninos' | 'adultos' =>
  g.audience === 'ninos' ? 'ninos' : 'adultos';

const publicoDelGrupo = (g: GrupoVariable, q: Quotation): number =>
  audienciaDe(g) === 'ninos' ? ninosDe(q) : adultosDe(q);

const personasDelGrupo = (g: GrupoVariable, q: Quotation): number => {
  if (typeof g.people === 'number') return g.people;
  return publicoDelGrupo(g, q) || Number(q.people_count || 0);
};

const esCompleto = (g: GrupoVariable, q: Quotation): boolean =>
  personasDelGrupo(g, q) === publicoDelGrupo(g, q);

const porPersona = (g: GrupoVariable): number =>
  (g.items || []).reduce(
    (s, it) => s + (it.precio || 0) * (it.quantity || 1),
    0,
  );

export const totalesDeCotizacion = (q: Quotation) => {
  const variableTotal = grupos(q).reduce(
    (s, g) => s + porPersona(g) * personasDelGrupo(g, q),
    0,
  );
  const perAdulto = grupos(q)
    .filter((g) => audienciaDe(g) === 'adultos' && esCompleto(g, q))
    .reduce((s, g) => s + porPersona(g), 0);
  const perNino = grupos(q)
    .filter((g) => audienciaDe(g) === 'ninos' && esCompleto(g, q))
    .reduce((s, g) => s + porPersona(g), 0);
  const parciales = grupos(q).filter((g) => !esCompleto(g, q));
  const fixedTotal = fijos(q).reduce(
    (s, f) => s + (f.precio || 0) * (f.quantity || 1),
    0,
  );
  const tipPct = q.tip_percentage;
  const propina =
    tipPct != null && tipPct > 0
      ? Math.round(variableTotal * (tipPct / 100))
      : 0;
  const totalConIva = Math.round(Number(q.total_amount || 0) - propina);
  const neto = Math.round(totalConIva / 1.19);
  const iva = totalConIva - neto;
  const subtotal = Math.round(Number(q.subtotal_amount || 0));
  const descuento = Math.max(0, subtotal - totalConIva);
  return {
    neto,
    iva,
    totalConIva,
    propina,
    descuento,
    subtotal,
    tipPct,
    variableTotal,
    fixedTotal,
    perAdulto,
    perNino,
    parciales,
  };
};

// ---------- El portero del envío (doc 13) ----------

/** Frenos deterministas que BLOQUEAN, cada uno con qué reparar. */
export const reparosDelPortero = (
  q: Quotation,
  correoDestino: string | null,
): string[] => {
  const reparos: string[] = [];
  if (!correoDestino) {
    reparos.push(
      'La cotización no tiene un correo de destino: agrega el correo a la persona de contacto o al cliente.',
    );
  }
  if (Math.round(Number(q.total_amount || 0)) <= 0) {
    reparos.push('La cotización tiene total $0: revisa los montos.');
  }
  const enCero: string[] = [];
  for (const g of grupos(q)) {
    for (const it of g.items || []) {
      if (!it.precio || it.precio <= 0) enCero.push(it.nombre || 'sin nombre');
    }
  }
  for (const f of fijos(q)) {
    if (!f.precio || f.precio <= 0) enCero.push(f.nombre || 'sin nombre');
  }
  if (enCero.length) {
    reparos.push(
      `Hay servicios con precio $0 (${enCero.slice(0, 3).join(', ')}${
        enCero.length > 3 ? '…' : ''
      }): corrige el precio o quítalos antes de enviar.`,
    );
  }
  return reparos;
};

// ---------- Fechas (UTC medianoche, como la hoja) ----------

/** "sábado 14 de marzo de 2026" con el día de semana CALCULADO
 *  (es-CL pone coma tras el día de semana; la casa escribe sin ella). */
export const fechaLargaDelEvento = (fecha: Date | string): string =>
  new Date(fecha)
    .toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .replace(', ', ' ');

// ---------- El correo ----------

const primerNombre = (nombre: string | null | undefined): string => {
  const limpio = String(nombre || '').trim();
  if (!limpio) return '';
  const primera = limpio.split(/\s+/)[0];
  return primera.charAt(0).toUpperCase() + primera.slice(1);
};

/**
 * Arma asunto, título y cuerpo del correo tipo. El cuerpo es el
 * espejo de la sección de valores de la hoja; el PDF adjunto lleva
 * el documento completo.
 */
export const correoDeCotizacion = (
  q: Quotation & { clients?: { name?: string | null } | null },
  marca: MarcaDelCorreo,
  nombreContacto: string | null,
): { asunto: string; titulo: string; cuerpoHtml: string } => {
  const fecha = fechaLargaDelEvento(q.event_date);
  const evento = String(q.event_type || 'evento');
  const cliente = String(q.clients?.name || '').trim();
  const t = totalesDeCotizacion(q);
  const primario = marca.colorPrimario || '#134686';
  const sobrePrimario = textoSobreFondo(primario);
  // La franja de subtotales usa el secundario solo si es claro, como
  // la hoja y el pie del correo (un acento saturado va sobre neutro).
  const franja =
    marca.colorSecundario && esClaro(marca.colorSecundario)
      ? marca.colorSecundario
      : '#f9fafb';

  const asunto = `Cotización ${evento}${cliente ? ` ${cliente}` : ''} — ${fecha}`;
  const titulo = `Cotización N.º ${q.quotation_number}`;

  // -- celdas con el formato de la hoja --
  const celda = (html: string, extra = ''): string =>
    `<td style="font-size:13px;padding:7px 10px;border-bottom:1px solid #f3f4f6;color:#1f2937;${extra}">${html}</td>`;
  const celdaDer = (html: string): string =>
    celda(
      html,
      'text-align:right;white-space:nowrap;font-weight:600;color:#111827;',
    );
  const celdaGris = (html: string): string =>
    celda(html, 'text-align:right;white-space:nowrap;color:#6b7280;');
  const tag = (texto: string, color: string): string =>
    `<span style="color:${color};font-weight:800;font-size:10px;letter-spacing:.5px;">${texto}</span>`;
  const filaSub = (rotulo: string, monto: number, colspan: number): string =>
    `<tr><td colspan="${String(colspan)}" style="font-size:13px;padding:7px 10px;font-weight:800;color:#111827;background-color:${franja};">${esc(rotulo)}</td><td style="font-size:13px;padding:7px 10px;font-weight:800;color:#111827;background-color:${franja};text-align:right;white-space:nowrap;">${clp(monto)}</td></tr>`;
  const encabezado = (texto: string): string =>
    `<p style="font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:${primario};margin:22px 0 8px;">${esc(texto)}</p>`;

  const adultos = adultosDe(q);
  const ninos = ninosDe(q);

  // -- Valores · servicios de alimentación (el calco de la hoja) --
  const filasAlimentacion: string[] = [];
  if (adultos > 0 && t.perAdulto > 0) {
    filasAlimentacion.push(
      `<tr>${celda(`${tag('ADULTOS', primario)} &nbsp;Valor por persona`)}${celdaGris(
        `${adultos.toLocaleString('es-CL')} personas`,
      )}${celdaGris(clp(t.perAdulto))}${celdaDer(clp(t.perAdulto * adultos))}</tr>`,
    );
  }
  if (ninos > 0 && t.perNino > 0) {
    filasAlimentacion.push(
      `<tr>${celda(`${tag('NIÑOS', '#b45309')} &nbsp;Valor por persona`)}${celdaGris(
        `${ninos.toLocaleString('es-CL')} personas`,
      )}${celdaGris(clp(t.perNino))}${celdaDer(clp(t.perNino * ninos))}</tr>`,
    );
  }
  for (const g of t.parciales) {
    const personas = personasDelGrupo(g, q);
    filasAlimentacion.push(
      `<tr>${celda(esc(g.category || 'Servicio'))}${celdaGris(
        `${personas.toLocaleString('es-CL')} personas`,
      )}${celdaGris(clp(porPersona(g)))}${celdaDer(clp(porPersona(g) * personas))}</tr>`,
    );
  }

  const bloqueAlimentacion = filasAlimentacion.length
    ? `${encabezado('Valores · Servicios de alimentación')}
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
         ${filasAlimentacion.join('\n')}
         ${filaSub('Subtotal alimentación', t.variableTotal, 3)}
       </table>`
    : '';

  // -- Servicios fijos del evento --
  const filasFijos = fijos(q).map((f) => {
    const qty = f.quantity || 1;
    const extra =
      qty > 1
        ? ` <span style="color:#6b7280;font-weight:400;">×${String(qty)}</span>`
        : '';
    return `<tr>${celda(`${esc(f.nombre || 'Servicio')}${extra}`)}${celdaDer(clp((f.precio || 0) * qty))}</tr>`;
  });
  const bloqueFijos = filasFijos.length
    ? `${encabezado('Servicios fijos del evento')}
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
         ${filasFijos.join('\n')}
         ${filaSub('Subtotal servicios fijos', t.fixedTotal, 1)}
       </table>`
    : '';

  // -- El resumen: Neto + IVA + TOTAL, jamás el neto solo --
  const lineaResumen = (rotulo: string, monto: string): string =>
    `<tr><td style="font-size:13px;color:#4b5563;padding:4px 12px;">${esc(rotulo)}</td><td style="font-size:13px;color:#111827;font-weight:700;padding:4px 12px;text-align:right;white-space:nowrap;">${monto}</td></tr>`;
  const filasResumen: string[] = [];
  if (t.descuento > 0) {
    filasResumen.push(lineaResumen('Subtotal', clp(t.subtotal)));
    filasResumen.push(lineaResumen('Descuento', `−${clp(t.descuento)}`));
  }
  filasResumen.push(lineaResumen('Neto', clp(t.neto)));
  filasResumen.push(lineaResumen('IVA (19%)', clp(t.iva)));
  const barraTotal = (rotulo: string, monto: number): string =>
    `<tr><td style="background-color:${primario};color:${sobrePrimario};font-size:14px;font-weight:800;padding:9px 12px;border-radius:6px 0 0 6px;">${esc(rotulo)}</td><td style="background-color:${primario};color:${sobrePrimario};font-size:14px;font-weight:800;padding:9px 12px;text-align:right;white-space:nowrap;border-radius:0 6px 6px 0;">${clp(monto)}</td></tr>`;
  if (t.propina > 0) {
    filasResumen.push(
      `<tr><td style="background-color:#fef3c7;font-size:13px;font-weight:800;color:#111827;padding:7px 12px;border-radius:6px 0 0 6px;">Total con IVA</td><td style="background-color:#fef3c7;font-size:13px;font-weight:800;color:#111827;padding:7px 12px;text-align:right;white-space:nowrap;border-radius:0 6px 6px 0;">${clp(t.totalConIva)}</td></tr>`,
    );
    filasResumen.push(
      lineaResumen(
        `Propina sugerida (${String(t.tipPct)}% alimentación)`,
        clp(t.propina),
      ),
    );
    filasResumen.push(barraTotal('TOTAL', t.totalConIva + t.propina));
  } else {
    filasResumen.push(barraTotal('TOTAL', t.totalConIva));
  }
  const bloqueResumen = `<table role="presentation" cellpadding="0" cellspacing="0" align="right" style="width:320px;max-width:100%;border-collapse:separate;border-spacing:0 2px;margin:14px 0 4px;">${filasResumen.join('\n')}</table><div style="clear:both;"></div>`;

  const parrafo = (html: string): string =>
    `<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px;">${html}</p>`;

  const saludo = primerNombre(nombreContacto);
  const personas = Number(q.people_count || 0);

  const cuerpoHtml = [
    parrafo(`Hola${saludo ? ` ${esc(saludo)}` : ''}:`),
    parrafo(
      `¡Gracias por cotizar con nosotros! Te compartimos la cotización para tu ${esc(
        evento.toLowerCase(),
      )} del ${esc(fecha)}${
        personas ? `, para ${String(personas)} personas` : ''
      }. Adjuntamos el documento completo en PDF con el programa y todo el detalle.`,
    ),
    bloqueAlimentacion,
    bloqueFijos,
    bloqueResumen,
    parrafo(
      'Los valores incluyen IVA. Para confirmar la fecha, el siguiente paso es coordinar el abono de reserva; cualquier ajuste al programa lo conversamos.',
    ),
    parrafo(
      'Si quieres modificar algo o tienes preguntas, responde este mismo correo y te ayudamos con gusto.',
    ),
    parrafo(`Saludos cordiales,<br />Equipo ${esc(marca.nombre)}`),
  ]
    .filter(Boolean)
    .join('\n');

  return { asunto, titulo, cuerpoHtml };
};
