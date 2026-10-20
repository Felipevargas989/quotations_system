import { useState } from "react";
import ConfirmInline from "../components/ConfirmInline";
import { toast } from "../components/toast/Toast";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  PlusCircle,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Calendar,
  Users,
  Sparkles,
  Loader2,
} from "lucide-react";
import { DateTime } from "luxon";
import { useAuth } from "../contexts/AuthContext";
import RequestForm from "../components/RequestForm.tsx";
import ResultadosDeIA from "../components/ResultadosDeIA";
import { ROLE_GROUPS, tieneDerecho } from "../constants/permissions";
import { useCrearConIA } from "../hooks/useCrearConIA";
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
import { matchesSearch } from "../utils/searchMatch";
import { SECTION_ROLES } from "../constants/permissions";

export default function RequestsPage() {
  const { user, userRole, company } = useAuth();
  // Convertir un requerimiento en cotización es pega de venta.
  const puedeCotizar = SECTION_ROLES.quotations_edit.includes(
    userRole as never,
  );
  // «✨ Crear con IA» (Felipe, 17-10-2026): quien cotiza, en la empresa
  // con el módulo propio cotizar_con_ia. El motor niega igual.
  const conIA = puedeCotizar && tieneDerecho(company, "cotizar_con_ia");
  const ia = useCrearConIA();
  const [confirmarTodas, setConfirmarTodas] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Confirmación de eliminar anclada al basurero (Tanda 3a).
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRequest, setEditingRequest] =
    useState<QuotationWithClient | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Requerimientos vía React Query (Etapa 2): MISMA queryKey que la
  // sección de requerimientos del panel de cotizaciones — un solo
  // caché compartido entre ambas pantallas.
  const { data: requests = [], isPending: loading } = useQuery({
    queryKey: ["requirements"],
    enabled: !!user,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(QuotationRequestType.REQUERIMIENTO, [
        QuotationStatus.SOLICITADA,
      ]);
      return data;
    },
  });

  const fetchRequests = async () => {
    await queryClient.invalidateQueries({ queryKey: ["requirements"] });
  };

  const handleDelete = async (requestId: string) => {
    // Security check: Only administrators can delete requests
    if (!ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any)) {
      toast.warn(
        "No tienes permisos para eliminar requerimientos: solo los administradores pueden hacerlo.",
      );
      return;
    }

    // (Tanda 3a) La confirmación vive anclada al basurero de la fila.
    try {
      const { error } = await deleteQuotation(requestId);

      if (error) throw error;

      // Sale de la pantalla al instante y se confirma con el servidor.
      queryClient.setQueryData<QuotationWithClient[]>(
        ["requirements"],
        (prev) => (prev ?? []).filter((r) => r.id !== requestId),
      );
      queryClient.invalidateQueries({ queryKey: ["requirements"] });
      toast.success("Requerimiento eliminado.");
    } catch (error) {
      toast.error("No se pudo eliminar el requerimiento.");
    }
  };

  // Número: exacto. Nombre: búsqueda inteligente (sin tildes, palabras
  // en cualquier orden).
  const filteredRequests = requests.filter(
    (request) =>
      !searchTerm ||
      request.quotation_number?.toString() === searchTerm.trim() ||
      matchesSearch(searchTerm, request.clients?.name),
  );

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
        {/* Columnas que no se cortan (Felipe, 19-10-2026): el número va
            angosto, el cliente y el evento bajan de línea, el estado y
            sus etiquetas van uno sobre otro, y los botones se acomodan
            si no caben. */}
        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {request.quotation_number}
        </td>
        <td className="px-4 py-4 min-w-[12rem]">
          <div>
            <div className="text-sm font-medium text-gray-900 break-words">
              {request.clients.name}
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="text-sm text-gray-900">
            {request.event_type || "No especificado"}
          </div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
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
        <td className="px-4 py-4">
          <div className="flex flex-col items-start gap-1">
            <span
              className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${getStatusColor(request.quotation_status)}`}
            >
              {getStatusText(request.quotation_status)}
            </span>
            {request.user_id === null && (
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 whitespace-nowrap">
                creada desde link público
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-4 text-sm font-medium">
          <div className="flex flex-wrap items-center gap-2">
            {/* Convertir en cotización: vivía en la tabla de pendientes
                del panel de cotizaciones (eliminada el 22-07); ahora la
                conversión vive aquí, en su casa natural. */}
            {/* Recepción registra el requerimiento; convertirlo en
                cotización es pega de venta (12-08). Sin el permiso, el
                botón no aparece: la ruta la rebotaría igual. */}
            {/* Dos botones chicos lado a lado (Felipe, 17-10-2026): armarla
                a mano en el cotizador, o que la arme la IA y quede en
                solicitada para revisarla. */}
            {puedeCotizar && (
              <button
                onClick={() => navigate(`/quotation-form/${request.id}`)}
                className="border border-green-600 text-green-700 px-2 py-1 rounded text-xs hover:bg-green-50 flex items-center gap-1"
                title="Armar la cotización a mano en el cotizador"
              >
                <PlusCircle size={13} />
                <span>Crear manual</span>
              </button>
            )}
            {conIA && (
              <button
                onClick={() =>
                  void ia.crear({
                    id: request.id,
                    numero: request.quotation_number,
                  })
                }
                disabled={ia.ocupado}
                className="bg-violet-600 text-white px-2 py-1 rounded text-xs hover:bg-violet-700 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                title="La IA arma la cotización con el catálogo y la deja en solicitada (cerca de un minuto)"
              >
                {ia.trabajando === request.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                <span>
                  {ia.trabajando === request.id ? "Generando…" : "Crear con IA"}
                </span>
              </button>
            )}
            <button
              onClick={() => {
                setEditingRequest(request);
                setShowForm(true);
              }}
              className="text-gray-600 hover:text-gray-900"
              title="Editar requerimiento"
            >
              <Edit size={16} />
            </button>
            {ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any) && (
              <span className="relative">
                <button
                  onClick={() => setConfirmDelId(request.id)}
                  className="text-red-600 hover:text-red-900"
                  title="Solo administradores pueden eliminar requerimientos"
                >
                  <Trash2 size={16} />
                </button>
                {confirmDelId === request.id && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 whitespace-nowrap block">
                    <ConfirmInline
                      question="¿Eliminar este requerimiento?"
                      onYes={() => {
                        setConfirmDelId(null);
                        void handleDelete(request.id);
                      }}
                      onNo={() => setConfirmDelId(null)}
                    />
                  </span>
                )}
              </span>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          Requerimientos Pendientes
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* «✨ Generar todas» en el lugar del enlace público, que se
              mudó a Mi empresa → Formulario web (Felipe, 17-10-2026). */}
          {conIA &&
            (confirmarTodas ? (
              // La pregunta en la misma línea, sin panel flotante (kit de
              // la casa: ConfirmInline).
              <ConfirmInline
                question={`¿Armar con IA los ${filteredRequests.length}? Cerca de un minuto cada uno.`}
                onYes={() => {
                  setConfirmarTodas(false);
                  void ia.generarTodas(
                    filteredRequests.map((r) => ({
                      id: r.id,
                      numero: r.quotation_number,
                    })),
                  );
                }}
                onNo={() => setConfirmarTodas(false)}
              />
            ) : (
              <button
                onClick={() => setConfirmarTodas(true)}
                disabled={ia.ocupado || filteredRequests.length === 0}
                className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 flex items-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
                title="La IA arma todos los requerimientos de la lista, de a uno"
              >
                {ia.lote ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Sparkles size={20} />
                )}
                <span>
                  {ia.lote
                    ? `Generando ${Math.min(ia.lote.hecho + 1, ia.lote.total)} de ${ia.lote.total}…`
                    : "Generar todas"}
                </span>
              </button>
            ))}
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Nuevo Requerimiento</span>
          </button>
        </div>
      </div>

      <ResultadosDeIA
        armadas={ia.armadas}
        fallidas={ia.fallidas}
        onCerrar={ia.limpiar}
      />

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

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  N°
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Evento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha/Personas
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
