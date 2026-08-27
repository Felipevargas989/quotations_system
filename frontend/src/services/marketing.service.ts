import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export interface AudienciaGuardada {
  id: number;
  nombre: string;
  filtro: FiltroSegmento;
  /** Conteo EN VIVO: la audiencia es una pregunta, no una lista. */
  total: number;
}

export interface AudienciasMarketing {
  guardadas: AudienciaGuardada[];
  clientes_con_correo: number;
  importadas: { audiencia: string; contactos: number; bajas: number }[];
  tipos: { tipo: string; total: number; conCorreo: number }[];
  tipos_evento: { tipo: string; n: number }[];
}

export interface CampanaMarketing {
  id: number;
  nombre: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  preencabezado: string | null;
  audiencia_tipo: "clientes" | "importada" | "segmento";
  audiencia_id: number | null;
  audiencia_ref: string | null;
  tipos_cliente: string[] | null;
  filtro: FiltroSegmento | null;
  estado: "borrador" | "enviada";
  prueba_enviada_at: string | null;
  enviada_at: string | null;
  total_destinatarios: number | null;
  reenviada_con_asunto: string | null;
  created_at: string;
}

export interface FiltroSegmento {
  tipos_cliente?: string[];
  con_estados?: (
    | "realizada"
    | "aceptada"
    | "rechazada"
    | "cancelada"
    | "anulada"
  )[];
  evento_desde?: string;
  evento_hasta?: string;
  sin_cotizacion_desde?: string;
  aniversario?: boolean;
  monto_min?: number;
  tipos_evento?: string[];
}

export const previaSegmento = async (filtro: FiltroSegmento) =>
  (await apiRequest(`${API_ROUTES.MARKETING}/segmento/previa`, "POST", {
    filtro,
  })) as {
    total: number;
    muestra: { email: string; cliente: string; contacto: string | null }[];
  };

export interface DestinatarioDeCampana {
  id: number;
  email: string;
  name: string | null;
  empresa: string | null;
  estado: string;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  reenviado_at: string | null;
  /** Se dio de baja DESDE esta campaña (deserción voluntaria). */
  baja: boolean;
}

export interface KpisDeCampana {
  enviados: number;
  entregados: number;
  tasa_entrega: number;
  aperturas: number;
  tasa_apertura: number;
  clics: number;
  tasa_clics: number;
  ctor: number;
  rebotes: number;
  tasa_rebote: number;
  reenviados: number;
  bajas: number;
  tasa_baja: number;
}

export const detalleDeCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/detalle`,
    "GET",
  )) as {
    campana: CampanaMarketing;
    kpis: KpisDeCampana;
    destinatarios: DestinatarioDeCampana[];
  };

export const htmlDeCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/html`,
    "GET",
  )) as { html: string; asunto: string };

export const resultadosDeCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/resultados`,
    "GET",
  )) as {
    enviados: number;
    abiertos: number;
    clicks: number;
    rebotes: number;
    reenviados: number;
  };

export const sinAbrirDeCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/sin-abrir`,
    "GET",
  )) as { sin_abrir: number };

export const reenviarCampana = async (id: number, asunto: string) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/reenviar`,
    "POST",
    { asunto },
  )) as { reenviados: number };

export const contactosDeAudienciaImportada = async (nombre: string) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/audiencias/importada?nombre=${encodeURIComponent(nombre)}`,
    "GET",
  )) as {
    email: string;
    nombre: string | null;
    empresa: string | null;
    baja: boolean;
  }[];

export const crearAudienciaMarketing = async (dto: {
  nombre: string;
  filtro: FiltroSegmento;
}) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/audiencias`,
    "POST",
    dto,
  )) as AudienciaGuardada;

export const eliminarAudienciaMarketing = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/audiencias/${String(id)}`,
    "DELETE",
  )) as { ok: boolean };

export const getAudienciasMarketing = async () =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/audiencias`,
    "GET",
  )) as AudienciasMarketing;

export const importarContactosMarketing = async (dto: {
  audiencia: string;
  contactos: { email: string; name?: string; empresa?: string }[];
}) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/contactos/importar`,
    "POST",
    dto,
  )) as {
    importados: number;
    duplicados_en_archivo: number;
    invalidos: string[];
  };

export const getCampanasMarketing = async () =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas`,
    "GET",
  )) as CampanaMarketing[];

export interface AudienciaElegida {
  audiencia_tipo: "clientes" | "importada" | "segmento";
  audiencia_id?: number;
  audiencia_ref?: string;
  tipos_cliente?: string[];
  filtro?: FiltroSegmento;
}

export const crearCampanaMarketing = async (dto: {
  nombre: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  preencabezado?: string;
  /** Selección múltiple (27-08): la unión, deduplicada por correo. */
  audiencias: AudienciaElegida[];
}) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas`,
    "POST",
    dto,
  )) as CampanaMarketing;

export const editarCampanaMarketing = async (
  id: number,
  dto: { asunto: string; titulo: string; cuerpo: string; preencabezado?: string },
) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}`,
    "PATCH",
    dto,
  )) as CampanaMarketing;

export const destinatariosDeCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/destinatarios`,
    "GET",
  )) as { destinatarios: number };

export const enviarPruebaCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/prueba`,
    "POST",
    {},
  )) as { enviada_a: string };

export const enviarCampana = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/enviar`,
    "POST",
    {},
  )) as { enviados: number; fallidos: number };
