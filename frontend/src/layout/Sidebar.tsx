import { Link } from "react-router-dom";
import {
  FileText,
  DollarSign,
  Home,
  Users,
  ClipboardList,
  Settings,
  Calendar,
  BarChart,
  X,
  MessageCircle,
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
    if (!userRole) return true; // Mientras carga, mostrar todo por defecto
    return canAccessSection(userRole, section as any);
  };

  const navigationItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Home,
      section: "dashboard",
    },
    {
      name: "Requerimientos",
      href: "/requests",
      icon: ClipboardList,
      section: "requests",
    },
    {
      name: "Cotizaciones",
      href: "/quotations",
      icon: FileText,
      section: "quotations",
    },
    {
      name: "Clientes",
      href: "/clients",
      icon: Users,
      section: "clients",
    },
    {
      name: "Pagos",
      href: "/payments",
      icon: DollarSign,
      section: "payments",
    },
    {
      name: "Servicios",
      href: "/services",
      icon: Settings,
      section: "services",
    },
    {
      name: "Calendario",
      href: "/calendar",
      icon: Calendar,
      section: "calendar",
    },
    {
      name: "Analytics",
      href: "/analytics",
      icon: BarChart,
      section: "analytics",
    },
    {
      name: "Encuestas de Satisfacción",
      href: "/customer-satisfaction-survey",
      icon: MessageCircle,
      section: "customer_satisfaction_survey",
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
              <img
                src="/images/logo.png"
                alt="Valle del Sol Quillón"
                className="h-7 w-22"
              />
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
