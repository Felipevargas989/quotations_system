import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import {
  CreateUser,
  SignupDto,
  UpdateUser,
  UserWithCompany,
} from "../types/users.types";
import type { Apariencia } from "../utils/personajes";

// El personaje y el color de cada uno (migración 167, 27-10-2026). La
// lista la ve cualquier cargo; el cambio toca solo a quien está
// conectado. Los errores suben a quien llama (React Query y el toast).
export const getApariencias = async (): Promise<Apariencia[]> => {
  const data = await apiRequest(API_ROUTES.USERS_APARIENCIAS, "GET");
  return Array.isArray(data) ? (data as Apariencia[]) : [];
};

export const updateApariencia = async (cambios: {
  personaje: string | null;
  color: string | null;
}): Promise<Apariencia> =>
  apiRequest(API_ROUTES.USERS_APARIENCIA, "PATCH", cambios);

// TODO: mange the error better
export const getUser = async (
  userId: string,
): Promise<{ data: UserWithCompany | null; error: Error | null }> => {
  try {
    const response = await apiRequest(`${API_ROUTES.USERS}/${userId}`, "GET");
    return { data: response.data, error: response.error };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getUsers = async () => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}`, "GET");
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const createUser = async (user: CreateUser) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}`, "POST", user);
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const updateUser = async (id: string, user: UpdateUser) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}/${id}`, "PATCH", user);
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const deleteUser = async (id: string) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}/${id}`, "DELETE");
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const updatePassword = async (passwordData: { newPassword: string }) => {
  try {
    const { data, error } = await apiRequest(
      `${API_ROUTES.USERS_PASSWORD}`,
      "PATCH",
      passwordData,
    );
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

export const signup = async (signupDto: SignupDto) => {
  try {
    const data = await apiRequest(
      `${API_ROUTES.USERS_SIGNUP}`,
      "POST",
      signupDto,
    );
    return { data };
  } catch (error) {
    // RED DE SEGURIDAD (migración 116, mismo molde que la 110): el motor
    // rechaza de plano los campos que no conoce. Si esta web llegara a
    // producción antes que el motor que entiende `origen_detalle`, se
    // caería el alta entera. Perder el origen cuesta infinitamente menos
    // que perder al cliente: se reintenta sin la marca.
    if (signupDto.origen_detalle) {
      const sinOrigen = { ...signupDto };
      delete sinOrigen.origen_detalle;
      try {
        const data = await apiRequest(
          `${API_ROUTES.USERS_SIGNUP}`,
          "POST",
          sinOrigen,
        );
        return { data };
      } catch (errorDelReintento) {
        return { data: null, error: errorDelReintento };
      }
    }
    return { data: null, error };
  }
};
