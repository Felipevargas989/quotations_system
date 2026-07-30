import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Plus, Search } from "lucide-react";
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
  getQuotationById,
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
import { matchesSearch, normalizeText } from "../../utils/searchMatch";
import { formatPhone } from "../../utils/phone";

// Persist the quotations status filter per user, so the selection survives
// reloads / navigation instead of resetting to the default each time.
const STATUS_FILTER_KEY = (userId: string | number) =>
  `eventia_quotations_status_filter_${userId}`;
// El orden elegido también se recuerda por usuario (pedido de Felipe
// 30-07: "si ordeno por fecha de evento, que se acuerde" — igual que
// Post-Venta).
const SORT_KEY = (userId: string | number) =>
  `eventia_quotations_sort_${userId}`;

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
      const savedSort = localStorage.getItem(SORT_KEY(user.id));
      if (savedSort) {
        const s = JSON.parse(savedSort) as {
          by?: string;
          order?: string;
        };
        if (s.by === "quotation_number" || s.by === "event_date") {
          setSortBy(s.by);
        }
        if (s.order === "asc" || s.order === "desc") {
          setSortOrder(s.order);
        }
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
    setFilterRestored(true);
  }, [user]);

  // Persist the chosen sort (after restore, like the filter).
  useEffect(() => {
    if (!user || !filterRestored) return;
    try {
      localStorage.setItem(
        SORT_KEY(user.id),
        JSON.stringify({ by: sortBy, order: sortOrder }),
      );
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [sortBy, sortOrder, user, filterRestored]);

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

  // Contacto de la fila: el MANDANTE de la cotización con su propio
  // teléfono (misma regla que Post-Venta); sin mandante guardado → el
  // contacto principal del cliente.
  const contactOf = (q: QuotationWithClient) => {
    const c = q.clients as unknown as {
      contact_person?: string;
      phone?: string;
      client_contacts?: { name: string; phone?: string }[];
    };
    const mandante = (
      q as unknown as { contact_name?: string | null }
    ).contact_name?.trim();
    if (mandante) {
      const match = (c?.client_contacts || []).find(
        (ct) => normalizeText(ct.name) === normalizeText(mandante),
      );
      return { name: mandante, phone: match?.phone || "" };
    }
    return { name: c?.contact_person || "", phone: c?.phone || "" };
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
      // FASE VELOCIDAD Etapa 3 (28-07): la lista ya no viaja con los
      // items (dieta de 93→15 KB) — el visor pide la cotización
      // completa recién cuando alguien la abre.
      const { data } = await getQuotationById(String(quotation.id));
      const quotationWithItems = {
        ...quotation,
        ...(data || {}),
        items: data?.items || [],
      };
      setViewingQuotation(quotationWithItems);
      setShowViewer(true);
    } catch (error) {
      console.error("Error loading quotation details:", error);
      alert("Error al cargar los detalles de la cotización");
    }
  };

  // Fila clickeable (patrón Post-Venta): con permiso → edición; sin
  // permiso (aceptadas para roles no operativos) → visor de solo lectura.
  // El click siempre hace algo útil, sin avisos de permiso.
  const handleRowClick = (quotation: QuotationWithClient) => {
    if (canEditQuotation(quotation)) {
      navigate(`/quotation-form/${quotation.id}`);
    } else {
      handleViewQuotation(quotation);
    }
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
        <div className="flex items-center gap-3">
          {/* Requerimientos pendientes: aviso junto al botón (la tabla de
              abajo se eliminó; la conversión vive en su módulo). */}
          {requirements.length > 0 && (
            <button
              onClick={() => navigate("/requests")}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-100"
              title="Ir al módulo de Requerimientos"
            >
              <AlertTriangle size={16} className="text-amber-500" />
              {requirements.length} requerimiento
              {requirements.length === 1 ? "" : "s"} pendiente
              {requirements.length === 1 ? "" : "s"}
            </button>
          )}
          <button
            onClick={() => navigate("/quotation-form")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Nueva Cotización</span>
          </button>
        </div>
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

      {/* Lista de cotizaciones — mismo esquema visual que Post-Venta
          (coherencia del sistema, acordado 22-07): fila clickeable con
          chevron, columna Estado (píldora-selector, click aislado) y
          "Ver" azul para el visor. Eliminar vive en el formulario. */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Cotizaciones</h2>
          <span className="text-sm text-gray-500">
            {filteredQuotations.length} de {quotations.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => handleSort("quotation_number")}
                >
                  N° Cot.{" "}
                  {sortBy === "quotation_number"
                    ? sortOrder === "asc"
                      ? "▲"
                      : "▼"
                    : ""}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => handleSort("event_date")}
                >
                  Fecha evento{" "}
                  {sortBy === "event_date"
                    ? sortOrder === "asc"
                      ? "▲"
                      : "▼"
                    : ""}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3" />
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : filteredQuotations.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No se encontraron cotizaciones
                  </td>
                </tr>
              ) : (
                filteredQuotations.map((quotation) => {
                  const contact = contactOf(quotation);
                  const clientType = (
                    quotation.clients as unknown as { client_type?: string }
                  )?.client_type;
                  const endDate = (
                    quotation as unknown as { event_end_date?: string | null }
                  )?.event_end_date;
                  return (
                    <tr
                      key={quotation.id}
                      onClick={() => handleRowClick(quotation)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                        #{quotation.quotation_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatISOUTCDateToString(quotation.event_date)}
                        </div>
                        {endDate && String(endDate) !== String(quotation.event_date) && (
                          <div className="text-xs text-gray-500">
                            al {formatISOUTCDateToString(endDate)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {quotation.clients.name.slice(0, 40) +
                            (quotation.clients.name.length > 40 ? "..." : "")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {clientType || ""}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {contact.name || "—"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatPhone(contact.phone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ${quotation.total_amount.toLocaleString("es-CL")}
                      </td>
                      {/* Click aislado: cambiar el estado no abre la fila */}
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={quotation.quotation_status}
                          onChange={(e) =>
                            handleStatusChange(quotation.id, e.target.value)
                          }
                          className={`px-2 py-1 text-xs font-semibold rounded-full border-0 ${getStatusColor(quotation.quotation_status)}`}
                        >
                          <option value="solicitada">📋 Solicitada</option>
                          <option value="enviada">📤 Enviada</option>
                          <option value="en_negociacion">
                            💬 En Negociación
                          </option>
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
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleViewQuotation(quotation)}
                          className="text-sm font-semibold text-blue-600 hover:underline"
                          title="Ver cotización (solo lectura)"
                        >
                          Ver
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        <ChevronRight size={18} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
