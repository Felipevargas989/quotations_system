import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase.ts";
import { UserRole } from "../constants/permissions";
import { getUser } from "../services/users.service.ts";
import { Company } from "../types/companies.types.ts";

interface AuthContextType {
  user: User | null;
  userRole: UserRole | null;
  userName: string | null;
  company: Omit<Company, "created_at"> | null;
  loading: boolean;
  /** true mientras el rol/perfil aún viene en camino (con usuario
   *  logeado). PermissionGuard muestra "Verificando permisos…" en vez
   *  del falso "Permisos Insuficientes". */
  roleLoading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error?: any; userRole?: string; companyId?: Company["id"] }>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<any>;
  loadUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Perfil guardado en el navegador (patrón "mostrar lo conocido y
// refrescar por detrás", Etapa 0 de React Query, 21-07-2026): al abrir
// la aplicación el rol aparece AL INSTANTE desde el último perfil
// conocido, y React Query lo revalida en silencio contra el servidor.
// La autoridad real vive en el backend (valida cada operación con el
// token); esto solo decide qué se muestra en pantalla.
const PROFILE_CACHE_KEY = (userId: string) => `eventia_profile_${userId}`;

interface ProfileData {
  role: UserRole;
  full_name?: string | null;
  companies?: Omit<Company, "created_at"> | null;
}

const readCachedProfile = (userId: string): ProfileData | undefined => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed?.role ? (parsed as ProfileData) : undefined;
  } catch {
    return undefined;
  }
};

const writeCachedProfile = (userId: string, profile: ProfileData) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify(profile));
  } catch {
    /* sin espacio o deshabilitado: el caché es un extra, no un requisito */
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Perfil (rol + nombre + empresa) vía React Query: parte del último
  // valor guardado (instantáneo), revalida siempre al montar, y ante
  // fallas de red reintenta solo antes de rendirse.
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ProfileData> => {
      const { data, error } = await getUser(user!.id);
      if (error || !data) throw error || new Error("Perfil no encontrado");
      const profile: ProfileData = {
        role: data.role,
        full_name: (data as { full_name?: string }).full_name || null,
        companies: data.companies || null,
      };
      writeCachedProfile(user!.id, profile);
      return profile;
    },
    initialData: user ? readCachedProfile(user.id) : undefined,
    // El valor guardado se considera antiguo: se muestra al tiro pero
    // SIEMPRE se revalida contra el servidor al partir.
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    retry: 3,
  });

  const userRole: UserRole | null = profileQuery.data?.role ?? null;
  const userName = profileQuery.data?.full_name ?? null;
  const company = profileQuery.data?.companies ?? null;
  const roleLoading = !!user && !profileQuery.data && profileQuery.isPending;

  const loadUserProfile = async () => {
    await profileQuery.refetch();
  };

  useEffect(() => {
    // Get initial session with better error handling
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          // Clear invalid refresh tokens
          if (
            error.message &&
            error.message.includes("Invalid Refresh Token")
          ) {
            await supabase.auth.signOut();
          }
        }
        setUser(session?.user ?? null);
      } catch (error) {
        // Clear invalid refresh tokens
        if (
          error instanceof Error &&
          error.message.includes("Invalid Refresh Token")
        ) {
          await supabase.auth.signOut();
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // (La carga del perfil la maneja React Query: reacciona sola al
  // cambio de usuario vía la queryKey, con caché y reintentos.)

  const signIn = async (email: string, password: string) => {
    try {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      // Check for refresh token errors
      if (
        result.error &&
        result.error.message &&
        result.error.message.includes("Invalid Refresh Token")
      ) {
        await supabase.auth.signOut();
      }

      // If sign in was successful, get the user's role and company_id
      if (result.data?.user && !result.error) {
        try {
          const { data: profileData } = await getUser(result.data.user.id);

          return {
            ...result,
            userRole: profileData?.role,
            companyId: profileData?.company_id,
          };
        } catch (profileError) {
          return result;
        }
      }

      return result;
    } catch (error) {
      // Clear invalid refresh tokens
      if (
        error instanceof Error &&
        error.message.includes("Invalid Refresh Token")
      ) {
        await supabase.auth.signOut();
      }
      return { error };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined,
        },
      });
      // Check for refresh token errors
      if (
        result.error &&
        result.error.message &&
        result.error.message.includes("Invalid Refresh Token")
      ) {
        await supabase.auth.signOut();
      }
      return result;
    } catch (error) {
      // Clear invalid refresh tokens
      if (
        error instanceof Error &&
        error.message.includes("Invalid Refresh Token")
      ) {
        await supabase.auth.signOut();
      }
      return { error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      // Al cerrar sesión se limpia el caché de consultas en memoria,
      // para que otra cuenta en el mismo navegador parta limpia.
      queryClient.clear();
    } catch (error) {
      console.error("Error in signOut:", error);
    }
  };

  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        return { error };
      }
      return { data, error: null };
    } catch (error) {
      return { error };
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    refreshSession,
    userRole,
    userName,
    company,
    roleLoading,
    loadUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
