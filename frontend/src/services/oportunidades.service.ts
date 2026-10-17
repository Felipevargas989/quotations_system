import { API_ROUTES } from "../constants/api.routes";
import { api, apiRequest } from "./api";

// OPORTUNIDADES (doc 17): licitaciones y compras ágiles de Mercado Público
// que el radar trae y la IA lee. Solo administrador, solo empresas con el
// derecho `oportunidades`.

export type Semaforo = "verde" | "amarillo" | "rojo";

export type EstadoOportunidad =
  | "nueva"
  | "en_estudio"
  | "postulada"
  | "ganada"
  | "perdida"
  | "descartada";

export type TipoProceso = "licitacion" | "compra_agil";

export interface ProcesoDeLista {
  tipo: TipoProceso;
  nombre: string;
  organismo: string | null;
  organismo_codigo: string | null;
  unidad: string | null;
  comuna: string | null;
  region: string | null;
  monto: number | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  estado: string | null;
}

/** Quién ganó un proceso y por cuánto. Con RUT, enlaza a su ficha de
 *  competidor. */
export interface GanadorDeProceso {
  rut?: string | null;
  nombre: string;
  monto: number | null;
}

/** La misma compra del año anterior: quién ganó, por cuánto y cuántos
 *  ofertaron (sprint 1b). */
export interface Anterior {
  codigo: string;
  nombre: string;
  anio: number | null;
  oferentes: number | null;
  url_acta: string | null;
  ganadores: GanadorDeProceso[];
}

/** SE VIENE (doc 17 §5.3): lo que se repite cada año y todavía no sale. */
export interface SeViene {
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  /** Cuándo debería publicarse: la última vez, un año después. */
  esperada: string;
  /** Ya debió salir y todavía no aparece. */
  atrasada: boolean;
  anios: number[];
  comuna_cercana: boolean;
  alto_valor: boolean;
  ultima: {
    codigo: string;
    fecha_publicacion: string;
    monto: number | null;
    oferentes: number | null;
    ganadores: GanadorDeProceso[];
  };
}

/** Quién gana en las regiones de la empresa (los últimos 3 años). */
export interface Competidor {
  rut: string;
  nombre: string;
  triunfos: number;
  monto_total: number;
  ultimo: string | null;
  organismos: Array<{ nombre: string; veces: number }>;
}

export interface FichaDeCompetidor extends Competidor {
  triunfos_detalle: Array<{
    codigo: string;
    nombre: string;
    organismo: string | null;
    comuna: string | null;
    fecha_publicacion: string | null;
    monto: number | null;
    oferentes: number | null;
  }>;
}

export interface Oportunidad {
  id: number;
  codigo: string;
  semaforo: Semaforo | null;
  etiquetas: string[];
  se_hace_en_el_complejo: "si" | "no" | "dudoso" | null;
  razon: string | null;
  /** comuna_cercana | alto_valor */
  alertas: string[];
  estado: EstadoOportunidad;
  responsable_id: string | null;
  leida_en: string | null;
  proceso: ProcesoDeLista;
  anterior?: Anterior | null;
}

export interface CambioDeProceso {
  id: number;
  /** fecha_cierre | reapertura */
  tipo: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  creado_en: string;
}

export interface FichaDeOportunidad extends Omit<Oportunidad, "proceso"> {
  leida_con: string | null;
  notas: string | null;
  quotation_id: string | null;
  actualizado_en: string;
  proceso: ProcesoDeLista & {
    codigo: string;
    descripcion: string | null;
    moneda: string | null;
    fechas: Record<string, unknown>;
    productos: Array<{
      nombre?: string | null;
      descripcion?: string | null;
      cantidad?: number | null;
    }>;
    adjudicacion: Record<string, unknown> | null;
    primera_vez_visto: string;
    actualizado_en: string;
  };
  cambios: CambioDeProceso[];
  anterior: Anterior | null;
}

