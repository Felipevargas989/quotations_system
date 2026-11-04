import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// Las razones sociales de un cliente: a quién se le factura (migración 184,
// doc 19 §9.12). Un cliente puede tener varias, cada una con su RUT
// (Santo Tomás factura al CFT y al Instituto Profesional). La empresa sale
// SIEMPRE de la sesión, en el motor.

export interface RazonSocial {
  id: number;
  client_id: string;
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo_facturacion: string | null;
  referencias_exigidas: string[];
  origen: "manual" | "orden_de_compra";
  created_at: string;
}

export type DatosDeRazonSocial = Partial<
  Pick<
    RazonSocial,
    | "rut"
    | "razon_social"
    | "giro"
    | "direccion"
    | "comuna"
    | "ciudad"
    | "correo_facturacion"
    | "referencias_exigidas"
  >
>;

const ruta = (clientId: string) =>
  `${API_ROUTES.CLIENTS}/${clientId}/razones-sociales`;

export const getRazonesSociales = async (
  clientId: string,
): Promise<RazonSocial[]> =>
  ((await apiRequest(ruta(clientId), "GET")) || []) as RazonSocial[];

export const createRazonSocial = async (
  clientId: string,
  datos: DatosDeRazonSocial,
): Promise<RazonSocial> =>
  (await apiRequest(ruta(clientId), "POST", datos)) as RazonSocial;

export const updateRazonSocial = async (
  clientId: string,
  id: number,
  cambios: DatosDeRazonSocial,
): Promise<RazonSocial> =>
  (await apiRequest(
    `${ruta(clientId)}/${id}`,
    "PATCH",
    cambios,
  )) as RazonSocial;

export const deleteRazonSocial = async (clientId: string, id: number) =>
  apiRequest(`${ruta(clientId)}/${id}`, "DELETE");
