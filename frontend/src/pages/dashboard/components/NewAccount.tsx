import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Users,
  FileText,
  Plus,
  ArrowRight,
  Building2,
} from "lucide-react";
import { findAllServices } from "../../../services/services.service";
import { getClients } from "../../../services/clients.service";
import { getQuotations } from "../../../services/quotations.service";
import {
  QuotationRequestType,
  QuotationStatus,
} from "../../../types/quotations.types";
import { useAuth } from "../../../contexts/AuthContext";

interface EmptyState {
  hasServices: boolean;
  hasClients: boolean;
  hasQuotations: boolean;
  hasCompanyLogo: boolean;
}

export default function NewAccount() {
  const { company } = useAuth();
  const [emptyStates, setEmptyStates] = useState<EmptyState>({
    hasServices: true,
    hasClients: true,
    hasQuotations: true,
    hasCompanyLogo: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkEmptyStates();
  }, [company?.logo_url]);

  const checkEmptyStates = async () => {
    try {
      setLoading(true);

      // Check services
      const servicesResponse = await findAllServices();
      const hasServices =
        servicesResponse.variableServices?.length > 0 ||
        servicesResponse.fixedServices?.length > 0;

      // Check clients
      const clientsResponse = await getClients();
      const hasClients = clientsResponse.data?.length > 0;

      // Check quotations (both requests and quotations)
      const requestsResponse = await getQuotations(
        QuotationRequestType.REQUERIMIENTO,
        [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
          QuotationStatus.ACEPTADA,
        ],
      );
      const hasQuotations = requestsResponse.data?.length > 0;
      setEmptyStates({
        hasServices: !hasServices,
        hasClients: !hasClients,
        hasQuotations: !hasQuotations,
        hasCompanyLogo: !company?.logo_url,
      });
    } catch (error) {
      console.error("Error checking empty states:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If all resources exist, don't show the component
  if (
    !emptyStates.hasServices &&
    !emptyStates.hasClients &&
    !emptyStates.hasQuotations &&
    !emptyStates.hasCompanyLogo
  ) {
    return null;
  }

  const emptyStateItems = [
    {
      id: "logo",
      title: "Configura el logo de tu empresa",
      description:
        "Agrega el logo de tu empresa para personalizar tus cotizaciones",
      icon: Building2,
      link: "/company-configuration",
      linkText: "Agregar Logo",
      show: emptyStates.hasCompanyLogo,
    },
    {
      id: "services",
      title: "Aún no hay servicios agregados",
      description:
        "Crea tu primer servicio para comenzar a construir cotizaciones",
      icon: Package,
      link: "/services",
      linkText: "Agregar Servicios",
      show: emptyStates.hasServices,
    },
    {
      id: "clients",
      title: "Aún no hay clientes creados",
      description:
        "Agrega tu primer cliente para comenzar a gestionar relaciones",
      icon: Users,
      link: "/clients",
      linkText: "Agregar Clientes",
      show: emptyStates.hasClients,
    },
    {
      id: "quotations",
      title: "Aún no hay cotizaciones creadas",
      description: "Crea tu primera cotización o requerimiento para comenzar",
      icon: FileText,
      link: "/requests",
      linkText: "Crear Cotización",
      show: emptyStates.hasQuotations,
    },
  ].filter((item) => item.show);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-6 mb-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          ¡Bienvenido a tu Sistema de Cotizaciones! 🎉
        </h2>
        <p className="text-gray-600">
          Comencemos configurando los elementos básicos
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {emptyStateItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <div
              key={item.id}
              className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-4 mx-auto">
                <IconComponent className="h-6 w-6 text-blue-600" />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                {item.title}
              </h3>

              <p className="text-gray-600 text-center mb-4 text-sm">
                {item.description}
              </p>

              <Link
                to={item.link}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>{item.linkText}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500">
          Una vez que hayas agregado estos recursos, verás los datos de tu
          dashboard aquí
        </p>
      </div>
    </div>
  );
}
