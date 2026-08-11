import type { User as SupabaseUser } from '@supabase/supabase-js';

// Barras mensuales (05-08, pedido de Felipe): el gráfico diario era
// ilegible. El balde diario (QuotationDayStats) se jubiló con él.
export interface QuotationMonthStats {
  mes: string; // Formato: YYYY-MM
  cantidad: number;
  monto: number;
}

export interface CompanyMonthlyStats {
  company_id: number;
  company_name: string;
  // SIEMPRE los 6 meses de la ventana (5 atrás + el en curso), con
  // huecos en 0 — sin meses fantasma faltantes.
  monthly: QuotationMonthStats[];
  // Significado HISTÓRICO conservado: últimos 30 días (los usan el
  // encabezado y las tarjetas "Totales por Empresa" tal cual).
  total_quotations: number;
  total_amount: number;
}

export interface UserLastSignInStats
  extends Pick<SupabaseUser, 'id' | 'created_at'> {
  email: string | null;
  last_sign_in_at: string | null;
  phone?: string | null;
}

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
  companies: CompanyMonthlyStats[];
  // La serie diaria agregada se jubiló junto con la línea "Total
  // (Todas las empresas)" del gráfico: con barras agrupadas era ruido.
  total_quotations_all_companies: number;
  total_amount_all_companies: number;
  user_sign_in_stats: UserSignInStats;
}
