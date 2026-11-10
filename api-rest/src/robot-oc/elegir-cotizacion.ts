/**
 * A QUÉ COTIZACIÓN VA UNA ORDEN DE COMPRA QUE LLEGÓ POR CORREO (doc 23).
 *
 * Felipe, 09-11-2026: *"la de CCU era por contacto: Daniela nos envió la
 * OC y quedó en la cotización de Daniela"*. El orden del cruce:
 *
 *   1. El cliente: por el RUT de la OC, por un correo igual a uno del
 *      cliente o, si no, por el dominio del correo (rudel.cl → Rudel).
 *   2. Si la OC ya está cargada en alguna cotización, no se vuelve a subir.
 *   3. Solo cotizaciones aceptadas o realizadas, cuyo total alcance para la
 *      OC (un anticipo es menor que el evento, nunca mayor).
 *   4. Si quedan varias: la del CONTACTO que mandó o compró; si siguen
 *      varias, la de total exacto.
 *   5. Si siguen varias, la FECHA (Felipe, 09-11-2026, caso Rudel: la #500
 *      de este mes contra la #199 de septiembre de 2025): un evento hecho
 *      hace más de 120 días ya no recibe órdenes nuevas y, entre las que
 *      quedan, gana la del evento más cercano a hoy si le saca 30 días a la
 *      siguiente. Si aun así no hay una clara, no se adivina: se devuelve la
 *      duda con las candidatas para que decida Felipe.
 */

export interface OcLeida {
  numero: string;
  total: number;
  /** RUT del cliente que compra, tal como viene en la OC. */
  rut?: string | null;
  /** Correos del que la mandó y del comprador que nombra la OC. */
  correos: string[];
}

export interface CotizacionCandidata {
  id: string;
  numero: number;
  estado: string;
  total: number;
  fecha_evento: string | null;
  cliente_id: string;
  cliente: string;
  /** Correo del contacto de ESTA cotización. */
  correo_contacto: string | null;
  /** Todos los correos del cliente (ficha y contactos). */
  correos_cliente: string[];
  ruts_cliente: string[];
  /** N° de OC ya cargadas (leídas por BelIA o en el nombre del PDF). */
  ocs_cargadas: string[];
}

export type Eleccion =
  | { resultado: 'elegida'; cotizacion: CotizacionCandidata; por: string }
  | { resultado: 'ya_estaba'; cotizacion: CotizacionCandidata }
  | { resultado: 'duda'; motivo: string; candidatas: CotizacionCandidata[] }
  | { resultado: 'sin_cliente'; motivo: string };

/** Dominios que no dicen de qué empresa es un correo. */
const DOMINIOS_GENERICOS = new Set([
  'gmail.com',
  'hotmail.com',
  'hotmail.cl',
  'outlook.com',
  'outlook.cl',
  'live.com',
  'live.cl',
  'yahoo.com',
  'yahoo.es',
  'icloud.com',
  'me.com',
  // Los propios: la OC de Rudel trae «Email: contacto@valledelsolquillon.cl».
  'valledelsolquillon.cl',
  'eventi-app.com',
]);

const ESTADOS_CON_OC = new Set(['aceptada', 'realizada']);
/** Holgura para comparar montos (redondeos de IVA). */
const HOLGURA = 1_000;
/** Un evento realizado hace más que esto ya no recibe órdenes nuevas. */
const DIAS_EVENTO_VIEJO = 120;
/** Lo que el evento más cercano le tiene que sacar al siguiente. */
const DIAS_VENTAJA = 30;
const DIA_MS = 86_400_000;

/** Días entre el evento y hoy (negativo si ya pasó); null sin fecha. */
const diasAlEvento = (c: CotizacionCandidata, hoy: Date) => {
  const t = c.fecha_evento ? Date.parse(c.fecha_evento) : NaN;
  return Number.isNaN(t) ? null : (t - hoy.getTime()) / DIA_MS;
};

/** Paso 5: la fecha. Devuelve la única clara o null. */
const porFecha = (lista: CotizacionCandidata[], hoy: Date) => {
  const vigentes = lista.filter((c) => {
    const d = diasAlEvento(c, hoy);
    return !(c.estado === 'realizada' && d !== null && d < -DIAS_EVENTO_VIEJO);
  });
  if (vigentes.length === 1) return vigentes[0];
  const conFecha = vigentes
    .map((c) => ({ c, d: diasAlEvento(c, hoy) }))
    .filter((x): x is { c: CotizacionCandidata; d: number } => x.d !== null)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  // Todas tienen que tener fecha para comparar; si no, no se adivina.
  if (conFecha.length !== vigentes.length || conFecha.length < 2) return null;
  return Math.abs(conFecha[1].d) - Math.abs(conFecha[0].d) >= DIAS_VENTAJA
    ? conFecha[0].c
    : null;
};

