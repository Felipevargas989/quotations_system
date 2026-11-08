import {
  armarFoto,
  type FotoDeServicios,
  type ResultadoDelArmado,
} from 'src/quotations/generar/armar-foto';
import type { Catalogo } from 'src/quotations/generar/catalogo';
import { ofrecible } from 'src/quotations/generar/reglas-valle-del-sol';
import type { OfertaDeLaPropuesta } from '../generacion/oferta-de-la-propuesta';
import type { FilaDeLaMatriz } from './armar-la-oferta';
import type { DiaDeLaCotizacion } from './la-cotizacion-detallada';
import type { CotizacionDeLaPostulacion } from './postulacion.repository';

// LA COTIZACIÓN DE LO POSTULADO, SIN COTIZACIÓN VINCULADA (decisión 120 del
// doc 17, 08-11). Felipe: "si las bases piden una cotización, tenemos que
// armar una solamente en el módulo de oportunidades sin tener que hacer una
// eventia. Podemos tomar los valores, podemos tomar el catálogo, pero arma
// una tipo y la adjunto". Son dos casos de negocio:
//  - "cuando yo busco el mercado": no hay cotización. La de las bases sale
//    de lo postulado con los precios del catálogo, armada aquí en memoria
//    con la misma foto de «Crear la cotización» (`armarFoto`), y NO se crea
//    nada en Eventia. Si gana, la cotización de Eventia se crea con el
//    botón de la ganada (decisión 104);
//  - "cuando el mercado me busca": la municipalidad aprobó una cotización
//    antes de publicar. Se vincula y manda ella (decisión 119), como antes.
// El precio que manda es el que se escribe al armar, repartido sobre los
// precios del catálogo (el-reparto.ts): el catálogo no se toca.

/** Desde y hasta, AAAA-MM-DD; `hasta` null = un solo día. */
export type FechasDeLaCotizacion = { desde: string; hasta: string | null };

export type EventoDeLaOferta = {
  fecha: string;
  fin: string | null;
  personas: number;
};

const entero = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
};

const fechaIso = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** AAAA-MM-DD más n días (al mediodía UTC: sin saltos de zona horaria). */
export const sumarDias = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Cuántos días dura lo que se ofrece: el día más alto de las cajas y los
 *  fijos (0 en un fijo = todo el evento). */
export const diasDeLaOferta = (oferta: OfertaDeLaPropuesta): number =>
  Math.max(
    1,
    ...oferta.cajas.map((c) => c.dia),
    ...oferta.fijos.map((f) => f.dia),
  );

/** La fecha, el término y las personas. La fecha: la elegida al crear
 *  (decisión 69); si no, la de la cotización que se reescribe; si no, la
 *  de las bases; si no, el cierre. El término: el elegido (si es después
 *  de la fecha); si no, el de la cotización que se reescribe; si no, los
 *  días que dura lo que se ofrece. Las personas: las de las bases; si no,
 *  las de la caja más grande. */
export const elEventoDeLaOferta = (d: {
  oferta: OfertaDeLaPropuesta;
  /** El análisis de las bases, listo; null si no hay. */
  bases: Record<string, unknown> | null;
  cierre: string | null | undefined;
  destino?: {
    event_date: string | null;
    event_end_date?: string | null;
  } | null;
  elegidas?: Partial<FechasDeLaCotizacion>;
}): EventoDeLaOferta => {
  const desde = fechaIso(d.elegidas?.desde);
  const fecha =
    desde ??
    fechaIso(d.destino?.event_date?.slice(0, 10)) ??
    fechaIso(d.bases?.fecha_del_servicio_iso) ??
    fechaIso(d.cierre?.slice(0, 10)) ??
    new Date().toISOString().slice(0, 10);
  const despues = (v: string | null) => (v && v > fecha ? v : null);
  // Lo ofrecido de varios días necesita al menos esos días: el término
  // nunca queda antes (si se eligió uno más corto, se alarga).
  const dias = diasDeLaOferta(d.oferta);
  const necesario = dias > 1 ? sumarDias(fecha, dias - 1) : null;
  const pedido = desde
    ? despues(fechaIso(d.elegidas?.hasta))
    : d.destino
      ? despues(fechaIso(d.destino.event_end_date?.slice(0, 10)))
      : null;
  const fin = necesario && (!pedido || pedido < necesario) ? necesario : pedido;
  const personas =
    entero(d.bases?.personas) ||
    Math.max(1, ...d.oferta.cajas.map((c) => c.personas));
  return { fecha, fin, personas };
};

