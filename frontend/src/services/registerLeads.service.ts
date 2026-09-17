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
    // RED DE SEGURIDAD (migración 116): si el motor aún no entiende
    // `origen_detalle`, se reintenta sin la marca antes de rendirse.
    if (leadData.origen_detalle) {
      const sinOrigen = { ...leadData };
      delete sinOrigen.origen_detalle;
      try {
        const data = await apiRequest(
          API_ROUTES.SUPER_ADMIN_LEAD,
          "POST",
          sinOrigen,
        );
        return { success: true, data };
      } catch {
        /* se informa el error original, abajo */
      }
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al registrar el lead",
    };
  }
};
