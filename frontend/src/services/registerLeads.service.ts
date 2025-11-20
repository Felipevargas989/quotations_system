import { API_ROUTES } from "../constants/api.routes";
import { supabase } from "../lib/supabase";
import { LeadData, RegisterLeadResponse } from "../types/leads.types";
import { apiRequest } from "./api";

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

    try {
      await apiRequest(`${API_ROUTES.SUPER_ADMIN_NEW_LEAD}`, "POST", {
        content: "Nuevo lead desde el formulario de la pagina",
      });
    } catch (notifyError) {
      console.error(
        "Error notifying super-admins about the new lead:",
        notifyError,
      );
    }

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
