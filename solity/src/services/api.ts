// Create Axios instance calling the API REST
import axios from "axios";
import { supabase } from "../lib/supabase";

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
    return Promise.reject(error);
  },
);

// function to make a request to the API REST
export const apiRequest = async (url: string, method: string, data: any) => {
  const response = await api.request({
    url,
    method,
    data,
  });
  return response.data;
};
