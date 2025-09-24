import { useState, useEffect } from "react";
import { Plus, Search, Edit, Trash2, Eye, PlusCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import QuotationForm from "../components/QuotationForm";
import QuotationViewer from "../components/QuotationViewer";
import { ROLE_GROUPS } from "../constants/permissions";
import PaymentPlanEditor from "../components/PaymentPlanEditor";
import {
  Quotation,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../types/quotations.types";
import {
  deleteQuotation,
  getQuotationById,
  getQuotations,
  updateQuotation,
} from "../services/quotations.service";
import {
  createPaymentPlan,
  getPaymentsByQuotationId,
} from "../services/payments.service";
import { CreatePayment } from "../types/payments.types";
import { formatISOUTCDateToString } from "../utils/dates";

export default function QuotationsPage() {
  const { user, userRole } = useAuth();
  const [quotations, setQuotations] = useState<QuotationWithClient[]>([]);
  const [requirements, setRequirements] = useState<QuotationWithClient[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showViewer, setShowViewer] = useState(false);
  const [viewingQuotation, setViewingQuotation] =
    useState<QuotationWithClient | null>(null);
  const [creatingFromRequirement, setCreatingFromRequirement] = useState<
    string | null
  >(null);
  const [showPaymentPlanEditor, setShowPaymentPlanEditor] = useState(false);
  const [quotationForPaymentPlan, setQuotationForPaymentPlan] =
    useState<Quotation | null>(null);

  useEffect(() => {
    fetchQuotations(statusFilter);
    fetchRequirements();
  }, [user]);

  // Refetch quotations when status filter changes
  useEffect(() => {
    if (user) {
      fetchQuotations(statusFilter);
    }
  }, [statusFilter]);

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

  const fetchQuotations = async (statusFilter?: string) => {
    if (!user) return;

    try {
      // Determine which statuses to fetch based on the filter
      let statusesToFetch: QuotationStatus[];

      if (statusFilter === "all" || !statusFilter) {
        // Fetch all quotation statuses
        statusesToFetch = [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
          QuotationStatus.ACEPTADA,
        ];
      } else {
        // Fetch only the selected status
        statusesToFetch = [statusFilter as QuotationStatus];
      }

      const { data } = await getQuotations(
        QuotationRequestType.COTIZACION,
        statusesToFetch,
      );

      // Set quotations data
      setQuotations(data);
    } catch (error) {
      console.error("Error fetching quotations:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await fetchQuotations(statusFilter);
    await fetchRequirements();
  };

  const fetchRequirements = async () => {
    if (!user) return;

    try {
      // Requirements don't need status filtering, they are always "solicitada"
      const { data } = await getQuotations(QuotationRequestType.REQUERIMIENTO, [
        QuotationStatus.SOLICITADA,
      ]);
      setRequirements(data);
    } catch (error) {
      console.error("Error fetching requirements:", error);
    }
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

      // // Obtener los datos del requerimiento
      const { data: requirement, error } =
        await getQuotationById(requirementId);

      if (error) throw error;
      if (!requirement) throw new Error("Requerimiento no encontrado");

      setEditingQuotation(requirement);
      setCreatingFromRequirement(requirementId);
      setShowForm(true);
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
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleStatusChange = async (quotationId: string, newStatus: string) => {
    try {
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

      alert(`✅ Estado actualizado correctamente a: ${newStatus}`);
      await fetchQuotations(statusFilter);
      await fetchRequirements();
    } catch (error) {
      alert(
        `Error al actualizar el estado: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
      await fetchQuotations(statusFilter);
    }
  };

  const handlePaymentPlanSave = async (customPlan: any[]) => {
    if (!quotationForPaymentPlan) return;

    try {
      // Create payments
      const eventDateObj = quotationForPaymentPlan.event_date
        ? new Date(quotationForPaymentPlan.event_date)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const today = new Date();

      // create payments array
      const paymentsToCreate = customPlan.map((payment, index) => {
        let dueDate;

        // Use custom due_date if provided, otherwise calculate based on plan
        if (payment.due_date) {
          dueDate = new Date(payment.due_date);
        } else if (
          payment.payment_type === "Pago Único" ||
          payment.payment_type === "Abono de Reserva"
        ) {
          dueDate = today;
        } else {
          dueDate = new Date(
            eventDateObj.getTime() -
              payment.days_before_event * 24 * 60 * 60 * 1000,
          );
        }

        const paymentToCreate: CreatePayment = {
          quotation_id: quotationForPaymentPlan.id,
          payment_number: index + 1,
          amount: Math.round(
            (quotationForPaymentPlan.total_amount * payment.percentage) / 100,
          ),
          due_date: dueDate,
          status: "pendiente",
          payment_type: payment.payment_type,
          notes: payment.notes || "",
        };
        return paymentToCreate;
      });

      // call API reques to create paymet plan
      await createPaymentPlan(quotationForPaymentPlan.id, paymentsToCreate);

      alert("✅ Plan de pagos creado y cotización aceptada exitosamente");
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
    console.log(
      "Editando cotización:",
      quotation.quotation_number,
      "ID:",
      quotation.id,
    );
    loadQuotationForEditing(quotation);
  };

  const loadQuotationForEditing = async (quotation: QuotationWithClient) => {
    try {
      // Items are now stored in the JSON field, no need to fetch from quotation_items
      const quotationWithItems: QuotationWithClient = {
        ...quotation,
        items: quotation.items || [],
        clients: quotation.clients,
      };
      setEditingQuotation(quotationWithItems);
      setCreatingFromRequirement(null); // Asegurar que no esté en modo "desde requerimiento"
      setShowForm(true);
    } catch (error) {
      alert("Error al cargar la cotización para editar");
    }
  };

  // Si está mostrando el formulario, renderizar solo el formulario
  if (showForm) {
    return (
      <QuotationForm
        quotation={editingQuotation}
        isFromRequirement={!!creatingFromRequirement}
        onSave={() => {
          setShowForm(false);
          setEditingQuotation(null);
          setCreatingFromRequirement(null);
          refreshData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
        <button
          onClick={() => setShowForm(true)}
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
              placeholder="Buscar cotizaciones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos los estados</option>
            <option value="solicitada">📋 Solicitada</option>
            <option value="enviada">📤 Enviada</option>
            <option value="en_negociacion">💬 En Negociación</option>
            <option value="aceptada">✅ Aceptada</option>
            <option value="rechazada">❌ Rechazada</option>
          </select>
        </div>
      </div>

      {/* Lista de cotizaciones */}
      <div className="bg-white shadow rounded-lg overflow-hidden max-h-96 overflow-y-auto">
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
                Total
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
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
            ) : quotations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No se encontraron cotizaciones
                </td>
              </tr>
            ) : (
              quotations.map((quotation) => (
                <tr key={quotation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {quotation.quotation_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {quotation.clients.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      📋 Cotización
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${quotation.total_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
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
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
