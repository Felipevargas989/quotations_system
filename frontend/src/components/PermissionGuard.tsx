import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { Shield, Lock } from "lucide-react";
import { ModuloPropio, UserRole, tieneModulo } from "../constants/permissions";
import PageSkeleton from "./PageSkeleton";

interface PermissionGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  // Módulo propio (14-09-2026): la pantalla existe solo si la empresa
  // tiene el módulo encendido; si no, un aviso en vez de la página.
  modulo?: ModuloPropio;
  fallback?: React.ReactNode;
}

export default function PermissionGuard({
  children,
  allowedRoles,
  modulo,
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

  // Módulo propio apagado para esta empresa (14-09-2026).
  if (!tieneModulo(company, modulo)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Lock className="h-8 w-8 text-gray-500" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Módulo no disponible
            </h1>
            <p className="text-gray-600 mb-4">
              Este módulo no está incluido para tu empresa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // User has permission, render children
  return <>{children}</>;
}
