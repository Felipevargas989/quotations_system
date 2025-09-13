export interface Company {
  id: number;
  name: string;
  created_at: string;
}

export interface CompaniesResponse {
  data: Company[] | null;
  error: string | null;
}
