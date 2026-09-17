import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// EL COBRO (16-09-2026, sprint B del paso 4+5). Dos llamadas:
// pedir el enlace de pago propio de la empresa, y preguntar en qué
// quedó el plan (la pantalla "estamos confirmando" pregunta esto).

export type PlanContratable = "cotiza" | "gestiona" | "crece";

export const pedirEnlaceDePago = async (
  plan: PlanContratable,
  correoMercadoPago?: string,
): Promise<{ enlace: string }> => {
  return (await apiRequest(API_ROUTES.PAGOS_SUSCRIBIR, "POST", {
    plan,
    ...(correoMercadoPago ? { correo_mercado_pago: correoMercadoPago } : {}),
  })) as { enlace: string };
};

export const estadoDelPlan = async (): Promise<{
  plan: string | null;
  estado_plan: string | null;
  pagado_hasta: string | null;
}> => {
  return (await apiRequest(API_ROUTES.PAGOS_ESTADO, "GET")) as {
    plan: string | null;
    estado_plan: string | null;
    pagado_hasta: string | null;
  };
};
