import { desgloseDeOferta, pesos } from '../generacion/la-plata';
import type { PiezaDelSet } from './el-set';
import type { CotizacionDeLaPostulacion } from './postulacion.repository';
import { armarZip } from './zip';

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
 *  análisis («Lo que tienes que presentar»), con la oferta. */
export const pidenLaCotizacion = (
  resultado: Record<string, unknown> | null | undefined,
): boolean =>
  (Array.isArray(resultado?.documentos) ? resultado.documentos : []).some(
    (d: { nombre?: unknown; cuando?: unknown }) =>
      typeof d?.nombre === 'string' &&
      /\bcotizacion\b/.test(normalizar(d.nombre)) &&
      (d.cuando === undefined || d.cuando === 'con_la_oferta'),
  );

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
        /\bcotizacion\b/.test(t) &&
        /detallad|desglos|por item|unitari|por servicio/.test(t)
      );
    },
  );

/** Lo que dice el set si las bases piden la cotización y no va: la arma
 *  «Armar postulación» desde la cotización vinculada, o se sube a mano.
 *  null si va o no la piden. */
export const laCotizacionQueFalta = (
  documentos: unknown[],
  piezas: PiezaDelSet[],
): string | null =>
  pidenLaCotizacion({ documentos }) &&
  !piezas.some(
    (p) =>
      p.que_es === 'cotizacion' ||
      (p.que_es === 'subido' && /cotizacion/.test(normalizar(p.nombre))),
  )
    ? 'Las bases piden una cotización detallada: vincula tu cotización y vuelve a armar la postulación, o súbela hecha a «Mi postulación».'
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
  numero: number;
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

/** El ancho y el alto de un PNG o un JPG, para no deformar el logo. */
export const medidasDeLaImagen = (
  datos: Buffer,
): { ancho: number; alto: number; tipo: 'png' | 'jpeg' } | null => {
  if (
    datos.length > 24 &&
    datos.readUInt32BE(0) === 0x89504e47 &&
    datos.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return {
      ancho: datos.readUInt32BE(16),
      alto: datos.readUInt32BE(20),
      tipo: 'png',
    };
  }
  if (datos.length > 4 && datos[0] === 0xff && datos[1] === 0xd8) {
    let i = 2;
    while (i + 9 < datos.length) {
      if (datos[i] !== 0xff) return null;
      const marca = datos[i + 1];
      const largo = datos.readUInt16BE(i + 2);
      // SOF0 a SOF15, sin DHT (C4), JPG (C8) ni DAC (CC).
      if (
        marca >= 0xc0 &&
        marca <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marca)
      ) {
        return {
          alto: datos.readUInt16BE(i + 5),
          ancho: datos.readUInt16BE(i + 7),
          tipo: 'jpeg',
        };
      }
      i += 2 + largo;
    }
  }
  return null;
};

// ---------------------------------------------------------------- el Word

const LETRA = 'Calibri';
const BORDE = 'D1D5DB';
const GRIS = '6B7280';
const BLANCO = 'FFFFFF';
/** Sin colores de la marca en Configuración de empresa: grises sobrios. */
const SIN_MARCA = { primario: '1F2937', secundario: 'F3F4F6' };
const ANCHO = 9972;
const A_DATOS = [2900, ANCHO - 2900];
const A_DETALLE = [1750, 4222, 1300, 1350, 1350];
const EMU_POR_CM = 360000;

const xml = (t: string): string =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

type Estilo = {
  negrita?: boolean;
  tam?: number;
  color?: string;
  mayus?: boolean;
  /** Entre letras, en veinteavos de punto: los rótulos de la casa. */
  espaciado?: number;
};

const corrida = (t: string, e: Estilo = {}): string => {
  const tam = e.tam ?? 22;
  const partes = t
    .split('\n')
    .map(
      (p, i) =>
        `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(p)}</w:t>`,
    )
    .join('');
  // En el orden del esquema de Word: rFonts, b, caps, color, spacing, sz.
  return `<w:r><w:rPr><w:rFonts w:ascii="${LETRA}" w:hAnsi="${LETRA}" w:cs="${LETRA}"/>${e.negrita ? '<w:b/>' : ''}${e.mayus ? '<w:caps/>' : ''}${e.color ? `<w:color w:val="${e.color}"/>` : ''}${e.espaciado ? `<w:spacing w:val="${e.espaciado}"/>` : ''}<w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/></w:rPr>${partes}</w:r>`;
};

type Parrafo = {
  alineado?: 'left' | 'center' | 'right';
  antes?: number;
  despues?: number;
  /** Con el siguiente y sin partirse: la firma no queda sola. */
  junto?: boolean;
};

const parrafo = (contenido: string, p: Parrafo = {}): string =>
  `<w:p><w:pPr>${p.junto ? '<w:keepNext/><w:keepLines/>' : ''}<w:spacing w:before="${p.antes ?? 0}" w:after="${p.despues ?? 80}"/><w:jc w:val="${p.alineado ?? 'left'}"/></w:pPr>${contenido}</w:p>`;

