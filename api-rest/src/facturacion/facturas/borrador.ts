import { normalizarRut, revisarRut } from '../../people/utils/rut';
import { armarBoleta } from '../archivo/boleta';
import { armarFactura } from '../archivo/factura';
import {
  desgloseDelTotal,
  montosDesdeElNeto,
  precioNetoDe,
  type Montos,
} from '../archivo/montos';
import { esFechaDelArchivo, textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle, Receptor } from '../archivo/tipos';
import { LARGO_MAXIMO } from '../datos-del-receptor';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import { REFERENCIAS_QUE_PIDE } from '../referencias';

/**
 * EL DTE DEL EVENTO QUE ARMA BELIA (doc 19 §9.2 y §9.20)
 *
 * Felipe, 05-11: *"finalmente esto es emitir DTE. Y yo puedo elegir si el
 * DTE es una factura, una boleta y punto"*. El DTE lleva sus líneas (la
 * descripción, la cantidad de personas y el precio CON IVA), y abajo el
 * neto, el IVA y el total a pagar. Se llena solo desde la OC o desde la
 * cotización, y se edita a mano.
 *
 * La factura con OC: el detalle, el total y la referencia 801 salen de la
 * OC (E1), y va al RUT de la OC (§9.12): si ese RUT ya es una razón social
 * del cliente, manda lo guardado; si no, se propone lo que dice la OC y la
 * persona lo confirma. Sin OC, el detalle sale de la cotización. Lo que
 * falta se pregunta: las referencias que pide el cliente (CCU, la nota de
 * pedido 802) y los datos del receptor que el SII exige en la factura. La
 * boleta no va contra una OC ni lleva referencias: solo sus líneas y el
 * correo del cliente.
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
  /** Los niños, aparte de las personas (`children_count`). */
  ninos?: number | null;
  /** El total de la cotización, con IVA. */
  total: number;
  clientId: string | null;
  /** El nombre del cliente en Eventia. */
  cliente: string | null;
  /** El correo del contacto del evento (o el del cliente): a él le llega
   *  la boleta. */
  correo?: string | null;
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
  /** Nulo en la factura de «Nuevo documento», que no es de un evento
   *  (§9.21). */
  evento: EventoAFacturar | null;
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

/** 33 la factura, 39 la boleta. */
export type TipoDeDte = 33 | 39;

/** Una línea del DTE: la descripción, la cantidad de personas y el precio
 *  unitario CON IVA, como todo precio en Eventia. En la factura el archivo
 *  lo lleva en neto (`precioNetoDe`). */
export interface LineaPedida {
  /** La glosa (80 caracteres). */
  descripcion: string;
  descripcion_larga: string | null;
  cantidad: number;
  precio: number;
}

/** Lo que se emite: lo propone BelIA y la persona lo corrige a mano (E4). */
export interface DtePedido {
  tipo: TipoDeDte;
  /** La OC contra la que va la factura (la boleta, nunca). */
  orden_de_compra_id: number | null;
  /** La boleta solo usa el correo. */
  receptor: Receptor;
  lineas: LineaPedida[];
  /** Solo la factura. */
  referencias: ReferenciaPedida[];
  /** Las referencias que este receptor pide siempre: al emitir quedan en
   *  su razón social (E2). */
  pedir_siempre: string[];
}

