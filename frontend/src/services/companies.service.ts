import { API_ROUTES } from "../constants/api.routes";
import { Company } from "../types/companies.types";
import { apiRequest } from "./api";

export const getCompany = async (companyId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.COMPANIES}/${companyId}`,
    "GET",
  );
  return { data: response.data as Company, error: response.error };
};

// Mudanza #7 (28-07): la cara PÚBLICA de la empresa (nombre, logo,
// colores, moneda) — para las páginas sin sesión (cotización pública y
// encuesta). La ficha completa quedó solo con sesión.
export const getCompanyPublic = async (companyId: string | number) => {
  const response = await apiRequest(
    `${API_ROUTES.COMPANIES}/public/${companyId}`,
    "GET",
  );
  return { data: response.data as Company, error: response.error };
};

export const updateCompany = async (
  name: Company["name"],
  logo_url?: Company["logo_url"],
  colors?: Company["colors"],
  notifications?: Company["notifications"],
  extras?: {
    tagline?: Company["tagline"];
    high_value_threshold?: Company["high_value_threshold"];
    bank_details?: Company["bank_details"];
  },
) => {
  const response = await apiRequest(`${API_ROUTES.COMPANIES}`, "PATCH", {
    name,
    logo_url,
    colors,
    notifications,
    ...(extras?.tagline !== undefined ? { tagline: extras.tagline } : {}),
    ...(extras?.bank_details !== undefined
      ? { bank_details: extras.bank_details }
      : {}),
  });
  return { data: response };
};
