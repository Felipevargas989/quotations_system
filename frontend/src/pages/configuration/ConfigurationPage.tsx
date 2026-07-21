import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Save, Lock, User } from "lucide-react";
import { updatePassword } from "../../services/users.service";
import { useAuth } from "../../contexts/AuthContext";
import { emailCategories } from "./constants";
import { getCompany, updateCompany } from "../../services/companies.service";
import { Company } from "../../types/companies.types";
import { EmailStructure } from "../../types/notifications";

export default function ConfigurationPage() {
  const { user, company: userCompany } = useAuth();
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Empresa vía React Query (Etapa 3); las casillas de notificaciones
  // se editan localmente y parten del valor guardado.
  const [emailNotifications, setEmailNotifications] = useState<{
    [key in EmailStructure]?: boolean;
  }>({});
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const companyQuery = useQuery({
    queryKey: ["company", userCompany?.id],
    enabled: !!userCompany?.id,
    queryFn: async (): Promise<Company | null> => {
      const { data, error } = await getCompany(userCompany!.id.toString());
      if (error) throw error;
      return data ?? null;
    },
  });
  const company = companyQuery.data ?? null;
  const isLoadingCompany = companyQuery.isPending;

  // Inicializa las casillas una vez por empresa cargada (los refrescos
  // en segundo plano no pisan lo que se esté editando).
  useEffect(() => {
    if (company) {
      setEmailNotifications(company.notifications?.emails || {});
    }
  }, [company?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const validateForm = () => {
    if (!formData.newPassword) {
      setError("La nueva contraseña es requerida");
      return false;
    }

    if (formData.newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return false;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.newPassword)) {
      setError(
        "La nueva contraseña debe contener al menos una letra minúscula, una mayúscula y un número",
      );
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updatePassword({
        newPassword: formData.newPassword,
      });

      if (result.data) {
        setSuccess("Contraseña actualizada exitosamente");
        setFormData({
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        setError(result.error?.message || "Error al actualizar la contraseña");
      }
    } catch (error) {
      console.error("Error updating password:", error);
      setError("Error inesperado al actualizar la contraseña");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailNotificationChange = (
    emailType: EmailStructure,
    checked: boolean,
  ) => {
    setEmailNotifications((prev) => ({
      ...prev,
      [emailType]: checked,
    }));
  };

  const handleSaveNotifications = async () => {
    if (!company) return;

    try {
      setIsSavingNotifications(true);
      await updateCompany(company.name, company.logo_url, company.colors, {
        emails: emailNotifications,
      });

      alert("Notificaciones guardadas exitosamente");
    } catch (error) {
      console.error("Error saving notifications:", error);
      setError("Error inesperado al guardar las notificaciones");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <User className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-gray-600">
            Gestiona tu información personal y configuración de cuenta
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Lock className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Cambiar Contraseña
            </h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Actualiza tu contraseña para mantener tu cuenta segura
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? "text" : "password"}
                  id="newPassword"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ingresa tu nueva contraseña"
                  required
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("new")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPasswords.new ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Mínimo 8 caracteres, debe incluir mayúscula, minúscula y número
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirmar Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Confirma tu nueva contraseña"
                  required
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("confirm")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPasswords.confirm ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setFormData({
                  newPassword: "",
                  confirmPassword: "",
                });
                setError(null);
                setSuccess(null);
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save size={16} />
              )}
              <span>
                {isSubmitting ? "Actualizando..." : "Actualizar Contraseña"}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* User Information Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Información de Usuario
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Información básica de tu cuenta
          </p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </div>
              <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">
                {user?.email}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Notificaciones por Email
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Configura qué notificaciones por email quieres recibir
          </p>
        </div>
        <div className="p-4">
          {isLoadingCompany ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">
                Cargando configuración...
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {emailCategories.map((category) => (
                  <div key={category.id}>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <span
                        className={`${category.badgeColor} text-xs px-2 py-1 rounded mr-2`}
                      >
                        {category.badge}
                      </span>
                      {category.name}
                    </h3>
                    <div className="space-y-3">
                      {category.emails.map((email) => (
                        <div
                          key={email.id}
                          className="flex items-start space-x-3"
                        >
                          <div className="flex items-center h-5">
                            <input
                              id={`email-${email.id}`}
                              name={`email-${email.id}`}
                              type="checkbox"
                              checked={
                                emailNotifications[
                                  email.id as EmailStructure
                                ] === true
                              }
                              onChange={(e) =>
                                handleEmailNotificationChange(
                                  email.id as EmailStructure,
                                  e.target.checked,
                                )
                              }
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor={`email-${email.id}`}
                              className="text-sm font-medium text-gray-900 cursor-pointer"
                            >
                              {email.icon} {email.name}
                            </label>
                            <p className="text-gray-600 text-xs mt-1">
                              {email.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-xs text-gray-500">
                    <p>
                      <strong>Enviados desde:</strong> Eventia
                      &lt;hola@eventi-app.com&gt;
                    </p>
                    <p>
                      <strong>Recordatorios:</strong> Diarios entre las 9:00 AM
                      y las 12:00 PM
                    </p>
                  </div>
                  <button
                    onClick={handleSaveNotifications}
                    disabled={isSavingNotifications}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    {isSavingNotifications ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Save size={16} />
                    )}
                    <span>
                      {isSavingNotifications
                        ? "Guardando..."
                        : "Guardar Configuración de Notificaciones"}
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
