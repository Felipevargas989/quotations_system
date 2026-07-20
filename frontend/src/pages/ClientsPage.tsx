import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Building,
  Phone,
  Mail,
  Star,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  validateEmail,
  validatePhone,
  validateClientForm,
} from "../utils/validation";
import { CLIENT_TYPES } from "../constants/clientTypes";
import {
  createClient,
  deleteClient,
  getClients,
  updateClient,
} from "../services/clients.service";
import { Client, ClientFormData } from "../types/clients.types";
import {
  ClientContact,
  createClientContact,
  deleteClientContact,
  getClientContacts,
  setPrimaryContact,
  updateClientContact,
} from "../services/clientContacts.service";

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<ClientFormData>({
    name: "",
    email: "",
    phone: "",
    client_type: "Particulares",
    address: "",
    contact_person: "",
    notes: "",
  });
  const [errors, setErrors] = useState({
    email: "",
    phone: "",
  });

  // ----- Personas de contacto del cliente en edición (multi-contactos) -----
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [contactDraft, setContactDraft] = useState<{
    id: number | null; // null = nueva persona
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const { company } = useAuth();

  // Espejo: clients.contact_person siempre refleja el nombre del principal.
  const syncPrimaryName = async (clientId: string, name: string) => {
    try {
      await updateClient({ contact_person: name } as ClientFormData, clientId);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, contact_person: name } : c,
        ),
      );
    } catch {
      /* el espejo es best-effort */
    }
  };

  const loadContacts = async (client: Client) => {
    let list = await getClientContacts(client.id);
    // Sanado: si el registro antiguo tiene una persona que no está en la
    // tabla, se importa (principal si no hay ninguno).
    const legacy = (client.contact_person || "").trim();
    if (
      legacy &&
      company?.id &&
      !list.some((c) => c.name.toLowerCase() === legacy.toLowerCase())
    ) {
      await createClientContact({
        company_id: company.id,
        client_id: client.id,
        name: legacy,
        is_primary: !list.some((c) => c.is_primary),
      });
      list = await getClientContacts(client.id);
    }
    setContacts(list);
  };

  const saveContactDraft = async (client: Client) => {
    if (!contactDraft || !contactDraft.name.trim() || !company?.id) return;
    setSavingContact(true);
    if (contactDraft.id == null) {
      const { data } = await createClientContact({
        company_id: company.id,
        client_id: client.id,
        name: contactDraft.name.trim(),
        email: contactDraft.email.trim() || null,
        phone: contactDraft.phone.trim() || null,
        is_primary: contacts.length === 0,
      });
      if (data?.is_primary) await syncPrimaryName(client.id, data.name);
    } else {
      await updateClientContact(contactDraft.id, {
        name: contactDraft.name.trim(),
        email: contactDraft.email.trim() || null,
        phone: contactDraft.phone.trim() || null,
      });
      const was = contacts.find((c) => c.id === contactDraft.id);
      if (was?.is_primary)
        await syncPrimaryName(client.id, contactDraft.name.trim());
    }
    setSavingContact(false);
    setContactDraft(null);
    setContacts(await getClientContacts(client.id));
  };

  const makePrimary = async (client: Client, contact: ClientContact) => {
    await setPrimaryContact(client.id, contact.id);
    await syncPrimaryName(client.id, contact.name);
    setContacts(await getClientContacts(client.id));
  };

  const removeContact = async (client: Client, contact: ClientContact) => {
    if (!window.confirm(`¿Eliminar a "${contact.name}"?`)) return;
    await deleteClientContact(contact.id);
    let list = await getClientContacts(client.id);
    // Si se fue el principal y quedan personas, la primera hereda.
    if (contact.is_primary) {
      if (list.length > 0) {
        await setPrimaryContact(client.id, list[0].id);
        await syncPrimaryName(client.id, list[0].name);
        list = await getClientContacts(client.id);
      } else {
        await syncPrimaryName(client.id, "");
      }
    }
    setContacts(list);
  };

  // Validation function using utility
  const validateForm = (): boolean => {
    const validation = validateClientForm(formData);
    setErrors(validation.errors);
    return validation.isValid;
  };

  useEffect(() => {
    loadClients();
  }, [user]);

  const loadClients = async () => {
    if (!user) return;

    try {
      const { data } = await getClients();
      setClients(data);
    } catch (error) {
      // TODO: handle error
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate form before submission
    if (!validateForm()) {
      alert("Por favor corrija los errores en los campos de email y teléfono");
      return;
    }

    try {
      if (editingClient) {
        await updateClient(formData, editingClient.id);

        alert("Cliente actualizado exitosamente");
      } else {
        const { data: created } = await createClient(formData);
        // Sembrar la persona de contacto como contacto PRINCIPAL real
        const createdClient = (created as any)?.data ?? created;
        if (
          createdClient?.id &&
          formData.contact_person?.trim() &&
          company?.id
        ) {
          await createClientContact({
            company_id: company.id,
            client_id: createdClient.id,
            name: formData.contact_person.trim(),
            is_primary: true,
          });
        }

        alert("Cliente creado exitosamente");
      }

      setShowForm(false);
      setEditingClient(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        client_type: "Particulares",
        address: "",
        contact_person: "",
        notes: "",
      });
      setErrors({
        email: "",
        phone: "",
      });
      loadClients();
    } catch (error) {
      alert("Error al guardar el cliente");
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setContacts([]);
    setContactDraft(null);
    loadContacts(client);
    setFormData({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      client_type: client.client_type,
      address: client.address || "",
      contact_person: client.contact_person || "",
      notes: client.notes || "",
    });
    setErrors({
      email: "",
      phone: "",
    });
    setShowForm(true);
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este cliente?")) return;

    try {
      await deleteClient(clientId);
      alert("Cliente eliminado exitosamente");
      loadClients();
    } catch (error) {
      console.error("Error deleting client:", error);
      alert("Error al eliminar el cliente");
    }
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.client_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.email &&
        client.email.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const getClientTypeColor = (type: string) => {
    const colors = {
      "Colegios & Universidades": "bg-blue-100 text-blue-800",
      Particulares: "bg-green-100 text-green-800",
      "Tour Operadores": "bg-purple-100 text-purple-800",
      Empresas: "bg-orange-100 text-orange-800",
      Iglesias: "bg-yellow-100 text-yellow-800",
      "Empresas Publicas": "bg-red-100 text-red-800",
    };
    return colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
          </h1>
          <button
            onClick={() => {
              setShowForm(false);
              setEditingClient(null);
              setFormData({
                name: "",
                email: "",
                phone: "",
                client_type: "Particulares",
                address: "",
                contact_person: "",
                notes: "",
              });
              setErrors({
                email: "",
                phone: "",
              });
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            ← Volver a la lista
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Nombre completo o empresa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Cliente *
                </label>
                <select
                  required
                  value={formData.client_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_type: e.target.value,
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    const email = e.target.value;
                    setFormData((prev) => ({ ...prev, email }));
                    setErrors((prev) => ({
                      ...prev,
                      email: validateEmail(email),
                    }));
                  }}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.email ? "border-red-500" : ""}`}
                  placeholder="correo@ejemplo.com"
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    const phone = e.target.value;
                    setFormData((prev) => ({ ...prev, phone }));
                    setErrors((prev) => ({
                      ...prev,
                      phone: validatePhone(phone),
                    }));
                  }}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.phone ? "border-red-500" : ""}`}
                  placeholder="+569XXXXXXXX"
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {editingClient
                    ? "Personas de contacto"
                    : "Persona de contacto (principal)"}
                </label>
                {!editingClient ? (
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        contact_person: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nombre del contacto principal"
                  />
                ) : (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-1">
                    {contacts.length === 0 && !contactDraft && (
                      <p className="text-sm text-gray-400">
                        Sin personas de contacto.
                      </p>
                    )}
                    {contacts.map((c) =>
                      contactDraft?.id === c.id ? (
                        <div
                          key={c.id}
                          className="grid grid-cols-1 md:grid-cols-4 gap-2 py-1"
                        >
                          <input
                            autoFocus
                            value={contactDraft.name}
                            onChange={(e) =>
                              setContactDraft((d) =>
                                d ? { ...d, name: e.target.value } : d,
                              )
                            }
                            placeholder="Nombre *"
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                          />
                          <input
                            value={contactDraft.email}
                            onChange={(e) =>
                              setContactDraft((d) =>
                                d ? { ...d, email: e.target.value } : d,
                              )
                            }
                            placeholder="Correo"
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                          />
                          <input
                            value={contactDraft.phone}
                            onChange={(e) =>
                              setContactDraft((d) =>
                                d ? { ...d, phone: e.target.value } : d,
                              )
                            }
                            placeholder="Teléfono"
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={savingContact || !contactDraft.name.trim()}
                              onClick={() => saveContactDraft(editingClient)}
                              className="p-1.5 text-green-600 hover:text-green-800 disabled:opacity-40"
                              title="Guardar"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setContactDraft(null)}
                              className="p-1.5 text-gray-500 hover:text-gray-700"
                              title="Cancelar"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="min-w-0 text-sm">
                            <span
                              className={
                                c.is_primary
                                  ? "font-semibold text-gray-900"
                                  : "text-gray-800"
                              }
                            >
                              {c.name}
                            </span>
                            <span className="ml-2 text-xs text-gray-400">
                              {[c.email, c.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                !c.is_primary &&
                                makePrimary(editingClient, c)
                              }
                              className={
                                c.is_primary
                                  ? "p-1.5 text-amber-500 cursor-default"
                                  : "p-1.5 text-gray-300 hover:text-amber-500"
                              }
                              title={
                                c.is_primary
                                  ? "Contacto principal"
                                  : "Marcar como principal"
                              }
                            >
                              <Star
                                size={15}
                                fill={c.is_primary ? "currentColor" : "none"}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setContactDraft({
                                  id: c.id,
                                  name: c.name,
                                  email: c.email || "",
                                  phone: c.phone || "",
                                })
                              }
                              className="p-1.5 text-gray-400 hover:text-blue-600"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeContact(editingClient, c)}
                              className="p-1.5 text-gray-400 hover:text-red-600"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                    {contactDraft && contactDraft.id == null && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 py-1">
                        <input
                          autoFocus
                          value={contactDraft.name}
                          onChange={(e) =>
                            setContactDraft((d) =>
                              d ? { ...d, name: e.target.value } : d,
                            )
                          }
                          placeholder="Nombre *"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                        <input
                          value={contactDraft.email}
                          onChange={(e) =>
                            setContactDraft((d) =>
                              d ? { ...d, email: e.target.value } : d,
                            )
                          }
                          placeholder="Correo"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                        <input
                          value={contactDraft.phone}
                          onChange={(e) =>
                            setContactDraft((d) =>
                              d ? { ...d, phone: e.target.value } : d,
                            )
                          }
                          placeholder="Teléfono"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={savingContact || !contactDraft.name.trim()}
                            onClick={() => saveContactDraft(editingClient)}
                            className="p-1.5 text-green-600 hover:text-green-800 disabled:opacity-40"
                            title="Guardar"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setContactDraft(null)}
                            className="p-1.5 text-gray-500 hover:text-gray-700"
                            title="Cancelar"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                    {!contactDraft && (
                      <button
                        type="button"
                        onClick={() =>
                          setContactDraft({
                            id: null,
                            name: "",
                            email: "",
                            phone: "",
                          })
                        }
                        className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                      >
                        + Agregar persona
                      </button>
                    )}
                    <p className="text-[11px] text-gray-400 pt-1">
                      La estrella marca el contacto principal (es el que se
                      muestra en la lista de clientes).
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Dirección completa"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Información adicional sobre el cliente..."
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingClient(null);
                  setErrors({
                    email: "",
                    phone: "",
                  });
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingClient ? "Actualizar Cliente" : "Crear Cliente"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Gestión de Clientes
        </h1>
        <button
          onClick={() => {
            setShowForm(true);
            setErrors({
              email: "",
              phone: "",
            });
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha Registro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No se encontraron clientes
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Building className="h-8 w-8 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {client.name}
                          </div>
                          {client.contact_person && (
                            <div className="text-sm text-gray-500">
                              Contacto: {client.contact_person}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${getClientTypeColor(client.client_type)}`}
                      >
                        {client.client_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        {client.email && (
                          <div className="flex items-center text-sm text-gray-900">
                            <Mail className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span
                              title={client.email}
                              className="truncate max-w-[200px]"
                            >
                              {client.email}
                            </span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center text-sm text-gray-900">
                            <Phone className="h-4 w-4 text-gray-400 mr-2" />
                            {client.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(client)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Clientes
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {clients.length}
              </p>
            </div>
            <Building className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Empresas</p>
              <p className="text-2xl font-bold text-green-600">
                {clients.filter((c) => c.client_type === "Empresas").length}
              </p>
            </div>
            <Building className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Particulares</p>
              <p className="text-2xl font-bold text-purple-600">
                {clients.filter((c) => c.client_type === "Particulares").length}
              </p>
            </div>
            <Building className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
