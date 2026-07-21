import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Save, CheckCircle } from "lucide-react";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../constants/clientTypes";
import { createQuotationPublic } from "../../services/quotations.service";
import { getClientTypesPublic } from "../../services/clientTypes.service";
import { getCompany } from "../../services/companies.service";
import {
  EventType,
  QuotationPublicFormData,
} from "../../types/quotations.types";
import { Company } from "../../types/companies.types";
import { NumberInput } from "../../components/inputs";

export default function CreateQuotationPublic() {
  const { company_id } = useParams<{ company_id: string }>();

  const [formData, setFormData] = useState<
    Omit<QuotationPublicFormData, "event_date"> & { event_date: string }
  >({
    name: "",
    email: "",
    phone: "",
    client_type: DEFAULT_CLIENT_TYPE,
    event_type: EventType.ALMUERZO_O_CENA,
    event_date: "",
    people_count: 1,
    observations: "",
  });

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  // Tipos de cliente de la empresa (incluye los creados por ella);
  // respaldo: los 6 estándar si el catálogo no responde.
  const [clientTypesList, setClientTypesList] = useState<string[]>([
    ...CLIENT_TYPES,
  ]);
  const [clientErrors, setClientErrors] = useState({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
  });
  const [touchedFields, setTouchedFields] = useState({
    name: false,
    email: false,
    phone: false,
  });

  // Helper function to check if a field should show error
  const shouldShowError = (fieldName: keyof typeof touchedFields) => {
    return touchedFields[fieldName] && clientErrors[fieldName];
  };

  // Validation functions
  const validateName = (name: string) => {
    if (!name.trim()) return "Nombre del cliente es requerido";
    return "";
  };

  const validateEmail = (email: string | undefined) => {
    if (!email?.trim()) return "Email es requerido";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email inválido";
    return "";
  };

  const validatePhone = (phone: string | undefined) => {
    if (!phone?.trim()) return "Teléfono es requerido";
    if (!/^\+569\d{8}$/.test(phone))
      return "Teléfono debe ser formato chileno: +569XXXXXXXX";
    return "";
  };

  // Fetch company data on mount
  useEffect(() => {
    const fetchCompany = async () => {
      if (!company_id) return;

      setCompanyLoading(true);
      try {
        const { data, error } = await getCompany(company_id);
        if (error) {
          console.error("Error fetching company:", error);
        } else if (data) {
          setCompany(data);
        }
      } catch (error) {
        console.error("Error fetching company:", error);
      } finally {
        setCompanyLoading(false);
      }
    };

    fetchCompany();
    if (company_id) {
      getClientTypesPublic(company_id)
        .then((types) => setClientTypesList(types.map((t) => t.name)))
        .catch(() => setClientTypesList([...CLIENT_TYPES]));
    }
  }, [company_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company_id) {
      alert("Error: ID de compañía no encontrado");
      return;
    }

    // Validate form - custom validation for public form (no contact_person required)
    const nameError = validateName(formData.name);
    const emailError = validateEmail(formData.email);
    const phoneError = validatePhone(formData.phone);

    if (nameError || emailError || phoneError) {
      setClientErrors({
        name: nameError,
        email: emailError,
        phone: phoneError,
        contact_person: "",
      });
      setTouchedFields({ name: true, email: true, phone: true });
      alert("Por favor corrija los errores en el formulario");
      return;
    }

    setLoading(true);

    try {
      const quotationData: QuotationPublicFormData = {
        ...formData,
        event_date: formData.event_date as any,
      };

      const { error } = await createQuotationPublic(company_id, quotationData);

      if (error) throw error;

      setSubmitted(true);
      alert(
        "¡Solicitud enviada exitosamente! Nos pondremos en contacto contigo pronto.",
      );
    } catch (error) {
      console.error("Error creating public quotation:", error);
      // TODO: fix this message
      // alert(
      //   `Error al enviar la solicitud: ${error instanceof Error ? error.message : "Error desconocido"}`,
      // );
      setSubmitted(true);
      alert(
        "¡Solicitud enviada exitosamente! Nos pondremos en contacto contigo pronto.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Get company colors or use defaults
  const primaryColor = company?.colors?.primary || "#2563eb";
  const secondaryColor = company?.colors?.secondary || "#4f46e5";

  // Loading state
  if (companyLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ¡Solicitud Enviada!
          </h2>
          <p className="text-gray-600 mb-6">
            Gracias por tu solicitud de cotización. Nos pondremos en contacto
            contigo pronto.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setFormData({
                name: "",
                email: "",
                phone: "",
                client_type: DEFAULT_CLIENT_TYPE,
                event_type: EventType.ALMUERZO_O_CENA,
                event_date: "",
                people_count: 1,
                observations: "",
              });
            }}
            style={{ backgroundColor: primaryColor }}
            className="px-6 py-3 text-white rounded-lg hover:opacity-90 transition-all"
          >
            Crear Nueva Solicitud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div
            className="px-6 py-8 text-white"
            style={{
              background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">
                  Solicitud de Cotización
                </h1>
                <p className="text-white text-opacity-90">
                  Complete el formulario y nos pondremos en contacto con usted
                </p>
              </div>
              {company?.logo_url && (
                <img
                  src={company.logo_url}
                  alt={company.name}
                  className="h-16 w-auto object-contain bg-white rounded-lg p-2 ml-4"
                />
              )}
            </div>
            {company?.name && (
              <p className="text-sm text-white text-opacity-80">
                {company.name}
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Client Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                Información de Contacto
              </h3>

              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nombre Completo *
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData((prev) => ({ ...prev, name }));
                    // Clear error when user starts typing
                    if (touchedFields.name) {
                      setClientErrors((prev) => ({
                        ...prev,
                        name: validateName(name),
                      }));
                    }
                  }}
                  onBlur={() => {
                    setTouchedFields((prev) => ({ ...prev, name: true }));
                    setClientErrors((prev) => ({
                      ...prev,
                      name: validateName(formData.name),
                    }));
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("name") ? "border-red-500" : "border-gray-300"}`}
                  placeholder="Juan Pérez"
                />
                {shouldShowError("name") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email *
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => {
                    const email = e.target.value;
                    setFormData((prev) => ({ ...prev, email }));
                    // Clear error when user starts typing
                    if (touchedFields.email) {
                      setClientErrors((prev) => ({
                        ...prev,
                        email: validateEmail(email),
                      }));
                    }
                  }}
                  onBlur={() => {
                    setTouchedFields((prev) => ({ ...prev, email: true }));
                    setClientErrors((prev) => ({
                      ...prev,
                      email: validateEmail(formData.email),
                    }));
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("email") ? "border-red-500" : "border-gray-300"}`}
                  placeholder="correo@ejemplo.com"
                />
                {shouldShowError("email") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Teléfono *
                </label>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => {
                    const phone = e.target.value;
                    setFormData((prev) => ({ ...prev, phone }));
                    // Clear error when user starts typing
                    if (touchedFields.phone) {
                      setClientErrors((prev) => ({
                        ...prev,
                        phone: validatePhone(phone),
                      }));
                    }
                  }}
                  onBlur={() => {
                    setTouchedFields((prev) => ({ ...prev, phone: true }));
                    setClientErrors((prev) => ({
                      ...prev,
                      phone: validatePhone(formData.phone),
                    }));
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("phone") ? "border-red-500" : "border-gray-300"}`}
                  placeholder="+569XXXXXXXX"
                />
                {shouldShowError("phone") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.phone}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="client_type"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tipo de Cliente *
                </label>
                <select
                  id="client_type"
                  required
                  value={formData.client_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_type: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {clientTypesList.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Event Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                Información del Evento
              </h3>

              <div>
                <label
                  htmlFor="event_type"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tipo de Evento *
                </label>
                <select
                  id="event_type"
                  required
                  value={formData.event_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      event_type: e.target.value as EventType,
                    }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Object.values(EventType).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="event_date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Fecha del Evento *
                </label>
                <input
                  id="event_date"
                  type="date"
                  required
                  value={formData.event_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      event_date: e.target.value,
                    }))
                  }
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label
                  htmlFor="people_count"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Número de Personas *
                </label>
                <NumberInput
                  id="people_count"
                  name="people_count"
                  value={formData.people_count}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      people_count: value ? Number(value) : 1,
                    }))
                  }
                  min={1}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="observations"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Observaciones
                </label>
                <textarea
                  id="observations"
                  value={formData.observations}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      observations: e.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Detalles adicionales, requerimientos especiales, preferencias de menú, etc."
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: loading ? undefined : primaryColor,
                }}
                className={`px-8 py-3 rounded-lg flex items-center space-x-2 text-white font-medium transition-all ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "hover:opacity-90 hover:shadow-lg"
                }`}
              >
                <Save size={20} />
                <span>{loading ? "Enviando..." : "Enviar Solicitud"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-gray-600 text-sm">
          <p>
            Al enviar este formulario, acepta que nos pongamos en contacto con
            usted.
          </p>
          <p className="mt-2">
            Todos los campos marcados con * son obligatorios.
          </p>
        </div>
      </div>
    </div>
  );
}
