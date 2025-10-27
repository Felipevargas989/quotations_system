import { useLocation, useNavigate } from "react-router-dom";
import { FileText, MessageSquare } from "lucide-react";

export default function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const basePath = "/customer-satisfaction-survey";

  const navigationItems = [
    {
      name: "Plantilla",
      path: `${basePath}/template`,
      icon: FileText,
    },
    {
      name: "Respuestas",
      path: `${basePath}/answers`,
      icon: MessageSquare,
    },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-6 py-4">
        <nav className="flex space-x-8">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={`
                  flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    active
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