/** La foto del cotizador con lo postulado y los precios del catálogo: la
 *  misma que guarda «Crear la cotización». Sin descuento: el precio que
 *  manda lo reparte después el-reparto.ts. */
export const fotoDeLoPostulado = (
  oferta: OfertaDeLaPropuesta,
  catalogo: Catalogo,
  evento: EventoDeLaOferta,
): ResultadoDelArmado =>
  armarFoto(
    {
      ...oferta,
      // El último día, para que lo ofrecido de varios días calce (con ''
      // armarFoto contaba un solo día y rechazaba el día 2 en adelante:
      // el catamarán y el Profesor, 22-10, decisión 69).
      ultimo_dia: evento.fin ?? '',
      descuento_porcentaje: 0,
      presupuesto_cliente: { monto: 0, por: 'total' },
      nota: '',
    },
    catalogo,
    { ...evento, ninos: 0, esTourOperador: false },
    ofrecible,
  );

/** La cotización de lo postulado en memoria, con la forma de una de
 *  Eventia para que la lean `diasDeLaCotizacion` y `plazoDeLaCotizacion`.
 *  Sin número ni cliente: nunca se guarda. */
export const laCotizacionEnMemoria = (
  items: FotoDeServicios,
  evento: EventoDeLaOferta,
): CotizacionDeLaPostulacion => ({
  id: '',
  quotation_number: 0,
  quotation_status: 'lo_postulado',
  people_count: evento.personas,
  children_count: 0,
  event_date: evento.fecha,
  event_end_date: evento.fin,
  items: items as unknown as Record<string, unknown>,
  subtotal_amount: null,
  discount_amount: null,
  total_amount: null,
  client: null,
});

/** Lo que la oferta deja por definir o por confirmar no se promete. */
const SIN_DEFINIR = /\[(completar|por confirmar)\b/i;

/** Lo que va sin precio aparte (decisión 120). Felipe: "sin precio
 *  aparte, el precio es 1 el que ponemos al armar". Lo particular de la
 *  licitación que va con un producto del catálogo queda comprometido
 *  dentro de su línea (la taza de regalo, con la colación); lo particular
 *  suelto y lo que se subcontrata van en «También incluye», con el texto de
 *  la oferta, que ya trae las palabras de las bases. Lo que quedó por
 *  definir no va. */
export function sinPrecioAparte(
  dias: DiaDeLaCotizacion[],
  matriz: FilaDeLaMatriz[],
): { dias: DiaDeLaCotizacion[]; tambien: string[] } {
  const conDetalle = dias.map((d) => ({
    ...d,
    lineas: d.lineas.map((l) => ({ ...l })),
  }));
  const tambien: string[] = [];
  const agregar = (como: string) => {
    if (!tambien.includes(como)) tambien.push(como);
  };
  for (const f of matriz) {
    const como = f.como.replace(/\s+/g, ' ').trim();
    if (!como || SIN_DEFINIR.test(como)) continue;
    if (f.origen === 'subcontratar') {
      agregar(como);
      continue;
    }
    if (f.origen !== 'particular') continue;
    const ids = new Set(f.productos.map(String));
    const linea = conDetalle
      .flatMap((d) => d.lineas)
      .find((l) => (l.codigos ?? []).some((c) => ids.has(c)));
    if (!linea) {
      agregar(como);
      continue;
    }
    if (!linea.detalle.includes(como)) {
      linea.detalle = linea.detalle ? `${linea.detalle}; ${como}` : como;
    }
  }
  return { dias: conDetalle, tambien };
}
