import { API_ROUTES } from "../constants/api.routes";
import { CompaniesResponse } from "../types/companies.types";
import {
  QuotationStatsResponse,
  TorreResponse,
} from "../types/superAdmin.types";
import { apiRequest } from "./api";
import { getCompanyPublic } from "./companies.service";

// MUDANZA #7 (28-07): el área super-admin por el backend, que además
// ahora EXIGE estar en la allowlist SUPER_ADMIN_EMAILS (antes cualquier
// sesión podía llamar estas funciones con herramientas técnicas).

export const getAllCompanies = async (): Promise<CompaniesResponse> => {
  try {
    const data = await apiRequest(API_ROUTES.SUPER_ADMIN_COMPANIES, "GET");
    return { data: data || [], error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

// La cara pública de una empresa (nombre, logo, colores) — la usa la
// encuesta de satisfacción, que corre sin sesión.
export const getCompanyById = async (
  companyId: number,
): Promise<CompaniesResponse> => {
  try {
    const { data, error } = await getCompanyPublic(companyId);
    if (error) return { data: null, error: String(error) };
    return { data: data ? [data] : [], error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

export const createCompany = async (
  name: string,
): Promise<CompaniesResponse> => {
  try {
    const data = await apiRequest(API_ROUTES.SUPER_ADMIN_COMPANIES, "POST", {
      name,
    });
    return { data: data ? [data] : [], error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

export const updateCompany = async (
  companyId: number,
  name: string,
): Promise<CompaniesResponse> => {
  try {
    const data = await apiRequest(
      `${API_ROUTES.SUPER_ADMIN_COMPANIES}/${companyId}`,
      "PATCH",
      { name },
    );
    return { data: data ? [data] : [], error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

// Torre de Control (tanda 1, 05-08): tarjetas + "quién ha entrado".
// Lanza el error tal cual: useQuery lo transforma en estados honestos.
export const getTorre = async (): Promise<TorreResponse> => {
  const data = await apiRequest(API_ROUTES.SUPER_ADMIN_TORRE, "GET");
  return data as TorreResponse;
};

export const getStatsLastMonth =
  async (): Promise<QuotationStatsResponse | null> => {
    try {
      const response = await apiRequest(
        `${API_ROUTES.SUPER_ADMIN_STATS_LAST_MONTH}`,
        "GET",
      );
      return response || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  };
