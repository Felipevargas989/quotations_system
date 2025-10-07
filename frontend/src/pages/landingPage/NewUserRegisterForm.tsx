import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Phone,
  Mail,
  Building,
  Users,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { registerLead } from "../../services/registerLeads.service";
import { LeadData } from "../../types/leads.types";
import { signup } from "../../services/users.service";
import { SignupDto } from "../../types/users.types";
import { useAuth } from "../../contexts/AuthContext";

interface FormData {
  nombreContacto: string;
  telefonoContacto: string;
  emailContacto: string;
  nombreEmpresa: string;
  personasEmpresa: string;
  ventasAnuales: string;
  passwordCuenta: string;
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
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    setLoading(true);
    setError("");

    try {
      // Log the payload
      console.log("Form submitted with payload:", formData);

      // Map form data to LeadData interface
      const leadData: LeadData = {
        nombre: formData.nombreContacto,
        telefono: formData.telefonoContacto,
        email: formData.emailContacto,
        nombre_empresa: formData.nombreEmpresa,
        personas_empresa: formData.personasEmpresa,
        ventas_anuales: formData.ventasAnuales,
      };

      // Register lead in database
      const result = await registerLead(leadData);

      // create user and company in DB
      const signupDto: SignupDto = {
        admin_email: formData.emailContacto,
        admin_password: formData.passwordCuenta,
        admin_full_name: formData.nombreContacto,
        company_name: formData.nombreEmpresa,
      };
      const signupResult = await signup(signupDto);

      if (result.success && signupResult.data) {
        // Sign in the user
        const signInResult = await signIn(
          formData.emailContacto,
          formData.passwordCuenta,
        );

        if (signInResult.error) {
          setError(
            "Cuenta creada, pero hubo un error al iniciar sesión. Por favor, inicia sesión manualmente.",
          );
        } else {
          // Redirect to dashboard
          navigate("/dashboard");
        }
      } else {
        const errorMessage =
          result.error ||
          (signupResult.error &&
          typeof signupResult.error === "object" &&
          "message" in signupResult.error
            ? (signupResult.error as { message: string }).message
            : "Error al crear la cuenta");
        setError(errorMessage);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      setError("Error inesperado al enviar el formulario");
    } finally {
      setLoading(false);
    }
  };

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
            <select
              id="personasEmpresa"
              name="personasEmpresa"
              value={formData.personasEmpresa}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">Selecciona una opción</option>
              <option value="1-5">1-5 personas</option>
              <option value="6-10">6-10 personas</option>
              <option value="11-25">11-25 personas</option>
              <option value="26-50">26-50 personas</option>
              <option value="51-100">51-100 personas</option>
              <option value="100+">Más de 100 personas</option>
            </select>
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
            <select
              id="ventasAnuales"
              name="ventasAnuales"
              value={formData.ventasAnuales}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">Selecciona una opción</option>
              <option value="Menos de 50MM CLP">Menos de 50MM CLP</option>
              <option value="50MM - 100MM CLP">50MM - 100MM CLP</option>
              <option value="100MM - 500MM CLP">100MM - 500MM CLP</option>
              <option value="500MM - 1B CLP">500MM - 1B CLP</option>
              <option value="Más de 1B CLP">Más de 1B CLP</option>
            </select>
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

          {/* Password Cuenta */}
          <div>
            <label
              htmlFor="passwordCuenta"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {/* <Lock className="inline w-4 h-4 mr-2" /> */}
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
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="••••••••"
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
          Al crear tu cuenta, aceptas nuestros términos y condiciones
        </p>
      </form>
    </div>
  );
}
