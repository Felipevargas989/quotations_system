import { apiRequest } from "./api";
import type { Ambiente, Receptor } from "./facturas.service";

// La lista de Facturación y las notas (doc 19 §9.5, paso 4): todo lo
// emitido con su cadena de anulaciones, «Comprobar» lo que quedó por
// confirmar, y las notas de crédito y de débito. Solo el administrador
// (E5). La empresa sale SIEMPRE de la sesión, en el motor.

export type AccionDeNota = "anular" | "corregir" | "rebajar";

export type SituacionEnLaLista =
  | "vigente"
  | "rebajada"
  | "anulada"
  | "por_confirmar"
  | "nota";

export interface DocumentoDeLaLista {
  id: number;
  tipo: number;
  folio: number | null;
  fecha_emision: string | null;
  estado: string;
  ambiente: Ambiente;
  /** «Factura 1235», «NC 88 · anula la 1235»: el reporte y el buscador. */
  titulo: string;
  /** «Factura 1235», «NC 88»: arriba en la lista (§9.22, 07-11). Opcional,
   *  como lo demás nuevo del motor: la vitrina puede llegar antes. */
  nombre?: string;
  /** «F383_Municipalidad de Quillón_460_1213301-49-AG26» (§9.35): el
   *  nombre al descargarlo y en el visor. Un motor de antes no lo manda. */
  nombre_del_pdf?: string;
  /** §9.36: emitida fuera de Eventia y traída de facturacion.cl. */
  traida?: boolean;
  /** Lo que hace la nota, «anula la 1235»: junto a la fecha. */
  que_hace?: string | null;
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
  /** El chip en una palabra («Vigente», «Rebajada», «Anulada», «Por
   *  confirmar») y, abajo, lo que lo cambió («−$1.000», «Por NC
   *  88», «Corregida por NC 90»), §9.22, 07-11. */
  cadena: { como: string; texto: string; detalle?: string | null };
  /** Para el filtro «Estado» (§9.22): la corregida vale entera, así que
   *  queda vigente; una nota sin anular es solo una nota. */
  situacion: SituacionEnLaLista;
  /** El RUT del receptor, para buscar (la boleta no lo tiene). */
  rut: string | null;
  /** La primera referencia de la factura: la OC, la HES… */
  referencia: { tipo: string; folio: string } | null;
  /** La condición de pago de la factura (§9.22): 1 contado, 2 crédito. */
  forma_de_pago: 1 | 2 | null;
  vencimiento: string | null;
  plazo_dias: number | null;
  pdf_path: string | null;
  error: string | null;
  acciones: {
    anular: boolean;
    rebajar: boolean;
    corregir: boolean;
    comprobar: boolean;
    pedirPdf: boolean;
    /** §9.33: el XML se le pide a facturacion.cl con el botón. */
    xml?: boolean;
  };
  saldo: number | null;
  plazos: { anular: string; rebajar: string } | null;
}

export interface ListaDeFacturacion {
  ambiente: Ambiente;
  /** Por qué no se puede emitir, si no se puede (paso 5). */
  sin_conexion?: string | null;
  mes: string;
  /** El período que trae: las dos fechas incluidas (AAAA-MM-DD). */
  desde: string;
  hasta: string;
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
  /** Lo que modifica, como va en la nota (§9.22, sprint 3). */
  referencia: {
    tipo: string;
    folio: string;
    fecha: string;
    codigo: number;
    razon: string;
  };
  emisor: { nombre: string | null; rut: string | null };
  plazo: string;
  montos: { neto: number; exento: number; iva: number; total: number } | null;
  /** La de anular copia las de lo que anula, con su descuento (§9.22). */
  lineas: {
    descripcion: string;
    descripcionLarga?: string | null;
    cantidad: number;
    precio: number;
    descuento?: number | null;
  }[];
  receptor: Receptor;
  ambiente: Ambiente;
}

/** «Probar la conexión» (paso 0): si facturacion.cl responde desde el
 *  motor y, conectado, los folios que quedan de cada tipo. */
export interface ConexionConFacturacionCl {
  ambiente: Ambiente;
  sin_conexion: string | null;
  servicio: {
    en_linea: boolean;
    version: string | null;
    ms: number;
    error: string | null;
  };
  folios: {
    tipo: number;
    ms: number;
    siguiente?: number;
    hasta?: number;
    libres?: number;
    vence?: string | null;
    error?: string;
  }[];
}

export const probarConexionConFacturacionCl =
  async (): Promise<ConexionConFacturacionCl> =>
    (await apiRequest(
      "/facturacion/conexion",
      "GET",
    )) as ConexionConFacturacionCl;

const base = "/facturacion/documentos";

/** La lista de un mes (AAAA-MM) o, desde el 06-11 (§9.22), de un rango de
 *  fechas con las dos incluidas: hasta un año por vez. */
