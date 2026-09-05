import type { Quotation } from './entities/quotation.entity';

/**
 * EL CORREO TIPO de "Enviar cotización" (doc 13): el cuerpo con el
 * detalle de servicios, la tabla de totales con neto + IVA + total
 * (nunca el neto solo) y las reglas de la skill de correos hechas
 * código — fecha con día de semana CALCULADO, condiciones neutras que
 * no prometen bloqueo de fecha, sin guion largo en el texto, saludo y
 * cierre cálidos. Funciones puras: datos entran, HTML sale.
 *
 * Los cálculos replican los de la hoja
 * (frontend/src/utils/quotationPrintDoc.ts): la propina se recalcula
 * del porcentaje sobre los servicios por persona, el monto con IVA es
 * el total menos la propina, y el neto es ese monto / 1,19. Si la
 * hoja cambia su matemática, este archivo cambia con ella.
 */

const esc = (s: string): string =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const clp = (n: number): string =>
  '$' + Math.round(n || 0).toLocaleString('es-CL');

/** Los grupos variables reales llevan más campos que el tipo viejo
 *  de la entidad (day/audience/people, como los lee la hoja). */
type GrupoVariable = {
  category?: string;
  audience?: string;
  people?: number;
  items?: { nombre?: string; precio?: number; quantity?: number }[];
};

type ServicioFijo = { nombre?: string; precio?: number; quantity?: number };

const grupos = (q: Quotation): GrupoVariable[] =>
  (q.items?.variable_services || []) as GrupoVariable[];
const fijos = (q: Quotation): ServicioFijo[] =>
  (q.items?.fixed_services || []) as ServicioFijo[];

// ---------- La matemática de la hoja, calcada ----------

const personasDelGrupo = (g: GrupoVariable, q: Quotation): number => {
  const ninos = Number(q.children_count || 0);
  const adultos = Math.max(0, Number(q.people_count || 0) - ninos);
  if (typeof g.people === 'number') return g.people;
  const delPublico = g.audience === 'ninos' ? ninos : adultos;
  return delPublico || Number(q.people_count || 0);
};

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
  return { neto, iva, totalConIva, propina, descuento, tipPct };
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

const filaTabla = (
  nombre: string,
  detalle: string,
  total: number,
): string => `<tr>
  <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${esc(nombre)}${
    detalle
      ? `<br /><span style="font-size:12px;color:#6b7280;">${esc(detalle)}</span>`
      : ''
  }</td>
  <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;white-space:nowrap;">${clp(total)}</td>
</tr>`;

const filaTotal = (
  rotulo: string,
  monto: number,
  opciones?: { fuerte?: boolean },
): string => `<tr>
  <td style="padding:5px 12px;font-size:${opciones?.fuerte ? '15px' : '13px'};color:${
    opciones?.fuerte ? '#111827' : '#6b7280'
  };${opciones?.fuerte ? 'font-weight:700;' : ''}text-align:right;">${esc(rotulo)}</td>
  <td style="padding:5px 12px;font-size:${opciones?.fuerte ? '15px' : '13px'};color:${
    opciones?.fuerte ? '#111827' : '#374151'
  };${opciones?.fuerte ? 'font-weight:700;' : ''}text-align:right;white-space:nowrap;width:130px;">${clp(monto)}</td>
</tr>`;

/**
 * Arma asunto, título y cuerpo del correo tipo. El PDF adjunto lleva
 * el detalle completo; el cuerpo resume servicios y totales.
 */
export const correoDeCotizacion = (
  q: Quotation & { clients?: { name?: string | null } | null },
  nombreEmpresa: string,
  nombreContacto: string | null,
): { asunto: string; titulo: string; cuerpoHtml: string } => {
  const fecha = fechaLargaDelEvento(q.event_date);
  const evento = String(q.event_type || 'evento');
  const cliente = String(q.clients?.name || '').trim();
  const t = totalesDeCotizacion(q);

  const asunto = `Cotización ${evento}${cliente ? ` ${cliente}` : ''} — ${fecha}`;
  const titulo = `Cotización N.º ${q.quotation_number}`;

  const filas: string[] = [];
  for (const g of grupos(q)) {
    const personas = personasDelGrupo(g, q);
    const unitario = porPersona(g);
    const publico = g.audience === 'ninos' ? 'niños' : 'personas';
    filas.push(
      filaTabla(
        g.category || 'Servicios por persona',
        `${clp(unitario)} por persona, ${personas} ${publico}`,
        unitario * personas,
      ),
    );
  }
  for (const f of fijos(q)) {
    const cantidad = f.quantity || 1;
    const detalle =
      cantidad > 1
        ? `${clp(f.precio || 0)} cada uno, ${cantidad} unidades`
        : '';
    filas.push(
      filaTabla(f.nombre || 'Servicio', detalle, (f.precio || 0) * cantidad),
    );
  }

  const totales: string[] = [];
  if (t.descuento > 0) {
    totales.push(filaTotal('Descuento incluido', -t.descuento));
  }
  totales.push(filaTotal('Neto', t.neto));
  totales.push(filaTotal('IVA (19%)', t.iva));
  totales.push(
    filaTotal('Total con IVA', t.totalConIva, { fuerte: !t.propina }),
  );
  if (t.propina > 0) {
    totales.push(
      filaTotal(`Propina sugerida (${String(t.tipPct)}%)`, t.propina),
    );
    totales.push(
      filaTotal('Total con propina', t.totalConIva + t.propina, {
        fuerte: true,
      }),
    );
  }

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
      }. Adjuntamos el documento completo en PDF con todo el detalle.`,
    ),
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 6px;">
      <tr>
        <td style="padding:9px 12px;background-color:#f9fafb;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Servicio</td>
        <td style="padding:9px 12px;background-color:#f9fafb;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Valor</td>
      </tr>
      ${filas.join('\n')}
    </table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;">${totales.join(
      '\n',
    )}</table>`,
    parrafo(
      'Los valores incluyen IVA. Para confirmar la fecha, el siguiente paso es coordinar el abono de reserva; cualquier ajuste al programa lo conversamos.',
    ),
    parrafo(
      'Si quieres modificar algo o tienes preguntas, responde este mismo correo y te ayudamos con gusto.',
    ),
    parrafo(`Saludos cordiales,<br />Equipo ${esc(nombreEmpresa)}`),
  ].join('\n');

  return { asunto, titulo, cuerpoHtml };
};
