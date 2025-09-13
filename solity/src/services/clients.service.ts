import { supabase } from "../lib/supabase";
import { Client, ClientFormData } from "../types/clients.types";

export const getClients = async (
  companyId: string,
  sortBy: string = "name",
) => {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order(sortBy, { ascending: true })
    .eq("company_id", companyId);

  return { data, error };
};

export const createClient = async (client: ClientFormData) => {
  const { data: newClient, error } = await supabase
    .from("clients")
    .insert([client])
    .select()
    .single();

  return { data: newClient as Client, error };
};
