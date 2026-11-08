import { desgloseDeOferta, pesos } from '../generacion/la-plata';
import type { PiezaDelSet } from './el-set';
import { papelesSinFormato, quienLoHace } from './los-papeles';
import type { CotizacionDeLaPostulacion } from './postulacion.repository';
import {
  ANCHO,
  BLANCO,
  celda,
  corrida,
  deDatos,
  empaquetarElWord,
  fila,
  laFirma,
  parrafo,
  SIN_MARCA,
  tabla,
  titulo,
} from './word-de-la-casa';

export { medidasDeLaImagen } from './word-de-la-casa';

// LA COTIZACIÓN DETALLADA, DESDE LA COTIZACIÓN VINCULADA (decisión 119 del
// doc 17, 07-11, parte 2). Felipe, con la 2705-1740-COT26, que pedía una
// «cotización detallada (con plazo de entrega, detalle de lo ofertado y
// datos bancarios)» y que «Armar postulación» no hizo: "todos los
// documentos debieron generarse", "si está vinculada a una cotización, la
// arme en base a esa cotización" y "con nuestro formato". La arma el motor,
// sin IA: cada servicio de la cotización con su precio repartido hasta el
// precio que se postula (el-reparto.ts, sin línea de descuento: Felipe,
// 07-11, "la cotización manda en los servicios", no en el precio), el neto
// y el IVA de `desgloseDeOferta`, el plazo y los datos bancarios de
// Configuración de empresa. El Word se arma a mano, como el ZIP
// (`armarZip`), y se firma después con «Firmar».

// Como el de `el-set.ts`, aquí: el set lee este archivo y no se importan en
// círculo.
const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();

/** El nombre de la cotización en «Mi postulación»: «Cotización detallada»
 *  con el precio de cada servicio, «Cotización» en una sola línea. */
export const nombreDeLaCotizacionDetallada = (
  codigo: string,
  detallada = true,
): string => `Cotización${detallada ? ' detallada' : ''} ${codigo}.docx`;

/** ¿Es la cotización que arma el motor (o su firmado, o una subida a mano
 *  con ese nombre)? */
export const esLaCotizacionDetallada = (nombre: string): boolean =>
  /^cotizacion\b/.test(normalizar(nombre));

/** ¿Las bases piden una cotización como documento? En la sección 4 del
 *  análisis («Lo que tienes que presentar»), con la oferta. Desde la parte
 *  3b (08-11) también con otro nombre («Oferta económica…», «Formato N°3 -
 *  Oferta económica» sin su formato): lo dice `quienLoHace`. Si trae su
 *  formulario con archivo, lo llena la IA y no se arma aparte. */
export const pidenLaCotizacion = (
  resultado: Record<string, unknown> | null | undefined,
): boolean =>
  papelesSinFormato(resultado).some((p) => p.quien?.quien === 'cotizacion');

/** ¿Piden el precio de cada servicio? Una «cotización detallada», con
 *  desglose o con precios unitarios. Si no, la cotización va en una sola
 *  línea, con lo que incluye y sin precio por ítem (Felipe eligió ese
 *  formato con la 3904-996-COT26 de Bulnes, que pedía una cotización formal
 *  y aparte el detalle del servicio, sin costos). */
export const pidenElDetalle = (
  resultado: Record<string, unknown> | null | undefined,
): boolean =>
  (Array.isArray(resultado?.documentos) ? resultado.documentos : []).some(
    (d: { nombre?: unknown; condicion?: unknown }) => {
      const t = normalizar(
        `${typeof d?.nombre === 'string' ? d.nombre : ''} ${typeof d?.condicion === 'string' ? d.condicion : ''}`,
      );
      return (
        (/\bcotizacion\b/.test(t) || quienLoHace(t)?.quien === 'cotizacion') &&
        /detallad|desglos|por item|unitari|por servicio|por persona|por linea|por unidad|por jornada/.test(
          t,
        )
      );
    },
  );

/** Lo que dice el set si las bases piden la cotización y no va: la arma
 *  «Armar postulación» desde lo postulado (decisión 120) o desde la
 *  cotización vinculada, o se sube a mano. null si va o no la piden. */
export const laCotizacionQueFalta = (
  documentos: unknown[],
  piezas: PiezaDelSet[],
  formularios: unknown[] = [],
): string | null =>
  pidenLaCotizacion({ documentos, formularios }) &&
  !piezas.some(
    (p) =>
      p.que_es === 'cotizacion' ||
      (p.que_es === 'subido' &&
        (/cotizacion/.test(normalizar(p.nombre)) ||
          quienLoHace(p.nombre)?.quien === 'cotizacion')),
  )
    ? 'Las bases piden una cotización: vuelve a armar la postulación (la arma Eventia con lo postulado, o con tu cotización si la vinculas), o súbela hecha a «Mi postulación».'
    : null;

