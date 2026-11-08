import { normalizarRut, rutEsValido } from '../../people/utils/rut';
import { LARGO_MAXIMO } from '../datos-del-receptor';
import {
  fechaDelPdf,
  textosDelPdf,
  type TextoDelPdf,
} from '../facturas-anteriores/texto-del-pdf';

/**
 * UNA FACTURA EMITIDA FUERA DE EVENTIA, LEÍDA DE SU PDF (doc 19 §9.36).
 * Felipe, 08-11, con las N° 374 y 375 de Santo Tomás, hechas en la página
 * de facturacion.cl: *"¿podrás traer estas facturas para hacer las notas de
 * crédito desde acá?"*. Sin IA: el PDF lo arma facturacion.cl con
 * JasperReports, cada texto con su posición (`textosDelPdf`). Medido el
 * 08-11 en la N° 374 de producción:
 * - arriba a la derecha, «FACTURA ELECTRONICA», «Nº 374» y la fecha;
 * - el cuadro del cliente: la etiqueta, su «:» y el valor a la derecha; a la
 *   derecha del cuadro, la condición de pago («CREDITO») y la ciudad;
 * - «Referencia : en ORDEN DE COMPRA : Nro. 32000066941 del 30-10-2026»;
 * - el detalle bajo «Descripción · Cant. · Precio Unit. · Total»;
 * - los totales: «Exento:» y «Neto:» en la misma fila, «% I.V.A.:» y
 *   «Total:», cada uno con su valor a la derecha.
 * Si algo no se lee o no cuadra, no se trae: es mejor no traer que traer
 * mal.
 *
 * La nota de crédito (Felipe, 08-11: *"tráete las notas de crédito y las
 * facturas"*) sale con la misma plantilla, medida en la NC N° 115 de
 * producción y en las N° 113 y 114 hechas en la página de facturacion.cl:
 * el título arriba en dos renglones, «NOTA DE CREDITO» y «ELECTRONICA»
 * (dos textos), y en la referencia la razón y el documento que modifica:
 * «El desglose no era el correcto en FACTURA ELECTRONICA : Nro. 375 del
 * 30-10-2026». El código de referencia (anula, corrige, rebaja) no se
 * imprime.
 */

/** Lo que se puede traer: la factura (33) y la nota de crédito (61). */
export type TipoTraible = 33 | 61;

const TITULO: Record<TipoTraible, { texto: string; nombre: string }> = {
  33: { texto: 'facturaelectronica', nombre: 'la factura' },
  61: { texto: 'notadecreditoelectronica', nombre: 'la nota de crédito' },
};

export interface LineaTraida {
  descripcion: string;
  descripcionLarga: string | null;
  cantidad: number;
  /** El precio unitario neto, como lo imprime la factura. */
  precio: number;
}

export interface FacturaDelPdf {
  folio: number;
  fecha_emision: string;
  receptor: {
    rut: string;
    razon_social: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
  };
  /** 1 contado, 2 crédito, como el SII; nulo si no lo dice. */
  forma_de_pago: 1 | 2 | null;
  /** El vencimiento del crédito, si la factura lo imprime. */
  vencimiento: string | null;
  /** La razón, si la trae: la de una nota dice por qué modifica. */
  referencias: {
    tipo: string;
    folio: string;
    fecha: string;
    razon?: string;
  }[];
  lineas: LineaTraida[];
  exento: number;
  neto: number;
  iva: number;
  total: number;
}

/** El título, arriba a la derecha sobre el N°, en uno o más renglones:
 *  «FACTURA ELECTRONICA», o «NOTA DE CREDITO» y «ELECTRONICA». Junto y
 *  sin espacios. */
const tituloSobre = (textos: TextoDelPdf[], folio: TextoDelPdf) =>
  textos
    .filter(
      (t) => t.x >= folio.x - 60 && t.y > folio.y + 5 && t.y < folio.y + 50,
    )
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((t) => normal(t.texto).replace(/\s/g, ''))
    .join('');

/** Misma fila: los textos de una fila se escriben a la misma altura. */
const MISMA_FILA = 2.5;

