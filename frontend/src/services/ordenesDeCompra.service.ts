import { apiRequest } from "./api";

// Las órdenes de compra de un evento (migración 184, doc 19). Cada una dice
// a nombre de quién viene (RUT y razón social): Santo Tomás manda OC del
// CFT y del Instituto Profesional para un mismo evento, y la factura de
// cada OC va a su RUT. Desde el 05-11 salen de Documentos: BelIA las lee al
// abrir «Emitir DTE» (§9.20); acá solo se listan, para nombrar la OC de
// cada factura emitida. La empresa sale SIEMPRE de la sesión, en el motor.

/** Lo que la OC dice del comprador, como lo leyó BelIA (paso 2b): la
 *  primera factura a un RUT nuevo lo propone (paso 2c). */
export interface CompradorDeLaOC {
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
}

export interface OrdenDeCompra {
  id: number;
  quotation_id: string;
  numero: string;
  fecha: string;
  rut: string | null;
  razon_social: string | null;
  comprador: CompradorDeLaOC | null;
  descripcion: string | null;
  neto: number | null;
  iva: number | null;
  total: number;
  origen: "manual" | "mercado_publico" | "pdf";
  documento_id: number | null;
  created_at: string;
}

const ruta = (quotationId: string) =>
  `/quotations/${quotationId}/ordenes-de-compra`;

export const getOrdenesDeCompra = async (
  quotationId: string,
): Promise<OrdenDeCompra[]> =>
  ((await apiRequest(ruta(quotationId), "GET")) || []) as OrdenDeCompra[];
