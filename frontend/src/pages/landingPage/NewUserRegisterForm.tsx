import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User,
  Phone,
  Mail,
  Building,
  Users,
  DollarSign,
  ArrowRight,
  Coins,
  Lock,
} from "lucide-react";
import { registerLead } from "../../services/registerLeads.service";
import { LeadData } from "../../types/leads.types";
import { signup } from "../../services/users.service";
import { origenDelLead } from "../../lib/origenDelLead";
import { SignupDto } from "../../types/users.types";
import { useAuth } from "../../contexts/AuthContext";
import { humanizeApiError } from "../../utils/apiErrors";
import { CURRENCIES } from "../../constants/companies";
import SelectWithSearch from "../../components/selects/SelectWithSearch";

interface FormData {
  nombreContacto: string;
  telefonoContacto: string;
  emailContacto: string;
  nombreEmpresa: string;
  personasEmpresa: string;
  ventasAnuales: string;
  passwordCuenta: string;
  currency: string;
}

export default function NewUserRegisterForm() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    nombreContacto: "",
    telefonoContacto: "",
    emailContacto: "",
    nombreEmpresa: "",
    personasEmpresa: "",
    ventasAnuales: "",
    passwordCuenta: "",
    currency: "CLP",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Portero: los desplegables de la casa no bloquean el envío como
    // hacía el nativo con required — la puerta valida aquí.
    if (!formData.personasEmpresa || !formData.ventasAnuales) {
      setError("Completa los campos marcados con *");
      return;
    }
    if (formData.passwordCuenta.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // EL LEAD SE GUARDA IGUAL (16-09-2026): así Felipe ve también a
      // los que empezaron y no terminaron. Va primero y SIN bloquear —
      // que un tropiezo del registro de interesados jamás le impida a
      // alguien crear su cuenta.
      // DE DÓNDE LLEGÓ (migración 116, 18-09-2026): la huella capturada
      // al aterrizar viaja con el interesado Y con el alta. El motor
      // decide la etiqueta; si no hay huella, no se manda nada.
      const origen = origenDelLead();
      const leadData: LeadData = {
        nombre: formData.nombreContacto,
        telefono: formData.telefonoContacto,
        email: formData.emailContacto,
        nombre_empresa: formData.nombreEmpresa,
        personas_empresa: formData.personasEmpresa,
        ventas_anuales: formData.ventasAnuales,
        ...(origen ? { origen_detalle: origen } : {}),
      };
      try {
        await registerLead(leadData);
      } catch {
        // El lead es la sombra del alta, no su condición.
      }

      // EL ALTA DE VERDAD (paso 4 del roadmap): crea la empresa con su
      // prueba de 7 días y su administrador. El motor limpia si algo
      // falla a medias y responde en español.
      const signupDto: SignupDto = {
        admin_email: formData.emailContacto,
        admin_password: formData.passwordCuenta,
        admin_full_name: formData.nombreContacto,
        company_name: formData.nombreEmpresa,
        currency: formData.currency,
        ...(origen ? { origen_detalle: origen } : {}),
      };
      const signupResult = await signup(signupDto);
      if (signupResult.error) {
        setError(humanizeApiError(signupResult.error));
        return;
      }

      // Adentro al tiro: la sesión se abre sola y cae en el Dashboard.
      const signInResult = await signIn(
        formData.emailContacto,
        formData.passwordCuenta,
      );
      if (signInResult.error) {
        setSuccess(true); // la cuenta SÍ quedó creada: se le dice y listo
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      setError(humanizeApiError(error, "Error inesperado al crear la cuenta"));
    } finally {
      setLoading(false);
    }
  };

  // Solo se ve si la cuenta quedó creada pero la sesión automática no
  // abrió (16-09-2026): la salida es entrar a mano, no esperar a nadie.
  if (success) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            ¡Tu cuenta está lista!
          </h2>
          <p className="text-gray-600 mb-6">
            Creamos tu empresa y tus 7 días de prueba ya están corriendo. Entra
            con tu correo y la contraseña que elegiste.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Iniciar sesión
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Crea tu cuenta gratis
        </h2>
        <p className="text-gray-600">
          Completa el formulario para comenzar a gestionar tus eventos
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Company Data Section */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-3">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Building className="w-5 h-5 mr-2 text-blue-600" />
              Datos de tu Empresa
            </h3>
          </div>

          {/* Nombre Empresa */}
          <div>
            <label
              htmlFor="nombreEmpresa"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <Building className="inline w-4 h-4 mr-2" />
              Nombre de la Empresa *
            </label>
            <input
              type="text"
              id="nombreEmpresa"
              name="nombreEmpresa"
              value={formData.nombreEmpresa}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Nombre de tu empresa"
            />
          </div>

          {/* Nombre Contacto */}
          <div>
            <label
              htmlFor="nombreContacto"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <User className="inline w-4 h-4 mr-2" />
              Nombre de Contacto *
            </label>
            <input
              type="text"
              id="nombreContacto"
              name="nombreContacto"
              value={formData.nombreContacto}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Tu nombre completo"
            />
          </div>

          {/* Teléfono Contacto */}
          <div>
            <label
              htmlFor="telefonoContacto"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <Phone className="inline w-4 h-4 mr-2" />
              Teléfono de Contacto *
            </label>
            <input
              type="tel"
              id="telefonoContacto"
              name="telefonoContacto"
              value={formData.telefonoContacto}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="+56 9 1234 5678"
            />
          </div>

          {/* Personas en la Empresa */}
          <div>
            <label
              htmlFor="personasEmpresa"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <Users className="inline w-4 h-4 mr-2" />
              ¿Cuántas personas trabajan en tu empresa? *
            </label>
            {/* Desplegable del sistema: el nativo del navegador se veía
                ajeno al resto. */}
            <SelectWithSearch
              options={[
                { value: "1-5", label: "1-5 personas" },
                { value: "6-10", label: "6-10 personas" },
                { value: "11-25", label: "11-25 personas" },
                { value: "26-50", label: "26-50 personas" },
                { value: "51-100", label: "51-100 personas" },
                { value: "100+", label: "Más de 100 personas" },
              ]}
              value={formData.personasEmpresa}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, personasEmpresa: value }))
              }
              placeholder="Selecciona una opción"
              required
            />
          </div>

          {/* Ventas Anuales */}
          <div>
            <label
              htmlFor="ventasAnuales"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <DollarSign className="inline w-4 h-4 mr-2" />
              ¿Cuánto venden anualmente? *
            </label>
            {/* Desplegable del sistema: el nativo del navegador se veía
                ajeno al resto. */}
            <SelectWithSearch
              options={[
                { value: "Menos de 50MM CLP", label: "Menos de 50MM CLP" },
                { value: "50MM - 100MM CLP", label: "50MM - 100MM CLP" },
                { value: "100MM - 500MM CLP", label: "100MM - 500MM CLP" },
                { value: "500MM - 1B CLP", label: "500MM - 1B CLP" },
                { value: "Más de 1B CLP", label: "Más de 1B CLP" },
              ]}
              value={formData.ventasAnuales}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, ventasAnuales: value }))
              }
              placeholder="Selecciona una opción"
              required
            />
          </div>

          {/* Currency Selector */}
          <div>
            <label
              htmlFor="currency"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <Coins className="inline w-4 h-4 mr-2" />
              Moneda *
            </label>
            {/* Desplegable del sistema: el nativo del navegador se veía
                ajeno al resto. */}
            <SelectWithSearch
              options={CURRENCIES.map((currency) => ({
                value: currency,
                label: currency,
              }))}
              value={formData.currency}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, currency: value }))
              }
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Selecciona la moneda para tus cotizaciones y pagos
            </p>
          </div>
        </div>

        {/* Account Data Section */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-3">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Mail className="w-5 h-5 mr-2 text-blue-600" />
              Datos de la Cuenta
            </h3>
          </div>

          {/* Email Contacto */}
          <div>
            <label
              htmlFor="emailContacto"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <Mail className="inline w-4 h-4 mr-2" />
              Email de Contacto *
            </label>
            <input
              type="email"
              id="emailContacto"
              name="emailContacto"
              value={formData.emailContacto}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="tu@email.com"
            />
          </div>

          {/* La contraseña de la cuenta (16-09-2026, paso 4): con esto
              el registro crea la empresa de verdad y entra al tiro. */}
          <div>
            <label
              htmlFor="passwordCuenta"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              <Lock className="inline w-4 h-4 mr-2" />
              Contraseña de la Cuenta *
            </label>
            <input
              type="password"
              id="passwordCuenta"
              name="passwordCuenta"
              value={formData.passwordCuenta}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  passwordCuenta: e.target.value,
                }))
              }
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors font-semibold flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <span>Crear cuenta gratis</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          Al crear tu cuenta, aceptas nuestros{" "}
          <Link
            to="/terminos"
            target="_blank"
            rel="noopener"
            className="text-blue-600 hover:underline"
          >
            términos y condiciones
          </Link>{" "}
          y nuestra{" "}
          <Link
            to="/privacidad"
            target="_blank"
            rel="noopener"
            className="text-blue-600 hover:underline"
          >
            política de privacidad
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