export type LineaDeLaCotizacion = {
  servicio: string;
  /** Vacío en un servicio fijo: su nombre ya lo dice. */
  detalle: string;
  cantidad: string;
  /** La cantidad en número: la de un servicio fijo, las personas de una
   *  comida. */
  unidades: number;
  unitario: number;
  total: number;
  /** Del reparto del precio (el-reparto.ts): lo mismo en neto, para el
   *  formulario que pide precios netos. */
  unitarioNeto?: number;
  totalNeto?: number;
  /** Los ids del catálogo de sus productos: ahí va lo particular que la
   *  oferta compromete con ellos (decisión 120). */
  codigos?: string[];
};

export type DiaDeLaCotizacion = {
  titulo: string;
  lineas: LineaDeLaCotizacion[];
  subtotal: number;
};

type Fila = Record<string, unknown>;

const filas = (v: unknown): Fila[] =>
  Array.isArray(v)
    ? v.filter((x): x is Fila => Boolean(x && typeof x === 'object'))
    : [];

const texto = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** El código de un producto: texto en la foto del cotizador, a veces
 *  número. */
const codigoDe = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : texto(v);

const codigosDe = (productos: Fila[]): string[] =>
  productos.map((p) => codigoDe(p.codigo)).filter(Boolean);

const diaDe = (f: Fila): number => {
  const d = Number(f.day);
  return Number.isInteger(d) && d > 0 ? d : 0;
};

/** «miércoles 11 de noviembre de 2026». Las fechas del evento son la
 *  medianoche UTC: se leen en UTC para no correrlas un día. */
export const fechaDelDia = (iso: string): string =>
  new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
    .replace(',', '');

