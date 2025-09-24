import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Calendar,
  Users,
} from "lucide-react";
import { DateTime } from "luxon";
import { useAuth } from "../contexts/AuthContext";
import RequestForm from "../components/RequestForm.tsx";
import { ROLE_GROUPS } from "../constants/permissions";
import {
  QuotationWithClient,
  QuotationRequestType,
  QuotationStatus,
} from "../types/quotations.types.ts";
import {
  deleteQuotation,
  getQuotations,
} from "../services/quotations.service.ts";
import { formatISOUTCDateToString } from "../utils/dates.ts";

export default function RequestsPage() {
  const { user, userRole } = useAuth();
  const [requests, setRequests] = useState<QuotationWithClient[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRequest, setEditingRequest] =
    useState<QuotationWithClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchRequests();
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;

    try {
      const { data } = await getQuotations(QuotationRequestType.REQUERIMIENTO, [
        QuotationStatus.SOLICITADA,
      ]);

      // if (error) throw error;
      setRequests(data);
    } catch (error) {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (requestId: string) => {
    // Security check: Only administrators can delete requests
    if (!ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any)) {
      alert(
        "No tienes permisos para eliminar requerimientos. Solo los administradores pueden realizar esta acción.",
      );
      return;
    }

    if (!confirm("¿Estás seguro de que quieres eliminar este requerimiento?"))
      return;

    try {
      const { error } = await deleteQuotation(requestId);

      if (error) throw error;

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      alert("Requerimiento eliminado exitosamente");
    } catch (error) {
      alert("Error al eliminar el requerimiento");
    }
  };

  const filteredRequests = requests.filter((request) => {
    // TODO: implememnt filter
    // const matchesSearch =
    //   request.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    //   request.quotation_number?.toString() === searchTerm.toLowerCase() ||
    //   request.event_type?.toLowerCase().includes(searchTerm.toLowerCase());
    // Solo mostrar requerimientos en estado "solicitada"
    // const isRequiredStatus = request.quotation_status === "solicitada";
    // const isRequiredType =
    //   request.request_type === "requerimiento" || !request.request_type;
    // return matchesSearch && isRequiredStatus && isRequiredType;
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "solicitada":
        return "bg-yellow-100 text-yellow-800";
      case "enviada":
        return "bg-blue-100 text-blue-800";
      case "en_negociacion":
        return "bg-purple-100 text-purple-800";
      case "aceptada":
        return "bg-green-100 text-green-800";
      case "rechazada":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "solicitada":
        return "📋 Solicitada";
      case "enviada":
        return "📤 Enviada";
      case "en_negociacion":
        return "💬 En Negociación";
      case "aceptada":
        return "✅ Aceptada";
      case "rechazada":
        return "❌ Rechazada";
      default:
        return status;
    }
  };

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
            Cargando...
          </td>
        </tr>
      );
    }

    if (filteredRequests.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
            No hay requerimientos pendientes
          </td>
        </tr>
      );
    }

    return filteredRequests.map((request) => (
      <tr key={request.id} className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {request.quotation_number}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div>
            <div className="text-sm font-medium text-gray-900">
              {request.clients.name}
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">
            {request.event_type || "No especificado"}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="space-y-1">
            {request.event_date && (
              <div className="flex items-center text-sm text-gray-900">
                <Calendar className="h-4 w-4 text-gray-400 mr-1" />
                {formatISOUTCDateToString(request.event_date)}
              </div>
            )}
            <div className="flex items-center text-sm text-gray-900">
              <Users className="h-4 w-4 text-gray-400 mr-1" />
              {request.people_count} personas
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(request.quotation_status)}`}
          >
            {getStatusText(request.quotation_status)}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setEditingRequest(request);
                setShowForm(true);
              }}
              className="text-gray-600 hover:text-gray-900"
            >
              <Edit size={16} />
            </button>
            {ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any) && (
              <button
                onClick={() => handleDelete(request.id)}
                className="text-red-600 hover:text-red-900"
                title="Solo administradores pueden eliminar requerimientos"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </td>
      </tr>
    ));
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {editingRequest ? "Editar Requerimiento" : "Nuevo Requerimiento"}
          </h1>
          <button
            onClick={() => {
              setShowForm(false);
              setEditingRequest(null);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ← Volver a la lista
          </button>
        </div>
        <RequestForm
          request={editingRequest}
          onSave={() => {
            setShowForm(false);
            setEditingRequest(null);
            fetchRequests();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Requerimientos Pendientes
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Nuevo Requerimiento</span>
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
                placeholder="Buscar requerimientos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter size={20} className="text-gray-400" />
              <div className="bg-yellow-100 px-3 py-2 rounded-lg text-yellow-800 text-sm font-medium">
                Solo requerimientos en estado "Solicitada"
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Número
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Evento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha/Personas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {renderTableBody()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Requerimientos Pendientes
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {filteredRequests.length}
              </p>
            </div>
            <Plus className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Hoy</p>
              <p className="text-2xl font-bold text-orange-600">
                {
                  filteredRequests.filter((r) => {
                    const today = new Date().toDateString();
                    return new Date(r.created_at).toDateString() === today;
                  }).length
                }
              </p>
            </div>
            <Edit className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Esta Semana</p>
              <p className="text-2xl font-bold text-green-600">
                {
                  filteredRequests.filter((r) => {
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return new Date(r.created_at) >= weekAgo;
                  }).length
                }
              </p>
            </div>
            <Eye className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Urgentes</p>
              <p className="text-2xl font-bold text-purple-600">
                {
                  filteredRequests.filter((r) => {
                    if (!r.event_date) return false;
                    try {
                      let eventDate: DateTime;
                      if (typeof r.event_date === "string") {
                        eventDate = DateTime.fromISO(r.event_date, {
                          zone: "utc",
                        });
                      } else {
                        eventDate = DateTime.fromJSDate(r.event_date, {
                          zone: "utc",
                        });
                      }
                      const today = DateTime.utc();
                      const diffDays = Math.ceil(
                        eventDate.diff(today, "days").days,
                      );
                      return diffDays <= 7 && diffDays >= 0;
                    } catch (error) {
                      console.error(
                        "Error calculating date difference:",
                        error,
                      );
                      return false;
                    }
                  }).length
                }
              </p>
            </div>
            <Calendar className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