export const getListaDeFacturacion = async (
  periodo: string | { desde: string; hasta: string; tipos?: number[] },
): Promise<ListaDeFacturacion> =>
  (await apiRequest(
    base,
    "GET",
    undefined,
    typeof periodo === "string"
      ? { mes: periodo }
      : {
          desde: periodo.desde,
          hasta: periodo.hasta,
          ...(periodo.tipos?.length ? { tipos: periodo.tipos.join(",") } : {}),
        },
  )) as ListaDeFacturacion;

export const comprobarDocumento = async (
  id: number,
): Promise<{ estado: string; folio: number | null }> =>
  (await apiRequest(`${base}/${id}/comprobar`, "POST")) as {
    estado: string;
    folio: number | null;
  };

/** El PDF que no alcanzó a llegar: lo trae de facturacion.cl y devuelve
 *  dónde quedó (§9.33: lo pide el ícono de descargar o de ver). */
export const pedirPdfDelDocumento = async (
  id: number,
): Promise<{ pdf_path: string | null }> =>
  ((await apiRequest(`${base}/${id}/pdf`, "POST")) ?? { pdf_path: null }) as {
    pdf_path: string | null;
  };

/** §9.33: el XML tributario, pedido a facturacion.cl (costo adicional):
 *  el nombre del archivo y su contenido en Base64, tal cual. */
export const pedirXmlDelDocumento = async (
  id: number,
): Promise<{ nombre: string; base64: string }> =>
  (await apiRequest(`${base}/${id}/xml`, "POST")) as {
    nombre: string;
    base64: string;
  };

/** §9.36: una factura emitida fuera de Eventia, leída de su PDF de
 *  facturacion.cl. */
export interface FacturaTraida {
  folio: number;
  fecha_emision: string;
  receptor: {
    rut: string;
    razon_social: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
  };
  referencias: { tipo: string; folio: string; fecha: string; razon?: string }[];
  lineas: {
    descripcion: string;
    descripcionLarga: string | null;
    cantidad: number;
    precio: number;
  }[];
  exento: number;
  neto: number;
  iva: number;
  total: number;
  /** facturacion.cl cortó la razón social en su PDF y va completa con la
   *  del SII (§9.36). */
  nombre_del_sii?: boolean;
  /** El evento de su OC (o, en una nota, el de su factura), si está en
   *  Eventia. */
  evento: { cotizacion: number | null; oc: string | null } | null;
  /** La factura (33) o la nota de crédito (61). */
  tipo?: 33 | 61;
  /** La nota: el documento que modifica y cómo («anula», «corrige»,
   *  «rebaja»). */
  modifica?: {
    tipo: string;
    folio: string;
    fecha: string;
    que_hace: string;
  } | null;
}

/** «Traer factura por N°» (§9.36): sin `guardar`, solo la lee. También la
 *  nota de crédito (`tipo` 61). */
export const traerFactura = async (
  folio: number,
  guardar: boolean,
  tipo: 33 | 61 = 33,
): Promise<{ factura: FacturaTraida; guardada: { id: number } | null }> =>
  (await apiRequest(
    `${base}/traer`,
    "POST",
    tipo === 61 ? { folio, guardar, tipo } : { folio, guardar },
  )) as {
    factura: FacturaTraida;
    guardada: { id: number } | null;
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

/** La nota emitida (o la que quedó por confirmar): el motor devuelve el
 *  documento entero; la pantalla usa su id para marcarla en la lista. */
export interface NotaEmitida {
  id: number;
  estado: string;
  folio: number | null;
  tipo: number;
  total: number;
}

export const emitirNota = async (
  id: number,
  nota: NotaPedida,
): Promise<NotaEmitida> =>
  (await apiRequest(`${base}/${id}/notas/emitir`, "POST", nota)) as NotaEmitida;

/** Un documento recibido de un proveedor (doc 19 §9.28, migración 193). */
export interface DocumentoRecibido {
  id: number;
  periodo: string;
  tipo: number;
  folio: number;
  fecha_emision: string | null;
  rut_emisor: string;
  razon_social_emisor: string | null;
  neto: number | null;
  exento: number | null;
  iva: number | null;
  total: number | null;
  link_pdf: string | null;
  recepcion_sii: string | null;
  acuse_sii: string | null;
  tipo_compra: number | null;
  traido_en: string;
}

/** Lo recibido de un mes: lo guardado, y si se puede traer más. */
export interface RecibidosDelMes {
  periodo: string;
  ambiente: Ambiente;
  se_puede_traer: boolean;
  sin_conexion: string | null;
  traido_en: string | null;
  documentos: DocumentoRecibido[];
  /** Solo al traer: cuántos se guardaron y cuántos vinieron sin XML. */
  traidos?: number;
  sin_datos?: number;
}

/** Lo recibido del mes (AAAA-MM), de la copia guardada. */
export const getRecibidos = async (periodo: string) =>
  (await apiRequest(
    `/facturacion/recibidos?periodo=${encodeURIComponent(periodo)}`,
    "GET",
  )) as RecibidosDelMes;

/** «Traer de facturacion.cl»: pide el libro de compras del mes y lo guarda. */
export const traerRecibidos = async (periodo: string) =>
  (await apiRequest("/facturacion/recibidos/traer", "POST", {
    periodo,
  })) as RecibidosDelMes;
