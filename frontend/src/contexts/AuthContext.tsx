import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  // Nombre completo del perfil (para la cabecera: nombre + rol, no el
  // correo cortado)
  const [userName, setUserName] = useState<string | null>(null);
  const [company, setCompany] = useState<Omit<Company, "created_at"> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async () => {
    if (!user) {
      setUserRole(null);
      setCompany(null);
      return;
    }

    try {
      const { data, error } = await getUser(user.id);

      if (error) {
      } else if (data) {
        setUserRole(data.role);
        setUserName((data as { full_name?: string }).full_name || null);
        setCompany(data.companies);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
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

  // Load user profile whenever user changes
  useEffect(() => {
    loadUserProfile();
  }, [user]);

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
