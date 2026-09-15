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
import Sidebar from "./Sidebar";
import PageSkeleton from "../components/PageSkeleton";

// ¿Estamos en el LABORATORIO? (la base espejo, no producción). El
// letrero evita para siempre confundir ambientes: acá se puede romper
// todo; en producción no. (28-07: Felipe entró al lab sin querer.)
const ES_LABORATORIO = String(import.meta.env.VITE_SUPABASE_URL || "").includes(
  "uonjtbyoxawxvhuikbgx",
);

export default function Layout() {
  const { userName, user, userRole, signOut, loading, company } = useAuth();

  // Cuántos días le quedan de prueba (paso 3.2, 14-09-2026). El día del
  // vencimiento cuenta como cero: esa mañana el reloj la bloquea.
  const diasDePrueba = (() => {
    if (!company?.prueba_vence) return null;
    const faltan = new Date(company.prueba_vence).getTime() - Date.now();
    return Math.max(0, Math.ceil(faltan / (24 * 60 * 60 * 1000)));
  })();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, navigate, loading]);

  const canAccess = (section: string): boolean => {
    // Mientras el rol viene en camino NO se muestra nada (12-08). El
    // "mostrar todo por defecto" de antes le hacía ver a recepción, por
    // un parpadeo, Dashboard / Post-Venta / Catálogo / Logística; un
    // clic en esa ventana la dejaba en "Permisos Insuficientes". Y si la
    // consulta del rol falla, el menú se queda vacío en vez de mentir.
    if (!userRole) return false;
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
                            onMouseEnter={() => {
                              // Precalentado por cursor (12-08): ver Sidebar.
                              import("../pages/UserManagementPage.tsx").catch(
                                () => {},
                              );
                            }}
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
                            onMouseEnter={() => {
                              import(
                                "../pages/configuration/ConfigurationPage"
                              ).catch(() => {});
                            }}
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
                            onMouseEnter={() => {
                              import(
                                "../pages/configuration/companyConfiguration/CompanyConfiguration.tsx"
                              ).catch(() => {});
                            }}
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
          {/* SE LE ACABÓ LA PRUEBA Y NO CONTRATÓ (paso 3.2, 14-09-2026).
              El motor ya le cierra todo salvo su perfil, Configuración y
              Planes; acá se le dice por qué, en vez de dejarlo chocando
              con avisos sueltos en cada pantalla. Lo importante del
              texto: sus datos siguen ahí. Nadie borra nada al bloquear. */}
          {company && company.estado_plan === "bloqueado" && (
            <div className="bg-red-600">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
                  <AlertCircle className="h-5 w-5 text-white flex-shrink-0" />
                  <p className="text-white text-sm font-medium">
                    Tu prueba gratis terminó. Elige un plan para volver a
                    entrar: tus cotizaciones y tus clientes están guardados.
                  </p>
                  <button
                    onClick={handleUpgradeClick}
                    className="rounded-lg bg-white px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Ver los planes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* EL BANNER DE LA PRUEBA (paso 3.2, 14-09-2026). Antes miraba
              `is_premium`, que nadie vencía nunca: una empresa quedaba
              "en prueba" para siempre. Ahora mira el estado real del plan
              y dice cuántos días quedan, porque a los 7 el reloj de las
              11:00 la deja bloqueada. `is_premium` sigue en la base y se
              retira cuando ya nadie lo lea. */}
          {company && company.estado_plan === "prueba" && (
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 border-b border-blue-700">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col items-center justify-center py-3 gap-2">
                  {/* First Row - Free Trial Text */}
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-5 w-5 text-white flex-shrink-0" />
                    <p className="text-white text-sm font-medium">
                      {diasDePrueba === null
                        ? "Estás en el período de prueba gratuito de 7 días."
                        : diasDePrueba > 0
                          ? `Te ${diasDePrueba === 1 ? "queda 1 día" : `quedan ${diasDePrueba} días`} de prueba gratis.`
                          : "Tu prueba gratis termina hoy."}
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
                    <span className="hidden sm:inline text-white text-sm">
                      |
                    </span>
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
                    <span className="hidden sm:inline text-white text-sm">
                      |
                    </span>
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
      </div>
    </>
  );
}
