import { apiRequest } from "./api";

// La factura del evento (doc 19, paso 2c): BelIA arma el borrador desde la
// OC (o desde el evento), la persona lo corrige y lo mira tal como saldrá,
// y el administrador lo emite (D5). En los pasos 1 a 4, contra
// facturacion.cl SIMULADO: no sale nada al SII. La empresa sale SIEMPRE de
// la sesión, en el motor.

export type Ambiente = "simulado" | "prueba" | "produccion";

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

/** Lo que se emite: lo propone BelIA y se corrige a mano (E4). */
export interface FacturaPedida {
  orden_de_compra_id: number | null;
  porcentaje: number | null;
  monto: number | null;
  receptor: Receptor;
  detalle: { descripcion: string; descripcion_larga: string | null };
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

export interface BorradorDeFactura {
  pedida: FacturaPedida;
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
   *  «Anula la factura N° 1». */
  cadena: {
    como: "vigente" | "anulado" | "rebajado" | "corregido";
    texto: string | null;
    modifica: string | null;
  };
}

export interface DocumentosDelEvento {
  ambiente: Ambiente;
  documentos: DocumentoTributario[];
  /** Lo facturado de cada OC con la cadena: una factura anulada ya no
   *  cuenta. */
  facturado_por_oc: Record<number, number>;
}

const ruta = (quotationId: string) => `/quotations/${quotationId}/facturas`;

export const getDocumentosTributarios = async (
  quotationId: string,
): Promise<DocumentosDelEvento> =>
  (await apiRequest(ruta(quotationId), "GET")) as DocumentosDelEvento;

export const armarBorradorDeFactura = async (
  quotationId: string,
  ordenDeCompraId: number | null,
): Promise<BorradorDeFactura> =>
  (await apiRequest(`${ruta(quotationId)}/borrador`, "POST", {
    orden_de_compra_id: ordenDeCompraId,
  })) as BorradorDeFactura;

export const revisarFactura = async (
  quotationId: string,
  pedida: FacturaPedida,
): Promise<VistaPrevia> =>
  (await apiRequest(
    `${ruta(quotationId)}/revisar`,
    "POST",
    pedida,
  )) as VistaPrevia;

export const emitirFactura = async (
  quotationId: string,
  pedida: FacturaPedida,
): Promise<DocumentoTributario> =>
  (await apiRequest(
    `${ruta(quotationId)}/emitir`,
    "POST",
    pedida,
  )) as DocumentoTributario;
