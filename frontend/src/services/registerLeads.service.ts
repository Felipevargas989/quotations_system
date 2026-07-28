import { API_ROUTES } from "../constants/api.routes";
import { LeadData, RegisterLeadResponse } from "../types/leads.types";
import { apiRequest } from "./api";

// Mudanza #1 de "una sola puerta" (28-07): antes este servicio escribía
// DIRECTO a la tabla leads con la llave anónima y después hacía una
// segunda llamada para avisar. Ahora es UNA llamada al backend, que
// valida, guarda con la llave de servicio y avisa — todo junto.
export const registerLead = async (
  leadData: LeadData,
): Promise<RegisterLeadResponse> => {
  try {
    const data = await apiRequest(
      API_ROUTES.SUPER_ADMIN_LEAD,
      "POST",
      leadData,
    );
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al registrar el lead",
    };
  }
};