/** «2.201.621,00» → 2201621. Nulo si no es un número. */
export const numeroDelPdf = (texto: string): number | null => {
  const limpio = texto.replace(/\$/g, '').trim();
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(limpio)) return null;
  return Number(limpio.replace(/\./g, '').replace(',', '.'));
};

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const deLaFila = (textos: TextoDelPdf[], y: number) =>
  textos
    .filter((t) => Math.abs(t.y - y) <= MISMA_FILA)
    .sort((a, b) => a.x - b.x);

const cortar = (texto: string | null, largo: number) =>
  texto ? Array.from(texto).slice(0, largo).join('').trim() || null : null;

/** El cuadro del cliente: cada valor después de su «:», hasta la columna
 *  de la derecha (la de «Ciudad» y la condición de pago). */
const receptorDe = (textos: TextoDelPdf[]) => {
  const etiqueta = (nombre: string) =>
    textos.find((t) => normal(t.texto).replace(/\s*:$/, '') === nombre);
  const ancla = etiqueta('senor(es)');
  if (!ancla) return null;
  const ciudad = textos.find(
    (t) =>
      normal(t.texto).replace(/\s*:$/, '') === 'ciudad' &&
      t.y <= ancla.y + MISMA_FILA &&
      t.y >= ancla.y - 120,
  );
  const derecha = ciudad ? ciudad.x - 1 : Infinity;
  const valor = (e: TextoDelPdf | undefined, hasta = derecha) => {
    if (!e) return null;
    const fila = deLaFila(textos, e.y).filter(
      (t) => t.x > e.x && t.x < hasta && t !== e,
    );
    const partes = fila
      .filter((t) => t.texto !== ':')
      .map((t) => t.texto.replace(/^:\s*/, ''));
    const junto = partes.join(' ').replace(/\s+/g, ' ').trim();
    return junto || null;
  };
  const columna = (nombre: string) =>
    textos.find(
      (t) =>
        normal(t.texto).replace(/\s*:$/, '') === nombre &&
        Math.abs(t.x - ancla.x) < 3 &&
        t.y < ancla.y &&
        t.y >= ancla.y - 120,
    );
  const crudo = valor(columna('r.u.t.') ?? columna('rut')) ?? '';
  const rut = rutEsValido(crudo) ? normalizarRut(crudo) : null;
  if (!rut) return null;
  const razon = cortar(valor(ancla), LARGO_MAXIMO.razon_social);
  if (!razon) return null;
  return {
    receptor: {
      rut,
      razon_social: razon,
      giro: cortar(valor(columna('giro')), LARGO_MAXIMO.giro),
      direccion: cortar(valor(columna('direccion')), LARGO_MAXIMO.direccion),
      comuna: cortar(valor(columna('comuna')), LARGO_MAXIMO.comuna),
      ciudad: cortar(valor(ciudad, Infinity), LARGO_MAXIMO.ciudad),
    },
    // A la derecha del cuadro: el vencimiento del crédito, si lo trae.
    vencimiento:
      textos
        .filter((t) => t.y <= ancla.y + MISMA_FILA && t.y >= ancla.y - 120)
        .map((t) => /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.texto.trim()))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => `${m[3]}-${m[2]}-${m[1]}`)[0] ?? null,
    // La condición de pago va a la derecha del cuadro.
    forma_de_pago: textos.some(
      (t) =>
        t.y <= ancla.y + MISMA_FILA &&
        t.y >= ancla.y - 120 &&
        normal(t.texto) === 'credito',
    )
      ? (2 as const)
      : textos.some(
            (t) =>
              t.y <= ancla.y + MISMA_FILA &&
              t.y >= ancla.y - 120 &&
              normal(t.texto) === 'contado',
          )
        ? (1 as const)
        : null,
  };
};

/** Lo que nombra una referencia: la OC y lo suyo y, en una nota, el
 *  documento que modifica. */
const TIPOS_DE_REFERENCIA: [nombre: string, tipo: string][] = [
  ['orden de compra', '801'],
  ['nota de pedido', '802'],
  ['contrato', '803'],
  ['factura no afecta o exenta electronica', '34'],
  ['factura exenta electronica', '34'],
  ['factura electronica', '33'],
  ['boleta electronica', '39'],
  ['nota de debito electronica', '56'],
  ['nota de credito electronica', '61'],
];

