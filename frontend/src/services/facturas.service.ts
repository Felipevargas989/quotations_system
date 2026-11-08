import { apiRequest } from "./api";

// El DTE del evento (doc 19 §9.2 y §9.20): la factura o la boleta. Al abrir
// «Emitir DTE», BelIA lee las OC de Documentos (`prepararDte`); arma el
// borrador desde una OC o desde la cotización; la persona lo corrige y lo
// mira tal como saldrá, y el administrador lo emite (D5). La empresa sale
// SIEMPRE de la sesión, en el motor.

export type Ambiente = "simulado" | "prueba" | "produccion";

/** 33 la factura, 39 la boleta. */
export type TipoDeDte = 33 | 39;

export interface Receptor {
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo: string | null;
}

export interface ReferenciaPedida {
  tipo: string;
  folio: string;
  fecha: string;
  /** El motivo, si se escribe (hasta 90, doc 19 §9.22). */
  razon?: string | null;
}

/** 1 contado y 2 crédito (doc 19 §9.22); los plazos viven en
 *  constants/facturacion (`PLAZOS_DE_PAGO`). */
export type FormaDePago = 1 | 2;

/** Una línea del DTE: la descripción, la cantidad de personas y el precio
 *  unitario CON IVA. */
export interface LineaPedida {
  descripcion: string;
  descripcion_larga: string | null;
  cantidad: number;
  precio: number;
  /** Solo la factura: el descuento de la línea en % (doc 19 §9.22). */
  descuento?: number | null;
  /** La factura de «Nuevo documento» (§9.23): la línea elegida del
   *  tarifario (nulo mientras no se elige; sin la clave, la línea va a
   *  mano). Su nombre y su precio los pone el motor. */
  tarifario_id?: number | null;
}

/** Lo que se emite: lo propone BelIA y se corrige a mano (E4). La boleta
 *  no va contra una OC ni lleva referencias, y del receptor usa el correo. */
export interface DtePedido {
  tipo: TipoDeDte;
  orden_de_compra_id: number | null;
  receptor: Receptor;
  lineas: LineaPedida[];
  referencias: ReferenciaPedida[];
  pedir_siempre: string[];
  /** Solo la factura: contado (1) o crédito (2); sin esto, crédito a 30. */
  forma_de_pago?: FormaDePago | null;
  /** Los días del crédito (30, 45 o 60); nulo al contado. */
  plazo_dias?: number | null;
  /** «Nuevo documento»: el cliente de Eventia al que va (su ficha recibe
   *  la razón social al emitir). */
  cliente_id?: string | null;
}

export type Origen = "orden_de_compra" | "ficha" | "cotizacion" | "persona";

/** Un cliente con sus razones sociales y su contacto principal: el
 *  buscador del destinatario de «Nuevo documento» (§9.22). */
export interface ClienteParaFacturar {
  id: string;
  nombre: string;
  tipo: string | null;
  contacto: {
    nombre: string;
    correo: string | null;
    telefono: string | null;
  } | null;
  razones: {
    id: number;
    rut: string;
    razon_social: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
    correo_facturacion: string | null;
    referencias_exigidas: string[];
  }[];
}

export interface Montos {
  neto: number;
  exento: number;
  iva: number;
  total: number;
}

export interface VistaPrevia {
  ok: boolean;
  montos: Montos | null;
  /** Como van en el archivo: en la factura, el precio en neto; en la
   *  boleta, con IVA. */
  lineas: {
    descripcion: string;
    descripcionLarga: string | null;
    cantidad: number;
    precio: number;
    /** El descuento de la línea en % (la factura, §9.22). */
    descuento?: number | null;
  }[];
  observaciones: string[];
  avisos: string[];
  problemas: string[];
  faltan: { campo: string; texto: string }[];
  /** El folio que sigue: el que llevará si se emite ahora. */
  folio: number;
  fecha: string;
  emisor: { nombre: string | null; rut: string | null };
  ambiente: Ambiente;
  /** La condición de pago como va en la factura; nula en la boleta. */
  pago?: {
    forma: FormaDePago;
    dias: number | null;
    vencimiento: string | null;
  } | null;
}

export interface RazonSocialDelBorrador {
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo_facturacion: string | null;
  referencias_exigidas: string[];
}

export interface BorradorDelDte {
  pedida: DtePedido;
  origenes: { receptor: Origen; detalle: Origen };
  leidoDe: string[];
  oc: { numero: string; total: number; facturado: number } | null;
  evento: {
    numero: number;
    total: number;
    facturado: number;
    cliente: string | null;
  };
  razones: RazonSocialDelBorrador[];
  vista: VistaPrevia;
}

