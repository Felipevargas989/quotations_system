import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { Shield, Lock } from "lucide-react";
import { Derecho, UserRole, tieneDerecho } from "../constants/permissions";
import MejoraTuPlan from "./MejoraTuPlan";
import PageSkeleton from "./PageSkeleton";

interface PermissionGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  // Derecho del plan (14-09-2026, paso 3.2): la pantalla existe solo si
  // la empresa lo tiene; si no, la pantalla de "mejora tu plan" en vez de
  // la página. Es ayuda visual: el motor niega igual con el mismo derecho.
  derecho?: Derecho;
  fallback?: React.ReactNode;
}

export default function PermissionGuard({
  children,
  allowedRoles,
  derecho,
  fallback,
}: PermissionGuardProps) {
  const { user, userRole, loading, roleLoading, company } = useAuth();

  // Show loading while checking permissions. OJO: incluye la ventana en
  // que la sesión ya está pero el rol aún viene en camino — antes esa
  // ventana mostraba un FALSO "Permisos Insuficientes" (bug 21-07-2026).
  if (loading || roleLoading) {
    // Misma textura que toda espera del sistema (PageSkeleton, 28-07).
    return <PageSkeleton />;
  }

  // Show access denied if no user
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <Lock className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Acceso Denegado
            </h1>
            <p className="text-gray-600 mb-6">
              Debes iniciar sesión para acceder a esta página.
            </p>
            <button
              onClick={() => (window.location.href = "/login")}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Ir al Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check if user has one of the allowed roles
  const hasPermission = userRole && allowedRoles.includes(userRole);

  if (!hasPermission) {
    // Use custom fallback if provided
    if (fallback) {
      return <>{fallback}</>;
    }

    // Default access denied UI
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
                <Shield className="h-8 w-8 text-yellow-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Permisos Insuficientes
            </h1>
            <p className="text-gray-600 mb-4">
              No tienes permisos para acceder a esta página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // El plan de la empresa no incluye esta función (paso 3.2, 14-09-2026).
  if (!tieneDerecho(company, derecho)) {
    return <MejoraTuPlan derecho={derecho!} />;
  }

  // User has permission, render children
  return <>{children}</>;
}