const sumarDias = (iso: string, dias: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Los días de la cotización con sus líneas: cada servicio fijo y cada
 *  comida por persona, con los precios de la cotización. */
export const diasDeLaCotizacion = (
  q: CotizacionDeLaPostulacion,
): DiaDeLaCotizacion[] => {
  const items = (q.items ?? {}) as Fila;
  const fijos = filas(items.fixed_services);
  const variables = filas(items.variable_services);
  const dias = [...new Set([...fijos, ...variables].map(diaDe))].sort(
    (a, b) => a - b,
  );
  return dias.map((d) => {
    const lineas: LineaDeLaCotizacion[] = [];
    for (const f of fijos.filter((x) => diaDe(x) === d)) {
      const cantidad = Math.max(1, numero(f.quantity));
      const unitario = numero(f.precio);
      lineas.push({
        servicio: texto(f.nombre) || 'Servicio',
        detalle: '',
        cantidad: String(cantidad),
        unidades: cantidad,
        unitario,
        total: unitario * cantidad,
        codigos: codigosDe([f]),
      });
    }
    for (const v of variables.filter((x) => diaDe(x) === d)) {
      const productos = filas(v.items);
      const personas = Math.max(1, numero(v.people) || q.people_count || 1);
      const unitario = productos.reduce(
        (s, p) => s + numero(p.precio) * Math.max(1, numero(p.quantity)),
        0,
      );
      lineas.push({
        servicio: texto(v.category) || 'Servicio',
        detalle: productos
          .map((p) => {
            const n = Math.max(1, numero(p.quantity));
            return `${texto(p.nombre)}${n > 1 ? ` ×${n}` : ''}`;
          })
          .filter(Boolean)
          .join('; '),
        cantidad: `${personas} personas`,
        unidades: personas,
        unitario,
        total: unitario * personas,
        codigos: codigosDe(productos),
      });
    }
    const fecha = q.event_date
      ? sumarDias(q.event_date, d > 0 ? d - 1 : 0)
      : null;
    const titulo = fecha
      ? fechaDelDia(fecha).replace(/^./, (c) => c.toUpperCase())
      : d > 0
        ? `Día ${d}`
        : 'Todo el evento';
    return {
      titulo,
      lineas,
      subtotal: lineas.reduce((s, l) => s + l.total, 0),
    };
  });
};

/** «el miércoles 11 y el jueves 12 de noviembre de 2026». */
export const plazoDeLaCotizacion = (
  q: CotizacionDeLaPostulacion,
): string | null => {
  if (!q.event_date) return null;
  const desde = q.event_date.slice(0, 10);
  const hasta = (q.event_end_date ?? q.event_date).slice(0, 10);
  const fechas: string[] = [];
  for (let f = desde; f <= hasta && fechas.length < 31; f = sumarDias(f, 1)) {
    fechas.push(f);
  }
  const largas = fechas.map(fechaDelDia);
  if (largas.length === 1) return `el ${largas[0]}`;
  // Del mismo mes y año, solo el último lleva «de noviembre de 2026».
  const cola = (s: string) => s.replace(/^\S+ \d+ /, '');
  const mismaCola = largas.every((l) => cola(l) === cola(largas[0]));
  const partes = largas.map((l, i) =>
    mismaCola && i < largas.length - 1 ? l.replace(/ de .*$/, '') : l,
  );
  return `el ${partes.slice(0, -1).join(', el ')} y el ${partes[partes.length - 1]}`;
};

export type DatosDeLaCotizacionDetallada = {
  /** «Compra Ágil 2705-1740-COT26» o «Licitación 4364-13-LE26». */
  proceso: string;
  nombre: string;
  comprador: string | null;
  /** El N° de la cotización vinculada; null si sale de lo postulado, sin
   *  cotización en Eventia (decisión 120). */
  numero: number | null;
  /** «7 de noviembre de 2026». */
  fecha: string;
  proveedor: Array<[string, string]>;
  /** Con el detalle, repartidos hasta el precio que se postula
   *  (`repartirElPrecio`): suman justo `total`. En una sola línea, solo
   *  dicen lo que incluye. */
  dias: DiaDeLaCotizacion[];
  /** El precio que se postula, con IVA. */
  total: number;
  /** Una sola línea por el total, con lo que incluye y sin precio por ítem:
   *  si las bases no piden el detalle de precios (decisión 119). */
  unaSolaLinea?: boolean;
  /** Lo que se compromete sin precio aparte, dentro del mismo precio: lo
   *  particular suelto y lo que se subcontrata (decisión 120). */
  tambien?: string[];
  /** Lo que la propuesta técnica describe: se nombra si va. */
  conPropuesta: boolean;
  /** Los colores de la marca (Configuración de empresa), RRGGBB; sin
   *  ellos, grises sobrios. */
  marca?: { primario: string; secundario: string } | null;
  plazo: string | null;
  /** Dónde: solo si las bases dicen que es en el recinto de la empresa. */
  lugar: string | null;
  banco: Array<[string, string]>;
  firma: { nombre: string; razonSocial: string };
  logo?: { datos: Buffer; tipo: 'png' | 'jpeg' } | null;
};

// ---------------------------------------------------------------- el Word

// Las piezas del Word de la casa viven en `word-de-la-casa.ts` (08-11),
// para que las usen también las declaraciones.

const A_DETALLE = [1750, 4222, 1300, 1350, 1350];

/** «Incluye: miércoles 11 de noviembre de 2026: salón…; desayuno para 20
 *  personas (té, café…)». Sin precios. */
export const loQueIncluye = (dias: DiaDeLaCotizacion[]): string =>
  `Incluye: ${dias
    .map(
      (d, i) =>
        // El primer día va en minúscula tras «Incluye:»; los demás, tras un
        // punto, con mayúscula.
        `${i === 0 ? d.titulo.replace(/^./, (c) => c.toLowerCase()) : d.titulo}: ${d.lineas
          .map((l) =>
            l.detalle
              ? `${l.servicio} para ${l.cantidad} (${l.detalle})`
              : l.servicio,
          )
          .join('; ')}`,
    )
    .join('. ')}.`;

/** El cuerpo del Word, sin el logo. */
const cuerpo = (d: DatosDeLaCotizacionDetallada): string[] => {
  // Con el detalle, los precios ya vienen repartidos hasta el precio que se
  // postula (el-reparto.ts): sin línea de descuento. Si no suman justo, no
  // sale un Word que se contradice.
  const suma = d.dias.reduce((s, x) => s + x.subtotal, 0);
  if (!d.unaSolaLinea && suma !== d.total) {
    throw new Error(
      `el detalle suma ${pesos(suma)} y el precio es ${pesos(d.total)}`,
    );
  }
  const { neto, iva } = desgloseDeOferta(d.total);
  const { primario, secundario } = d.marca ?? SIN_MARCA;
  const cuatro = A_DETALLE.slice(0, 4).reduce((s, a) => s + a, 0);
  const tot = (etiqueta: string, valor: string, fuerte = false) =>
    fila(
      celda(etiqueta, {
        ancho: cuatro,
        juntas: 4,
        alineado: 'right',
        negrita: fuerte,
        fondo: fuerte ? primario : undefined,
        color: fuerte ? BLANCO : undefined,
      }),
      celda(valor, {
        ancho: A_DETALLE[4],
        alineado: 'right',
        negrita: fuerte,
        fondo: fuerte ? primario : undefined,
        color: fuerte ? BLANCO : undefined,
      }),
    );
  const detalle: string[] = [
    fila(
      ...['Servicio', 'Detalle', 'Cantidad', 'Valor unitario', 'Total'].map(
        (t, i) =>
          celda(t, {
            ancho: A_DETALLE[i],
            negrita: true,
            fondo: primario,
            color: BLANCO,
            tam: 18,
            mayus: true,
            espaciado: 10,
            alineado: i === 2 ? 'center' : i > 2 ? 'right' : 'left',
          }),
      ),
    ),
  ];
  if (d.unaSolaLinea) {
    detalle.push(
      fila(
        celda('Servicio integral', { ancho: A_DETALLE[0] }),
        celda(loQueIncluye(d.dias), { ancho: A_DETALLE[1] }),
        celda('1 servicio', { ancho: A_DETALLE[2], alineado: 'center' }),
        celda(pesos(d.total), { ancho: A_DETALLE[3], alineado: 'right' }),
        celda(pesos(d.total), { ancho: A_DETALLE[4], alineado: 'right' }),
      ),
    );
  }
  for (const dia of d.unaSolaLinea ? [] : d.dias) {
    detalle.push(
      fila(
        celda(dia.titulo, {
          ancho: ANCHO,
          juntas: 5,
          negrita: true,
          fondo: secundario,
          color: primario,
        }),
      ),
    );
    for (const l of dia.lineas) {
      const nombre = l.detalle
        ? [
            celda(l.servicio, { ancho: A_DETALLE[0] }),
            celda(l.detalle, { ancho: A_DETALLE[1] }),
          ]
        : [
            celda(l.servicio, {
              ancho: A_DETALLE[0] + A_DETALLE[1],
              juntas: 2,
            }),
          ];
      detalle.push(
        fila(
          ...nombre,
          celda(l.cantidad, { ancho: A_DETALLE[2], alineado: 'center' }),
          celda(pesos(l.unitario), { ancho: A_DETALLE[3], alineado: 'right' }),
          celda(pesos(l.total), { ancho: A_DETALLE[4], alineado: 'right' }),
        ),
      );
    }
    if (d.dias.length > 1) {
      detalle.push(
        tot(`Subtotal ${dia.titulo.toLowerCase()}`, pesos(dia.subtotal)),
      );
    }
  }
  detalle.push(tot('Neto', pesos(neto)));
  detalle.push(tot('IVA (19%)', pesos(iva)));
  detalle.push(tot('Total con IVA incluido', pesos(d.total), true));

  const partes = [
    parrafo(
      corrida(d.unaSolaLinea ? 'COTIZACIÓN' : 'COTIZACIÓN DETALLADA', {
        negrita: true,
        tam: 32,
        color: primario,
        espaciado: 20,
      }),
      {
        despues: 60,
      },
    ),
    parrafo(
      corrida(d.proceso, { negrita: true }) +
        corrida(`\n${d.nombre}${d.comprador ? `\n${d.comprador}` : ''}`),
      { despues: 160 },
    ),
    parrafo(
      corrida(
        `${d.numero ? `Cotización N° ${d.numero} · ` : ''}Fecha: ${d.fecha} · Validez: 30 días`,
      ),
    ),
    titulo('1. Proveedor', primario),
    deDatos(d.proveedor),
    titulo('2. Detalle de lo ofertado', primario),
    parrafo(corrida('Valores en pesos chilenos, con IVA incluido.')),
    tabla(A_DETALLE, detalle),
    ...(d.tambien && d.tambien.length > 0
      ? [
          parrafo(
            corrida('También incluye, dentro del mismo precio:', {
              negrita: true,
            }),
            { antes: 120, junto: true },
          ),
          ...d.tambien.map((t) => parrafo(corrida(`• ${t}`))),
        ]
      : []),
    parrafo(
      corrida(
        d.conPropuesta
          ? 'Incluye todo lo descrito en la propuesta técnica adjunta, conforme a las especificaciones de las bases.'
          : 'Incluye todo lo descrito, conforme a las especificaciones de las bases.',
      ),
      { antes: 80 },
    ),
  ];
  let n = 3;
  if (d.plazo) {
    partes.push(titulo(`${n++}. Plazo de entrega`, primario));
    partes.push(
      parrafo(
        corrida(
          `El servicio se presta ${d.plazo}${d.lugar ? `, en ${d.lugar}` : ''}.`,
        ),
      ),
    );
  }
  if (d.banco.length > 0) {
    partes.push(titulo(`${n++}. Datos bancarios`, primario));
    partes.push(deDatos(d.banco));
  }
  partes.push(
    ...laFirma(
      `${d.firma.nombre}\nRepresentante legal\n${d.firma.razonSocial}`,
    ),
  );
  return partes;
};

/** El Word de la cotización detallada. */
export function armarLaCotizacionDetallada(
  d: DatosDeLaCotizacionDetallada,
): Buffer {
  return empaquetarElWord(cuerpo(d), d.logo);
}