/** El nombre como patrón: sin importar mayúsculas, tildes ni espacios. */
const VOCAL: Record<string, string> = {
  a: '[aá]',
  e: '[eé]',
  i: '[ií]',
  o: '[oó]',
  u: '[uú]',
};
const patron = (nombre: string) =>
  nombre
    .split(' ')
    .map((p) =>
      Array.from(p)
        .map((c) => VOCAL[c] ?? c)
        .join(''),
    )
    .join('\\s+');

/** «en ORDEN DE COMPRA : Nro. 32000066941 del 30-10-2026»: solo con un
 *  nombre conocido, así una razón con «en» («error en el giro en FACTURA
 *  ELECTRONICA : …») no se come la referencia. */
const REFERENCIA = new RegExp(
  `(?:^|\\s)en\\s+(${TIPOS_DE_REFERENCIA.map(([n]) => patron(n)).join('|')})\\s*:\\s*Nro\\.?\\s*(\\S+)\\s+del\\s+(\\d{2})-(\\d{2})-(\\d{4})`,
  'gi',
);

/** Las referencias, con la razón que va antes de cada una. */
const referenciasDe = (textos: TextoDelPdf[]) => {
  const etiquetas = textos.filter((t) => normal(t.texto) === 'referencia');
  const salida: FacturaDelPdf['referencias'] = [];
  for (const e of etiquetas) {
    const fila = deLaFila(textos, e.y)
      .filter((t) => t.x > e.x && t.texto.trim() !== ':')
      .map((t) => t.texto.replace(/^:\s*/, ''))
      .join(' ');
    let desde = 0;
    for (const m of fila.matchAll(REFERENCIA)) {
      const razon = fila.slice(desde, m.index).trim();
      desde = (m.index ?? 0) + m[0].length;
      const tipo = TIPOS_DE_REFERENCIA.find(([n]) => n === normal(m[1]))?.[1];
      if (tipo)
        salida.push({
          tipo,
          folio: m[2],
          fecha: `${m[5]}-${m[4]}-${m[3]}`,
          ...(razon ? { razon } : {}),
        });
    }
  }
  return salida;
};

/** El detalle: las filas bajo «Descripción · Cant. · Precio Unit. ·
 *  Total»; una fila sin montos sigue la descripción de la anterior. */
const lineasDe = (textos: TextoDelPdf[]) => {
  const titulo = textos.find((t) => normal(t.texto) === 'descripcion');
  if (!titulo) return null;
  const cabecera = deLaFila(textos, titulo.y);
  const col = (nombre: string) =>
    cabecera.find((t) => normal(t.texto) === nombre)?.x;
  const cant = col('cant.');
  const precio = col('precio unit.');
  const total = col('total');
  if (cant == null || precio == null || total == null) return null;
  // Con descuento por línea, el formato es otro: no se adivina.
  if (cabecera.some((t) => /^desc/i.test(normal(t.texto)) && t !== titulo))
    return null;
  const fin = Math.max(
    ...textos
      .filter((t) => /^(son:|exento:|neto:|total:)/.test(normal(t.texto)))
      .map((t) => t.y),
  );
  const filas = [
    ...new Set(
      textos
        .filter((t) => t.y < titulo.y - MISMA_FILA && t.y > fin + MISMA_FILA)
        .map((t) => t.y),
    ),
  ].sort((a, b) => b - a);
  const lineas: LineaTraida[] = [];
  const vistas = new Set<number>();
  for (const y of filas) {
    if ([...vistas].some((v) => Math.abs(v - y) <= MISMA_FILA)) continue;
    vistas.add(y);
    const fila = deLaFila(textos, y);
    const texto = fila
      .filter((t) => t.x < cant - 5)
      .map((t) => t.texto)
      .join(' ')
      .trim();
    const enColumna = (desde: number, hasta: number) =>
      fila.find((t) => t.x >= desde && t.x < hasta)?.texto;
    const laCantidad = numeroDelPdf(enColumna(cant - 10, precio - 5) ?? '');
    const elPrecio = numeroDelPdf(enColumna(precio - 10, total - 30) ?? '');
    if (laCantidad != null && elPrecio != null && texto)
      lineas.push({
        descripcion: texto,
        descripcionLarga: null,
        cantidad: laCantidad,
        precio: elPrecio,
      });
    else if (texto && !laCantidad && !elPrecio && lineas.length) {
      const ultima = lineas[lineas.length - 1];
      ultima.descripcionLarga = [ultima.descripcionLarga, texto]
        .filter(Boolean)
        .join(' ');
    } else if (texto || laCantidad != null || elPrecio != null) return null;
  }
  return lineas.length ? lineas : null;
};

