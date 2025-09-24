import { API_ROUTES } from "../constants/api.routes";
import { supabase } from "../lib/supabase";
import { CompaniesResponse } from "../types/companies.types";
import { QuotationStatsResponse } from "../types/superAdmin.types";
import { apiRequest } from "./api";

/**
 * Get all companies from the database
 * @returns Promise<CompaniesResponse> - Array of companies or error message
 */
export const getAllCompanies = async (): Promise<CompaniesResponse> => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return {
        data: null,
        error: error.message,
      };
    }

    return {
      data: data || [],
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

/**
 * Get a specific company by ID
 * @param companyId - The ID of the company to fetch
 * @returns Promise<CompaniesResponse> - Company data or error message
 */
export const getCompanyById = async (
  companyId: number,
): Promise<CompaniesResponse> => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (error) {
      return {
        data: null,
        error: error.message,
      };
    }

    return {
      data: data ? [data] : [],
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

/**
 * Create a new company
 * @param name - The name of the company
 * @returns Promise<CompaniesResponse> - Created company data or error message
 */
export const createCompany = async (
  name: string,
): Promise<CompaniesResponse> => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .insert([{ name }])
      .select()
      .single();

    if (error) {
      return {
        data: null,
        error: error.message,
      };
    }

    return {
      data: data ? [data] : [],
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
};

/**
 * Update an existing company
 * @param companyId - The ID of the company to update
 * @param name - The new name for the company
 * @returns Promise<CompaniesResponse> - Updated company data or error message
 */
export const updateCompany = async (
  companyId: number,
  name: string,
): Promise<CompaniesResponse> => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .update({ name })
      .eq("id", companyId)
      .select()
      .single();

    if (error) {
      return {
        data: null,
        error: error.message,
      };
    }

    return {
      data: data ? [data] : [],
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
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
      // return { data: null, error: error.message };
    }
  };
