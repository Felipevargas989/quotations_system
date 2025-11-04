import { EmailStructure } from "./notifications";

export interface Company {
  id: number;
  name: string;
  created_at: string;
  logo_url?: string;
  colors?: {
    primary: string;
    secondary: string;
  };
  is_premium: boolean;
  notifications?: {
    emails?: {
      [key in EmailStructure]?: boolean;
    };
  };
  currency: string;
}

export interface CompaniesResponse {
  data: Company[] | null;
  error: string | null;
}
