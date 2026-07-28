import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LogOut,
  User,
  ChevronDown,
  Cog,
  Building,
  Calendar,
  AlertCircle,
  Sparkles,
  MessageCircle,
  Menu,
} from "lucide-react";
import { canAccessSection } from "../constants/permissions";
import FloatingWhatsAppButton from "./FloatingWhatsAppButton";
import Sidebar from "./Sidebar";
import PageSkeleton from "../components/PageSkeleton";

// ¿Estamos en el LABORATORIO? (la base espejo, no producción). El
// letrero evita para siempre confundir ambientes: acá se puede romper
// todo; en producción no. (28-07: Felipe entró al lab sin querer.)
const ES_LABORATORIO = String(
  import.meta.env.VITE_SUPABASE_URL || "",
).includes("uonjtbyoxawxvhuikbgx");

export default function Layout() {
  const { userName, user, userRole, signOut, loading, company } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    navigate("/plans");
  };

  const handleSalesClick = () => {
    window.open(
      "https://api.whatsapp.com/send/?phone=%2B56940589151&text&type=phone_number&app_absent=0&message=Hola, quiero hablar con ventas",
    );
  };

  if (loading) {
    // Misma textura que toda espera del sistema (PageSkeleton, 28-07).
    return <PageSkeleton />;
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {ES_LABORATORIO && (
        <div className="bg-amber-400 text-amber-950 text-center text-xs font-bold py-1 tracking-wide">
          🧪 LABORATORIO — copia de prueba: lo que hagas aquí NO afecta el
          sistema real
        </div>
      )}
    
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <nav className="bg-white shadow-sm border-b">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              {/* Hamburger menu button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                <Menu size={24} />
              </button>

              {/* User menu */}
              <div className="flex items-center">
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <User size={16} />
                    <span
                      className="hidden sm:block text-left leading-tight"
                      title={user.email}
                    >
                      <span className="block text-sm font-medium">
                        {userName || user.email}
                      </span>
                      {userRole && (
                        <span className="block text-[11px] text-gray-400 capitalize">
                          {userRole}
                        </span>
                      )}
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
        {company && company.is_premium === false && (
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
                      Te enseñamos cómo funciona Eventia y te resolvemos
                      cualquier posible duda
                    </p>
                  </a>
                  <span className="hidden sm:inline text-white text-sm">|</span>
                  <button
                    onClick={handleSalesClick}
                    className="flex flex-col items-center gap-2 text-white hover:scale-105 transition-transform duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <MessageCircle size={18} className="flex-shrink-0" />
                      <span className="text-sm font-semibold underline">
                        Hablar con ventas
                      </span>
                    </div>
                    <p className="text-xs text-blue-100 text-center max-w-md">
                      Contacta directamente con nuestro equipo de ventas
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* Floating WhatsApp Button */}
      <FloatingWhatsAppButton />
    </div>
    </>
  );
}
