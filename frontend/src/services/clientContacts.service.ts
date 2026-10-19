import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// Contactos por cliente — versión mínima (adelanto de la Etapa 4).
// MUDANZA #7 (28-07): por el backend (/client-contacts), con la empresa
// SIEMPRE de la sesión (la versión directa editaba por id sin verificar
// de quién era el contacto).

export interface ClientContact {
  id: number;
  company_id: number;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
}

export const getClientContacts = async (
  clientId: string,
): Promise<ClientContact[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.CLIENT_CONTACTS,
      "GET",
      undefined,
      { clientId },
    );
    return (data || []) as ClientContact[];
  } catch {
    return [];
  }
};

export const createClientContact = async (fields: {
  company_id: number;
  client_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
}) => {
  try {
    const { company_id: _omitido, ...datos } = fields;
    const data = await apiRequest(API_ROUTES.CLIENT_CONTACTS, "POST", datos);
    return { data: data as ClientContact | null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const updateClientContact = async (
  id: number,
  fields: Partial<Pick<ClientContact, "name" | "email" | "phone">>,
) => {
  try {
    await apiRequest(`${API_ROUTES.CLIENT_CONTACTS}/${id}`, "PATCH", fields);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteClientContact = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.CLIENT_CONTACTS}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Marca el principal (uno por cliente): limpia el anterior y fija el nuevo.
export const setPrimaryContact = async (
  clientId: string,
  contactId: number,
) => {
  try {
    await apiRequest(`${API_ROUTES.CLIENT_CONTACTS}/${contactId}/primary`, "POST", {
      client_id: clientId,
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};
