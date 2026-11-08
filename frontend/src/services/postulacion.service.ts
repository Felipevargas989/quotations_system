import { API_ROUTES } from "../constants/api.routes";
import { api, apiRequest } from "./api";
import {
  type AnalisisDeBases,
  type EstadoDeLaCotizacion,
  subirConFormulario,
  type VistaDelOferente,
} from "./oportunidades.service";

// LA POSTULACIÓN (doc 17, decisiones 33 y 34, 19-10): los respaldos de
// experiencia de la carpeta (con la ficha pública de una orden de compra),
// la oferta armada con IA y el set para Mercado Público. Aparte de
// oportunidades.service, que estaba en el tope de 800 líneas del portero.

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
  /** «No usar» (decisión 56): la IA no lo ve. */
  no_usar?: boolean;
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

/** Lee una orden de compra o una factura con IA (decisión 34): sus datos
 *  para el respaldo, sin guardar nada (si es de Mercado Público, los
 *  confirma su ficha pública). `aviso`: algo que revisar. */
export const leerRespaldo = (archivo: File) =>
  subirConFormulario<{
    datos: DatosDeRespaldo;
    aviso: string | null;
    /** Si ya está en el sistema, dónde (decisión 77): no se guarda. */
    ya_esta?: string | null;
  }>(`${API_ROUTES.OPORTUNIDADES}/oferente/respaldos/leer`, archivo);

/** «No usar» (decisión 56): marca o desmarca un respaldo que la empresa no
 *  quiere mostrar; los demás se usan de mayor a menor monto. */
export const marcarNoUsar = async (id: number, noUsar: boolean) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente/documentos/${id}/no-usar`,
    "PATCH",
    { no_usar: noUsar },
  )) as VistaDelOferente;

/** Una fila de la oferta armada con IA (decisión 33): una especificación
 *  técnica de las bases, qué se ofrece y con qué productos del catálogo. */
export interface FilaDeLaOferta {
  especificacion: string;
  pagina: number;
  /** Lo que se ofrece: va tal cual en la propuesta y en los anexos. */
  como: string;
  /** Decisión 120 (08-11): también lo parecido al catálogo y lo
   *  particular de la licitación (se incluye sin precio aparte). */
  origen: "catalogo" | "parecido" | "subcontratar" | "particular" | "completar";
  productos: number[];
}

export interface ArmadoDeLaOferta {
  resumen: string;
  matriz: FilaDeLaOferta[];
  faltan_en_el_catalogo: Array<{ que: string; por_que: string }>;
  /** Decisión 57: lo que se le pide al proveedor externo, junto. No viene
   *  en las ofertas de antes del 20-10. */
  subcontratar?: string[];
  /** Decisión 57: variaciones de lo que ya vende, al comentario interno. */
  detalles?: string[];
}

/** Lo que anota «Armar postulación» en la fila de la oferta (decisión 35). */
export interface PostulacionArmada {
  /** El precio, con IVA. */
  total: number;
  /** ¿Va propuesta técnica? Si las bases la piden o aceptan formato propio. */
  propuesta: boolean;
  /** false: una compra ágil sin formularios, sin anexos (decisión 94). */
  anexos?: boolean;
  /** true: los anexos ya estaban todos firmados y no se rehicieron
   *  (decisión 99). */
  firmados?: boolean;
  /** Lo que no alcanzó a partir después de la oferta. */
  problemas?: string[];
}

/** Lo que la IA no sabe de la empresa y pregunta antes de armar (decisión
 *  119, parte 3). */
export interface PreguntaDeLaPostulacion {
  /** La exigencia en minúsculas y sin tildes (la de «Bases y criterios»). */
  clave: string;
  /** Lo que dicen las bases, tal cual. */
  exigencia: string;
  /** La pregunta, corta. */
  pregunta: string;
}

export interface TrabajoDeOferta extends Omit<AnalisisDeBases, "resultado"> {
  tipo: "oferta";
  parametros?: {
    postulacion?: PostulacionArmada;
    /** El armado se detuvo hasta que la empresa responda (decisión 119,
     *  parte 3): el precio con que se pidió y las preguntas. Va en la
     *  última fila de la oferta (sin oferta todavía, una en «error»). */
    detenida?: { total: number; preguntas: PreguntaDeLaPostulacion[] };
  };
  resultado: ArmadoDeLaOferta | null;
}

export const getOfertaDeLaPostulacion = async (id: number) =>
  ((await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/oferta`, "GET")) as
    | TrabajoDeOferta
    | ""
    | null) || null;

/** «Armar postulación» (decisión 35): con el precio (con IVA), la oferta y,
 *  por detrás, los anexos, la propuesta técnica si va y la cotización
 *  vinculada igual a lo postulado. Responde con la oferta en curso. */
export const armarPostulacion = async (id: number, total: number) =>
  (await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/postulacion`, "POST", {
    total,
  })) as TrabajoDeOferta;

/** Una respuesta del modal (decisión 119, parte 3). */
export interface RespuestaDelModal {
  clave: string;
  pregunta: string;
  exigencia?: string;
  respuesta: "lo_tengo" | "no_puedo";
  detalle?: string;
}

/** Las respuestas del modal: quedan en «Mi empresa» y marcadas en «Bases y
 *  criterios», y recién ahí se arma. Responde con la oferta en curso. */
export const responderYArmar = async (
  id: number,
  total: number,
  respuestas: RespuestaDelModal[],
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/postulacion/respuestas`,
    "POST",
    { total, respuestas },
  )) as TrabajoDeOferta;

/** Vincular una cotización que ya existe SIN reescribirla (decisión 73,
 *  23-10): quedan sus productos y precios; pasa a la fecha de las bases. */
export const vincularCotizacion = async (id: number, numero: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/cotizacion/vincular`,
    "POST",
    { numero },
  )) as EstadoDeLaCotizacion;

/** «Descargar para Mercado Público» (decisión 34): un archivo del ZIP. */
export interface PiezaDelSet {
  nombre: string;
  /** Dónde queda dentro del ZIP: «2. Técnica/Respaldos de experiencia». */
  carpetas: string[];
  que_es:
    | "formulario"
    | "propuesta"
    /** La cotización detallada que arma el motor (decisión 119). */
    | "cotizacion"
    /** Una declaración en el formato de la casa (decisión 119, parte 3b). */
    | "declaracion"
    | "subido"
    | "documento"
    | "respaldo";
  aviso: string | null;
}

export interface SetParaMercadoPublico {
  piezas: PiezaDelSet[];
  /** Lo que falta o hay que revisar antes de subir. */
  faltan: string[];
  bytes: number;
}

export const getSetParaMercadoPublico = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/set`,
    "GET",
  )) as SetParaMercadoPublico;

/** El ZIP. Si el motor dice que no, su mensaje viene dentro de un Blob: se
 *  lee para que humanizeApiError lo encuentre. */
export const descargarSetParaMercadoPublico = async (
  id: number,
): Promise<Blob> => {
  try {
    const respuesta = await api.get<Blob>(
      `${API_ROUTES.OPORTUNIDADES}/${id}/set/zip`,
      { responseType: "blob" },
    );
    return respuesta.data;
  } catch (e) {
    const respuesta = (e as { response?: { data?: unknown } }).response;
    if (respuesta?.data instanceof Blob) {
      try {
        respuesta.data = JSON.parse(await respuesta.data.text());
      } catch {
        // No era JSON: queda como vino.
      }
    }
    throw e;
  }
};