export interface ConfigOportunidades {
  regiones: string[];
  comunas_cercanas: string[];
  perfil: string;
  /** De Configuración de empresa: aquí solo se muestran. */
  umbral_alto_valor: number | null;
  correo_avisos: string | null;
}

export interface CorridaDelRadar {
  id: number;
  origen: string;
  estado: "corriendo" | "ok" | "error" | "abandonada";
  empezo_en: string;
  termino_en: string | null;
  resumen: {
    licitaciones?: { activas?: number; nuevas?: number; pendientes?: number };
    compras_agiles?: { nuevas?: number };
    lectura?: { leidas?: number };
    avisos?: string[];
  } | null;
  error: string | null;
}

export const getOportunidades = async (params: {
  vigentes?: boolean;
  estado?: EstadoOportunidad;
}) =>
  (await apiRequest(
    API_ROUTES.OPORTUNIDADES,
    "GET",
    undefined,
    params,
  )) as Oportunidad[];

export const getFichaDeOportunidad = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}`,
    "GET",
  )) as FichaDeOportunidad;

export const actualizarOportunidad = async (
  id: number,
  cambios: {
    estado?: EstadoOportunidad;
    responsable_id?: string | null;
    notas?: string | null;
  },
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}`,
    "PATCH",
    cambios,
  )) as Pick<
    FichaDeOportunidad,
    "id" | "estado" | "responsable_id" | "notas" | "actualizado_en"
  >;

export const getConfigOportunidades = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/config`,
    "GET",
  )) as ConfigOportunidades;

export const guardarConfigOportunidades = async (config: {
  regiones?: string[];
  comunas_cercanas?: string[];
  perfil?: string;
}) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/config`,
    "PATCH",
    config,
  )) as ConfigOportunidades;

/** Lo que Opus leyó de las bases (doc 17, sprint 3, paso 1; migración
 *  125). */
export interface ResultadoDeBases {
  resumen: string;
  lugar: string;
  se_puede_en_el_complejo: "si" | "no" | "dudoso";
  /** 0 = las bases no lo dicen. */
  monto: number;
  monto_detalle: string;
  fechas: Array<{ que: string; cuando: string }>;
  criterios: Array<{ nombre: string; peso: string; como_se_evalua: string }>;
  requisitos: Array<{
    que: string;
    tipo: "administrativo" | "tecnico" | "economico" | "garantia" | "otro";
    obligatorio: boolean;
    documento: string;
    /** 0 = sin página (un Word). */
    pagina: number;
  }>;
  garantias: string[];
  alertas: string[];
}

export interface AnalisisDeBases {
  id: number;
  estado: "procesando" | "listo" | "error";
  resultado: ResultadoDeBases | null;
  archivos: Array<{ id: number; nombre: string }>;
  no_leidos: Array<{ nombre: string; motivo: string }>;
  modelo: string | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  costo_usd: number | null;
  error: string | null;
  creado_en: string;
  terminado_en: string | null;
}

export const getAnalisis = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/analisis`,
    "GET",
  )) as AnalisisDeBases | null;

export const pedirAnalisis = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/analisis`,
    "POST",
  )) as AnalisisDeBases;

/** La empresa como oferente (doc 17, sprint 3, paso 2; migración 126). */
export interface Oferente {
  razon_social: string | null;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  region: string | null;
  telefono: string | null;
  correo: string | null;
  representante_nombre: string | null;
  representante_rut: string | null;
  representante_cargo: string | null;
  experiencia: string | null;
  instalaciones: string | null;
  /** La foto de la firma, en el balde privado. */
  firma_ruta: string | null;
  firma_subida_en: string | null;
}

export interface DocumentoDeEmpresa {
  id: number;
  tipo: string;
  nombre: string;
  ruta: string;
  tipo_archivo: string;
  bytes: number;
  /** AAAA-MM-DD; null = no vence. */
  vence: string | null;
  creado_en: string;
  quien: { full_name: string | null } | null;
}