export interface Borrador {
  pedida: DtePedido;
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
export const glosaYDescripcion = (
  texto: string,
): Pick<LineaPedida, 'descripcion' | 'descripcion_larga'> => {
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
 *  personas, según cotización N° X». Sin las personas si ya van en la
 *  cantidad de la línea. */
export const detalleDelEvento = (
  e: EventoAFacturar,
  conPersonas = true,
): string => {
  const tipo = textoLimpio(e.tipoDeEvento);
  const servicio = tipo ? `Servicio de ${enMinuscula(tipo)}` : 'Servicio';
  const fechas = !e.desde
    ? ''
    : e.hasta && e.hasta.slice(0, 10) !== e.desde.slice(0, 10)
      ? ` del ${fechaCorta(e.desde)} al ${fechaCorta(e.hasta)}`
      : ` del ${fechaCorta(e.desde)}`;
  const ninos = e.ninos ? ` y ${e.ninos} niños` : '';
  const personas =
    conPersonas && e.personas ? `, ${e.personas} personas${ninos}` : '';
  return `${servicio}${fechas}${personas}, según cotización N° ${e.numero}`;
};

/**
 * La línea por lo que se emite. Con las personas (`personas`, solo cuando
 * va todo el evento), las personas por su precio si cuadra al peso; si no,
 * una línea por el monto, con las personas en el texto.
 */
const lineaDelMonto = (
  texto: (conPersonas: boolean) => string,
  monto: number,
  personas: number | null | undefined,
): LineaPedida => {
  const cuantas =
    personas && personas > 0 && monto > 0 && monto % personas === 0
      ? personas
      : null;
  return {
    ...glosaYDescripcion(texto(!cuantas)),
    cantidad: cuantas ?? 1,
    precio: cuantas ? monto / cuantas : monto,
  };
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

/** Lo que BelIA propone: el punto de partida que la persona corrige. La
 *  boleta no va contra una OC (Felipe, 05-11: *"por la orden de compra van
 *  contra facturas"*). */
export function armarBorrador(
  ctx: ContextoDeLaFactura,
  tipo: TipoDeDte = 33,
): Borrador {
  const { evento, razones } = ctx;
  if (!evento) throw new Error('El borrador de BelIA es de un evento');
  const oc = tipo === 33 ? ctx.oc : null;
  const leidoDe: string[] = [];
  if (oc) leidoDe.push(oc.pdf ? `OC ${oc.pdf}` : `OC N° ${oc.numero}`);
  leidoDe.push(`cotización N° ${evento.numero}`);

  // El monto: todo lo que queda de la OC (E1) o del evento (D4). Las
  // personas van en la cantidad solo si va todo el evento y sin niños,
  // que tienen su propio precio.
  const base = oc ? oc.total : evento.total;
  const facturado = oc ? oc.facturado : ctx.facturadoDelEvento;
  const queda = Math.max(0, base - facturado);
  const todoElEvento =
    facturado === 0 && base === evento.total && !evento.ninos;
  const conTextoDeLaOC = !!oc && !!textoLimpio(oc.descripcion);
  const linea = lineaDelMonto(
    (conPersonas) =>
      conTextoDeLaOC
        ? (oc?.descripcion ?? '')
        : detalleDelEvento(evento, conPersonas),
    queda,
    todoElEvento ? evento.personas : null,
  );

  if (tipo === 39)
    return {
      pedida: {
        tipo,
        orden_de_compra_id: null,
        receptor: { ...RECEPTOR_VACIO, correo: evento.correo ?? null },
        lineas: [linea],
        referencias: [],
        pedir_siempre: [],
      },
      origenes: {
        receptor: evento.correo ? 'ficha' : 'persona',
        detalle: 'cotizacion',
      },
      leidoDe,
    };

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

  // Las referencias: la OC (801) y las que este receptor pide siempre.
  const exigidas = guardada?.referencias_exigidas ?? [];
  const referencias: ReferenciaPedida[] = oc
    ? [{ tipo: '801', folio: oc.numero, fecha: oc.fecha }]
    : [];
  for (const codigo of exigidas)
    if (!referencias.some((r) => r.tipo === codigo))
      referencias.push({ tipo: codigo, folio: '', fecha: '' });

  return {
    pedida: {
      tipo,
      orden_de_compra_id: oc?.id ?? null,
      receptor,
      lineas: [linea],
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
export const faltaEnElDte = (p: DtePedido): Falta[] => {
  const faltan: Falta[] = [];
  const factura = p.tipo !== 39;
  const r = p.receptor ?? RECEPTOR_VACIO;
  if (factura) {
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
  }
  const lineas = p.lineas ?? [];
  if (!lineas.length)
    faltan.push({ campo: 'detalle', texto: 'una línea con su descripción' });
  lineas.forEach((l, i) => {
    if (!textoLimpio(l.descripcion))
      faltan.push({
        campo: `detalle:${i}`,
        texto:
          lineas.length > 1
            ? `la descripción de la línea ${i + 1}`
            : 'la descripción',
      });
  });
  if (factura)
    for (const ref of p.referencias ?? [])
      if (!textoLimpio(ref.folio) || !esFechaDelArchivo(ref.fecha))
        faltan.push({
          campo: `referencia:${ref.tipo}`,
          texto: `${nombreDeReferencia(ref.tipo).toLowerCase()} (${ref.tipo}): su N° y su fecha`,
        });
  return faltan;
};

/** La observación del documento: el N° de la cotización y la fecha del
 *  evento (§5.3). */
const observacionesDe = (e: EventoAFacturar): string[] => [
  `Cotización N° ${e.numero}${e.desde ? ` · evento ${fechaCorta(e.desde)}` : ''}`,
];

/** Lo que una línea vale con IVA, al peso: lo que el DTE debería sumar. */
const conIva = (l: LineaPedida) => Math.round(l.cantidad * l.precio);

/**
 * La vista previa y la emisión usan esta misma revisión: lo que falta, los
 * candados (nunca más del 100 % de una OC) y el archivo armado con su folio
 * (la boleta va con folio 0: lo pone facturacion.cl).
 */
export function revisarDte(
  p: DtePedido,
  ctx: ContextoDeLaFactura,
  folio: number,
  fecha: string,
): Revision {
  const { evento } = ctx;
  const factura = p.tipo !== 39;
  const oc = factura ? ctx.oc : null;
  const Cual = factura ? 'La factura' : 'La boleta';
  const problemas: string[] = [];
  const avisos: string[] = [];
  const faltan = faltaEnElDte(p);

  const pedidas = p.lineas ?? [];
  pedidas.forEach((l, i) => {
    const de = pedidas.length > 1 ? ` de la línea ${i + 1}` : '';
    if (!Number.isFinite(l.cantidad) || l.cantidad <= 0)
      problemas.push(`La cantidad${de} va mayor que cero`);
    if (!Number.isInteger(l.precio) || l.precio < 0)
      problemas.push(`El precio${de} va en pesos, sin decimales`);
  });
  // Las líneas como van en el archivo: en la factura, en neto con los seis
  // decimales que admite (así 78 menús de $55.000 suman exacto con su IVA);
  // en la boleta, con IVA.
  const lineas: LineaDeDetalle[] = pedidas.map((l) => ({
    descripcion: l.descripcion ?? '',
    descripcionLarga: l.descripcion_larga ?? null,
    cantidad: l.cantidad,
    precio: factura ? precioNetoDe(l.precio) : l.precio,
  }));
  const esperado = pedidas.reduce((s, l) => s + conIva(l), 0);
  const montos: Montos | null = problemas.length
    ? null
    : factura
      ? montosDesdeElNeto(
          lineas.reduce((s, l) => s + Math.round(l.cantidad * l.precio), 0),
        )
      : desgloseDelTotal(esperado);
  if (montos && montos.total <= 0) problemas.push(`${Cual} queda en $0`);

  // Los textos de la ficha caben enteros (datos-del-receptor): lo que se
  // escribe acá, también.
  const r = p.receptor ?? RECEPTOR_VACIO;
  const largos: [string, string | null | undefined, number][] = [
    ...(factura
      ? ([
          ['La razón social', r.razon_social, LARGO_MAXIMO.razon_social],
          ['El giro', r.giro, LARGO_MAXIMO.giro],
          ['La dirección', r.direccion, LARGO_MAXIMO.direccion],
          ['La comuna', r.comuna, LARGO_MAXIMO.comuna],
          ['La ciudad', r.ciudad, LARGO_MAXIMO.ciudad],
        ] as [string, string | null | undefined, number][])
      : []),
    ['Los correos', r.correo, LARGO_MAXIMO.correo_facturacion],
    ...pedidas.map(
      (l, i) =>
        [
          pedidas.length > 1
            ? `La descripción de la línea ${i + 1}`
            : 'La descripción',
          l.descripcion,
          LARGO_DE_LA_GLOSA,
        ] as [string, string, number],
    ),
  ];
  for (const [nombre, valor, largo] of largos)
    if (Array.from(textoLimpio(valor)).length > largo)
      problemas.push(`${nombre} pasa de ${largo} caracteres`);

  // E1: con OC, la factura va por la OC; si las OC no suman lo de la
  // cotización, se avisa.
  if (oc && evento && ctx.totalDeLasOC !== evento.total)
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
    // L17: la OC trae su neto y su IVA, y la factura de la OC entera los
    // repite; si no, se dice.
    if (
      oc.neto != null &&
      oc.iva != null &&
      montos.total === oc.total &&
      (montos.neto !== oc.neto || montos.iva !== oc.iva)
    )
      avisos.push(
        `La OC dice neto ${pesos(oc.neto)} e IVA ${pesos(oc.iva)}; la factura queda en neto ${pesos(montos.neto)} e IVA ${pesos(montos.iva)}.`,
      );
  }
  // E4: sin tope contra el evento, pero se dice.
  if (montos && evento && ctx.facturadoDelEvento + montos.total > evento.total)
    avisos.push(
      `Con ${factura ? 'esta factura' : 'esta boleta'}, lo emitido del evento suma ${pesos(ctx.facturadoDelEvento + montos.total)} y la cotización ${pesos(evento.total)}.`,
    );

  const observaciones = evento ? observacionesDe(evento) : [];
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

  const armado = factura
    ? armarFactura({
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
        totalEsperado: esperado,
        ambiente: ctx.ambiente,
      })
    : armarBoleta({
        fecha,
        receptor: r.correo ? { correo: r.correo } : null,
        lineas,
        observaciones,
        totalEsperado: esperado,
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
