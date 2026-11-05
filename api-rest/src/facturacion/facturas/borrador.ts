import { normalizarRut, revisarRut } from '../../people/utils/rut';
import { armarFactura } from '../archivo/factura';
import {
  montosDesdeElNeto,
  netoParaElTotal,
  type Montos,
} from '../archivo/montos';
import { esFechaDelArchivo, textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle, Receptor } from '../archivo/tipos';
import { LARGO_MAXIMO } from '../datos-del-receptor';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import { REFERENCIAS_QUE_PIDE } from '../referencias';

/**
 * EL BORRADOR DE LA FACTURA QUE ARMA BELIA (doc 19 §9.2, paso 2c)
 *
 * Felipe, 04-11: *"Belia arma todo y luego se confirma a mano"*. Con OC, el
 * detalle, el total y la referencia 801 salen de la OC (E1), y la factura va
 * al RUT de la OC (§9.12): si ese RUT ya es una razón social del cliente,
 * manda lo guardado; si no, se propone lo que dice la OC y la persona lo
 * confirma. Sin OC, el detalle sale de la cotización y el monto es un % del
 * evento (D4). Lo que falta se pregunta: las referencias que pide el
 * cliente (CCU, la nota de pedido 802) y los datos del receptor que el SII
 * exige en la factura.
 *
 * Es puro: recibe lo leído de la base y no llama a nadie. El servicio lo
 * usa igual para la vista previa y para emitir, así que lo que se ve es lo
 * que sale.
 */

/** De dónde salió cada dato (§9.2: «cada dato dice de dónde salió»). */
export type Origen = 'orden_de_compra' | 'ficha' | 'cotizacion' | 'persona';

/** El evento que se factura. */
export interface EventoAFacturar {
  id: string;
  numero: number;
  /** `quotation_status`: se factura lo aceptado o realizado (§9.2). */
  estado: string;
  tipoDeEvento: string | null;
  /** AAAA-MM-DD. */
  desde: string | null;
  hasta: string | null;
  personas: number | null;
  /** El total de la cotización, con IVA. */
  total: number;
  clientId: string | null;
  /** El nombre del cliente en Eventia. */
  cliente: string | null;
}

/** La OC que se factura, con lo que ya se le facturó. */
export interface OrdenAFacturar {
  id: number;
  numero: string;
  fecha: string;
  rut: string | null;
  razon_social: string | null;
  comprador: {
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
  } | null;
  descripcion: string | null;
  neto: number | null;
  iva: number | null;
  total: number;
  /** Las facturas emitidas (o por confirmar) contra esta OC. */
  facturado: number;
  /** El nombre del PDF en Documentos, si lo hay. */
  pdf: string | null;
}

export interface RazonSocialGuardada {
  id: number;
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo_facturacion: string | null;
  referencias_exigidas: string[];
}

export interface ContextoDeLaFactura {
  evento: EventoAFacturar;
  oc: OrdenAFacturar | null;
  /** Las razones sociales del cliente. */
  razones: RazonSocialGuardada[];
  /** Lo ya facturado del evento entero. */
  facturadoDelEvento: number;
  /** Lo que suman todas las OC del evento (E1: la diferencia con la
   *  cotización se avisa). */
  totalDeLasOC: number;
  /** Dónde sale: en el ambiente de prueba, sin correo (L11). */
  ambiente?: AmbienteDeFacturacion;
}

export interface ReferenciaPedida {
  /** '801', '802', '803', '805', '806' o 'HES'. */
  tipo: string;
  folio: string;
  /** AAAA-MM-DD. */
  fecha: string;
}

/** Lo que se emite: lo propone BelIA y la persona lo corrige a mano (E4). */
export interface FacturaPedida {
  orden_de_compra_id: number | null;
  /** El % de la OC, o del evento si no hay OC (D4). Nulo si va por monto. */
  porcentaje: number | null;
  /** El total con IVA, si va por un monto (E4). */
  monto: number | null;
  receptor: Receptor;
  detalle: { descripcion: string; descripcion_larga: string | null };
  referencias: ReferenciaPedida[];
  /** Las referencias que este receptor pide siempre: al emitir quedan en
   *  su razón social (E2). */
  pedir_siempre: string[];
}

export interface Borrador {
  pedida: FacturaPedida;
  origenes: { receptor: Origen; detalle: Origen };
  /** «OC 4500918822.pdf», «cotización N° 712», «ficha de CCU». */
  leidoDe: string[];
}

/** Un dato que falta para poder emitir. */
export interface Falta {
  /** 'rut', 'giro', 'referencia:802'… */
  campo: string;
  texto: string;
}

