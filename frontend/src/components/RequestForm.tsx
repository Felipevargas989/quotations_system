import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "./toast/Toast";
import {
  Save,
  RotateCcw,
  Plus,
  CheckCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { SECTION_ROLES, tieneDerecho } from "../constants/permissions";
import { useCrearConIA } from "../hooks/useCrearConIA";
import { useAuth } from "../contexts/AuthContext";
import { validateCompleteClientForm } from "../utils/validation";
import { normalizePhone, PHONE_PLACEHOLDER } from "../utils/phone";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../constants/clientTypes";
import { clientsQueryOptions } from "../services/clients.service";
import { useCrearCliente } from "../hooks/useCrearCliente";
import Modal from "./Modal";
import ComentariosDelEvento from "./ComentariosDelEvento";
import { comentarioParaGuardar } from "../utils/comentarioInterno";
import { clientTypesQueryOptions } from "../services/clientTypes.service";
import { useQuery } from "@tanstack/react-query";
import { eventTypesQueryOptions } from "../services/eventTypes.service";

import {
  createQuotation,
  updateQuotation,
} from "../services/quotations.service";
import { useDateAvailability } from "../hooks/useDateAvailability";
import {
  EventType,
  QuotationCreateData,
  QuotationRequestType,
  QuotationStatus,
} from "../types/quotations.types";
import { NumberInput } from "./inputs";
import SelectWithSearch from "./selects/SelectWithSearch";
import { getClientContacts } from "../services/clientContacts.service";

interface RequestFormProps {
  request?: any;
  onSave?: () => void;
}

export default function RequestForm({ request, onSave }: RequestFormProps) {
  const { user, userRole, company } = useAuth();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  // «✨ Crear con IA» al editar (Felipe, 17-10-2026): se escribe el
  // comentario interno y en un solo paso se guarda y se arma. Solo quien
  // cotiza, en la empresa con el módulo propio cotizar_con_ia.
  const conIA =
    Boolean(request?.id) &&
    SECTION_ROLES.quotations_edit.includes(userRole as never) &&
    tieneDerecho(company, "cotizar_con_ia");
  const ia = useCrearConIA();
  // Un requerimiento maneja solo el esqueleto del evento (sin montos):
  // QuotationCreateData refleja eso (Fase 2 Bloque C). El "" inicial de
  // event_type existe hasta que el usuario elige (el select es
  // obligatorio), por eso el cast.
  const [formData, setFormData] = useState<
    Omit<QuotationCreateData, "request_type" | "quotation_status">
  >({
    event_type: "" as EventType,
    event_date: "",
    people_count: 1,
    observations: "",
    comentario_interno: "",
    client_id: "",
    contact_name: null,
  });
  // Los contactos del cliente elegido, para la persona de contacto
  // (Felipe, 05-09: "no trae el nombre de la persona a pesar de estar
  // sus datos" — el dato viajaba en la solicitud y acá no se veía).
  const [clientContacts, setClientContacts] = useState<
    { id: number; name: string }[]
  >([]);
  useEffect(() => {
    if (!formData.client_id) {
      setClientContacts([]);
      return;
    }
    getClientContacts(formData.client_id)
      .then((cs) => setClientContacts(cs as { id: number; name: string }[]))
      .catch(() => setClientContacts([]));
  }, [formData.client_id]);
  // Clientes desde el caché compartido de React Query (Etapa 2)
  const { data: clients = [] } = useQuery(clientsQueryOptions);
  const [loading, setLoading] = useState(false);
  const [, setIsExistingClient] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientFormData, setClientFormData] = useState({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
    client_type: DEFAULT_CLIENT_TYPE as string,
  });
  // Tipos de cliente por empresa (caché compartido; estándar de respaldo)
  const { data: clientTypesData } = useQuery(clientTypesQueryOptions);
  const clientTypesList: string[] = clientTypesData?.map((t) => t.name) ?? [
    ...CLIENT_TYPES,
  ];
  const [clientErrors, setClientErrors] = useState({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
  });
  const [isFormValid, setIsFormValid] = useState(false);
  const [touchedFields, setTouchedFields] = useState({
    name: false,
    email: false,
    phone: false,
    contact_person: false,
  });

  // Use custom hook for date availability checking
  const { hasConflicts: hasDateConflicts, isChecking: checkingConflicts } =
    useDateAvailability(formData.event_date, null, request?.id);

  // El catálogo VIVO de tipos de evento (05-09, doc 12): ya no es
  // lista fija — se administra en la página Consultas.
  const { data: catalogoTipos = [] } = useQuery(eventTypesQueryOptions);
  const eventTypes = catalogoTipos.filter((t) => t.activo).map((t) => t.name);

  useEffect(() => {
    // (Clientes y tipos los carga React Query automáticamente.)
    if (request) {
      // Solo lo que el estado maneja. request_type y quotation_status
      // no viven en el formulario: al actualizar, el backend conserva
      // los valores guardados (PATCH parcial).
      const requestData: Omit<
        QuotationCreateData,
        "request_type" | "quotation_status"
      > = {
        event_type: request.event_type,
        event_date: request.event_date.split("T")[0],
        people_count: request.people_count,
        observations: request.observations,
        // El comentario interno (17-10-2026): si la fila llegó sin el
        // campo, queda undefined y no se toca (utils/comentarioInterno).
        comentario_interno:
          "comentario_interno" in request
            ? (request.comentario_interno ?? "")
            : undefined,
        client_id: request.client_id,
        // La persona que escribió la solicitud viene guardada: se
        // muestra en vez de perderse (Felipe, 05-09).
        contact_name:
          (request as { contact_name?: string | null }).contact_name ?? null,
      };

      setFormData(requestData);
      // If editing and has client_id, set as existing client
      if (request.client_id) {
        setIsExistingClient(true);
      }
    }
  }, [request]);

  // Update form validity when client form data changes
  useEffect(() => {
    const validation = validateCompleteClientForm(clientFormData);
    setClientErrors(validation.errors);
    setIsFormValid(validation.isValid);
  }, [clientFormData]);

  // Helper function to check if a field should show error
  const shouldShowError = (fieldName: keyof typeof touchedFields) => {
    return touchedFields[fieldName] && clientErrors[fieldName];
  };

  // (loadClients eliminado: la lista vive en el caché ["clients"].)

  // generateRequestNumber function removed - quotation_number is now auto-generated in database

  const handleClientSelect = (clientId: string, clientData?: any) => {
    if (clientId) {
      // If clientData is provided, use it directly (for newly created clients)
      const selectedClient =
        clientData || clients.find((c) => c.id === clientId);

      if (selectedClient) {
        setFormData((prev) => ({
          ...prev,
          client_id: clientId,
        }));
        setIsExistingClient(true);
      } else {
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        client_id: "",
      }));

      setIsExistingClient(false);
    }
  };

  // "Crear nuevo cliente" con el aviso de cliente parecido (16-10-2026):
  // crear, avisar y sus tres salidas viven en useCrearCliente (la misma
  // pieza del cotizador y de Clientes).
  const nuevoCliente = useCrearCliente({
    abierto: showClientModal,
    datos: clientFormData,
    armar: () => (user ? { ...clientFormData, address: "", notes: "" } : null),
    alElegir: (c, persona) => {
      handleClientSelect(c.id, c);
      if (persona) setFormData((prev) => ({ ...prev, contact_name: persona }));
    },
    alTerminar: () => {
      setClientFormData({
        name: "",
        email: "",
        phone: "",
        contact_person: "",
        client_type: DEFAULT_CLIENT_TYPE,
      });
      setShowClientModal(false);
    },
  });

  const handleCreateClient = nuevoCliente.enviar;

  // Cerrar "Crear nuevo cliente" (el ✕, Cancelar, Escape o el fondo):
  // limpia los errores marcados para la próxima vez.
  const cerrarVentanaCliente = () => {
    setShowClientModal(false);
    setClientErrors({
      name: "",
      email: "",
      phone: "",
      contact_person: "",
    });
    setIsFormValid(false);
    setTouchedFields({
      name: false,
      email: false,
      phone: false,
      contact_person: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      if (request?.id) {
        const { error } = await updateQuotation(
          {
            ...formData,
            ...comentarioParaGuardar(formData.comentario_interno),
          },
          request.id,
        );

        if (error) throw error;
        toast.success("Requerimiento actualizado.");
      } else {
        const { error } = await createQuotation({
          ...formData,
          ...comentarioParaGuardar(formData.comentario_interno),
          request_type: QuotationRequestType.REQUERIMIENTO,
          quotation_status: QuotationStatus.SOLICITADA,
        });

        if (error) throw error;
        toast.success("Requerimiento creado.");
      }

      if (onSave) onSave();
    } catch (error) {
      toast.error("No se pudo guardar el requerimiento.");
    } finally {
      setLoading(false);
    }
  };

  // Guarda lo escrito y pide a la IA que la arme; si sale, se abre en el
  // cotizador para revisarla (queda en solicitada, nunca se envía).
  const guardarYCrearConIA = async () => {
    if (!request?.id || !formRef.current?.reportValidity()) return;
    setLoading(true);
    try {
      const { error } = await updateQuotation(
        {
          ...formData,
          ...comentarioParaGuardar(formData.comentario_interno),
        },
        request.id,
      );
      if (error) throw error;
    } catch {
      toast.error("No se pudo guardar el requerimiento.");
      setLoading(false);
      return;
    }
    const ok = await ia.crear({
      id: request.id,
      numero: request.quotation_number,
    });
    setLoading(false);
    if (ok) navigate(`/quotation-form/${request.id}`);
  };

  const handleClear = () => {
    setFormData({
      event_type: "" as EventType,
      event_date: "",
      people_count: 1,
      observations: "",
      comentario_interno: "",
      client_id: "",
    });
    setIsExistingClient(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Client Creation Modal */}
      {/* La ventana de la casa (16-10-2026): con el aviso de cliente
          parecido, la hecha a mano y centrada se salía de la pantalla
          sin dejar bajar. Anclada arriba y sin tope: crece y se
          desplaza la página (el tipo de cliente es un buscador). */}
      {showClientModal && (
        <Modal
          titulo="Crear Nuevo Cliente"
          ancho="max-w-md"
          sinTope
          onCerrar={cerrarVentanaCliente}
        >
          <form onSubmit={handleCreateClient} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Cliente
              </label>
              <input
                type="text"
                required
                value={clientFormData.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setClientFormData((prev) => ({ ...prev, name }));
                  setClientErrors((prev) => ({
                    ...prev,
                    name: !name.trim() ? "Nombre del cliente es requerido" : "",
                  }));
                }}
                onBlur={() =>
                  setTouchedFields((prev) => ({ ...prev, name: true }))
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("name") ? "border-red-500" : ""}`}
                placeholder="Nombre completo o empresa"
              />
              {shouldShowError("name") && (
                <p className="text-red-500 text-sm mt-1">{clientErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={clientFormData.email}
                onChange={(e) => {
                  const email = e.target.value;
                  setClientFormData((prev) => ({ ...prev, email }));
                }}
                onBlur={() =>
                  setTouchedFields((prev) => ({ ...prev, email: true }))
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("email") ? "border-red-500" : ""}`}
                placeholder="correo@ejemplo.com"
              />
              {shouldShowError("email") && (
                <p className="text-red-500 text-sm mt-1">
                  {clientErrors.email}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                value={clientFormData.phone}
                onChange={(e) => {
                  const phone = e.target.value;
                  setClientFormData((prev) => ({ ...prev, phone }));
                }}
                onBlur={() => {
                  // Al salir del recuadro el número queda ordenado y a la
                  // vista, para que se note que quedó bien guardado.
                  setClientFormData((prev) => ({
                    ...prev,
                    phone: normalizePhone(prev.phone || ""),
                  }));
                  setTouchedFields((prev) => ({ ...prev, phone: true }));
                }}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("phone") ? "border-red-500" : ""}`}
                placeholder={PHONE_PLACEHOLDER}
              />
              {shouldShowError("phone") && (
                <p className="text-red-500 text-sm mt-1">
                  {clientErrors.phone}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Persona de Contacto
              </label>
              <input
                type="text"
                value={clientFormData.contact_person}
                onChange={(e) => {
                  const contact_person = e.target.value;
                  setClientFormData((prev) => ({ ...prev, contact_person }));
                }}
                onBlur={() =>
                  setTouchedFields((prev) => ({
                    ...prev,
                    contact_person: true,
                  }))
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("contact_person") ? "border-red-500" : ""}`}
                placeholder="Nombre del contacto principal"
              />
              {shouldShowError("contact_person") && (
                <p className="text-red-500 text-sm mt-1">
                  {clientErrors.contact_person}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Cliente
              </label>
              <SelectWithSearch
                options={clientTypesList.map((type) => ({
                  value: type,
                  label: type,
                }))}
                value={clientFormData.client_type}
                onChange={(v) =>
                  setClientFormData((prev) => ({
                    ...prev,
                    client_type: v,
                  }))
                }
                placeholder="Tipo de cliente"
                searchPlaceholder="Buscar tipo…"
                noResultsText="Sin resultados"
              />
            </div>

            {nuevoCliente.aviso}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={cerrarVentanaCliente}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={nuevoCliente.cargando || !isFormValid}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                  nuevoCliente.cargando || !isFormValid
                    ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Plus size={16} />
                <span>
                  {nuevoCliente.cargando ? "Creando..." : "Crear Cliente"}
                </span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        {/* Número de Requerimiento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Número de Requerimiento
          </label>
          <div className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 text-sm">
            {request?.quotation_number || "Auto-generado"}
          </div>
        </div>

        {/* Información básica */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cliente Existente
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <SelectWithSearch
              options={clients.map((client) => ({
                value: client.id,
                label: `${client.name} (${client.client_type})`,
              }))}
              value={formData.client_id || ""}
              onChange={(value) => handleClientSelect(value)}
            />
            <button
              type="button"
              onClick={() => setShowClientModal(true)}
              className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 flex items-center justify-center space-x-2 whitespace-nowrap sm:w-auto w-full"
              title="Crear nuevo cliente"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {/* La persona de contacto: la misma pieza del cotizador — los
            contactos del cliente, con el nombre guardado visible aunque
            haya salido del catálogo (SelectWithSearch lo garantiza). */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Persona de contacto
          </label>
          <SelectWithSearch
            options={clientContacts
              .map((c) => c.name)
              .sort((a, b) => a.localeCompare(b))
              .map((n) => ({ value: n, label: n }))}
            value={formData.contact_name || ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                contact_name: value || null,
              }))
            }
            placeholder={
              formData.client_id ? "Sin contacto" : "Elige un cliente primero"
            }
          />
        </div>

        {/* Información del cliente */}
        {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Cliente *
            </label>
            <input
              type="text"
              required
              value={selectedClient?.name}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              placeholder="Seleccione un cliente"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={formData.client_email}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              placeholder="Seleccione un cliente"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Teléfono
            </label>
            <input
              type="tel"
              value={formData.phone}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              placeholder="Seleccione un cliente"
            />
          </div>
        </div> */}

        {/* Información del evento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Evento *
            </label>
            <SelectWithSearch
              options={eventTypes.map((type) => ({
                value: type,
                label: type,
              }))}
              value={formData.event_type}
              onChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  // Las opciones salen de EventType: el valor siempre es
                  // uno válido (o "" mientras elige).
                  event_type: v as EventType,
                }))
              }
              placeholder="Seleccionar tipo"
              searchPlaceholder="Buscar tipo…"
              noResultsText="Sin resultados"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha del Evento
            </label>
            <input
              type="date"
              value={formData.event_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, event_date: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {checkingConflicts && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <p className="text-sm text-blue-800">
                    Verificando disponibilidad...
                  </p>
                </div>
              </div>
            )}
            {!checkingConflicts && hasDateConflicts && (
              <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <span className="text-yellow-600 font-semibold">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm text-yellow-800">
                      Hay más eventos programados para este mismo día.{" "}
                      <a
                        href={`/calendar?date=${formData.event_date}&filter=all`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline hover:text-yellow-900"
                      >
                        Ver en calendario
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!checkingConflicts && !hasDateConflicts && formData.event_date && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-800">
                    Fecha disponible - No hay otros eventos programados
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Número de Personas *
            </label>

            <NumberInput
              value={formData.people_count}
              onChange={(value) => {
                const peopleCount = value ?? 1; // Default to 1 if undefined
                setFormData((prev) => ({
                  ...prev,
                  people_count: peopleCount,
                }));
              }}
              required
              min={1}
            />
          </div>
        </div>

        {/* Los dos comentarios (17-10-2026): el que ve el cliente y el
            interno, que nunca sale. */}
        <ComentariosDelEvento
          observaciones={formData.observations}
          onObservaciones={(observations) =>
            setFormData((prev) => ({ ...prev, observations }))
          }
          comentarioInterno={formData.comentario_interno}
          onComentarioInterno={(comentario_interno) =>
            setFormData((prev) => ({ ...prev, comentario_interno }))
          }
        />

        {/* Botones */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
          >
            <RotateCcw size={16} />
            <span>Limpiar</span>
          </button>
          {conIA && (
            <button
              type="button"
              onClick={() => void guardarYCrearConIA()}
              disabled={loading || ia.ocupado}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Guarda y la IA arma la cotización (cerca de un minuto)"
            >
              {ia.ocupado ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>{ia.ocupado ? "Generando…" : "Crear con IA"}</span>
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Save size={16} />
            <span>
              {loading ? "Guardando..." : request ? "Actualizar" : "Crear"}{" "}
              Requerimiento
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
