// La pestaña «Costos» de Proveedores (doc 25, 23-11-2026; antes «Stock»): subir compras
// que lee la IA, revisar y aplicar el costo con check y los cortes y marcas
// equivalentes (la bodega salió el mismo día, D16). Todo por el motor (/logistics/stock).
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

/** Una compra aplicada de un insumo vigilado: su costo y el de antes. */
export interface CostoDeUnaCompra {
  costo: number;
  antes: number | null;
  fecha: string | null;
  proveedor: string | null;
  equivalente: string | null;
}

export interface EstadoDeStock {
  equivalentes: Equivalente[];
  compras: CompraSubida[];
  /** Los insumos con estrella (doc 25 D18). */
  vigilados: number[];
  /** Hasta 6 compras por insumo vigilado, la más nueva primero. */
  historial: Record<number, CostoDeUnaCompra[]>;
}

export const getEstadoDeStock = async (): Promise<EstadoDeStock> =>
  (await apiRequest(BASE, "GET")) as EstadoDeStock;

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

export const vigilarInsumo = async (supplyId: number, vigilar: boolean) =>
  apiRequest(`${BASE}/vigilados/${supplyId}`, "PUT", { vigilar });
