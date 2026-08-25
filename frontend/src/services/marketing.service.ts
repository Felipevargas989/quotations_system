import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export interface AudienciasMarketing {
  importadas: { audiencia: string; contactos: number }[];
  tipos: { tipo: string; total: number; conCorreo: number }[];
  tipos_evento: { tipo: string; n: number }[];
}

export interface CampanaMarketing {
  id: number;
  nombre: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  boton_texto: string | null;
  boton_url: string | null;
  audiencia_tipo: "clientes" | "importada" | "segmento";
  audiencia_ref: string | null;
  tipos_cliente: string[] | null;
  filtro: FiltroSegmento | null;
  estado: "borrador" | "enviada";
  prueba_enviada_at: string | null;
  enviada_at: string | null;
  total_destinatarios: number | null;
  created_at: string;
}

export interface FiltroSegmento {
  tipos_cliente?: string[];
  con_estados?: ("realizada" | "aceptada" | "rechazada" | "anulada")[];
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
  })) as { total: number; muestra: { email: string; name: string | null }[] };

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

export const reenviarCampana = async (id: number, asunto?: string) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas/${String(id)}/reenviar`,
    "POST",
    asunto ? { asunto } : {},
  )) as { reenviados: number };

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

export const crearCampanaMarketing = async (dto: {
  nombre: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  boton_texto?: string;
  boton_url?: string;
  audiencia_tipo: "clientes" | "importada" | "segmento";
  audiencia_ref?: string;
  tipos_cliente?: string[];
  filtro?: FiltroSegmento;
}) =>
  (await apiRequest(
    `${API_ROUTES.MARKETING}/campanas`,
    "POST",
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
