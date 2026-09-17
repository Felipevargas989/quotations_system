import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { getCompany, updateCompany } from "../../services/companies.service";
import { Company } from "../../types/companies.types";
import { EmailStructure } from "../../types/notifications";
import { emailCategories, equipoEmails } from "./constants";

// LOS CORREOS DE LA EMPRESA (extraídos de ConfigurationPage el
// 18-09-2026, sprint "Mi cuenta / Mi empresa").
//
// Felipe: "hay que separar todo, hoy está revuelto" — las casillas de
// notificaciones son un asunto de LA EMPRESA (qué correos salen a los
// clientes) y vivían dentro de la pantalla personal, junto al cambio
// de contraseña. Ahora son una pestaña de Mi empresa. La lógica es la
// misma que tenían allá: React Query para la empresa, casillas que
// parten del valor guardado, y la regla del 29-07 — sin llave =
// encendido, solo un "false" explícito apaga un correo.
export default function CorreosDeLaEmpresa() {
  const { company: userCompany } = useAuth();
  const [emailNotifications, setEmailNotifications] = useState<{
    [key in EmailStructure]?: boolean;
  }>({});
  // "Responder a": si el cliente responde un correo, llega a esta
  // casilla (el envío sigue saliendo del dominio de Eventia).
  const [replyTo, setReplyTo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
      setReplyTo(company.notifications?.replyTo || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const cambiarCasilla = (emailType: EmailStructure, checked: boolean) => {
    setEmailNotifications((prev) => ({ ...prev, [emailType]: checked }));
  };

  const guardar = async () => {
    if (!company) return;
    try {
      setIsSaving(true);
      await updateCompany(company.name, company.logo_url, company.colors, {
        emails: emailNotifications,
        replyTo: replyTo.trim() || null,
      });
      toast.success("Notificaciones guardadas.");
    } catch (error) {
      console.error("Error saving notifications:", error);
      toast.error("No pudimos guardar las notificaciones. Intenta de nuevo.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Correos al cliente
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Salen encendidos por defecto; aquí puedes apagar los que no quieras
          enviar
        </p>
      </div>
      <div className="p-4">
        {isLoadingCompany ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Cargando configuración...</span>
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
                      <div key={email.id} className="flex items-start space-x-3">
                        <div className="flex items-center h-5">
                          <input
                            id={`email-${email.id}`}
                            name={`email-${email.id}`}
                            type="checkbox"
                            // Sin llave = encendido (regla del 29-07):
                            // solo un "false" explícito lo apaga.
                            checked={
                              emailNotifications[email.id as EmailStructure] !==
                              false
                            }
                            onChange={(e) =>
                              cambiarCasilla(
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
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2">
                  EQUIPO
                </span>
                Para el equipo — siempre activos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                {equipoEmails.map((email) => (
                  <div key={email.name} className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {email.icon} {email.name}
                    </p>
                    <p className="text-gray-600 text-xs mt-0.5">
                      {email.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <label
                htmlFor="reply-to"
                className="block text-sm font-medium text-gray-900"
              >
                Responder a
              </label>
              <p className="text-xs text-gray-600 mt-0.5 mb-2">
                Si un cliente responde un correo, la respuesta llega a esta
                casilla. Vacío = sin respuesta directa.
              </p>
              <input
                id="reply-to"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="contacto@tuempresa.cl"
                className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center gap-4 flex-wrap">
                <div className="text-xs text-gray-500">
                  <p>
                    <strong>Enviados desde:</strong>{" "}
                    {company?.name || "Tu empresa"} &lt;hola@eventi-app.com&gt;
                  </p>
                  <p>
                    <strong>Cobranza:</strong> 3 días antes · el día del
                    vencimiento · 7 días después (máx. 3 avisos por cuota)
                  </p>
                </div>
                <button
                  onClick={() => void guardar()}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {isSaving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save size={16} />
                  )}
                  <span>{isSaving ? "Guardando..." : "Guardar"}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
