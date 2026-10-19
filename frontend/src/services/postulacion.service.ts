import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type { AnalisisDeBases } from "./oportunidades.service";

// LA POSTULACIÓN (doc 17, decisiones 33 y 34, 19-10): los respaldos de
// experiencia de la carpeta (con la ficha pública de una orden de compra)
// y la oferta armada con IA. Aparte de oportunidades.service, que estaba en
// el tope de 800 líneas del portero.

/** Un respaldo de experiencia de la carpeta (decisión 34 del doc 17): una
 *  orden de compra o una factura, con lo que pide el anexo de experiencia. */
export interface DatosDeRespaldo {
  numero: string;
  mandante: string | null;
  contrato: string | null;
  anio: number | null;
  /** Pesos, con impuestos. */
  monto: number | null;
  fuente: "mercado_publico" | "manual";
}

/** La ficha pública de una orden de compra, leída por el motor. */
export interface OrdenDeCompra {
  numero: string;
  contrato: string;
  mandante: string | null;
  unidad: string | null;
  fecha: string | null;
  anio: number | null;
  monto: number | null;
  estado: string | null;
  licitacion: string | null;
  rut_proveedor: string | null;
}

/** Con el número de una orden de compra, sus datos desde la ficha pública
 *  de Mercado Público (decisión 34). `aviso`: si es de otro proveedor. */
export const leerOrdenDeCompra = async (codigo: string) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente/orden-de-compra/${encodeURIComponent(codigo.trim())}`,
    "GET",
  )) as { orden: OrdenDeCompra; aviso: string | null };

/** Una fila de la oferta armada con IA (decisión 33): una especificación
 *  técnica de las bases, qué se ofrece y con qué productos del catálogo. */
export interface FilaDeLaOferta {
  especificacion: string;
  pagina: number;
  /** Lo que se ofrece: va tal cual en la propuesta y en los anexos. */
  como: string;
  origen: "catalogo" | "subcontratar" | "completar";
  productos: number[];
}

export interface ArmadoDeLaOferta {
  resumen: string;
  matriz: FilaDeLaOferta[];
  faltan_en_el_catalogo: Array<{ que: string; por_que: string }>;
}

export interface TrabajoDeOferta extends Omit<AnalisisDeBases, "resultado"> {
  tipo: "oferta";
  resultado: ArmadoDeLaOferta | null;
}

export const getOfertaDeLaPostulacion = async (id: number) =>
  ((await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/oferta`, "GET")) as
    | TrabajoDeOferta
    | ""
    | null) || null;

export const armarLaOferta = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/oferta`,
    "POST",
  )) as TrabajoDeOferta;