export interface VistaDelOferente {
  oferente: Oferente;
  /** De Configuración de empresa: aquí solo se muestran. */
  empresa: {
    nombre: string | null;
    banco: {
      rut: string | null;
      banco: string | null;
      tipo_cuenta: string | null;
      numero: string | null;
      titular: string | null;
    } | null;
  };
  documentos: DocumentoDeEmpresa[];
}

export type CamposDelOferente = Omit<
  Oferente,
  "firma_ruta" | "firma_subida_en"
>;

export const getOferente = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente`,
    "GET",
  )) as VistaDelOferente;

/** Vacío = borrar el dato. */
export const guardarOferente = async (
  cambios: Partial<Record<keyof CamposDelOferente, string>>,
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente`,
    "PATCH",
    cambios,
  )) as VistaDelOferente;

const subirConFormulario = async <T>(
  url: string,
  archivo: File,
  campos: Record<string, string> = {},
) => {
  const form = new FormData();
  form.append("file", archivo);
  Object.entries(campos).forEach(([k, v]) => form.append(k, v));
  const { data } = await api.request({
    url,
    method: "POST",
    data: form,
    headers: { "Content-Type": undefined },
  });
  return data as T;
};

export const subirFirma = (archivo: File) =>
  subirConFormulario<VistaDelOferente>(
    `${API_ROUTES.OPORTUNIDADES}/oferente/firma`,
    archivo,
  );

export const borrarFirma = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente/firma`,
    "DELETE",
  )) as VistaDelOferente;

export const subirDocumentoDeEmpresa = (
  archivo: File,
  tipo: string,
  vence: string,
) =>
  subirConFormulario<DocumentoDeEmpresa>(
    `${API_ROUTES.OPORTUNIDADES}/oferente/documentos`,
    archivo,
    { tipo, vence },
  );

export const borrarDocumentoDeEmpresa = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente/documentos/${id}`,
    "DELETE",
  )) as { borrado: boolean };

/** Lo que dijo Opus al validar la postulación (doc 17, sprint 3, paso 3;
 *  migración 127). */
export interface ResultadoDeValidacion {
  resumen: string;
  listo: "si" | "casi" | "no";
  requisitos: Array<{
    que: string;
    estado: "cumple" | "falta" | "vencido" | "revisar";
    donde: string;
    observacion: string;
  }>;
  otros_problemas: string[];
}

export interface ValidacionDeDocumentos
  extends Omit<AnalisisDeBases, "resultado"> {
  resultado: ResultadoDeValidacion | null;
}

export const getValidacion = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/validacion`,
    "GET",
  )) as ValidacionDeDocumentos | null;

export const pedirValidacion = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/validacion`,
    "POST",
  )) as ValidacionDeDocumentos;

/** "Mis licitaciones" (Felipe, 17-10): las marcadas, con su avance. */
export interface AvanceDeLicitacion {
  /** Archivos en «Bases y anexos». */
  bases: number;
  analisis: "procesando" | "listo" | "error" | null;
  anexos: "procesando" | "listo" | "error" | null;
  propuesta: "procesando" | "listo" | "error" | null;
  /** En «Mi postulación»: todo, lo hecho por la IA sin firma y lo firmado. */
  postulacion: number;
  generados: number;
  firmados: number;
  validacion: {
    estado: "procesando" | "listo" | "error";
    listo: "si" | "casi" | "no" | null;
  } | null;
}

export type MiLicitacion = Oportunidad & { avance: AvanceDeLicitacion };

export const getMisLicitaciones = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/mias`,
    "GET",
  )) as MiLicitacion[];

export const getCalendario = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/calendario`,
    "GET",
  )) as SeViene[];

export const getCompetidores = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/competidores`,
    "GET",
  )) as Competidor[];

export const getCompetidor = async (rut: string) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/competidores/${encodeURIComponent(rut)}`,
    "GET",
  )) as FichaDeCompetidor;

