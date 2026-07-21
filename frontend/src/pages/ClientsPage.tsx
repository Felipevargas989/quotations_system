import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ConfirmInline from "../components/ConfirmInline";
import MultiSelect, { MultiSelectOption } from "../components/MultiSelect";
import { getClientTypeColor } from "../utils/clientTypeColor";
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
import {
  ClientTypeItem,
  createClientType,
  deleteClientType,
  getClientTypes,
  reorderClientTypes,
} from "../services/clientTypes.service";
import { Client, ClientFormData } from "../types/clients.types";
import {
  ClientContact,
  createClientContact,
  deleteClientContact,
  getClientContacts,
  setPrimaryContact,
  updateClientContact,
} from "../services/clientContacts.service";

// Persistencia por usuario del filtro de tipos (mismo patrón que el
// filtro de estados de Cotizaciones): la selección sobrevive recargas.
const TYPE_FILTER_KEY = (userId: string | number) =>
  `eventia_clients_type_filter_${userId}`;

export default function ClientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  // Confirmación inline de borrado de cliente (solo clientes sin
  // cotizaciones; los demás muestran el basurero desactivado).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ---- Filtro múltiple por tipo (vacío = todos), guardado por usuario ----
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [typeFilterRestored, setTypeFilterRestored] = useState(false);

  // ---- Tipos de cliente dinámicos (tabla client_types) ----
  // TODA la gestión (crear, ordenar con flechas, eliminar) vive en el
  // panel "Gestionar tipos" (decisión Felipe 21-07-2026); el desplegable
  // solo selecciona.
  const [clientTypes, setClientTypes] = useState<ClientTypeItem[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [savingType, setSavingType] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [managingTypes, setManagingTypes] = useState(false); // panel de gestión
  const [confirmTypeDelId, setConfirmTypeDelId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const loadClientTypes = async () => {
    try {
      setClientTypes(await getClientTypes());
    } catch {
      // Respaldo: si el catálogo no responde, se usan los 6 estándar.
      setClientTypes(CLIENT_TYPES.map((name, i) => ({ id: -(i + 1), name })));
    }
  };

  const handleCreateType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setSavingType(true);
    setTypeError(null);
    try {
      await createClientType(name);
      await loadClientTypes();
      setNewTypeName("");
    } catch (error: any) {
      setTypeError(
        error?.response?.data?.message || "No se pudo crear el tipo",
      );
    } finally {
      setSavingType(false);
    }
  };

  // Subir/bajar un tipo: reordena en pantalla al instante y persiste.
  const moveType = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= clientTypes.length || reordering) return;
    const next = [...clientTypes];
    [next[index], next[target]] = [next[target], next[index]];
    setClientTypes(next);
    setReordering(true);
    try {
      await reorderClientTypes(next.map((t) => t.id));
    } catch {
      // Si falla la persistencia, se recarga el orden real.
      await loadClientTypes();
    } finally {
      setReordering(false);
    }
  };

  const handleDeleteType = async (id: number) => {
    setTypeError(null);
    try {
      await deleteClientType(id);
      setConfirmTypeDelId(null);
      await loadClientTypes();
    } catch (error: any) {
      setTypeError(
        error?.response?.data?.message || "No se pudo eliminar el tipo",
      );
      setConfirmTypeDelId(null);
    }
  };

  // Cuántos clientes usan cada tipo (para bloquear el borrado en uso).
  const typeUsage = (name: string) =>
    clients.filter((c) => (c.client_type || "").trim() === name).length;

  // ----- Personas de contacto del cliente en edición (multi-contactos) -----
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [contactDraft, setContactDraft] = useState<{
    id: number | null; // null = nueva persona
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  // Al CREAR una empresa: correo y teléfono de la persona de contacto
  // (la empresa no tiene correo/teléfono propios; las personas sí)
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const { company } = useAuth();

  const isEmpresa = formData.client_type !== "Particulares";

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

  // Confirmación inline para eliminar contacto (sin popup del navegador)
  const [confirmContactId, setConfirmContactId] = useState<number | null>(null);
  const removeContact = async (client: Client, contact: ClientContact) => {
    setConfirmContactId(null);
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
    loadClientTypes();
  }, [user]);

  // Restaurar el filtro de tipos guardado (por usuario).
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(TYPE_FILTER_KEY(user.id));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setTypeFilter(parsed);
      }
    } catch {
      /* almacenamiento no disponible o corrupto: se parte sin filtro */
    }
    setTypeFilterRestored(true);
  }, [user]);

  // Guardar el filtro de tipos en cada cambio (después de restaurar).
  useEffect(() => {
    if (!user || !typeFilterRestored) return;
    try {
      localStorage.setItem(TYPE_FILTER_KEY(user.id), JSON.stringify(typeFilter));
    } catch {
      /* sin espacio o deshabilitado: el filtro sigue funcionando en memoria */
    }
  }, [typeFilter, user, typeFilterRestored]);

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
            email: newContactEmail.trim() || null,
            phone: newContactPhone.trim() || null,
            is_primary: true,
          });
          setNewContactEmail("");
          setNewContactPhone("");
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

  // Eliminación con confirmación inline (patrón del sistema, sin popups
  // del navegador). Solo llega aquí un cliente SIN cotizaciones: para
  // los que tienen, el basurero va desactivado y el backend además lo
  // rechaza con 409 por si acaso.
  const handleDelete = async (clientId: string) => {
    setDeletingClient(true);
    setDeleteError(null);
    try {
      await deleteClient(clientId);
      setConfirmDeleteId(null);
      loadClients();
    } catch (error: any) {
      console.error("Error deleting client:", error);
      setDeleteError(
        error?.response?.data?.message || "No se pudo eliminar el cliente",
      );
    } finally {
      setDeletingClient(false);
    }
  };

  // Opciones del filtro: el catálogo en SU orden manual primero, y al
  // final (alfabéticos) los tipos antiguos que aún viven en clientes
  // pero ya no están en el catálogo.
  const catalogNames = clientTypes.map((t) => t.name);
  const extraNames = [
    ...new Set(
      clients
        .map((c) => (c.client_type || "").trim())
        .filter((n) => n && !catalogNames.includes(n)),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const typeFilterOptions: MultiSelectOption[] = [
    ...catalogNames,
    ...extraNames,
  ].map((name) => ({ value: name, label: name }));

  // Buscador y filtro de tipos se aplican JUNTOS (vacío = todos).
  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.client_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.email &&
        client.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType =
      typeFilter.length === 0 ||
      typeFilter.includes((client.client_type || "").trim());
    return matchesSearch && matchesType;
  });

  // (getClientTypeColor vive ahora en utils/clientTypeColor.ts, compartido
  // con la ficha 360° del cliente.)

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
                  {clientTypes.map((type) => (
                    <option key={type.id} value={type.name}>
                      {type.name}
                    </option>
                  ))}
                  {/* Si el cliente en edición tiene un tipo que ya no
                      existe en el catálogo, se muestra igual. */}
                  {formData.client_type &&
                    !clientTypes.some(
                      (t) => t.name === formData.client_type,
                    ) && (
                      <option value={formData.client_type}>
                        {formData.client_type}
                      </option>
                    )}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setManagingTypes((v) => !v);
                    setTypeError(null);
                    setConfirmTypeDelId(null);
                  }}
                  className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  {managingTypes ? "Ocultar tipos" : "Gestionar tipos…"}
                </button>

                {managingTypes && (
                  <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {clientTypes.map((type, index) => {
                      const inUse = typeUsage(type.name);
                      return (
                        <div
                          key={type.id}
                          className="flex items-center justify-between px-3 py-1.5 text-sm"
                        >
                          {confirmTypeDelId === type.id ? (
                            <ConfirmInline
                              question={`¿Eliminar "${type.name}"?`}
                              onYes={() => handleDeleteType(type.id)}
                              onNo={() => setConfirmTypeDelId(null)}
                            />
                          ) : (
                            <>
                              <span className="text-gray-800">
                                {type.name}
                                <span className="text-gray-400 ml-2 text-xs">
                                  {inUse} cliente{inUse === 1 ? "" : "s"}
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={index === 0 || reordering}
                                  onClick={() => moveType(index, -1)}
                                  className="text-gray-500 hover:text-blue-600 disabled:text-gray-200 disabled:cursor-not-allowed font-bold"
                                  title="Subir"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    index === clientTypes.length - 1 ||
                                    reordering
                                  }
                                  onClick={() => moveType(index, 1)}
                                  className="text-gray-500 hover:text-blue-600 disabled:text-gray-200 disabled:cursor-not-allowed font-bold"
                                  title="Bajar"
                                >
                                  ↓
                                </button>
                                {inUse > 0 ? (
                                  <span
                                    title={`No se puede eliminar: ${inUse} cliente${inUse === 1 ? "" : "s"} usa${inUse === 1 ? "" : "n"} este tipo`}
                                    className="text-gray-300 cursor-not-allowed ml-1"
                                  >
                                    <Trash2 size={14} />
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmTypeDelId(type.id)}
                                    className="text-red-600 hover:text-red-800 ml-1"
                                    title="Eliminar tipo (sin clientes)"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {/* Crear un tipo nuevo: vive AQUÍ, junto al resto de
                        la gestión (no en el desplegable). */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input
                        type="text"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateType();
                          }
                        }}
                        placeholder="Nuevo tipo (Ej: Club Adulto Mayor)"
                        maxLength={60}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        disabled={savingType || !newTypeName.trim()}
                        onClick={handleCreateType}
                        className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingType ? "…" : "+ Agregar"}
                      </button>
                    </div>
                  </div>
                )}

                {typeError && (
                  <p className="text-xs text-red-600 mt-1">{typeError}</p>
                )}
              </div>

              {/* La empresa no tiene correo/teléfono propios: esos datos
                  viven en las personas de contacto. Particulares sí. */}
              {!isEmpresa && (
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
              )}

              {!isEmpresa && (
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
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {editingClient
                    ? "Personas de contacto"
                    : "Persona de contacto (principal)"}
                </label>
                {!editingClient ? (
                  <div className="space-y-2">
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
                    {isEmpresa && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                          placeholder="Correo de la persona"
                        />
                        <input
                          type="tel"
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                          placeholder="Teléfono de la persona"
                        />
                      </div>
                    )}
                  </div>
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
                              disabled={
                                savingContact || !contactDraft.name.trim()
                              }
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
                              {[c.email, c.phone].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {confirmContactId === c.id ? (
                              <ConfirmInline
                                question={`¿Eliminar a "${c.name}"?`}
                                onYes={() => removeContact(editingClient, c)}
                                onNo={() => setConfirmContactId(null)}
                              />
                            ) : (
                              <>
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
                                    fill={
                                      c.is_primary ? "currentColor" : "none"
                                    }
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
                                  onClick={() => setConfirmContactId(c.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
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
                            disabled={
                              savingContact || !contactDraft.name.trim()
                            }
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
          Gestión de Clientes{" "}
          <span className="text-base font-medium text-gray-400">
            · {clients.length.toLocaleString("es-CL")} en total
          </span>
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
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
            <div className="min-w-[220px]">
              <MultiSelect
                options={typeFilterOptions}
                value={typeFilter}
                onChange={setTypeFilter}
                placeholder="Filtrar por tipo"
                className="w-full"
              />
            </div>
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
                {/* Columna del chevron › (la fila se abre al pinchar) */}
                <th className="w-8" aria-label="Abrir ficha" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No se encontraron clientes
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  // Toda la fila abre la ficha 360° del cliente; los
                  // botones de acciones detienen la propagación.
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    title="Ver ficha del cliente"
                    className="hover:bg-gray-50 cursor-pointer"
                  >
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
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* La celda SIEMPRE mide lo de los dos iconos; la
                          confirmación flota anclada a la derecha y crece
                          hacia la izquierda sobre la fila, sin mover la
                          tabla (principio anti-salto de layout). */}
                      <div className="relative">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(client)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit size={16} />
                          </button>
                          {(client.quotation_count ?? 0) > 0 ? (
                            // Un cliente con cotizaciones NO se elimina:
                            // su historial vive en esas cotizaciones.
                            <span
                              title={`No se puede eliminar: tiene ${client.quotation_count} cotización${(client.quotation_count ?? 0) > 1 ? "es" : ""} asociada${(client.quotation_count ?? 0) > 1 ? "s" : ""}`}
                              className="text-gray-300 cursor-not-allowed"
                            >
                              <Trash2 size={16} />
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmDeleteId(client.id);
                                setDeleteError(null);
                              }}
                              className="text-red-600 hover:text-red-900"
                              title="Eliminar cliente"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        {confirmDeleteId === client.id && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">
                            <ConfirmInline
                              question="¿Eliminar cliente?"
                              busy={deletingClient}
                              onYes={() => handleDelete(client.id)}
                              onNo={() => {
                                setConfirmDeleteId(null);
                                setDeleteError(null);
                              }}
                            />
                            {deleteError && (
                              <p className="text-xs text-red-600 mt-1">
                                {deleteError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Chevron › : señal visual de que la fila se abre
                        (mismo lenguaje que Post-Venta) */}
                    <td className="pr-4 text-right">
                      <ChevronRight
                        size={18}
                        className="inline text-gray-300"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estadísticas: una tarjeta por CADA tipo de cliente existente,
          ordenadas por cantidad (decisión Felipe 21-07-2026: sin tope;
          con tipos ilimitados el resumen puede ocupar varias filas). */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {(() => {
          const counts = new Map<string, number>();
          clients.forEach((c) => {
            const t = (c.client_type || "").trim() || "Sin tipo";
            counts.set(t, (counts.get(t) || 0) + 1);
          });
          const cards = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          const colors = [
            "text-blue-600",
            "text-green-600",
            "text-purple-600",
            "text-amber-600",
            "text-rose-600",
            "text-teal-600",
          ];
          return cards.map(([label, n], i) => (
            <div key={label} className="bg-white p-4 rounded-lg shadow">
              <p
                className="text-xs font-medium text-gray-600 truncate"
                title={label}
              >
                {label}
              </p>
              <p className={`text-2xl font-bold ${colors[i % colors.length]}`}>
                {n.toLocaleString("es-CL")}
              </p>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