export interface Revision {
  /** Se puede emitir: no falta nada y facturacion.cl lo aceptaría. */
  ok: boolean;
  /** El archivo para facturacion.cl: lo usa el servicio, no la pantalla. */
  archivo: string | null;
  montos: Montos | null;
  lineas: LineaDeDetalle[];
  observaciones: string[];
  avisos: string[];
  problemas: string[];
  faltan: Falta[];
}

const ORDEN_SII: string[] = REFERENCIAS_QUE_PIDE.map((r) => r.codigo);

export const nombreDeReferencia = (codigo: string): string =>
  REFERENCIAS_QUE_PIDE.find((r) => r.codigo === codigo)?.nombre ?? codigo;

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

const fechaCorta = (fecha: string) => {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}-${m}-${a}`;
};

/** «Paseo fin de año» → «paseo fin de año»; las siglas (CCU) quedan. */
const enMinuscula = (texto: string) =>
  texto
    .split(' ')
    .map((p) => (p.length > 1 && p === p.toUpperCase() ? p : p.toLowerCase()))
    .join(' ');

const LARGO_DE_LA_GLOSA = 80;
const LARGO_DE_LA_DESCRIPCION = 1000;

/**
 * La glosa de la línea (80 caracteres) y su descripción larga: si el texto
 * no cabe en la glosa, la glosa se corta en una palabra y el texto entero
 * va en la descripción larga. Sin «…»: el archivo va en latin-1 (L23).
 */
export const glosaYDescripcion = (texto: string): FacturaPedida['detalle'] => {
  const limpio = textoLimpio(texto);
  const letras = Array.from(limpio);
  if (letras.length <= LARGO_DE_LA_GLOSA)
    return { descripcion: limpio, descripcion_larga: null };
  const corte = letras.slice(0, LARGO_DE_LA_GLOSA - 3).join('');
  const espacio = corte.lastIndexOf(' ');
  const glosa = (espacio > 40 ? corte.slice(0, espacio) : corte).replace(
    /[\s,.:-]+$/,
    '',
  );
  return {
    descripcion: `${glosa}...`,
    descripcion_larga: letras.slice(0, LARGO_DE_LA_DESCRIPCION).join(''),
  };
};

/** El detalle sin OC (§9.2): «Servicio de [tipo] del [fecha], [N]
 *  personas, según cotización N° X». */
export const detalleDelEvento = (e: EventoAFacturar): string => {
  const tipo = textoLimpio(e.tipoDeEvento);
  const servicio = tipo ? `Servicio de ${enMinuscula(tipo)}` : 'Servicio';
  const fechas = !e.desde
    ? ''
    : e.hasta && e.hasta.slice(0, 10) !== e.desde.slice(0, 10)
      ? ` del ${fechaCorta(e.desde)} al ${fechaCorta(e.hasta)}`
      : ` del ${fechaCorta(e.desde)}`;
  const personas = e.personas ? `, ${e.personas} personas` : '';
  return `${servicio}${fechas}${personas}, según cotización N° ${e.numero}`;
};

const receptorDe = (r: RazonSocialGuardada): Receptor => ({
  rut: r.rut,
  razon_social: r.razon_social,
  giro: r.giro,
  direccion: r.direccion,
  comuna: r.comuna,
  ciudad: r.ciudad,
  correo: r.correo_facturacion,
});

const RECEPTOR_VACIO: Receptor = {
  rut: '',
  razon_social: '',
  giro: null,
  direccion: null,
  comuna: null,
  ciudad: null,
  correo: null,
};

/** La razón social guardada con ese RUT, si la hay. */
export const razonSocialDelRut = (
  razones: RazonSocialGuardada[],
  rut: string | null | undefined,
): RazonSocialGuardada | undefined => {
  const canonico = rut ? normalizarRut(rut) : null;
  return canonico
    ? razones.find((r) => normalizarRut(r.rut) === canonico)
    : undefined;
};

const enOrdenDelSii = (refs: ReferenciaPedida[]) =>
  [...refs].sort(
    (a, b) => ORDEN_SII.indexOf(a.tipo) - ORDEN_SII.indexOf(b.tipo),
  );

/** Lo que BelIA propone: el punto de partida que la persona corrige. */
export function armarBorrador(ctx: ContextoDeLaFactura): Borrador {
  const { evento, oc, razones } = ctx;
  const leidoDe: string[] = [];
  if (oc) leidoDe.push(oc.pdf ? `OC ${oc.pdf}` : `OC N° ${oc.numero}`);
  leidoDe.push(`cotización N° ${evento.numero}`);

  // A quién: con OC, al RUT de la OC; sin OC (o sin RUT en la OC), a la
  // única razón social del cliente. Con varias, la persona elige.
  let receptor: Receptor = { ...RECEPTOR_VACIO };
  let origenDelReceptor: Origen = 'persona';
  const guardada = oc?.rut
    ? razonSocialDelRut(razones, oc.rut)
    : razones.length === 1
      ? razones[0]
      : undefined;
  if (guardada) {
    receptor = receptorDe(guardada);
    origenDelReceptor = 'ficha';
    leidoDe.push(`ficha de ${evento.cliente ?? guardada.razon_social}`);
  } else if (oc?.rut) {
    receptor = {
      ...RECEPTOR_VACIO,
      rut: normalizarRut(oc.rut) ?? oc.rut,
      razon_social: oc.razon_social ?? '',
      giro: oc.comprador?.giro ?? null,
      direccion: oc.comprador?.direccion ?? null,
      comuna: oc.comprador?.comuna ?? null,
      ciudad: oc.comprador?.ciudad ?? null,
    };
    origenDelReceptor = 'orden_de_compra';
  }

  const conTextoDeLaOC = !!oc && !!textoLimpio(oc.descripcion);
  const detalle = glosaYDescripcion(
    conTextoDeLaOC ? (oc?.descripcion ?? '') : detalleDelEvento(evento),
  );

  // Las referencias: la OC (801) y las que este receptor pide siempre.
  const exigidas = guardada?.referencias_exigidas ?? [];
  const referencias: ReferenciaPedida[] = oc
    ? [{ tipo: '801', folio: oc.numero, fecha: oc.fecha }]
    : [];
  for (const codigo of exigidas)
    if (!referencias.some((r) => r.tipo === codigo))
      referencias.push({ tipo: codigo, folio: '', fecha: '' });

  // El monto: todo lo que queda de la OC (E1) o del evento (D4). Si ya se
  // facturó una parte, va por lo que falta, en pesos.
  const base = oc ? oc.total : evento.total;
  const facturado = oc ? oc.facturado : ctx.facturadoDelEvento;
  const queda = Math.max(0, base - facturado);
  const porMonto = facturado > 0 && queda > 0;

  return {
    pedida: {
      orden_de_compra_id: oc?.id ?? null,
      porcentaje: porMonto ? null : 100,
      monto: porMonto ? queda : null,
      receptor,
      detalle,
      referencias: enOrdenDelSii(referencias),
      pedir_siempre: [...exigidas],
    },
    origenes: {
      receptor: origenDelReceptor,
      detalle: conTextoDeLaOC ? 'orden_de_compra' : 'cotizacion',
    },
    leidoDe,
  };
}

/** Lo que falta para emitir: se pregunta en el borrador. */
export const faltaEnLaFactura = (p: FacturaPedida): Falta[] => {
  const faltan: Falta[] = [];
  const r = p.receptor ?? RECEPTOR_VACIO;
  if (!r.rut || revisarRut(r.rut) !== null)
    faltan.push({ campo: 'rut', texto: 'el RUT' });
  if (!textoLimpio(r.razon_social))
    faltan.push({ campo: 'razon_social', texto: 'la razón social' });
  // Lo que el SII exige en la factura (doc 19 §9.13).
  if (!textoLimpio(r.giro)) faltan.push({ campo: 'giro', texto: 'el giro' });
  if (!textoLimpio(r.direccion))
    faltan.push({ campo: 'direccion', texto: 'la dirección' });
  if (!textoLimpio(r.comuna))
    faltan.push({ campo: 'comuna', texto: 'la comuna' });
  if (!textoLimpio(p.detalle?.descripcion))
    faltan.push({ campo: 'detalle', texto: 'el detalle' });
  for (const ref of p.referencias ?? [])
    if (!textoLimpio(ref.folio) || !esFechaDelArchivo(ref.fecha))
      faltan.push({
        campo: `referencia:${ref.tipo}`,
        texto: `${nombreDeReferencia(ref.tipo).toLowerCase()} (${ref.tipo}): su N° y su fecha`,
      });
  return faltan;
};

/** El neto de la línea y el total que debería dar, según lo pedido. */
const montoPedido = (
  p: FacturaPedida,
  ctx: ContextoDeLaFactura,
  problemas: string[],
): { neto: number; esperado: number } | null => {
  const { oc, evento } = ctx;
  if (p.monto != null) {
    if (!Number.isInteger(p.monto) || p.monto <= 0) {
      problemas.push('El monto va en pesos, sin decimales y mayor que cero');
      return null;
    }
    return { neto: netoParaElTotal(p.monto).neto, esperado: p.monto };
  }
  const pc = p.porcentaje;
  if (pc == null || !Number.isFinite(pc) || pc <= 0 || pc > 100) {
    problemas.push('El porcentaje va entre 0,01 y 100');
    return null;
  }
  const base = oc ? oc.total : evento.total;
  const esperado = pc === 100 ? base : Math.round((base * pc) / 100);
  // Con el neto de la OC, se factura su neto (L17): el IVA sale de él.
  if (oc && oc.neto != null && oc.iva != null)
    return { neto: Math.round((oc.neto * pc) / 100), esperado };
  return { neto: netoParaElTotal(esperado).neto, esperado };
};

/** La observación del documento: el N° de la cotización y la fecha del
 *  evento (§5.3). */
const observacionesDe = (e: EventoAFacturar): string[] => [
  `Cotización N° ${e.numero}${e.desde ? ` · evento ${fechaCorta(e.desde)}` : ''}`,
];

/**
 * La vista previa y la emisión usan esta misma revisión: lo que falta, los
 * candados (nunca más del 100 % de una OC) y el archivo armado con su folio.
 */
export function revisarFactura(
  p: FacturaPedida,
  ctx: ContextoDeLaFactura,
  folio: number,
  fecha: string,
): Revision {
  const { oc, evento } = ctx;
  const problemas: string[] = [];
  const avisos: string[] = [];
  const faltan = faltaEnLaFactura(p);

  const monto = montoPedido(p, ctx, problemas);
  const lineas: LineaDeDetalle[] = monto
    ? [
        {
          descripcion: p.detalle?.descripcion ?? '',
          descripcionLarga: p.detalle?.descripcion_larga ?? null,
          cantidad: 1,
          precio: monto.neto,
        },
      ]
    : [];
  const montos = monto ? montosDesdeElNeto(monto.neto) : null;
  if (montos && montos.total <= 0) problemas.push('La factura queda en $0');

  // Los textos de la ficha caben enteros (datos-del-receptor): lo que se
  // escribe acá, también.
  const r = p.receptor ?? RECEPTOR_VACIO;
  const largos: [string, string | null | undefined, number][] = [
    ['La razón social', r.razon_social, LARGO_MAXIMO.razon_social],
    ['El giro', r.giro, LARGO_MAXIMO.giro],
    ['La dirección', r.direccion, LARGO_MAXIMO.direccion],
    ['La comuna', r.comuna, LARGO_MAXIMO.comuna],
    ['La ciudad', r.ciudad, LARGO_MAXIMO.ciudad],
    ['Los correos', r.correo, LARGO_MAXIMO.correo_facturacion],
    ['El detalle', p.detalle?.descripcion, LARGO_DE_LA_GLOSA],
  ];
  for (const [nombre, valor, largo] of largos)
    if (Array.from(textoLimpio(valor)).length > largo)
      problemas.push(`${nombre} pasa de ${largo} caracteres`);

  // E1: con OC, la factura va por la OC; si las OC no suman lo de la
  // cotización, se avisa.
  if (oc && ctx.totalDeLasOC !== evento.total)
    avisos.push(
      `La cotización suma ${pesos(evento.total)}: la factura va por el total de la OC.`,
    );

  if (oc && montos) {
    // Nunca más del 100 % de una OC (§5.3); $1 de redondeo se tolera.
    const saldo = oc.total - oc.facturado;
    if (saldo <= 0)
      problemas.push(`La OC N° ${oc.numero} ya está facturada completa`);
    else if (montos.total > saldo + 1)
      problemas.push(
        `A la OC N° ${oc.numero} le quedan ${pesos(saldo)} por facturar, y esta factura va por ${pesos(montos.total)}`,
      );
  }
  // E4: sin tope contra el evento, pero se dice.
  if (montos && ctx.facturadoDelEvento + montos.total > evento.total)
    avisos.push(
      `Con esta factura, lo facturado del evento suma ${pesos(ctx.facturadoDelEvento + montos.total)} y la cotización ${pesos(evento.total)}.`,
    );

  const observaciones = observacionesDe(evento);
  if (faltan.length || problemas.length)
    return {
      ok: false,
      archivo: null,
      montos,
      lineas,
      observaciones,
      avisos,
      problemas,
      faltan,
    };

  const armado = armarFactura({
    tipo: 33,
    folio,
    fecha,
    receptor: r,
    lineas,
    referencias: p.referencias.map((ref) => ({
      tipo: ref.tipo,
      folio: ref.folio,
      fecha: ref.fecha,
      codigo: 0,
    })),
    observaciones,
    totalEsperado: monto?.esperado ?? null,
    ambiente: ctx.ambiente,
  });
  if (!armado.ok)
    return {
      ok: false,
      archivo: null,
      montos,
      lineas,
      observaciones,
      avisos,
      problemas: armado.problemas,
      faltan,
    };
  return {
    ok: true,
    archivo: armado.archivo,
    montos: armado.montos,
    lineas,
    observaciones,
    avisos: [...avisos, ...armado.avisos],
    problemas: [],
    faltan,
  };
}
