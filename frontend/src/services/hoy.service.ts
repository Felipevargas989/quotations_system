import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// ============ LA FILA "HOY" DEL DASHBOARD (Fase 5, 23-07) ============
// MUDANZA #7 (28-07): la cuenta la hace el backend (/analytics/hoy),
// con la misma lógica que vivía acá. Cuatro alertas accionables,
// independientes del filtro de período.

export interface HoyAlerts {
  porCobrar: { pendiente: number; vencido: number };
  proximos: { count: number; primera: string | null };
  requerimientos: { count: number; oldestDays: number };
  enviadas: { count: number; oldestDays: number };
}

const VACIO: HoyAlerts = {
  porCobrar: { pendiente: 0, vencido: 0 },
  proximos: { count: 0, primera: null },
  requerimientos: { count: 0, oldestDays: 0 },
  enviadas: { count: 0, oldestDays: 0 },
};

export const getHoyAlerts = async (_companyId: number): Promise<HoyAlerts> => {
  try {
    const data = await apiRequest(API_ROUTES.ANALYTICS_HOY, "GET");
    return (data || VACIO) as HoyAlerts;
  } catch {
    return VACIO;
  }
};