type Celda = Omit<Estilo, 'negrita'> & {
  ancho: number;
  negrita?: boolean;
  alineado?: 'left' | 'center' | 'right';
  juntas?: number;
  fondo?: string;
};

const celda = (t: string, c: Celda): string =>
  `<w:tc><w:tcPr><w:tcW w:w="${c.ancho}" w:type="dxa"/>${c.juntas && c.juntas > 1 ? `<w:gridSpan w:val="${c.juntas}"/>` : ''}${c.fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fondo}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${parrafo(corrida(t, c), { alineado: c.alineado, despues: 0 })}</w:tc>`;

const fila = (...celdas: string[]): string =>
  `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdas.join('')}</w:tr>`;

const tabla = (anchos: number[], filasDeLaTabla: string[]): string => {
  const bordes = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(
      (l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="${BORDE}"/>`,
    )
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${anchos.reduce((s, a) => s + a, 0)}" w:type="dxa"/><w:tblBorders>${bordes}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>${filasDeLaTabla.join('')}</w:tbl>`;
};

/** El título de cada parte, como los de la cotización de Eventia: chico,
 *  en mayúsculas espaciadas y del color de la marca. */
const titulo = (t: string, color: string): string =>
  parrafo(
    corrida(t, { negrita: true, tam: 21, color, mayus: true, espaciado: 24 }),
    { antes: 240, despues: 100, junto: true },
  );

/** Rótulo gris en mayúsculas y el dato al lado. */
const deDatos = (pares: Array<[string, string]>): string =>
  tabla(
    A_DATOS,
    pares.map(([k, v]) =>
      fila(
        celda(k, {
          ancho: A_DATOS[0],
          negrita: true,
          tam: 17,
          color: GRIS,
          mayus: true,
          espaciado: 10,
        }),
        celda(v, { ancho: A_DATOS[1] }),
      ),
    ),
  );

const logoEnLinea = (alto: number, ancho: number): string =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${ancho}" cy="${alto}"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ancho}" cy="${alto}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

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
        `Cotización N° ${d.numero} · Fecha: ${d.fecha} · Validez: 30 días`,
      ),
    ),
    titulo('1. Proveedor', primario),
    deDatos(d.proveedor),
    titulo('2. Detalle de lo ofertado', primario),
    parrafo(corrida('Valores en pesos chilenos, con IVA incluido.')),
    tabla(A_DETALLE, detalle),
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
    parrafo(corrida('______________________________'), {
      antes: 720,
      despues: 0,
      junto: true,
    }),
    parrafo(
      corrida(`${d.firma.nombre}\nRepresentante legal\n${d.firma.razonSocial}`),
      {
        despues: 0,
      },
    ),
  );
  return partes;
};

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP =
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

/** El Word de la cotización detallada. */
export function armarLaCotizacionDetallada(
  d: DatosDeLaCotizacionDetallada,
): Buffer {
  const medidas = d.logo ? medidasDeLaImagen(d.logo.datos) : null;
  // El logo, de 1,6 cm de alto y a lo más 6 cm de ancho, sin deformarlo.
  let logo = '';
  if (medidas && medidas.ancho > 0 && medidas.alto > 0) {
    let alto = 1.6 * EMU_POR_CM;
    let ancho = (alto * medidas.ancho) / medidas.alto;
    if (ancho > 6 * EMU_POR_CM) {
      ancho = 6 * EMU_POR_CM;
      alto = (ancho * medidas.alto) / medidas.ancho;
    }
    logo = logoEnLinea(Math.round(alto), Math.round(ancho));
  }
  const documento =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}"><w:body>${logo}${cuerpo(d).join('')}` +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const estilos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${LETRA}" w:hAnsi="${LETRA}" w:cs="${LETRA}" w:eastAsia="${LETRA}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const extension = medidas?.tipo === 'jpeg' ? 'jpeg' : 'png';
  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (logo
      ? `<Default Extension="${extension}" ContentType="image/${extension}"/>`
      : '') +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';
  const relaciones =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  const relacionesDelDocumento =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    (logo
      ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${extension}"/>`
      : '') +
    '</Relationships>';
  const texto = (nombre: string, contenido: string) => ({
    nombre,
    datos: Buffer.from(contenido, 'utf8'),
    comprimir: true,
  });
  return armarZip([
    texto('[Content_Types].xml', tipos),
    texto('_rels/.rels', relaciones),
    texto('word/document.xml', documento),
    texto('word/styles.xml', estilos),
    texto('word/_rels/document.xml.rels', relacionesDelDocumento),
    ...(logo && d.logo
      ? [{ nombre: `word/media/logo.${extension}`, datos: d.logo.datos }]
      : []),
  ]);
}