export const limpiarCorreo = (c: string | null | undefined) =>
  (c ?? '').trim().toLowerCase();

export const dominio = (c: string) => {
  const d = limpiarCorreo(c).split('@')[1] ?? '';
  return d && !DOMINIOS_GENERICOS.has(d) ? d : '';
};

export const limpiarRut = (r: string | null | undefined) =>
  (r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

/** «4505466941», «OC-024940-1», «N° 35074» → solo letras y números. */
export const limpiarNumero = (n: string | null | undefined) =>
  (n ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

/** La OC ya cargada: igual N° o el N° dentro del nombre del PDF. */
const yaCargada = (c: CotizacionCandidata, numero: string) =>
  numero.length >= 4 &&
  c.ocs_cargadas.some((o) => {
    const x = limpiarNumero(o);
    return x === numero || x.includes(numero);
  });

export function elegirCotizacion(
  oc: OcLeida,
  todas: CotizacionCandidata[],
  hoy: Date = new Date(),
): Eleccion {
  const numero = limpiarNumero(oc.numero);
  const rut = limpiarRut(oc.rut);
  const correos = oc.correos.map(limpiarCorreo).filter(Boolean);
  const dominios = new Set(correos.map(dominio).filter(Boolean));

  // 1. El cliente.
  const porRut = (c: CotizacionCandidata) =>
    !!rut && c.ruts_cliente.some((r) => limpiarRut(r) === rut);
  const porCorreo = (c: CotizacionCandidata) =>
    c.correos_cliente.some((x) => correos.includes(limpiarCorreo(x)));
  const porDominio = (c: CotizacionCandidata) =>
    c.correos_cliente.some((x) => dominios.has(dominio(x)));
  let delCliente = todas.filter((c) => porRut(c) || porCorreo(c));
  if (!delCliente.length) delCliente = todas.filter(porDominio);
  if (!delCliente.length)
    return {
      resultado: 'sin_cliente',
      motivo: 'Ningún cliente tiene ese RUT, ese correo ni ese dominio',
    };

  // 2. Ya cargada.
  const cargada = delCliente.find((c) => yaCargada(c, numero));
  if (cargada) return { resultado: 'ya_estaba', cotizacion: cargada };

  // 3. Aceptadas o realizadas, con total que alcance.
  const posibles = delCliente.filter(
    (c) => ESTADOS_CON_OC.has(c.estado) && oc.total <= c.total + HOLGURA,
  );
  if (!posibles.length)
    return {
      resultado: 'duda',
      motivo:
        'El cliente no tiene una cotización aceptada o realizada que alcance para esta OC',
      candidatas: delCliente.filter((c) => ESTADOS_CON_OC.has(c.estado)),
    };
  if (posibles.length === 1)
    return { resultado: 'elegida', cotizacion: posibles[0], por: 'única' };

  // 4. El contacto, después el total exacto.
  const delContacto = posibles.filter(
    (c) =>
      !!c.correo_contacto && correos.includes(limpiarCorreo(c.correo_contacto)),
  );
  if (delContacto.length === 1)
    return {
      resultado: 'elegida',
      cotizacion: delContacto[0],
      por: 'contacto',
    };
  const base = delContacto.length ? delContacto : posibles;
  const exactas = base.filter((c) => Math.abs(c.total - oc.total) <= HOLGURA);
  if (exactas.length === 1)
    return {
      resultado: 'elegida',
      cotizacion: exactas[0],
      por: delContacto.length ? 'contacto y total' : 'total',
    };

  // 5. La fecha.
  const empatadas = exactas.length > 1 ? exactas : base;
  const cercana = porFecha(empatadas, hoy);
  if (cercana)
    return {
      resultado: 'elegida',
      cotizacion: cercana,
      por: delContacto.length ? 'contacto y fecha' : 'fecha',
    };
  return {
    resultado: 'duda',
    motivo: 'Más de una cotización calza con esta OC',
    candidatas: empatadas,
  };
}
