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
) => {
  const response = await apiRequest(`${API_ROUTES.COMPANIES}`, "PATCH", {
    name,
    logo_url,
    colors,
    notifications,
  });
  return { data: response };
};
