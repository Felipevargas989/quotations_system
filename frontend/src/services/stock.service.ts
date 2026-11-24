// La pestaña «Stock» de Proveedores (doc 25, 23-11-2026): subir compras
// que lee la IA, revisar y aplicar el costo con check, los cortes y marcas
// equivalentes y la bodega simple. Todo por el motor (/logistics/stock).
import { API_ROUTES } from "../constants/api.routes";
import { api, apiRequest } from "./api";

const BASE = API_ROUTES.LOGISTICS_STOCK;

export type EstadoDeLinea = "propuesta" | "aplicada" | "no_es_insumo";

export interface LineaDeCompra {
  id: number;
  compra_id: number;
  orden: number;
  texto: string;
  cantidad_texto: string | null;
  total: number | null;
  supply_id: number | null;
  equivalente: string | null;
  /** Cuando la IA dudó: hasta 3 insumos para «¿Cuál es?». */
  posibles: number[] | null;
  cantidad_base: number | null;
  costo_base: number | null;
  costo_antes: number | null;
  estado: EstadoDeLinea;
}

export interface CompraSubida {
  id: number;
  archivo: string;
  nombre_archivo: string | null;
  supplier_id: number | null;
  proveedor_texto: string | null;
  tipo_documento: string | null;
  numero: string | null;
  fecha: string | null;
  con_iva: boolean;
  estado: "por_revisar" | "aplicada" | "descartada";
  created_at: string;
  aplicada_at: string | null;
  lineas: LineaDeCompra[];
}

export interface Equivalente {
  id: number;
  supply_id: number;
  nombre: string;
  tipo: "corte" | "marca";
}

export interface LineaDeBodega {
  tipo: "tengo" | "compra" | "saque" | "evento";
  cantidad: number;
  cuando: string;
  detalle: string | null;
}

export interface BodegaDeInsumo {
  supply_id: number;
  stock: number | null;
  contado_el: string | null;
  historia: LineaDeBodega[];
}

export interface EstadoDeStock {
  bodega: BodegaDeInsumo[];
  equivalentes: Equivalente[];
  compras: CompraSubida[];
}

export const getEstadoDeStock = async (): Promise<EstadoDeStock> =>
  (await apiRequest(BASE, "GET")) as EstadoDeStock;

/** Solo la bodega conocida (insumo → stock), para la lista de Compras. */
export const getBodega = async (): Promise<
  { supply_id: number; stock: number }[]
> => (await apiRequest(`${BASE}/bodega`, "GET")) ?? [];

export const subirCompra = async (archivo: File) => {
  const form = new FormData();
  form.append("archivo", archivo);
  const { data } = await api.request({
    url: `${BASE}/compras`,
    method: "POST",
    data: form,
    headers: { "Content-Type": undefined },
    // La IA tarda: una factura larga puede tomar un minuto.
    timeout: 4 * 60 * 1000,
  });
  return data as { compra: CompraSubida; avisos: string[] };
};

export const cambiarLinea = async (
  id: number,
  cambios: {
    supply_id?: number | null;
    cantidad_base?: number | null;
    total?: number | null;
    no_es_insumo?: boolean;
  },
) =>
  (await apiRequest(
    `${BASE}/compras/lineas/${id}`,
    "PATCH",
    cambios,
  )) as CompraSubida;

export const aplicarCompra = async (id: number, lineas: number[]) =>
  (await apiRequest(`${BASE}/compras/${id}/aplicar`, "POST", { lineas })) as {
    aplicadas: number;
    compra: CompraSubida;
  };

export const descartarCompra = async (id: number) =>
  apiRequest(`${BASE}/compras/${id}/descartar`, "POST");

export const agregarEquivalente = async (
  supply_id: number,
  nombre: string,
  tipo: "corte" | "marca",
) => apiRequest(`${BASE}/equivalentes`, "POST", { supply_id, nombre, tipo });

export const borrarEquivalente = async (id: number) =>
  apiRequest(`${BASE}/equivalentes/${id}`, "DELETE");

export const moverBodega = async (
  supply_id: number,
  tipo: "tengo" | "saque",
  cantidad_base: number,
  nota?: string,
) =>
  apiRequest(`${BASE}/movimientos`, "POST", {
    supply_id,
    tipo,
    cantidad_base,
    ...(nota ? { nota } : {}),
  });
