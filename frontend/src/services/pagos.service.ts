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
  pago_proveedor: string | null;
  plan_programado: string | null;
}> => {
  return (await apiRequest(API_ROUTES.PAGOS_ESTADO, "GET")) as {
    plan: string | null;
    estado_plan: string | null;
    pagado_hasta: string | null;
    pago_proveedor: string | null;
    plan_programado: string | null;
  };
};

// EL CAMBIO DE PLAN (18-09-2026): primero se cotiza (qué costaría y
// desde cuándo rige) y recién con la confirmación se cambia.
export type CotizacionDeCambio = {
  modo: "subir" | "bajar" | "igual";
  plan_actual: PlanContratable;
  plan_nuevo: PlanContratable;
  precio_actual: number;
  precio_nuevo: number;
  dias_restantes: number;
  proporcional: number;
  rige_desde: string | null;
};

export const cotizarCambio = async (
  plan: PlanContratable,
): Promise<CotizacionDeCambio> => {
  return (await apiRequest(API_ROUTES.PAGOS_CAMBIAR_PLAN_COTIZAR, "POST", {
    plan,
  })) as CotizacionDeCambio;
};

export const cambiarPlan = async (
  plan: PlanContratable,
  correoMercadoPago?: string,
): Promise<
  | { modo: "subir"; enlace: string | null; proporcional: number }
  | { modo: "bajar"; rige_desde: string | null }
> => {
  return (await apiRequest(API_ROUTES.PAGOS_CAMBIAR_PLAN, "POST", {
    plan,
    ...(correoMercadoPago ? { correo_mercado_pago: correoMercadoPago } : {}),
  })) as
    | { modo: "subir"; enlace: string | null; proporcional: number }
    | { modo: "bajar"; rige_desde: string | null };
};
