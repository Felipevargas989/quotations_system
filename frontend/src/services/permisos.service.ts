import { API_ROUTES } from "../constants/api.routes";
import { Permiso, UserRole } from "../constants/permissions";
import { apiRequest } from "./api";

// LOS PERMISOS POR CARGO (doc 22, 05-11-2026): la pantalla de Mi empresa →
// Usuarios → Permisos por cargo. El catálogo, los nombres y lo de fábrica
// los manda el motor: la pantalla pinta lo que recibe.

export interface CeldaDePermiso {
  prendido: boolean;
  fabrica: boolean;
}

export interface FilaDePermisos {
  clave: Permiso;
  /** comercial, operacion, facturacion o administracion. */
  area: string;
  nombre: string;
  /** 'fijo': Mi empresa y Usuarios. 'plan': el plan no lo trae. */
  candado: "fijo" | "plan" | null;
  celdas: Record<UserRole, CeldaDePermiso>;
}

/** Un tipo de cliente de la empresa con sus cuatro celdas (doc 22 §9). */
export interface FilaDeTipo {
  id: number;
  nombre: string;
  celdas: Record<UserRole, CeldaDePermiso>;
}

export interface UltimoCambio {
  quien: string | null;
  cuando: string;
  accion: "cambio" | "fabrica";
  cargo: UserRole | null;
  permiso: string | null;
  prendido: boolean | null;
}

export interface PantallaDePermisos {
  cargos: UserRole[];
  permisos: FilaDePermisos[];
  /** Los tipos de cliente de la empresa, en su orden. Un motor sin el
   *  §9 no los manda. */
  tipos?: FilaDeTipo[];
  deFabrica: boolean;
  ultimoCambio: UltimoCambio | null;
}

export const getPermisos = async (): Promise<PantallaDePermisos> =>
  (await apiRequest(API_ROUTES.PERMISOS, "GET")) as PantallaDePermisos;

export const cambiarPermiso = async (cambio: {
  cargo: UserRole;
  permiso: Permiso;
  prendido: boolean;
}): Promise<PantallaDePermisos> =>
  (await apiRequest(API_ROUTES.PERMISOS, "PUT", cambio)) as PantallaDePermisos;

export const cambiarTipo = async (cambio: {
  cargo: UserRole;
  tipo: number;
  prendido: boolean;
}): Promise<PantallaDePermisos> =>
  (await apiRequest(
    API_ROUTES.PERMISOS_TIPOS,
    "PUT",
    cambio,
  )) as PantallaDePermisos;

export const volverAFabrica = async (): Promise<PantallaDePermisos> =>
  (await apiRequest(API_ROUTES.PERMISOS_FABRICA, "POST")) as PantallaDePermisos;
