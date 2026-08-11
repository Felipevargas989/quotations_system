import type { User as SupabaseUser } from "@supabase/supabase-js";

// Barras mensuales (05-08): el balde diario se jubiló con el gráfico
// de líneas. Espejo de api-rest/src/super-admin/dto/quotation-stats.dto.
export interface QuotationMonthStats {
  mes: string; // 'YYYY-MM'
  cantidad: number;
  monto: number;
}

export type UserLastSignInStats = Pick<
  SupabaseUser,
  "id" | "email" | "last_sign_in_at" | "created_at" | "phone"
>;

export interface UserSignInStats {
  period_start: string;
  period_end: string;
  total_users: number;
  total_signed_in_in_period: number;
  total_never_signed_in: number;
  users: UserLastSignInStats[];
}

export interface QuotationStatsResponse {
  period: string; // e.g., "2024-01" for January 2024
  companies: {
    company_id: number;
    company_name: string;
    // SIEMPRE los 6 meses de la ventana, huecos en 0.
    monthly: QuotationMonthStats[];
    // Significado histórico conservado: últimos 30 días (encabezado y
    // tarjetas "Totales por Empresa").
    total_quotations: number;
    total_amount: number;
  }[];
  total_quotations_all_companies: number;
  total_amount_all_companies: number;
  user_sign_in_stats: UserSignInStats;
}

// ---- Torre de Control (tanda 1, 05-08): espejo del backend
// (api-rest/src/super-admin/dto/torre.dto.ts). ----
export interface TorreUsuario {
  email: string;
  nombre: string;
  empresa: string;
  rol: string;
  ultimo_inicio_sesion: string | null;
  creado: string | null;
}

export interface TorreTarjetas {
  empresas_total: number;
  empresas_mes: number;
  usuarios_total: number;
  usuarios_mes: number;
  leads_total: number;
  leads_mes: number;
}

export interface TorreResponse {
  usuarios: TorreUsuario[];
  tarjetas: TorreTarjetas;
}