export interface DocumentoTributario {
  id: number;
  tipo: number;
  ambiente: Ambiente;
  folio: number | null;
  fecha_emision: string | null;
  estado: "borrador" | "enviando" | "emitido" | "por_confirmar" | "rechazado";
  receptor: Receptor;
  neto: number;
  iva: number;
  total: number;
  orden_de_compra_id: number | null;
  porcentaje: number | null;
  error: string | null;
  pdf_path: string | null;
  created_at: string;
  /** El estado en la cadena (paso 4): «Anulada por NC 1», «Rebajada:
   *  queda $…» (sin texto si está vigente), y lo que hace una nota:
   *  «Anula la factura N° 1». Opcional: un motor anterior al paso 4 no lo
   *  manda, y la vitrina puede llegar antes que el motor. */
  cadena?: {
    como: "vigente" | "anulado" | "rebajado" | "corregido";
    texto: string | null;
    modifica: string | null;
  };
}

/** De dónde se puede llenar el DTE: cada OC que BelIA leyó de Documentos,
 *  con lo ya facturado, y la cotización. Lo que no pudo leer, con su
 *  porqué. */
export interface PreparacionDelDte {
  tipo: TipoDeDte;
  ocs: {
    id: number;
    numero: string;
    fecha: string;
    razon_social: string | null;
    total: number;
    facturado: number;
  }[];
  sin_leer: { documento_id: number; nombre: string; motivo: string }[];
  evento: {
    numero: number;
    total: number;
    facturado: number;
    cliente: string | null;
  };
}

const ruta = (quotationId: string) => `/quotations/${quotationId}/facturas`;

export const prepararDte = async (
  quotationId: string,
): Promise<PreparacionDelDte> =>
  (await apiRequest(
    `${ruta(quotationId)}/preparar`,
    "POST",
  )) as PreparacionDelDte;

/** El borrador de BelIA. Con `porcentaje` (§9.26: el 50 % o el 30 % de la
 *  OC, o de la cotización), factura esa parte; sin él, todo lo que queda. */
export const armarBorradorDeDte = async (
  quotationId: string,
  tipo: TipoDeDte,
  ordenDeCompraId: number | null,
  porcentaje: number | null = null,
): Promise<BorradorDelDte> =>
  (await apiRequest(`${ruta(quotationId)}/borrador`, "POST", {
    tipo,
    orden_de_compra_id: ordenDeCompraId,
    ...(porcentaje != null ? { porcentaje } : {}),
  })) as BorradorDelDte;

export const revisarDte = async (
  quotationId: string,
  pedida: DtePedido,
): Promise<VistaPrevia> =>
  (await apiRequest(
    `${ruta(quotationId)}/revisar`,
    "POST",
    pedida,
  )) as VistaPrevia;

export const emitirDte = async (
  quotationId: string,
  pedida: DtePedido,
): Promise<DocumentoTributario> =>
  (await apiRequest(
    `${ruta(quotationId)}/emitir`,
    "POST",
    pedida,
  )) as DocumentoTributario;

/** Pendiente, parcial o facturado (§9.26): del evento y de cada OC. */
export type EstadoDeLaFacturacion = "pendiente" | "parcial" | "facturado";

/** Una OC del evento en «Por facturar» (§9.26), con lo facturado de ella
 *  (contado con la cadena) y lo que le queda. */
export interface OrdenPorFacturar {
  id: number;
  numero: string;
  total: number;
  facturado: number;
  queda: number;
  estado: EstadoDeLaFacturacion;
  /** El RUT de la OC, para el buscador (§9.31). */
  rut?: string | null;
}

/** Un evento de «Por facturar» (doc 19 §9.21): aceptado o realizado, con
 *  lo ya emitido (facturas y boletas, con la cadena) y lo que queda. */
export interface EventoPorFacturar {
  id: string;
  numero: number;
  /** El de la cotización: aceptada o realizada. */
  estado: string;
  tipoDeEvento: string | null;
  fecha: string | null;
  cliente: string | null;
  /** §9.31, para el buscador: el contacto de la cotización (o de la
   *  ficha) y los RUT de las razones sociales del cliente. */
  contacto?: string | null;
  ruts?: string[];
  total: number;
  emitido: number;
  queda: number;
  ocs: number;
  /** Tiene en Documentos el PDF de una factura subido a mano (§9.24): se
   *  revisa antes de facturarlo. */
  tiene_factura_en_documentos?: boolean;
  /** §9.26: cuánto se ha facturado del evento. */
  facturacion?: EstadoDeLaFacturacion;
  porcentaje_facturado?: number;
  /** §9.26: sus OC leídas, cada una con su estado. */
  ordenes?: OrdenPorFacturar[];
  /** §9.26: los PDF de órdenes de compra que BelIA todavía no lee. */
  ocs_sin_leer?: number;
  /** §9.26: lo que factura «Facturar»: lo que queda de la primera OC con
   *  saldo, o lo que queda del evento. */
  se_factura?: { oc: string | null; monto: number };
}

