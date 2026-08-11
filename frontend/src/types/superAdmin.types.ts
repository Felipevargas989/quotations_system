import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface QuotationDayStats {
  date: string;
  count: number;
  total_amount: number;
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
    stats: QuotationDayStats[];
    total_quotations: number;
    total_amount: number;
  }[];
  total_quotations: QuotationDayStats[]; // Aggregated totals by day
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
