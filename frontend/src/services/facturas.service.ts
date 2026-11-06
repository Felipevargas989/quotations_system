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
}

/** Una línea del DTE: la descripción, la cantidad de personas y el precio
 *  unitario CON IVA. */
export interface LineaPedida {
  descripcion: string;
  descripcion_larga: string | null;
  cantidad: number;
  precio: number;
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
}

export type Origen = "orden_de_compra" | "ficha" | "cotizacion" | "persona";

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

export interface DocumentosDelEvento {
  ambiente: Ambiente;
  /** Por qué no se puede emitir, si no se puede (paso 5). Opcional: un
   *  motor anterior no lo manda. */
  sin_conexion?: string | null;
  documentos: DocumentoTributario[];
  /** Lo facturado de cada OC con la cadena: una factura anulada ya no
   *  cuenta. Opcional, como `cadena`. */
  facturado_por_oc?: Record<number, number>;
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

export const getDocumentosTributarios = async (
  quotationId: string,
): Promise<DocumentosDelEvento> =>
  (await apiRequest(ruta(quotationId), "GET")) as DocumentosDelEvento;

export const prepararDte = async (
  quotationId: string,
): Promise<PreparacionDelDte> =>
  (await apiRequest(
    `${ruta(quotationId)}/preparar`,
    "POST",
  )) as PreparacionDelDte;

export const armarBorradorDeDte = async (
  quotationId: string,
  tipo: TipoDeDte,
  ordenDeCompraId: number | null,
): Promise<BorradorDelDte> =>
  (await apiRequest(`${ruta(quotationId)}/borrador`, "POST", {
    tipo,
    orden_de_compra_id: ordenDeCompraId,
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

/** Un evento de «Por facturar» (doc 19 §9.21): aceptado o realizado, con
 *  lo ya emitido (facturas y boletas, con la cadena) y lo que queda. */
export interface EventoPorFacturar {
  id: string;
  numero: number;
  estado: string;
  tipoDeEvento: string | null;
  fecha: string | null;
  cliente: string | null;
  total: number;
  emitido: number;
  queda: number;
  ocs: number;
}

export interface EventosPorFacturar {
  ambiente: Ambiente;
  sin_conexion?: string | null;
  /** Desde qué fecha mira (los últimos 90 días y lo que viene). */
  desde: string;
  eventos: EventoPorFacturar[];
}

export const getPorFacturar = async (): Promise<EventosPorFacturar> =>
  (await apiRequest("/facturacion/por-facturar", "GET")) as EventosPorFacturar;
