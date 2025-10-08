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
  Calendar,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { canAccessSection } from "../constants/permissions";

export default function Layout() {
  const { user, userRole, signOut, loading, company } = useAuth();
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

  const handleUpgradeClick = () => {
    window.open(
      "https://api.whatsapp.com/send/?phone=%2B56940589151&text&type=phone_number&app_absent=0&message=Hola, quiero contratar el plan",
    );
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
                {canAccess("calendar") && (
                  <Link
                    to="/calendar"
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Calendar size={16} />
                    <span>Calendario</span>
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
                    {user.email?.substring(0, 5)}
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

      {/* Free Trial Banner */}
      {company && !company.is_premium && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 border-b border-blue-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center justify-center py-3 gap-2">
              {/* First Row - Free Trial Text */}
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-white flex-shrink-0" />
                <p className="text-white text-sm font-medium">
                  Estás en el período de prueba gratuito de 7 días.
                </p>
              </div>

              {/* Second Row - Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                <button
                  onClick={handleUpgradeClick}
                  className="flex flex-col items-center gap-2 text-white hover:scale-105 transition-transform duration-200"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="flex-shrink-0" />
                    <span className="text-sm font-semibold underline">
                      Contrata el plan profesional de Eventia
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 text-center max-w-md">
                    Accede a todas las funcionalidades sin límites
                  </p>
                </button>
                <span className="hidden sm:inline text-white text-sm">|</span>
                <a
                  href="https://calendly.com/hola-eventi-app/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 text-white hover:scale-105 transition-transform duration-200"
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="flex-shrink-0" />
                    <span className="text-sm font-semibold underline">
                      ¿Quieres una demo gratuita? Agéndala aquí
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 text-center max-w-md">
                    Te enseñamos cómo funciona Eventia y te resolvemos cualquier
                    posible duda
                  </p>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