/** Una base o anexo que subió la empresa (migración 124). `ruta` vive en
 *  el balde privado: se ve con el visor de la casa (FileViewLink), que
 *  pide un enlace firmado de pocos minutos. */
export interface AdjuntoDeOportunidad {
  id: number;
  nombre: string;
  ruta: string;
  tipo: string;
  bytes: number;
  /** De dónde salió (migración 129): lo subió una persona, lo hizo la IA
   *  (sin firma) o es la versión firmada. */
  origen: OrigenDeArchivo;
  /** El archivo del que salió. */
  viene_de: number | null;
  creado_en: string;
  subido_por: string | null;
  quien: { full_name: string | null } | null;
}

export type OrigenDeArchivo = "subido" | "generado" | "firmado";

/** Lo que la IA hizo en el taller (doc 17, sprint 3, paso 4; migración
 *  129): los anexos llenos SIN firma, la firma y la propuesta técnica. */
export type TipoDeGeneracion = "anexos" | "firma" | "propuesta";

export interface ResultadoDeGeneracion {
  resumen: string;
  documentos: Array<{
    adjunto_id: number;
    nombre: string;
    que_se_hizo: string;
    pendientes: string[];
  }>;
  pendientes: string[];
  /** Lo que entregó la IA y no pasó la revisión del motor. */
  descartados: Array<{ nombre: string; motivo: string }>;
  no_entregados: string[];
}

export interface Generacion extends Omit<AnalisisDeBases, "resultado"> {
  tipo: TipoDeGeneracion;
  parametros: { monto_total?: number | null; adjuntos?: number[] };
  resultado: ResultadoDeGeneracion | null;
}

export type GeneracionesDeOportunidad = Record<
  TipoDeGeneracion,
  Generacion | null
>;

export const getGeneraciones = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/generaciones`,
    "GET",
  )) as GeneracionesDeOportunidad;

/** `monto_total` con IVA, lo pone la empresa; sin él, la oferta económica
 *  queda en blanco. */
export const generarAnexos = async (
  id: number,
  pedido: { monto_total?: number; adjuntos?: number[] },
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/generaciones/anexos`,
    "POST",
    pedido,
  )) as Generacion;

export const firmarDocumentos = async (id: number, adjuntos: number[]) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/generaciones/firma`,
    "POST",
    { adjuntos },
  )) as Generacion;

export const crearPropuestaTecnica = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/generaciones/propuesta`,
    "POST",
  )) as Generacion;

/** 'bases': lo que publicó el comprador en Mercado Público. 'postulacion':
 *  lo que la empresa va a presentar (migración 127). */
export type SeccionDeArchivos = "bases" | "postulacion";

export const getAdjuntos = async (
  id: number,
  seccion: SeccionDeArchivos = "bases",
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/adjuntos`,
    "GET",
    undefined,
    { seccion },
  )) as AdjuntoDeOportunidad[];

/** Un archivo por pedido (el motor valida tipo y tamaño). */
export const subirAdjunto = async (
  id: number,
  archivo: File,
  seccion: SeccionDeArchivos = "bases",
) => {
  const form = new FormData();
  form.append("file", archivo);
  form.append("seccion", seccion);
  const { data } = await api.request({
    url: `${API_ROUTES.OPORTUNIDADES}/${id}/adjuntos`,
    method: "POST",
    data: form,
    headers: { "Content-Type": undefined },
  });
  return data as AdjuntoDeOportunidad;
};

export const borrarAdjunto = async (id: number, adjuntoId: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/adjuntos/${adjuntoId}`,
    "DELETE",
  )) as { borrado: boolean };

export const getCorridasDelRadar = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/radar/corridas`,
    "GET",
  )) as CorridaDelRadar[];

export const correrRadar = async () =>
  (await apiRequest(`${API_ROUTES.OPORTUNIDADES}/radar`, "POST")) as {
    iniciada: boolean;
    corrida?: number;
    motivo?: string;
  };
