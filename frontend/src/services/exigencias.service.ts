import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// «BASES Y CRITERIOS» EN DOS LISTAS (19-10). Felipe: "lo que pide la
// licitación con el listado de documentos". Las exigencias que la empresa
// marca (lo tengo / no puedo, migración 152) y el checklist de documentos
// que devuelve el análisis de las bases. Aparte de oportunidades.service,
// que está cerca del tope de 800 líneas.

/** Lo que la empresa marca en una exigencia de las bases. */
export type MarcaDeExigencia = "lo_tengo" | "no_puedo";

/** Un documento que piden las bases (el checklist del análisis, desde el
 *  19-10; un análisis anterior no lo trae). */
export interface DocumentoPedido {
  nombre: string;
  parte: "administrativa" | "tecnica" | "economica" | "otra";
  cuando: "con_la_oferta" | "al_adjudicar" | "al_pagar";
  /** Si falta, queda fuera de bases o no se puede adjudicar. */
  obligatorio: boolean;
  /** Vigencia o antigüedad que piden; vacío si nada. */
  condicion: string;
  /** A qué parte de la carpeta de «Mi empresa» corresponde. */
  carpeta: string;
  pagina: number;
}

/** Marca (o desmarca, con null) una exigencia; devuelve todas las marcas. */
export const marcarExigencia = async (
  id: number,
  clave: string,
  marca: MarcaDeExigencia | null,
) =>
  (await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/exigencias`, "PATCH", {
    clave,
    marca,
  })) as Record<string, MarcaDeExigencia>;
