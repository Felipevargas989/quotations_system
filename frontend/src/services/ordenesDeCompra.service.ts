import { apiRequest } from "./api";

// Las órdenes de compra de un evento (migración 184, doc 19, paso 2a). Cada
// una dice a nombre de quién viene (RUT y razón social): Santo Tomás manda
// OC del CFT y del Instituto Profesional para un mismo evento, y la factura
// de cada OC va a su RUT. La empresa sale SIEMPRE de la sesión, en el motor.

export interface OrdenDeCompra {
  id: number;
  quotation_id: string;
  numero: string;
  fecha: string;
  rut: string | null;
  razon_social: string | null;
  descripcion: string | null;
  neto: number | null;
  iva: number | null;
  total: number;
  origen: "manual" | "mercado_publico" | "pdf";
  documento_id: number | null;
  created_at: string;
}

export type DatosDeOrdenDeCompra = Partial<
  Pick<
    OrdenDeCompra,
    | "numero"
    | "fecha"
    | "rut"
    | "razon_social"
    | "descripcion"
    | "neto"
    | "iva"
    | "total"
    | "documento_id"
  >
>;

const ruta = (quotationId: string) =>
  `/quotations/${quotationId}/ordenes-de-compra`;

export const getOrdenesDeCompra = async (
  quotationId: string,
): Promise<OrdenDeCompra[]> =>
  ((await apiRequest(ruta(quotationId), "GET")) || []) as OrdenDeCompra[];

export const createOrdenDeCompra = async (
  quotationId: string,
  datos: DatosDeOrdenDeCompra,
): Promise<OrdenDeCompra> =>
  (await apiRequest(ruta(quotationId), "POST", datos)) as OrdenDeCompra;

export const updateOrdenDeCompra = async (
  quotationId: string,
  id: number,
  cambios: DatosDeOrdenDeCompra,
): Promise<OrdenDeCompra> =>
  (await apiRequest(
    `${ruta(quotationId)}/${id}`,
    "PATCH",
    cambios,
  )) as OrdenDeCompra;

export const deleteOrdenDeCompra = async (quotationId: string, id: number) =>
  apiRequest(`${ruta(quotationId)}/${id}`, "DELETE");