/** Los totales: el valor a la derecha de cada etiqueta, hasta la próxima. */
const totalesDe = (textos: TextoDelPdf[]) => {
  const de = (nombre: string) => {
    const e = textos.find((t) => normal(t.texto) === nombre);
    if (!e) return null;
    for (const t of deLaFila(textos, e.y).filter((t) => t.x > e.x)) {
      if (t.texto.trim().endsWith(':')) return null;
      const n = numeroDelPdf(t.texto);
      if (n != null) return n;
    }
    return null;
  };
  const neto = de('neto:');
  const iva = de('% i.v.a.:');
  const total = de('total:');
  if (neto == null || iva == null || total == null) return null;
  return { exento: de('exento:') ?? 0, neto, iva, total };
};

/**
 * La factura (o la nota de crédito) entera, o el motivo por el que no se
 * puede traer. Nunca falla: un PDF que no es de facturacion.cl dice que no
 * se pudo leer.
 */
export const leerFacturaDelPdf = (
  pdf: Buffer,
  tipo: TipoTraible = 33,
): { ok: true; factura: FacturaDelPdf } | { ok: false; motivo: string } => {
  let textos: TextoDelPdf[];
  try {
    textos = textosDelPdf(pdf);
  } catch {
    return { ok: false, motivo: 'El PDF no se pudo leer' };
  }
  const titulo = TITULO[tipo];
  const delFolio = textos.find((t) => /^N[º°o]\.?\s*\d+$/.test(t.texto.trim()));
  const esDelTipo =
    textos.some((t) => normal(t.texto).replace(/\s/g, '') === titulo.texto) ||
    (!!delFolio && tituloSobre(textos, delFolio) === titulo.texto);
  if (!esDelTipo)
    return {
      ok: false,
      motivo: `No es ${tipo === 33 ? 'una factura electrónica' : 'una nota de crédito electrónica'}`,
    };
  const folio = delFolio
    ? Number(/(\d+)$/.exec(delFolio.texto.trim())?.[1])
    : null;
  const fecha = fechaDelPdf(textos);
  const cuadro = receptorDe(textos);
  const lineas = lineasDe(textos);
  const totales = totalesDe(textos);
  if (!folio)
    return { ok: false, motivo: `No se lee el N° de ${titulo.nombre}` };
  if (!fecha) return { ok: false, motivo: 'No se lee la fecha de emisión' };
  if (!cuadro)
    return { ok: false, motivo: 'No se lee el RUT o la razón social' };
  if (!lineas) return { ok: false, motivo: 'No se lee el detalle' };
  if (!totales) return { ok: false, motivo: 'No se leen los totales' };
  // Que cuadre: el total, el IVA y la suma de las líneas.
  const { exento, neto, iva, total } = totales;
  if (exento + neto + iva !== total)
    return { ok: false, motivo: 'El neto y el IVA no suman el total' };
  if (Math.abs(Math.round(neto * 0.19) - iva) > 1)
    return { ok: false, motivo: 'El IVA no es el 19 % del neto' };
  const suma = lineas.reduce(
    (s, l) => s + Math.round(l.cantidad * l.precio),
    0,
  );
  if (Math.abs(suma - (neto + exento)) > lineas.length)
    return { ok: false, motivo: 'Las líneas no suman el neto' };
  return {
    ok: true,
    factura: {
      folio,
      fecha_emision: fecha,
      receptor: cuadro.receptor,
      forma_de_pago: cuadro.forma_de_pago,
      vencimiento: cuadro.vencimiento,
      referencias: referenciasDe(textos),
      lineas,
      exento,
      neto,
      iva,
      total,
    },
  };
};
