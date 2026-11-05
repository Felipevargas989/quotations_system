import { apiRequest } from "./api";
import type { Ambiente, Receptor } from "./facturas.service";

// La lista de Facturación y las notas (doc 19 §9.5, paso 4): todo lo
// emitido con su cadena de anulaciones, «Comprobar» lo que quedó por
// confirmar, y las notas de crédito y de débito. Solo el administrador
// (E5). La empresa sale SIEMPRE de la sesión, en el motor.

export type AccionDeNota = "anular" | "corregir" | "rebajar";

export interface DocumentoDeLaLista {
  id: number;
  tipo: number;
  folio: number | null;
  fecha_emision: string | null;
  estado: string;
  ambiente: Ambiente;
  /** «Factura 1235», «NC 88 · anula la 1235». */
  titulo: string;
  /** «Factura 1235», si esta factura reemplaza a una anulada de la misma OC. */
  reemplaza: string | null;
  cliente: string | null;
  /** Con signo: la nota de crédito resta. */
  total: number;
  neto: number;
  iva: number;
  numero: number | null;
  quotation_id: string | null;
  oc: string | null;
  modifica_id: number | null;
  cadena: { como: string; texto: string };
  pdf_path: string | null;
  error: string | null;
  acciones: {
    anular: boolean;
    rebajar: boolean;
    corregir: boolean;
    comprobar: boolean;
    pedirPdf: boolean;
  };
  saldo: number | null;
  plazos: { anular: string; rebajar: string } | null;
}

export interface ListaDeFacturacion {
  ambiente: Ambiente;
  mes: string;
  hoy: string;
  resumen: {
    facturado: number;
    facturas: number;
    boletas: number;
    notas: number;
    porConfirmar: number;
  };
  documentos: DocumentoDeLaLista[];
}

export interface NotaPedida {
  accion: AccionDeNota;
  motivo: string;
  monto?: number | null;
  receptor?: Partial<Receptor> | null;
}

export interface VistaDeLaNota {
  ok: boolean;
  problemas: string[];
  avisos: string[];
  tipo: number;
  folio: number;
  fecha: string;
  codigo: number;
  modifica: string;
  plazo: string;
  montos: { neto: number; exento: number; iva: number; total: number } | null;
  lineas: { descripcion: string; cantidad: number; precio: number }[];
  receptor: Receptor;
  ambiente: Ambiente;
}

const base = "/facturacion/documentos";

export const getListaDeFacturacion = async (
  mes: string,
): Promise<ListaDeFacturacion> =>
  (await apiRequest(
    `${base}?mes=${encodeURIComponent(mes)}`,
    "GET",
  )) as ListaDeFacturacion;

export const comprobarDocumento = async (
  id: number,
): Promise<{ estado: string; folio: number | null }> =>
  (await apiRequest(`${base}/${id}/comprobar`, "POST")) as {
    estado: string;
    folio: number | null;
  };

export const pedirPdfDelDocumento = async (id: number): Promise<void> => {
  await apiRequest(`${base}/${id}/pdf`, "POST");
};

export const revisarNota = async (
  id: number,
  nota: NotaPedida,
): Promise<VistaDeLaNota> =>
  (await apiRequest(
    `${base}/${id}/notas/revisar`,
    "POST",
    nota,
  )) as VistaDeLaNota;

export const emitirNota = async (
  id: number,
  nota: NotaPedida,
): Promise<{ estado: string; folio: number | null; tipo: number }> =>
  (await apiRequest(`${base}/${id}/notas/emitir`, "POST", nota)) as {
    estado: string;
    folio: number | null;
    tipo: number;
  };
