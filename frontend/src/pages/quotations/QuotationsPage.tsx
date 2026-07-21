import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Eye, PlusCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import QuotationViewer from "../../components/QuotationViewer";
import { ROLE_GROUPS } from "../../constants/permissions";
import PaymentPlanEditor from "../../components/PaymentPlanEditor";
import {
  Quotation,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../../types/quotations.types";
import {
  deleteQuotation,
  getQuotations,
  updateQuotation,
} from "../../services/quotations.service";
import {
  createPaymentPlan,
  getPaymentsByQuotationId,
} from "../../services/payments.service";
import { CreatePayment } from "../../types/payments.types";
import { formatISOUTCDateToString } from "../../utils/dates";
import MultiSelect, { MultiSelectOption } from "../../components/MultiSelect";
import { matchesSearch } from "../../utils/searchMatch";

// Persist the quotations status filter per user, so the selection survives
// reloads / navigation instead of resetting to the default each time.
const STATUS_FILTER_KEY = (userId: string | number) =>
  `eventia_quotations_status_filter_${userId}`;

const ALL_STATUSES: QuotationStatus[] = [
  QuotationStatus.SOLICITADA,
  QuotationStatus.ENVIADA,
  QuotationStatus.EN_NEGOCIACION,
  QuotationStatus.ACEPTADA,
  QuotationStatus.RECHAZADA,
  QuotationStatus.CANCELADA,
  QuotationStatus.REALIZADA,
];

export default function QuotationsPage() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const initialStatusFilter = [
    QuotationStatus.SOLICITADA,
    QuotationStatus.ENVIADA,
    QuotationStatus.EN_NEGOCIACION,
  ];
  const [statusFilter, setStatusFilter] =
    useState<string[]>(initialStatusFilter);
  // Guards the persisted-filter restore so we don't fetch (or overwrite
  // storage) before we've loaded the user's saved selection.
  const [filterRestored, setFilterRestored] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewingQuotation, setViewingQuotation] =
    useState<QuotationWithClient | null>(null);
  const [showPaymentPlanEditor, setShowPaymentPlanEditor] = useState(false);
  const [quotationForPaymentPlan, setQuotationForPaymentPlan] =
    useState<Quotation | null>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<"quotation_number" | "event_date">(
    "quotation_number",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Status options for multiselect
  const statusOptions: MultiSelectOption[] = [
    { value: QuotationStatus.SOLICITADA, label: "📋 Solicitada" },
    { value: QuotationStatus.ENVIADA, label: "📤 Enviada" },
    { value: QuotationStatus.EN_NEGOCIACION, label: "💬 En Negociación" },
    { value: QuotationStatus.ACEPTADA, label: "✅ Aceptada" },
    { value: QuotationStatus.RECHAZADA, label: "❌ Rechazada" },
    { value: QuotationStatus.CANCELADA, label: "🚫 Cancelada" },
    { value: QuotationStatus.REALIZADA, label: "🎉 Realizada" },
  ];

  // Restore the persisted status filter (per user) before the first fetch.
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(STATUS_FILTER_KEY(user.id));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setStatusFilter(parsed);
        }
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
    setFilterRestored(true);
  }, [user]);

  // Persist the status filter whenever it changes (after restore).
  useEffect(() => {
    if (!user || !filterRestored) return;
    try {
      localStorage.setItem(
        STATUS_FILTER_KEY(user.id),
        JSON.stringify(statusFilter),
      );
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [statusFilter, user, filterRestored]);

  // ---- Cotizaciones y requerimientos vía React Query (Etapa 2) ----
  // La consulta reacciona sola al filtro y al orden; al cambiar de
  // combinación se sigue mostrando la lista anterior mientras llega la
  // nueva (sin parpadeo a blanco). Volver a esta pantalla pinta al
  // instante desde caché y revalida en segundo plano.
  const statusesToFetch: QuotationStatus[] =
    statusFilter.length === 0
      ? ALL_STATUSES
      : (statusFilter as QuotationStatus[]);

  const quotationsQuery = useQuery({
    queryKey: [
      "quotations",
      [...statusesToFetch].sort().join(","),
      sortBy,
      sortOrder,
    ],
    enabled: !!user && filterRestored,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(
        QuotationRequestType.COTIZACION,
        statusesToFetch,
        sortBy,
        sortOrder,
      );
      return data;
    },
  });
  const quotations = quotationsQuery.data ?? [];
  const loading = quotationsQuery.isPending;

  const { data: requirements = [] } = useQuery({
    queryKey: ["requirements"],
    enabled: !!user,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      // Requirements don't need status filtering, they are always "solicitada"
      const { data } = await getQuotations(QuotationRequestType.REQUERIMIENTO, [
        QuotationStatus.SOLICITADA,
      ]);
      return data;
    },
  });

  // Los antiguos "fetch" ahora son invalidaciones: todos los puntos que
  // llaman tras guardar/cambiar estado siguen funcionando igual.
  const fetchQuotations = async (_statusFilter?: string[]) => {
    await queryClient.invalidateQueries({ queryKey: ["quotations"] });
  };
  const fetchRequirements = async () => {
    await queryClient.invalidateQueries({ queryKey: ["requirements"] });
  };

  // Handle column sorting
  const handleSort = (column: "quotation_number" | "event_date") => {
    if (sortBy === column) {
      // If clicking the same column, toggle the order
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // If clicking a different column, set it as the new sort column with default desc order
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  // Check if user can edit a quotation based on status and role
  const canEditQuotation = (quotation: Quotation): boolean => {
    if (!userRole) return false;

    // If quotation is in "Aceptada" state, only operaciones and administrador can edit
    if (quotation.quotation_status === "aceptada") {
      return ROLE_GROUPS.OPERATIONS_AND_UP.includes(userRole);
    }

    // For other states, all roles can edit (assuming they have access to quotations)
    return true;
  };

  const refreshData = async () => {
    await fetchQuotations(statusFilter);
    await fetchRequirements();
  };

  const handleDeleteQuotation = async (
    quotationId: string,
    quotationNumber: string,
  ) => {
    // Security check: Only administrators can delete quotations
    if (!ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any)) {
      alert(
        "No tienes permisos para eliminar cotizaciones. Solo los administradores pueden realizar esta acción.",
      );
      return;
    }

    const confirmed = confirm(
      `¿Estás seguro de que quieres eliminar la cotización #${quotationNumber}?\n\nEsta acción no se puede deshacer.`,
    );

    if (!confirmed) return;

    try {
      // Delete the quotation (items are now stored in JSON field)
      await deleteQuotation(quotationId);

      alert("✅ Cotización eliminada exitosamente");
      await fetchQuotations(statusFilter);
      await fetchRequirements();
    } catch (error) {
      console.error("Error deleting quotation:", error);
      alert(
        `Error al eliminar la cotización: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    }
  };

  const handleCreateQuotationFromRequirement = async (
    requirementId: Quotation["id"],
  ) => {
    try {
      if (!user?.id) {
        alert("Error: Usuario no autenticado");
        return;
      }

      // Navigate to quotation form with requirement ID
      navigate(`/quotation-form/${requirementId}`);
    } catch (error) {
      alert("Error al crear cotización desde requerimiento");
    }
  };

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
      case "cancelada":
        return "bg-gray-200 text-gray-600";
      case "realizada":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleStatusChange = async (quotationId: string, newStatus: string) => {
    try {
      // Guardia de estados: volver de post-venta (aceptada/realizada/
      // cancelada) a pre-venta elimina el plan de pagos — se avisa antes.
      // Si hay pagos registrados, el backend rechaza el cambio.
      const POST_SALE = ["aceptada", "realizada", "cancelada"];
      const PRE_SALE = ["solicitada", "enviada", "en_negociacion", "rechazada"];
      const current = quotations.find((q) => q.id === quotationId);
      if (
        current &&
        POST_SALE.includes(current.quotation_status) &&
        PRE_SALE.includes(newStatus)
      ) {
        const ok = confirm(
          "Esta cotización ya pasó a Post-Venta con su plan de pagos.\n\nSi no hay pagos registrados, el plan se eliminará y la cotización volverá a pre-venta. Si ya hay pagos registrados, el sistema no permitirá el cambio (para eso está Anular en Post-Venta).\n\n¿Continuar?",
        );
        if (!ok) {
          await fetchQuotations(statusFilter);
          return;
        }
      }

      if (newStatus === QuotationStatus.ACEPTADA) {
        const quotation = quotations.find((q) => q.id === quotationId);
        if (quotation) {
          // Check if payment plan already exists
          const { data: existingPayments } =
            await getPaymentsByQuotationId(quotationId);

          if (existingPayments && existingPayments.length > 0) {
            //
            // Payment plan already exists, just update the status
            const { data, error } = await updateQuotation(
              { quotation_status: newStatus as QuotationStatus },
              quotationId,
            );

            if (error) {
              throw new Error(
                `Error actualizando cotización: ${error.message}`,
              );
            }

            alert(
              "✅ Cotización aceptada exitosamente (plan de pagos ya existía)",
            );
            await fetchQuotations(statusFilter);
            await fetchRequirements();
            return;
          }

          // Show payment plan editor first
          setQuotationForPaymentPlan(quotation);
          setShowPaymentPlanEditor(true);
          return; // Don't update status yet
        }
      }

      // For other statuses or after payment plan is accepted, update the status
      const { data, error } = await updateQuotation(
        { quotation_status: newStatus as QuotationStatus },
        quotationId,
      );

      if (error) {
        throw new Error(`Error actualizando cotización: ${error.message}`);
      }

      alert(
        `✅ Estado actualizado correctamente a: ${newStatus} ${newStatus === QuotationStatus.ENVIADA ? ", y se ha enviado el correo de confirmación al cliente." : ""}`,
      );
      await fetchQuotations(statusFilter);
      await fetchRequirements();
    } catch (error) {
      // El backend puede rechazar con un motivo claro (ej: la guardia de
      // estados cuando hay pagos registrados) — mostrarlo tal cual.
      const backendMsg = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;
      alert(
        `No se pudo actualizar el estado: ${
          backendMsg ||
          (error instanceof Error ? error.message : "Error desconocido")
        }`,
      );
      await fetchQuotations(statusFilter);
    }
  };

  const handlePaymentPlanSave = async (customPlan: any[]) => {
    if (!quotationForPaymentPlan) return;

    try {
      // Create payments array (el editor entrega montos en pesos directos)
      const paymentsToCreate = customPlan.map((payment, index) => {
        if (!payment.due_date) {
          throw new Error(
            `La fecha de vencimiento es requerida para el pago ${index + 1}`,
          );
        }

        const paymentToCreate: CreatePayment = {
          quotation_id: quotationForPaymentPlan.id,
          payment_number: index + 1,
          amount: Math.round(payment.amount),
          due_date: new Date(payment.due_date),
          status: "pendiente",
          payment_type: payment.payment_type,
          notes: payment.notes || "",
        };
        return paymentToCreate;
      });

      // call API reques to create paymet plan
      await createPaymentPlan(quotationForPaymentPlan.id, paymentsToCreate);

      alert(
        "✅ Plan de pagos creado y cotización aceptada exitosamente, y se ha enviado el correo de confirmación al cliente.",
      );
      setShowPaymentPlanEditor(false);
      setQuotationForPaymentPlan(null);
      await fetchQuotations(statusFilter);
      await fetchRequirements();
    } catch (error) {
      alert(
        `Error al crear el plan de pagos: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    }
  };

  const handlePaymentPlanCancel = () => {
    alert("❌ Plan de pagos cancelado. La cotización no ha sido aceptada.");
    setShowPaymentPlanEditor(false);
    setQuotationForPaymentPlan(null);
  };

  const handleViewQuotation = async (quotation: QuotationWithClient) => {
    try {
      // Items are now stored in the JSON field, no need to fetch from quotation_items
      const quotationWithItems = { ...quotation, items: quotation.items || [] };
      setViewingQuotation(quotationWithItems);
      setShowViewer(true);
    } catch (error) {
      console.error("Error loading quotation details:", error);
      alert("Error al cargar los detalles de la cotización");
    }
  };

  const handleEditQuotation = (quotation: QuotationWithClient) => {
    if (!canEditQuotation(quotation)) {
      alert("No tienes permiso para editar esta cotización.");
      return;
    }
    // Navigate to quotation form with quotation ID
    navigate(`/quotation-form/${quotation.id}`);
  };

  // Número: exacto (decisión 21-07). Nombre: búsqueda inteligente (sin
  // tildes, palabras en cualquier orden).
  const filteredQuotations = quotations.filter(
    (quotation) =>
      !searchTerm ||
      quotation.quotation_number?.toString() === searchTerm.trim() ||
      matchesSearch(searchTerm, quotation.clients?.name),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
        <button
          onClick={() => navigate("/quotation-form")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Nueva Cotización</span>
        </button>
      </div>

      {showViewer && viewingQuotation && (
        <QuotationViewer
          quotation={viewingQuotation}
          onClose={() => {
            setShowViewer(false);
            setViewingQuotation(null);
          }}
        />
      )}

      {showPaymentPlanEditor && quotationForPaymentPlan && (
        <PaymentPlanEditor
          quotation={{
            id: quotationForPaymentPlan.id,
            quotation_number:
              quotationForPaymentPlan.quotation_number.toString(),
            client_name: (
              quotationForPaymentPlan as unknown as {
                clients?: { name?: string };
              }
            ).clients?.name,
            total_amount: quotationForPaymentPlan.total_amount,
            event_date: quotationForPaymentPlan.event_date,
          }}
          onSave={handlePaymentPlanSave}
          onCancel={handlePaymentPlanCancel}
        />
      )}

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Buscar cotizaciones por número de cotización o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="min-w-[200px]">
            <MultiSelect
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Filtrar por estado"
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Lista de cotizaciones */}
      <div className="bg-white shadow rounded-lg overflow-hidden max-h-96 overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors w-20"
                onClick={() => handleSort("quotation_number")}
              >
                <div className="flex items-center space-x-2">
                  <span>Número</span>
                  <div className="flex flex-col">
                    {sortBy === "quotation_number" ? (
                      <span className="text-blue-600 font-bold text-lg">
                        {sortOrder === "asc" ? "▲" : "▼"}
                      </span>
                    ) : (
                      <span className="text-gray-500 font-semibold text-sm bg-gray-100 px-1 rounded">
                        ▲▼
                      </span>
                    )}
                  </div>
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Estado
              </th>
              <th
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors w-28"
                onClick={() => handleSort("event_date")}
              >
                <div className="flex items-center space-x-2">
                  <span>Fecha</span>
                  <div className="flex flex-col">
                    {sortBy === "event_date" ? (
                      <span className="text-blue-600 font-bold text-lg">
                        {sortOrder === "asc" ? "▲" : "▼"}
                      </span>
                    ) : (
                      <span className="text-gray-500 font-semibold text-sm bg-gray-100 px-1 rounded">
                        ▲▼
                      </span>
                    )}
                  </div>
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : filteredQuotations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No se encontraron cotizaciones
                </td>
              </tr>
            ) : (
              filteredQuotations.map((quotation) => (
                <tr key={quotation.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {quotation.quotation_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {quotation.clients.name.slice(0, 40) +
                      (quotation.clients.name.length > 40 ? "..." : "")}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      📋 Cotización
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${quotation.total_amount.toLocaleString()}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <select
                      value={quotation.quotation_status}
                      onChange={(e) =>
                        handleStatusChange(quotation.id, e.target.value)
                      }
                      className={`px-2 py-1 text-xs font-semibold rounded-full border-0 ${getStatusColor(quotation.quotation_status)}`}
                    >
                      <option value="solicitada">📋 Solicitada</option>
                      <option value="enviada">📤 Enviada</option>
                      <option value="en_negociacion">💬 En Negociación</option>
                      <option value="aceptada">✅ Aceptada</option>
                      <option value="rechazada">❌ Rechazada</option>
                      {(ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any) ||
                        quotation.quotation_status === "cancelada") && (
                        <option value="cancelada">🚫 Cancelada</option>
                      )}
                      {/* Realizada NO se elige desde aquí: solo el botón de
                          Post-Venta la declara (y envía la encuesta). La opción
                          existe únicamente para MOSTRAR el estado actual y
                          permitir revertirlo a Aceptada si fue un error. */}
                      {quotation.quotation_status === "realizada" && (
                        <option value="realizada">🎉 Realizada</option>
                      )}
                    </select>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatISOUTCDateToString(quotation.event_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewQuotation(quotation)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Ver cotización"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => {
                          handleEditQuotation(quotation);
                        }}
                        className={`${
                          canEditQuotation(quotation)
                            ? "text-gray-600 hover:text-gray-900"
                            : "text-gray-300 cursor-not-allowed"
                        }`}
                        title={
                          canEditQuotation(quotation)
                            ? "Editar cotización"
                            : "No tienes permiso para editar cotizaciones en estado 'Aceptada'"
                        }
                        disabled={!canEditQuotation(quotation)}
                      >
                        <Edit size={16} />
                      </button>
                      {ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any) && (
                        <button
                          onClick={() =>
                            handleDeleteQuotation(
                              quotation.id,
                              quotation.quotation_number.toString(),
                            )
                          }
                          className="text-red-600 hover:text-red-900"
                          title="Solo administradores pueden eliminar cotizaciones"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Tabla de Requerimientos para crear cotizaciones */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="bg-yellow-50 px-6 py-4 border-b border-yellow-200">
          <h2 className="text-lg font-medium text-yellow-800">
            Requerimientos Pendientes
          </h2>
          <p className="text-sm text-yellow-600">
            Requerimientos que pueden convertirse en cotizaciones
          </p>
        </div>
        <RequirementsForQuotations
          onCreateQuotation={handleCreateQuotationFromRequirement}
          requirements={requirements}
        />
      </div>
    </div>
  );
}

// Componente para mostrar requerimientos que pueden convertirse en cotizaciones
function RequirementsForQuotations({
  onCreateQuotation,
  requirements,
}: {
  onCreateQuotation: (id: string) => void;
  requirements: QuotationWithClient[];
}) {
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Número
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cliente
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tipo
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Personas
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
          {requirements.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                No hay requerimientos pendientes para crear cotizaciones
              </td>
            </tr>
          ) : (
            requirements.map((requirement) => (
              <tr key={requirement.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {requirement.quotation_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {requirement.clients.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {requirement.event_type || "No especificado"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {requirement.people_count}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    📋 Solicitada
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => onCreateQuotation(requirement.id)}
                    className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 flex items-center space-x-1"
                  >
                    <PlusCircle size={14} />
                    <span>Crear Cotización</span>
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
