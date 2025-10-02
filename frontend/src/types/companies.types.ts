export interface Company {
  id: number;
  name: string;
  created_at: string;
  logo_url?: string;
  colors?: {
    primary: string;
    secondary: string;
  };
}

export interface CompaniesResponse {
  data: Company[] | null;
  error: string | null;
}
