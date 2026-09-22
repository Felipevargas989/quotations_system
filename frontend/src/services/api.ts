// Create Axios instance calling the API REST
import axios from "axios";
import { supabase } from "../lib/supabase";
import { toast } from "../components/toast/Toast";

export const api = axios.create({
  baseURL: import.meta.env.VITE_EVENTIA_API_REST,
  withCredentials: true, // Important for CORS with credentials
  headers: {
    "Content-Type": "application/json",
  },
});

// TODO: move to supabase service
// Function to get JWT token from Supabase
const getSupabaseToken = async (): Promise<string | null> => {
  try {
    // Get the current session from Supabase
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      return null;
    }

    return session?.access_token || null;
  } catch (error) {
    return null;
  }
};

// Add request interceptor to handle auth tokens
api.interceptors.request.use(
  async (config) => {
    // Get the JWT token from Supabase
    const token = await getSupabaseToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Add response interceptor to handle errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the session
        const {
          data: { session },
          error: refreshError,
        } = await supabase.auth.refreshSession();

        if (refreshError) {
          // Redirect to login or handle auth failure
          return Promise.reject(error);
        }

        if (session?.access_token) {
          // Update the authorization header with the new token
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
          // Retry the original request
          return api(originalRequest);
        }
      } catch (refreshError) {}
    }

    // EL PLAN NO INCLUYE ESTO (paso 3.2, 14-09-2026). El motor responde
    // 403 con un cuerpo fijo que trae el mensaje ya escrito en español y
    // el plan al que hay que subirse. Se muestra ese mensaje en vez del
    // error rojo genérico, que no le dice nada a nadie.
    //
    // Es solo el aviso: quien decide es el motor. La app esconde lo que
    // no corresponde para no ofrecerlo, pero si algo se escapa, acá el
    // cliente se entera de por qué y de cómo arreglarlo.
    // LA BASE NO RESPONDE (22-09-2026, seguro 2). El motor ahora dice la
    // verdad con un 503 cuando Supabase no contesta a tiempo; antes eso
    // llegaba como 401 y la aplicación parecía "sesión vencida".
    if (error.response?.status === 503) {
      toast.error(
        "El sistema no puede leer la base de datos en este momento. Intenta de nuevo en un minuto.",
      );
    }

    const cuerpo = error.response?.data as
      | { codigo?: string; mensaje?: string }
      | undefined;
    if (
      error.response?.status === 403 &&
      cuerpo?.codigo &&
      ["SIN_DERECHO", "SIN_CUPO", "PLAN_BLOQUEADO"].includes(cuerpo.codigo)
    ) {
      toast.warn(cuerpo.mensaje || "Esto no está incluido en tu plan.");
    }

    return Promise.reject(error);
  },
);

// function to make a request to the API REST
export const apiRequest = async (
  url: string,
  method: string,
  data?: any,
  params?: any,
) => {
  try {
    const response = await api.request({
      url,
      method,
      data,
      params,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};
