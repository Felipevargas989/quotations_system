import { supabase } from "../lib/supabase";
import {
  ManagementResource,
  Supplier,
  Supply,
} from "../types/logistics.types";

// Catálogos del módulo Logística. Acceso directo a Supabase (mismo patrón que
// refunds/event_documents); si luego se decide pasar por la API, este archivo
// es el único punto a cambiar.

// ---------- Proveedores ----------
export const getSuppliers = async (companyId: number): Promise<Supplier[]> => {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando proveedores", error);
    return [];
  }
  return (data || []) as Supplier[];
};

export const createSupplier = async (fields: {
  company_id: number;
  name: string;
  phone?: string | null;
  notes?: string | null;
}) => {
  const { error } = await supabase.from("suppliers").insert(fields);
  return { error };
};

export const updateSupplier = async (
  id: number,
  fields: Partial<Pick<Supplier, "name" | "phone" | "notes" | "is_active">>,
) => {
  const { error } = await supabase
    .from("suppliers")
    .update(fields)
    .eq("id", id);
  return { error };
};

// ---------- Insumos ----------
export const getSupplies = async (companyId: number): Promise<Supply[]> => {
  const { data, error } = await supabase
    .from("supplies")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando insumos", error);
    return [];
  }
  return (data || []) as Supply[];
};

export const createSupply = async (fields: {
  company_id: number;
  name: string;
  unit_family: Supply["unit_family"];
  price: number;
  supplier_id?: number | null;
}) => {
  const { error } = await supabase.from("supplies").insert(fields);
  return { error };
};

export const updateSupply = async (
  id: number,
  fields: Partial<
    Pick<Supply, "name" | "unit_family" | "price" | "supplier_id" | "is_active">
  >,
) => {
  const { error } = await supabase.from("supplies").update(fields).eq("id", id);
  return { error };
};

// ---------- Recursos de gestión ----------
export const getManagementResources = async (
  companyId: number,
): Promise<ManagementResource[]> => {
  const { data, error } = await supabase
    .from("management_resources")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando recursos", error);
    return [];
  }
  return (data || []) as ManagementResource[];
};

export const createManagementResource = async (fields: {
  company_id: number;
  name: string;
  type: ManagementResource["type"];
}) => {
  const { error } = await supabase.from("management_resources").insert(fields);
  return { error };
};

export const updateManagementResource = async (
  id: number,
  fields: Partial<
    Pick<ManagementResource, "name" | "type" | "last_price" | "is_active">
  >,
) => {
  const { error } = await supabase
    .from("management_resources")
    .update(fields)
    .eq("id", id);
  return { error };
};
