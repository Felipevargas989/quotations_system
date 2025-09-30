import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  FileText,
  DollarSign,
  Home,
  LogOut,
  Users,
  ClipboardList,
  Settings,
  User,
  ChevronDown,
  Cog,
  Building,
} from "lucide-react";
import { canAccessSection } from "../constants/permissions";

export default function Layout() {
  const { user, userRole, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, navigate, loading]);

  const canAccess = (section: string): boolean => {
    if (!userRole) return true; // Mientras carga, mostrar todo por defecto

    return canAccessSection(userRole, section as any);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Error during sign out:", error);
      navigate("/login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <img
                    src="/images/logo.png"
                    alt="Valle del Sol Quillón"
                    className="h-18 w-32"
                  />
                  {/* <h1 className="text-xl font-bold text-gray-900">Eventia</h1> */}
                </div>
              </div>
              <div className="flex space-x-4">
                {canAccess("dashboard") && (
                  <Link
                    to="/dashboard"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Home size={16} />
                    <span>Dashboard</span>
                  </Link>
                )}
                {canAccess("requests") && (
                  <Link
                    to="/requests"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <ClipboardList size={16} />
                    <span>Requerimientos</span>
                  </Link>
                )}
                {canAccess("quotations") && (
                  <Link
                    to="/quotations"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <FileText size={16} />
                    <span>Cotizaciones</span>
                  </Link>
                )}
                {canAccess("clients") && (
                  <Link
                    to="/clients"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Users size={16} />
                    <span>Clientes</span>
                  </Link>
                )}
                {canAccess("payments") && (
                  <Link
                    to="/payments"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <DollarSign size={16} />
                    <span>Pagos</span>
                  </Link>
                )}

                {canAccess("services") && (
                  <Link
                    to="/services"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Settings size={16} />
                    <span>Servicios</span>
                  </Link>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                >
                  <User size={16} />
                  <span className="hidden sm:block" title={user.email}>
                    {user.email?.substring(0, 20)}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border">
                    <div className="px-4 py-2 text-sm text-gray-500 border-b">
                      {user.email}
                      {userRole && (
                        <div className="text-xs text-blue-600 font-medium mt-1">
                          Rol: {userRole}
                        </div>
                      )}
                    </div>
                    {canAccess("admin") && (
                      <Link
                        to="/admin/users"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <User size={16} />
                        <span>Gestión de Usuarios</span>
                      </Link>
                    )}
                    {canAccess("configuration") && (
                      <Link
                        to="/configuration"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Cog size={16} />
                        <span>Configuración</span>
                      </Link>
                    )}
                    {canAccess("company_configuration") && (
                      <Link
                        to="/company-configuration"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Building size={16} />
                        <span>Configuración de la Compañía</span>
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleSignOut();
                      }}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <LogOut size={16} />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
