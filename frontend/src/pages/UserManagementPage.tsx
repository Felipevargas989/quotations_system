import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Edit2,
  Save,
  X,
  Shield,
  User as UserIcon,
  Plus,
  Mail,
  UserPlus,
  Trash2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { UserRole } from "../constants/permissions";
import {
  getUsers,
  createUser as createUserService,
  updateUser,
  deleteUser as deleteUserService,
} from "../services/users.service";
import { UpdateUser } from "../types/users.types";

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export default function UserManagementPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Usuarios vía React Query (Etapa 3): caché con revalidación en
  // segundo plano; cada crear/editar/eliminar invalida la lista.
  const { data: users = [], isPending: loading } = useQuery({
    queryKey: ["users"],
    queryFn: async (): Promise<UserProfile[]> => {
      const { data, error } = await getUsers();
      if (error) throw error;
      return data || [];
    },
  });

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    email: "",
    full_name: "",
    role: "vendedor" as UserRole,
    password: "",
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roles = [
    {
      value: "recepcion",
      label: "Recepción",
      color: "bg-gray-100 text-gray-800",
    },
    {
      value: "vendedor",
      label: "Vendedor",
      color: "bg-green-100 text-green-800",
    },
    {
      value: "operaciones",
      label: "Operaciones",
      color: "bg-blue-100 text-blue-800",
    },
    {
      value: "administrador",
      label: "Administrador",
      color: "bg-red-100 text-red-800",
    },
  ];

  const loadUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const getRoleInfo = (role: string) => {
    return roles.find((r) => r.value === role) || roles[1];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const createUser = async () => {
    if (!createForm.email || !createForm.full_name) {
      alert("Por favor completa todos los campos requeridos");
      return;
    }

    if (!isEditing && !createForm.password) {
      alert("Por favor completa todos los campos requeridos");
      return;
    }

    setCreatingUser(true);
    try {
      if (isEditing && editingUserId) {
        // Update existing user
        const editedUser: UpdateUser = {
          full_name: createForm.full_name,
          role: createForm.role,
        };
        const { error: profileError } = await updateUser(
          editingUserId,
          editedUser,
        );

        if (profileError) throw profileError;

        // Refresh users list
        await loadUsers();

        alert("Usuario actualizado correctamente");
      } else {
        // Create new user
        const response = await createUserService(createForm);

        if (response.error) throw response.error;

        await loadUsers();
      }

      // Reset form and close modal
      setCreateForm({
        email: "",
        full_name: "",
        role: "vendedor",
        password: "",
      });
      setShowCreateModal(false);
      setIsEditing(false);
      setEditingUserId(null);
    } catch (error) {
      console.error("Error creating/updating user:", error);
      alert(
        "Error al crear/actualizar el usuario: " + (error as Error).message,
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      email: "",
      full_name: "",
      role: "vendedor",
      password: "",
    });
    setIsEditing(false);
    setEditingUserId(null);
  };

  const openEditModal = (userProfile: UserProfile) => {
    setCreateForm({
      email: userProfile.email,
      full_name: userProfile.full_name || "",
      role: userProfile.role,
      password: "", // Empty for editing
    });
    setIsEditing(true);
    setEditingUserId(userProfile.id);
    setShowCreateModal(true);
  };

  const openDeleteModal = (userProfile: UserProfile) => {
    setDeletingUser(userProfile);
    setShowDeleteModal(true);
  };

  const deleteUser = async () => {
    if (!deletingUser) return;

    setDeleting(true);
    try {
      // Delete user profile first
      const { error } = await deleteUserService(deletingUser.id);

      if (error) throw error;

      // Refresh users list
      await loadUsers();

      // Close modal and reset state
      setShowDeleteModal(false);
      setDeletingUser(null);

      alert("Usuario eliminado correctamente");
    } catch (error) {
      alert("No se pudo eliminar el usuario. Intenta de nuevo.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Users className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Gestión de Usuarios
            </h1>
            <p className="text-gray-600">
              Administra roles y permisos de usuarios
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} />
          <span>Crear Usuario</span>
        </button>
      </div>

      {/* Información de roles */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-4">
          📋 Permisos por Rol
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">
                Recepción
              </span>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Requerimientos</li>
              <li>• Clientes</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                Vendedor
              </span>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Requerimientos</li>
              <li>• Clientes</li>
              <li>• Cotizaciones</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                Operaciones
              </span>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Requerimientos</li>
              <li>• Clientes</li>
              <li>• Cotizaciones</li>
              <li>• Pagos</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                Administrador
              </span>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Acceso completo</li>
              <li>• Dashboard</li>
              <li>• Configuración</li>
              <li>• Gestión usuarios</li>
              <li>• Gestión servicios</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            Usuarios del Sistema
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre Completo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
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
              {users.length === 0 ? (
                <tr>
                  <td
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center"
                    colSpan={5}
                  >
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                users.map((userProfile) => (
                  <tr key={userProfile.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <UserIcon className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {userProfile.email}
                          </div>
                          {userProfile.user_id === user?.id && (
                            <div className="text-xs text-blue-600 font-medium">
                              (Tu cuenta)
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {userProfile.full_name || "Sin nombre"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleInfo(userProfile.role).color}`}
                      >
                        {getRoleInfo(userProfile.role).label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(userProfile.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openEditModal(userProfile)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar usuario"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => openDeleteModal(userProfile)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar usuario"
                          disabled={userProfile.user_id === user?.id}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {roles.map((role) => {
          const count = users.filter((u) => u.role === role.value).length;
          return (
            <div key={role.value} className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {role.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                </div>
                <Shield className="h-8 w-8 text-gray-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {isEditing ? "Editar Usuario" : "Crear Nuevo Usuario"}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className={`w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isEditing ? "bg-gray-100 cursor-not-allowed" : ""
                    }`}
                    placeholder="usuario@ejemplo.com"
                    required
                    disabled={isEditing}
                  />
                </div>
                {isEditing && (
                  <p className="text-xs text-gray-500 mt-1">
                    El email no se puede modificar
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo *
                </label>
                <div className="relative">
                  <UserIcon
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    type="text"
                    value={createForm.full_name}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        full_name: e.target.value,
                      }))
                    }
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nombre completo"
                    required
                  />
                </div>
              </div>

              {!isEditing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    La contraseña debe tener al menos 6 caracteres
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      role: e.target.value as UserRole,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={creatingUser}
              >
                Cancelar
              </button>
              <button
                onClick={createUser}
                disabled={
                  creatingUser ||
                  !createForm.email ||
                  !createForm.full_name ||
                  (!isEditing && !createForm.password)
                }
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {creatingUser ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>{isEditing ? "Actualizando..." : "Creando..."}</span>
                  </>
                ) : (
                  <>
                    {isEditing ? <Save size={16} /> : <Plus size={16} />}
                    <span>
                      {isEditing ? "Actualizar Usuario" : "Crear Usuario"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Confirmar Eliminación
              </h2>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingUser(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={deleting}
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Eliminar Usuario
                  </h3>
                  <p className="text-sm text-gray-500">
                    Esta acción no se puede deshacer
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Usuario:</strong>{" "}
                  {deletingUser.full_name || "Sin nombre"}
                </p>
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Email:</strong> {deletingUser.email}
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Rol:</strong> {getRoleInfo(deletingUser.role).label}
                </p>
              </div>

              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Nota:</strong> El usuario permanecerá en el sistema
                  de autenticación pero no podrá acceder sin un perfil.
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingUser(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                onClick={deleteUser}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Eliminar Usuario</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