/** Un evento marcado con «Ya está facturado» (§9.24): se facturó fuera de
 *  Eventia y no entra a la masiva. */
export interface EventoFacturadoFuera extends EventoPorFacturar {
  marcado_por: string | null;
  /** ISO. */
  marcado_en: string;
}

export interface EventosPorFacturar {
  ambiente: Ambiente;
  sin_conexion?: string | null;
  /** Desde qué fecha mira (los últimos 90 días y lo que viene). */
  desde: string;
  eventos: EventoPorFacturar[];
  /** §9.26: los facturados completos en Eventia (plegados abajo). */
  facturados?: EventoPorFacturar[];
  facturados_fuera?: EventoFacturadoFuera[];
}

export const getPorFacturar = async (): Promise<EventosPorFacturar> =>
  (await apiRequest("/facturacion/por-facturar", "GET")) as EventosPorFacturar;

/** Una OC que BelIA no pudo leer en la primera lectura (§9.26). */
export interface OcSinLeer {
  documento_id: number;
  nombre: string;
  motivo: string;
  quotation_id: string;
  numero: number;
}

/** La primera lectura de las OC (§9.26): BelIA lee las de Documentos que
 *  todavía no lee, de los eventos de «Por facturar». */
export const leerOrdenesPendientes = async () =>
  (await apiRequest("/facturacion/por-facturar/leer-ordenes", "POST")) as {
    leidas: number;
    sin_leer: OcSinLeer[];
  };

/** «Ya está facturado»: sale de «Por facturar» (§9.24). */
export const marcarFacturadoFuera = async (quotationId: string) =>
  (await apiRequest(
    `/facturacion/por-facturar/${quotationId}/facturado-fuera`,
    "POST",
  )) as { ok: true };

/** «Devolver»: vuelve a «Por facturar». */
export const devolverAPorFacturar = async (quotationId: string) =>
  (await apiRequest(
    `/facturacion/por-facturar/${quotationId}/facturado-fuera`,
    "DELETE",
  )) as { ok: true };

/** La razón social guardada con un RUT (de cualquier cliente), para la
 *  factura de «Nuevo documento» (doc 19 §9.21). */
export interface RazonSocialEncontrada {
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo_facturacion: string | null;
  referencias_exigidas: string[];
  cliente: string | null;
  /** §9.27: de la ficha de un cliente de Eventia, o de la nómina del SII. */
  origen?: "eventia" | "sii";
  /** §9.27: del SII, sus actividades vigentes para elegir el giro. */
  giros?: string[];
}

/** Una carga de la nómina del SII (§9.27). */
export interface CargaDeLaNomina {
  id: number;
  empezo_en: string;
  termino_en: string | null;
  estado: "cargando" | "lista" | "fallo";
  empresas: number;
  error: string | null;
  pedida_por_nombre: string | null;
}

/** Cómo está la nómina del SII: la última carga y la que se usa. */
export const getNominaSii = async () =>
  (await apiRequest("/facturacion/nomina-sii", "GET")) as {
    ultima: CargaDeLaNomina | null;
    lista: CargaDeLaNomina | null;
  };

/** «Cargar la nómina del SII»: el motor la baja de sii.cl por detrás. */
export const cargarNominaSii = async () =>
  (await apiRequest(
    "/facturacion/nomina-sii/cargar",
    "POST",
  )) as CargaDeLaNomina;

export const buscarRazonSocial = async (
  rut: string,
): Promise<RazonSocialEncontrada | null> =>
  ((await apiRequest(
    `/facturacion/razon-social?rut=${encodeURIComponent(rut)}`,
    "GET",
  )) as RazonSocialEncontrada | "" | null) || null;

/** Los clientes con sus razones sociales, para elegir a quién va la
 *  factura de «Nuevo documento». */
export const getClientesParaFacturar = async (): Promise<
  ClienteParaFacturar[]
> =>
  ((await apiRequest("/facturacion/clientes", "GET")) ??
    []) as ClienteParaFacturar[];

/** La factura de «Nuevo documento»: de cero, sin evento ni OC. */
export const revisarFacturaSinEvento = async (
  pedida: DtePedido,
): Promise<VistaPrevia> =>
  (await apiRequest(
    "/facturacion/facturas/revisar",
    "POST",
    pedida,
  )) as VistaPrevia;

export const emitirFacturaSinEvento = async (
  pedida: DtePedido,
): Promise<DocumentoTributario> =>
  (await apiRequest(
    "/facturacion/facturas/emitir",
    "POST",
    pedida,
  )) as DocumentoTributario;
