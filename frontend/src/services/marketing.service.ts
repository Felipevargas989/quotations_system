import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export interface AudienciasMarketing {
  importadas: { audiencia: string; contactos: number }[];
  tipos: { tipo: string; total: number; conCorreo: number }[];
}

export interface CampanaMarketing {
  id: number;
  nombre: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  boton_texto: string | null;
  boton_url: string | null;
  audiencia_tipo: "clientes" | "importada";
  audiencia_ref: string | null;
  tipos_cliente: string[] | null;
  estado: "borrador" | "enviada";
  prueba_enviada_at: string | null;
  enviada_at: string | null;
  total_destinatarios: number | null;
  created_at: string;
}

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
  audiencia_tipo: "clientes" | "importada";
  audiencia_ref?: string;
  tipos_cliente?: string[];
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
