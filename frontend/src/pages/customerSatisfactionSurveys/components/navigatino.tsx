import { NavLink } from "react-router-dom";
import { FileText, BarChart3 } from "lucide-react";

interface NavigationProps {
  readonly basePath: string;
}

export default function Navigation({ basePath }: NavigationProps) {
  const navItems = [
    {
      path: `${basePath}/template`,
      label: "Plantilla",
      icon: FileText,
    },
    {
      path: `${basePath}/answers`,
      label: "Respuestas",
      icon: BarChart3,
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Encuestas de Satisfacción
        </h2>
        <nav className="flex space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
