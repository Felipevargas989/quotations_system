import { useState, useEffect } from "react";
import { Save, RotateCcw, Plus, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { validateCompleteClientForm } from "../utils/validation";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../constants/clientTypes";
import { getClients } from "../services/clients.service";
import { createClient } from "../services/clients.service";

import { ClientFormData } from "../types/clients.types";
import {
  createQuotation,
  updateQuotation,
} from "../services/quotations.service";
import {
  QuotationFormData,
  QuotationRequestType,
  QuotationStatus,
} from "../types/quotations.types";

interface RequestFormProps {
  request?: any;
  onSave?: () => void;
}

export default function RequestForm({ request, onSave }: RequestFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<
    Omit<QuotationFormData, "request_type" | "quotation_status">
  >({
    event_type: "",
    event_date: "",
    people_count: 1,
    observations: "",
    client_id: "",
  });
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExistingClient, setIsExistingClient] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientFormData, setClientFormData] = useState({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
    client_type: DEFAULT_CLIENT_TYPE,
  });
  const [clientLoading, setClientLoading] = useState(false);
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

  const eventTypes = [
    "Almuerzo o Cena",
    "Paseo de Curso",
    "Uso salones",
    "Estadía y Alimentación",
    "Paseo fin de año",
    "Celebraciones",
    "Matrimonios",
    "Graduación",
  ];

  useEffect(() => {
    loadClients();
    if (request) {
      const requestData: QuotationFormData = {
        request_type: request.request_type,
        quotation_status: request.quotation_status,
        event_type: request.event_type,
        event_date: request.event_date,
        people_count: request.people_count,
        observations: request.observations,
        client_id: request.client_id,
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

  const loadClients = async () => {
    try {
      const { data } = await getClients();

      // if (error) throw error;
      setClients(data);
    } catch (error) {
      setClients([]);
    }
  };

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
        console.log("Client not found in list");
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        client_id: "",
      }));

      setIsExistingClient(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setClientLoading(true);

    try {
      const payload: ClientFormData = {
        ...clientFormData,
        address: "",
        notes: "",
      };

      const { data: newClient } = await createClient(payload);

      // if (error) throw error;

      if (newClient) {
        // Add the new client to the local state immediately
        setClients((prev) => [...prev, newClient]);

        // Auto-select the newly created client

        // Auto-select the newly created client with its data
        handleClientSelect(newClient.id, newClient);
      }

      // Reset client form and close modal
      setClientFormData({
        name: "",
        email: "",
        phone: "",
        contact_person: "",
        client_type: DEFAULT_CLIENT_TYPE,
      });
      setShowClientModal(false);
      alert("Cliente creado exitosamente");
    } catch (error) {
      console.error("Error creating client:", error);
      alert("Error al crear el cliente");
    } finally {
      setClientLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      if (request?.id) {
        console.log("formData", formData);
        console.log("request.id", request.id);

        const { error } = await updateQuotation(formData, request.id);

        if (error) throw error;
        alert("Requerimiento actualizado exitosamente");
      } else {
        const { error } = await createQuotation({
          ...formData,
          request_type: QuotationRequestType.REQUERIMIENTO,
          quotation_status: QuotationStatus.SOLICITADA,
        });

        if (error) throw error;
        alert("Requerimiento creado exitosamente");
      }

      if (onSave) onSave();
    } catch (error) {
      alert("Error al guardar el requerimiento");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFormData({
      event_type: "",
      event_date: "",
      people_count: 1,
      observations: "",
      client_id: "",
    });
    setIsExistingClient(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Client Creation Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Crear Nuevo Cliente
              </h3>
              <button
                onClick={() => {
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
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

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
                      name: !name.trim()
                        ? "Nombre del cliente es requerido"
                        : "",
                    }));
                  }}
                  onBlur={() =>
                    setTouchedFields((prev) => ({ ...prev, name: true }))
                  }
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("name") ? "border-red-500" : ""}`}
                  placeholder="Nombre completo o empresa"
                />
                {shouldShowError("name") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.name}
                  </p>
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
                  onBlur={() =>
                    setTouchedFields((prev) => ({ ...prev, phone: true }))
                  }
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("phone") ? "border-red-500" : ""}`}
                  placeholder="+569XXXXXXXX"
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
                <select
                  value={clientFormData.client_type}
                  onChange={(e) =>
                    setClientFormData((prev) => ({
                      ...prev,
                      client_type: e.target.value as typeof DEFAULT_CLIENT_TYPE,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {CLIENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
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
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={clientLoading || !isFormValid}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                    clientLoading || !isFormValid
                      ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  <Plus size={16} />
                  <span>{clientLoading ? "Creando..." : "Crear Cliente"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
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
            <select
              value={formData.client_id || ""}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-0"
            >
              <option value="">Seleccionar cliente existente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} ({client.client_type})
                </option>
              ))}
            </select>
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
            <select
              required
              value={formData.event_type}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, event_type: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Seleccionar tipo</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Número de Personas *
            </label>
            <input
              type="number"
              min="1"
              required
              value={formData.people_count}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  people_count: parseInt(e.target.value),
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            value={formData.observations}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, observations: e.target.value }))
            }
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Detalles adicionales, requerimientos especiales, etc."
          />
        </div>

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
