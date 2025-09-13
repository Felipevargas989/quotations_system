import { supabase } from "../lib/supabase";
import { LeadData, RegisterLeadResponse } from "../types/leads.types";

export const registerLead = async (
  leadData: LeadData,
): Promise<RegisterLeadResponse> => {
  try {
    const { data, error } = await supabase
      .from("leads")
      .insert([
        {
          nombre: leadData.nombre,
          telefono: leadData.telefono,
          email: leadData.email,
          nombre_empresa: leadData.nombre_empresa,
          personas_empresa: leadData.personas_empresa,
          ventas_anuales: leadData.ventas_anuales,
        },
      ])
      .select();

    if (error) {
      console.error("Error registering lead:", error);
      return {
        success: false,
        error: error.message || "Error al registrar el lead",
      };
    }

    console.log("Lead registered successfully:", data);
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Unexpected error registering lead:", error);
    return {
      success: false,
      error: "Error inesperado al registrar el lead",
    };
  }
};
