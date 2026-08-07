// Bitácora comercial (migración 59, "el descreme, no el CRM"): el hilo
// de notas de seguimiento por cotización y el mapa que alimenta el
// semáforo de la lista.
import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export type FollowupTipo =
  | "llamada"
  | "correo"
  | "reunion"
  | "whatsapp"
  | "otro";

export interface Followup {
  id: number;
  created_at: string;
  updated_at?: string | null;
  quotation_id: string;
  author_user_id?: string | null;
  author_name?: string | null;
  note: string;
  tipo?: FollowupTipo | null;
  next_contact_date?: string | null;
  // Cuándo se dio por cumplido ese próximo contacto (migración 65).
  // Con fecha vencida y esto en null, el compromiso está PENDIENTE: es
  // lo que enciende el aviso ámbar en el tablero de Post-Venta.
  next_contact_done_at?: string | null;
}

// Última gestión por cotización, para pintar el semáforo sin pedir
// cada hilo completo.
export type FollowupsMap = Record<
  string,
  {
    last_at: string;
    next_contact_date: string | null;
    next_contact_done_at: string | null;
  }
>;

export const getFollowupsMap = async (): Promise<FollowupsMap> => {
  const data = await apiRequest(API_ROUTES.FOLLOWUPS_MAP, "GET");
  return (data || {}) as FollowupsMap;
};

export const getFollowupsByQuotation = async (
  quotationId: string,
): Promise<Followup[]> => {
  const data = await apiRequest(
    `${API_ROUTES.FOLLOWUPS_BY_QUOTATION}/${quotationId}`,
    "GET",
  );
  return (data || []) as Followup[];
};

export const createFollowup = async (payload: {
  quotation_id: string;
  note: string;
  tipo?: FollowupTipo;
  next_contact_date?: string;
}): Promise<Followup> => {
  const data = await apiRequest(API_ROUTES.FOLLOWUPS, "POST", payload);
  return data as Followup;
};

export const updateFollowup = async (
  id: number,
  payload: {
    note?: string;
    tipo?: FollowupTipo;
    next_contact_date?: string;
    // Instante ISO para dar el pendiente por cumplido; null lo devuelve
    // a pendiente. Nunca borra next_contact_date.
    next_contact_done_at?: string | null;
  },
): Promise<Followup> => {
  const data = await apiRequest(
    `${API_ROUTES.FOLLOWUPS}/${id}`,
    "PATCH",
    payload,
  );
  return data as Followup;
};

export const deleteFollowup = async (id: number): Promise<void> => {
  await apiRequest(`${API_ROUTES.FOLLOWUPS}/${id}`, "DELETE");
};
