import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle, Send } from "lucide-react";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../constants/clientTypes";
import { createQuotationPublic } from "../../services/quotations.service";
import { getClientTypesPublic } from "../../services/clientTypes.service";
import { getCompanyPublic } from "../../services/companies.service";
import {
  EventType,
  QuotationPublicFormData,
} from "../../types/quotations.types";
import { Company } from "../../types/companies.types";
import { NumberInput } from "../../components/inputs";
import { normalizePhone } from "../../utils/phone";

// Formulario público de solicitud (rediseño 22-07, aprobado por Felipe):
// - Lenguaje visual de los documentos de la empresa (logo redondo, folio
//   en color de marca, secciones con línea) en vez del degradado genérico.
// - Teléfono chileno NORMALIZADO automáticamente ("9 1234 5678",
//   "912345678" y "+56912345678" son lo mismo) — la tarea es del sistema,
//   no del cliente. Desde el 26-07 esa normalización vive en utils/phone.ts
//   y la comparten los seis formularios; acá también entran los fijos.
// - Errores HONESTOS: si el envío falla, se dice y se ofrece reintentar
//   (antes mostraba éxito aunque fallara → leads perdidos en silencio).
// - Campo niños (audiencias del Cotizador 2.0). Cero popups nativos.

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
    children_count: 0,
    observations: "",
  });

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [clientTypesList, setClientTypesList] = useState<string[]>([
    ...CLIENT_TYPES,
  ]);
  const [clientErrors, setClientErrors] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [touchedFields, setTouchedFields] = useState({
    name: false,
    email: false,
    phone: false,
  });

  const shouldShowError = (fieldName: keyof typeof touchedFields) =>
    touchedFields[fieldName] && clientErrors[fieldName];

  // ---------- Validación ----------
  const validateName = (name: string) =>
    !name.trim() ? "Cuéntanos tu nombre" : "";

  const validateEmail = (email: string | undefined) => {
    if (!email?.trim()) return "Necesitamos tu correo para responderte";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Correo inválido";
    return "";
  };

  // La normalización vive en utils/phone.ts, junto con la del resto del
  // sistema (26-07-2026). Antes había una copia acá que solo entendía
  // celulares; ahora acepta también fijos, porque si alguien solo tiene fijo
  // no corresponde dejarlo afuera de pedir una cotización.
  const validatePhone = (phone: string | undefined) => {
    if (!phone?.trim()) return "Necesitamos un teléfono para contactarte";
    if (!/^\+56\d{9}$/.test(normalizePhone(phone)))
      return "Escribe un teléfono chileno de 9 dígitos (ej: 9 1234 5678)";
    return "";
  };

  useEffect(() => {
    const fetchCompany = async () => {
      if (!company_id) return;
      setCompanyLoading(true);
      try {
        const { data, error } = await getCompanyPublic(company_id);
        if (error) console.error("Error fetching company:", error);
        else if (data) setCompany(data);
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
    if (!company_id) return;

    const nameError = validateName(formData.name);
    const emailError = validateEmail(formData.email);
    const phoneError = validatePhone(formData.phone);

    if (nameError || emailError || phoneError) {
      setClientErrors({
        name: nameError,
        email: emailError,
        phone: phoneError,
      });
      setTouchedFields({ name: true, email: true, phone: true });
      return;
    }

    setLoading(true);
    setSubmitError(false);

    try {
      // El formulario pide ADULTOS y NIÑOS por separado (Felipe, 23-07);
      // en la base people_count sigue siendo el TOTAL (convención del
      // Cotizador 2.0: children_count es un subconjunto de people_count),
      // así que aquí se suma antes de enviar.
      const adults = Number(formData.people_count || 1);
      const kids = Number(formData.children_count || 0);
      const quotationData: QuotationPublicFormData = {
        ...formData,
        phone: normalizePhone(formData.phone || ""),
        people_count: adults + kids,
        children_count: kids,
        event_date: formData.event_date as any,
      };

      const { error } = await createQuotationPublic(company_id, quotationData);
      if (error) throw error;
      setSubmitted(true);
    } catch (error) {
      // HONESTIDAD ANTE TODO (bug histórico corregido el 22-07): si el
      // envío falla, se informa y se deja reintentar. Jamás fingir éxito.
      console.error("Error creating public quotation:", error);
      setSubmitError(true);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Marca de la empresa (mismo lenguaje de sus documentos) ----------
  const hexOk = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);
  const brandP = hexOk(company?.colors?.primary) || "#1e3a8a";
  const onBrandP = (() => {
    const n = parseInt(brandP.slice(1), 16);
    const lum =
      (0.299 * ((n >> 16) & 255) +
        0.587 * ((n >> 8) & 255) +
        0.114 * (n & 255)) /
      255;
    return lum > 0.6 ? "#111827" : "#fff";
  })();
  const initials = (company?.name || "E")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const inputCls = (hasError?: string | boolean) =>
    `w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
      hasError ? "border-red-500" : "border-gray-300"
    }`;

  const seccion = (titulo: string) => (
    <div className="flex items-center gap-2">
      <h3
        className="text-[11px] font-extrabold uppercase tracking-widest"
        style={{ color: brandP }}
      >
        {titulo}
      </h3>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  );

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-gray-400"></div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            ¡Solicitud enviada!
          </h2>
          <p className="text-gray-600 mb-6">
            Gracias por escribirnos. El equipo de{" "}
            {company?.name || "la empresa"} se pondrá en contacto contigo a la
            brevedad.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setSubmitError(false);
              setTouchedFields({ name: false, email: false, phone: false });
              setFormData({
                name: "",
                email: "",
                phone: "",
                client_type: DEFAULT_CLIENT_TYPE,
                event_type: EventType.ALMUERZO_O_CENA,
                event_date: "",
                people_count: 1,
                children_count: 0,
                observations: "",
              });
            }}
            style={{ backgroundColor: brandP, color: onBrandP }}
            className="px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all"
          >
            Enviar otra solicitud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Encabezado con el lenguaje de los documentos de la empresa */}
          <div
            className="px-6 sm:px-10 pt-8 pb-5"
            style={{ borderBottom: `3px solid ${brandP}` }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-[100px] h-[100px] rounded-full flex items-center justify-center font-extrabold text-3xl overflow-hidden shrink-0"
                  style={{ backgroundColor: brandP, color: onBrandP }}
                >
                  {company?.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt={company.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">
                    {company?.name || "Empresa"}
                  </h1>
                  <p className="text-xs text-gray-500">
                    Cuéntanos de tu evento y te preparamos una cotización
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-[11px] font-extrabold uppercase tracking-[2px]"
                  style={{ color: brandP }}
                >
                  Solicitud de Cotización
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-6">
            {seccion("Tus datos")}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nombre completo *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData((prev) => ({ ...prev, name }));
                    if (touchedFields.name)
                      setClientErrors((prev) => ({
                        ...prev,
                        name: validateName(name),
                      }));
                  }}
                  onBlur={() => {
                    setTouchedFields((prev) => ({ ...prev, name: true }));
                    setClientErrors((prev) => ({
                      ...prev,
                      name: validateName(formData.name),
                    }));
                  }}
                  className={inputCls(shouldShowError("name"))}
                  placeholder="Juanita Pérez"
                />
                {shouldShowError("name") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Correo *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      const email = e.target.value;
                      setFormData((prev) => ({ ...prev, email }));
                      if (touchedFields.email)
                        setClientErrors((prev) => ({
                          ...prev,
                          email: validateEmail(email),
                        }));
                    }}
                    onBlur={() => {
                      setTouchedFields((prev) => ({ ...prev, email: true }));
                      setClientErrors((prev) => ({
                        ...prev,
                        email: validateEmail(formData.email),
                      }));
                    }}
                    className={inputCls(shouldShowError("email"))}
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
                    value={formData.phone}
                    onChange={(e) => {
                      const phone = e.target.value;
                      setFormData((prev) => ({ ...prev, phone }));
                      if (touchedFields.phone)
                        setClientErrors((prev) => ({
                          ...prev,
                          phone: validatePhone(phone),
                        }));
                    }}
                    onBlur={() => {
                      // El sistema completa el +56 9 solo — sin exigirle
                      // formatos al cliente.
                      const norm = normalizePhone(formData.phone || "");
                      setFormData((prev) => ({ ...prev, phone: norm }));
                      setTouchedFields((prev) => ({ ...prev, phone: true }));
                      setClientErrors((prev) => ({
                        ...prev,
                        phone: validatePhone(norm),
                      }));
                    }}
                    className={inputCls(shouldShowError("phone"))}
                    placeholder="9 1234 5678"
                  />
                  {shouldShowError("phone") && (
                    <p className="text-red-500 text-sm mt-1">
                      {clientErrors.phone}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="client_type"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tipo de cliente *
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
                  className={inputCls(false)}
                >
                  {clientTypesList.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {seccion("Tu evento")}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="event_type"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Tipo de evento *
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
                    className={inputCls(false)}
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
                    Fecha del evento *
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
                    className={inputCls(false)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="people_count"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Adultos *
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
                    htmlFor="children_count"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Niños (menores de 12 años)
                  </label>
                  <NumberInput
                    id="children_count"
                    name="children_count"
                    value={formData.children_count || undefined}
                    onChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        children_count: value ? Number(value) : 0,
                      }))
                    }
                    min={0}
                    placeholder="0"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Se suman a los adultos. Nos ayuda a preparar el menú.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="observations"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Cuéntanos más
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
                  placeholder="Detalles del evento: lugar, horarios, preferencias de menú, si dura más de un día…"
                />
              </div>
            </div>

            {/* Error HONESTO con reintento (nunca fingir éxito) */}
            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle
                  size={18}
                  className="text-red-500 shrink-0 mt-0.5"
                />
                <div className="text-sm text-red-800">
                  <p className="font-bold">
                    Tu solicitud no se pudo enviar todavía.
                  </p>
                  <p className="mt-0.5">
                    Revisa tu conexión e inténtalo de nuevo con el botón —
                    tus datos siguen aquí, no se perdieron.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: loading ? undefined : brandP,
                  color: loading ? undefined : onBrandP,
                }}
                className={`px-8 py-3 rounded-lg flex items-center space-x-2 font-semibold transition-all ${
                  loading
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "hover:opacity-90 hover:shadow-lg"
                }`}
              >
                <Send size={18} />
                <span>
                  {loading
                    ? "Enviando…"
                    : submitError
                      ? "Reintentar envío"
                      : "Enviar solicitud"}
                </span>
              </button>
            </div>
          </form>
        </div>

        <div className="mt-5 text-center text-gray-500 text-xs">
          <p>
            Al enviar este formulario aceptas que{" "}
            {company?.name || "la empresa"} te contacte. Campos con * son
            obligatorios.
          </p>
        </div>
      </div>
    </div>
  );
}
