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
  // Contacto principal del cliente (uno por cliente; espejo en
  // clients.contact_person, sincronizado por la aplicación)
  is_primary: boolean;
  created_at: string;
}

export const getClientContacts = async (
  clientId: string,
): Promise<ClientContact[]> => {
  const { data, error } = await supabase
    .from("client_contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
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
  is_primary?: boolean;
}) => {
  const { data, error } = await supabase
    .from("client_contacts")
    .insert(fields)
    .select()
    .single();
  return { data: data as ClientContact | null, error };
};

export const updateClientContact = async (
  id: number,
  fields: Partial<Pick<ClientContact, "name" | "email" | "phone">>,
) => {
  const { error } = await supabase
    .from("client_contacts")
    .update(fields)
    .eq("id", id);
  return { error };
};

export const deleteClientContact = async (id: number) => {
  const { error } = await supabase
    .from("client_contacts")
    .delete()
    .eq("id", id);
  return { error };
};

// Marca el principal (uno por cliente): limpia el anterior y fija el nuevo.
export const setPrimaryContact = async (
  clientId: string,
  contactId: number,
) => {
  await supabase
    .from("client_contacts")
    .update({ is_primary: false })
    .eq("client_id", clientId)
    .eq("is_primary", true);
  const { error } = await supabase
    .from("client_contacts")
    .update({ is_primary: true })
    .eq("id", contactId);
  return { error };
};
