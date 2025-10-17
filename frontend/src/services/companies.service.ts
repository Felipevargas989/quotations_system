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

export const updateCompany = async (
  name: Company["name"],
  logo_url?: Company["logo_url"],
  colors?: Company["colors"],
) => {
  const response = await apiRequest(`${API_ROUTES.COMPANIES}`, "PATCH", {
    name,
    logo_url,
    colors,
  });
  return { data: response };
};
