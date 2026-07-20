import { supabase } from "../lib/supabase";

// Contactos por cliente — versión mínima (adelanto de la Etapa 4).
// La cotización guarda el NOMBRE como foto (contact_name); esta tabla es
// solo la lista de donde se elige. Acceso directo a Supabase, mismo
// patrón que logistics/sections.

export interface ClientContact {
  id: number;
  company_id: number;
  client_id: string;
  name: string;
  // Opcionales: hay contactos que se comunican solo por teléfono o solo
  // por correo — exigir más que el nombre afectaría la operación.
  email: string | null;
  phone: string | null;
  created_at: string;
}

export const getClientContacts = async (
  clientId: string,
): Promise<ClientContact[]> => {
  const { data, error } = await supabase
    .from("client_contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("name");
  if (error) {
    console.error("Error cargando contactos del cliente", error);
    return [];
  }
  return (data || []) as ClientContact[];
};

export const createClientContact = async (fields: {
  company_id: number;
  client_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}) => {
  const { data, error } = await supabase
    .from("client_contacts")
    .insert(fields)
    .select()
    .single();
  return { data: data as ClientContact | null, error };
};
