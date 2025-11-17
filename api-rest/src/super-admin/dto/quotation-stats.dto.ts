import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface QuotationDayStats {
  date: string; // Format: YYYY-MM-DD
  count: number;
  total_amount: number;
}

export type UserLastSignInStats = Pick<
  SupabaseUser,
  'id' | 'email' | 'last_sign_in_at' | 'created_at' | 'phone'
> & {
  email: string | null;
  last_sign_in_at: string | null;
  phone?: string | null;
};

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
  total_quotations: QuotationDayStats[];
  total_quotations_all_companies: number;
  total_amount_all_companies: number;
  user_sign_in_stats: UserSignInStats;
}
