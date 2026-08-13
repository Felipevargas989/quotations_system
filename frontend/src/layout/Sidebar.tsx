import { Link } from "react-router-dom";
import {
  FileText,
  Home,
  Users,
  ClipboardList,
  LibraryBig,
  Calendar,
  X,
  MessageCircle,
  Receipt,
  Package,
} from "lucide-react";
import { canAccessSection } from "../constants/permissions";
import { useAuth } from "../contexts/AuthContext";

interface SidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { userRole } = useAuth();

  const canAccess = (section: string): boolean => {
    // Mientras el rol viene en camino NO se muestra nada (12-08). El
    // "mostrar todo por defecto" de antes le hacía ver a recepción, por
    // un parpadeo, Dashboard / Post-Venta / Catálogo / Logística; un
    // clic en esa ventana la dejaba en "Permisos Insuficientes". Y si la
    // consulta del rol falla, el menú se queda vacío en vez de mentir.
    if (!userRole) return false;
    return canAccessSection(userRole, section as any);
  };

  // PRECALENTADO POR CURSOR (12-08, hallazgo #2 de velocidad): al posar
  // el mouse sobre un botón, su pantalla se empieza a descargar; para
  // cuando llega el clic (~0,3 s después) ya está lista. Es el mismo
  // archivo que App.tsx carga perezoso — Vite no duplica nada, y si la
  // descarga falla no pasa nada: la pantalla baja normal al entrar.
  const navigationItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Home,
      section: "dashboard",
      precargar: () => import("../pages/dashboard/DashboardPage.tsx"),
    },
    {
      name: "Requerimientos",
      href: "/requests",
      icon: ClipboardList,
      section: "requests",
      precargar: () => import("../pages/RequestsPage"),
    },
    {
      name: "Cotizaciones",
      href: "/quotations",
      icon: FileText,
      section: "quotations",
      precargar: () => import("../pages/quotations/QuotationsPage"),
    },
    {
      name: "Clientes",
      href: "/clients",
      icon: Users,
      section: "clients",
      precargar: () => import("../pages/ClientsPage"),
    },
    {
      name: "Post‑Venta",
      href: "/post-venta",
      icon: Receipt,
      section: "payments",
      precargar: () => import("../pages/postventa/PostVentaPage"),
    },
    {
      // 28-07 (pedido de Felipe): "Catálogo" describe mejor lo que hay
      // adentro, y el libro le queda mejor que la tuerca. La dirección
      // interna (/services) NO cambia para no romper enlaces guardados.
      name: "Catálogo",
      href: "/services",
      icon: LibraryBig,
      section: "services",
      precargar: () => import("../pages/services"),
    },
    {
      name: "Logística",
      href: "/logistica",
      icon: Package,
      section: "logistics",
      precargar: () => import("../pages/logistica/LogisticaPage"),
    },
    {
      name: "Calendario",
      href: "/calendar",
      icon: Calendar,
      section: "calendar",
      precargar: () => import("../pages/calendar/Calendar.tsx"),
    },
    {
      name: "Encuestas de Satisfacción",
      href: "/customer-satisfaction-survey",
      icon: MessageCircle,
      section: "customer_satisfaction_survey",
      precargar: () => import("../pages/customerSatisfactionSurveys/index.tsx"),
    },
  ];

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <button
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
            }
          }}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        fixed top-0 left-0 z-50 w-64 bg-white shadow-lg h-screen
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2">
              {/* 28-07 (pedido de Felipe): el MISMO logo de la landing
                  nueva, para coherencia visual en todo el producto. */}
              <svg
                width="34"
                height="34"
                viewBox="0 0 64 64"
                fill="none"
                aria-label="Eventia"
              >
                <path d="M8 11 H41 L32 21 H8 Z" fill="#1597E5" />
                <path d="M8 25 H35 L26 35 H8 Z" fill="#1597E5" />
                <path
                  d="M11 41 L22 53 L49 24"
                  stroke="#0B1F33"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-xl font-extrabold tracking-tight text-gray-900">
                Eventia
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="space-y-2">
            {navigationItems.map((item) => {
              if (!canAccess(item.section)) return null;

              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={onClose}
                  onMouseEnter={() => {
                    item.precargar().catch(() => {});
                  }}
                  onFocus={() => {
                    item.precargar().catch(() => {});
                  }}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-200"
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
