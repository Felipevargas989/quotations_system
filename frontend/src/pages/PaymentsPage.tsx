import { useState, useEffect } from "react";
import {
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Edit2,
  Save,
  X,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  FileEdit,
  Trash2,
  ArrowLeftCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import PaymentTransactionModal from "../components/PaymentTransactionModal";
import QuotationForm from "./quotations/QuotationForm";
import {
  PaymentWithTransactions,
  getPaymentsWithTransactions,
  deletePaymentTransaction,
} from "../services/paymentTransactions.service";
import { deletePayment } from "../services/payments.service";
import { ROLE_GROUPS } from "../constants/permissions";
import { updateQuotation } from "../services/quotations.service";
import { useNavigate } from "react-router-dom";
import { getRefunds } from "../services/refunds.service";

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [payments, setPayments] = useState<PaymentWithTransactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    requires_invoice: false,
    has_contract: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [selectedPaymentForTransaction, setSelectedPaymentForTransaction] =
    useState<PaymentWithTransactions | null>(null);
  const [selectedTransactionForEdit, setSelectedTransactionForEdit] =
    useState<any>(null);
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(
    new Set(),
  );
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any>(null);
  const [lastUpdateResult, setLastUpdateResult] = useState<{
    success: boolean;
    updatedCount: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadPayments();
  }, [userRole]);

  const loadPayments = async () => {
    try {
      const { data: paymentsData } = await getPaymentsWithTransactions();
      const { data: refundsData } = await getRefunds();

      // Transform refunds to match payment structure
      const transformedRefunds =
        refundsData?.map((refund: any) => ({
          id: refund.id,
          amount: refund.amount,
          paid_amount: 0,
          status: "",
          payment_number: 0,
          payment_type: "Reembolso comprometido",
          due_date: new Date().toISOString(),
          quotation_id: refund.quotation_id,
          quotations: refund.quotations,
          transactions: [],
          payment_count: 0,
          isRefund: true, // Marker to identify refunds
        })) || [];
      // Merge payments and refunds
      setPayments([...paymentsData, ...transformedRefunds]);
    } catch (error) {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const updateQuotationDetails = async (quotationId: string) => {
    try {
      const { error } = await updateQuotation(
        {
          requires_invoice: editForm.requires_invoice,
          has_contract: editForm.has_contract,
        },
        quotationId,
      );

      if (error) throw error;

      alert("✅ Detalles actualizados correctamente");
      await loadPayments();

      setEditingPayment(null);
    } catch (error) {
      alert("❌ Error al actualizar los detalles: " + (error as any).message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pendiente":
        return "bg-yellow-100 text-yellow-800";
      case "pagado":
        return "bg-green-100 text-green-800";
      case "vencido":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const filteredPayments = payments.filter((payment) => {
    const matchesStatus =
      statusFilter === "all" || payment.status === statusFilter;

    // TODO: implement this search
    const matchesSearch =
      !searchTerm ||
      payment.quotations?.quotation_number?.toString() ===
        searchTerm.toLowerCase() ||
      payment.quotations?.clients?.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const totalPendiente = payments
    .filter((p) => p.status === "pendiente")
    .reduce((sum, p) => sum + (p.amount - p.paid_amount), 0);

  const totalPagado = payments.reduce((sum, p) => sum + p.paid_amount, 0);

  const totalVencido = payments
    .filter((p) => p.status === "vencido")
    .reduce((sum, p) => sum + (p.amount - p.paid_amount), 0);

  const toggleExpandedPayment = (paymentId: string) => {
    const newExpanded = new Set(expandedPayments);
    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId);
    } else {
      newExpanded.add(paymentId);
    }
    setExpandedPayments(newExpanded);
  };

  const getPaymentProgress = (payment: PaymentWithTransactions) => {
    return (payment.paid_amount / payment.amount) * 100;
  };

  const handleEditTransaction = (
    payment: PaymentWithTransactions,
    transaction: any,
  ) => {
    setSelectedPaymentForTransaction(payment);
    setSelectedTransactionForEdit(transaction);
    setShowTransactionModal(true);
  };

  const handleDeleteTransaction = async (
    payment: PaymentWithTransactions,
    transaction: any,
  ) => {
    // Check if user is administrator
    if (!userRole || !ROLE_GROUPS.ADMIN_ONLY.includes(userRole)) {
      alert(
        "❌ Solo los administradores pueden eliminar transacciones de pago",
      );
      return;
    }

    if (
      !confirm(
        `¿Estás seguro de que quieres eliminar esta transacción de $${transaction.amount.toLocaleString()}?`,
      )
    ) {
      return;
    }

    try {
      await deletePaymentTransaction(transaction.id);
      alert("✅ Transacción eliminada correctamente");
      await loadPayments(); // Reload payments to update the data
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("❌ Error al eliminar la transacción");
    }
  };

  const handleDeletePayment = async (payment: PaymentWithTransactions) => {
    // Check if user is administrator
    if (!userRole || !ROLE_GROUPS.ADMIN_ONLY.includes(userRole)) {
      alert("❌ Solo los administradores pueden eliminar pagos");
      return;
    }

    const transactionCount = payment.transactions.length;
    const totalPaid = payment.paid_amount;

    let confirmMessage = `¿Estás seguro de que quieres eliminar el pago #${payment.payment_number}?`;
    if (transactionCount > 0) {
      confirmMessage += `\n\nEste pago tiene ${transactionCount} transacción(es) registrada(s) por un total de $${totalPaid.toLocaleString()}.`;
    }
    confirmMessage += "\n\nEsta acción no se puede deshacer.";

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const result = await deletePayment(payment.id, payment.transactions);

      if (result.success) {
        alert("✅ Pago y transacciones eliminados correctamente");
        await loadPayments(); // Reload payments to update the data
      } else {
        throw result.error;
      }
    } catch (error) {
      console.error("Error deleting payment:", error);
      alert("❌ Error al eliminar el pago");
    }
  };

  const handleEditQuotationFromPayment = async (
    payment: PaymentWithTransactions,
  ) => {
    try {
      navigate(`/quotation-form/${payment.quotation_id}`);
    } catch (error) {
      alert("Error al cargar la cotización para editar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Si está mostrando el formulario de cotización, renderizar solo el formulario
  if (showQuotationForm && editingQuotation) {
    return (
      <QuotationForm
        quotation={editingQuotation}
        onSave={() => {
          setShowQuotationForm(false);
          setEditingQuotation(null);
          loadPayments();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Pagos</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Buscar por cotización o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos los pagos</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="pagado">✅ Pagados</option>
            <option value="vencido">⚠️ Vencidos</option>
          </select>
        </div>
      </div>

      {/* Notification for manual update result */}
      {lastUpdateResult && (
        <div
          className={`p-4 rounded-lg border ${
            lastUpdateResult.success
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{lastUpdateResult.message}</span>
            <button
              onClick={() => setLastUpdateResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal para transacciones de pago */}
      {showTransactionModal && selectedPaymentForTransaction && (
        <PaymentTransactionModal
          payment={selectedPaymentForTransaction}
          transaction={selectedTransactionForEdit}
          onSave={() => {
            setShowTransactionModal(false);
            setSelectedPaymentForTransaction(null);
            setSelectedTransactionForEdit(null);
            loadPayments();
          }}
          onCancel={() => {
            setShowTransactionModal(false);
            setSelectedPaymentForTransaction(null);
            setSelectedTransactionForEdit(null);
          }}
        />
      )}

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 ">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">
                ${totalPendiente.toLocaleString()}
              </p>
            </div>
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pagados</p>
              <p className="text-2xl font-bold text-green-600">
                ${totalPagado.toLocaleString()}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Vencidos</p>
              <p className="text-2xl font-bold text-red-600">
                ${totalVencido.toLocaleString()}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total General</p>
              <p className="text-2xl font-bold text-blue-600">
                $
                {(totalPendiente + totalPagado + totalVencido).toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Tabla de pagos */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-6">
                  {/* Expand/Collapse */}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Cot.
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  Cliente
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  Pago #
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Tipo
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Vencimiento
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Monto
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Prog.
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Estado
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  <div className="leading-tight text-xs">
                    Fact./
                    <br />
                    Bol.
                  </div>
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center"
                    colSpan={11}
                  >
                    No hay pagos registrados
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const isExpanded = expandedPayments.has(payment.id);
                  const paymentStatus = payment.status;
                  const progress = getPaymentProgress(payment);
                  const remainingAmount = payment.amount - payment.paid_amount;
                  const isRefund = (payment as any).isRefund;

                  return (
                    <>
                      <tr key={payment.id} className="hover:bg-gray-50">
                        {/* Expand/Collapse */}
                        <td className="px-2 py-2 whitespace-nowrap">
                          {isRefund ? (
                            <ArrowLeftCircle
                              size={16}
                              className="text-orange-500"
                            />
                          ) : (
                            <button
                              onClick={() => toggleExpandedPayment(payment.id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                          )}
                        </td>

                        {/* Cotización */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                          {payment.quotations?.quotation_number || "N/A"}
                        </td>

                        {/* Cliente */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 truncate max-w-24">
                          {payment.quotations?.clients?.name || "N/A"}
                        </td>

                        {/* Número de Pago */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 text-center">
                          {!isRefund && (
                            <span className="font-medium ">
                              {payment.payment_number}
                            </span>
                          )}
                        </td>

                        {/* Tipo de Pago */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          <span
                            className={`px-1 py-0.5 rounded text-xs ${
                              isRefund
                                ? "bg-orange-100 text-orange-800 font-semibold"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {payment.payment_type ||
                              `Cuota ${payment.payment_number}`}
                          </span>
                        </td>

                        {/* Fecha Vencimiento */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          {!isRefund &&
                            format(new Date(payment.due_date), "dd/MM/yy", {
                              locale: es,
                            })}
                        </td>

                        {/* Monto */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          <div className="text-center">
                            <div className="font-medium">
                              ${payment.amount.toLocaleString()}
                            </div>
                            {!isRefund && (
                              <div className="text-xs text-gray-500">
                                ${payment.paid_amount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Progreso */}
                        <td className="px-2 py-2 whitespace-nowrap">
                          {!isRefund && (
                            <div className="w-12">
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    progress === 100
                                      ? "bg-green-500"
                                      : progress > 0
                                        ? "bg-yellow-500"
                                        : "bg-gray-300"
                                  }`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <div className="text-xs text-gray-600 text-center">
                                {progress.toFixed(0)}%
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Estado */}
                        <td className="px-2 py-2 whitespace-nowrap">
                          {!isRefund && (
                            <>
                              <span
                                className={`px-1 py-0.5 text-xs font-semibold rounded ${getStatusColor(paymentStatus)}`}
                              >
                                {paymentStatus.charAt(0).toUpperCase() +
                                  paymentStatus.slice(1)}
                              </span>
                              {payment.payment_count > 0 && (
                                <div className="text-xs text-gray-600">
                                  {payment.payment_count} pago
                                  {payment.payment_count > 1 ? "s" : ""}
                                </div>
                              )}
                            </>
                          )}
                        </td>

                        {/* Facturación/Contrato */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          {!isRefund && editingPayment === payment.id ? (
                            <div className="space-y-1">
                              <label className="flex items-center space-x-1">
                                <input
                                  type="checkbox"
                                  checked={editForm.requires_invoice}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      requires_invoice: e.target.checked,
                                    }))
                                  }
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="text-xs text-gray-700">
                                  📄 Factura
                                </span>
                              </label>
                              <label className="flex items-center space-x-1">
                                <input
                                  type="checkbox"
                                  checked={editForm.has_contract}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      has_contract: e.target.checked,
                                    }))
                                  }
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="text-xs text-gray-700">
                                  📋 Boleta
                                </span>
                              </label>
                            </div>
                          ) : !isRefund ? (
                            <div className="space-y-1">
                              <div className="flex items-center space-x-1">
                                {payment.quotations?.requires_invoice ? (
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                ) : (
                                  <div className="h-3 w-3 border border-gray-300 rounded"></div>
                                )}
                                <span className="text-xs text-gray-600">
                                  📄 Factura
                                </span>
                              </div>
                              <div className="flex items-center space-x-1">
                                {payment.quotations?.has_contract ? (
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                ) : (
                                  <div className="h-3 w-3 border border-gray-300 rounded"></div>
                                )}
                                <span className="text-xs text-gray-600">
                                  📋 Boleta
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </td>

                        {/* Acciones */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs font-medium">
                          {!isRefund && (
                            <div className="flex space-x-1">
                              {/* Add Payment Transaction Button */}
                              {remainingAmount > 0 && (
                                <button
                                  onClick={() => {
                                    setSelectedPaymentForTransaction(payment);
                                    setShowTransactionModal(true);
                                  }}
                                  className="text-blue-600 hover:text-blue-900"
                                  title="Agregar pago"
                                >
                                  <Plus size={14} />
                                </button>
                              )}

                              {/* Edit Quotation Button */}
                              <button
                                onClick={() =>
                                  handleEditQuotationFromPayment(payment)
                                }
                                className="text-purple-600 hover:text-purple-900"
                                title="Editar cotización"
                              >
                                <FileEdit size={14} />
                              </button>

                              {/* Delete Payment Button */}
                              {userRole &&
                                ROLE_GROUPS.ADMIN_ONLY.includes(userRole) && (
                                  <button
                                    onClick={() => handleDeletePayment(payment)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Eliminar pago"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}

                              {/* Edit Button */}
                              {editingPayment === payment.id ? (
                                <>
                                  <button
                                    onClick={() =>
                                      updateQuotationDetails(
                                        payment.quotation_id,
                                      )
                                    }
                                    className="text-green-600 hover:text-green-900"
                                    title="Guardar cambios"
                                  >
                                    <Save size={14} />
                                  </button>
                                  <button
                                    onClick={() => setEditingPayment(null)}
                                    className="text-gray-600 hover:text-gray-900"
                                    title="Cancelar"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingPayment(payment.id);
                                    setEditForm({
                                      requires_invoice:
                                        payment.quotations?.requires_invoice ||
                                        false,
                                      has_contract:
                                        payment.quotations?.has_contract ||
                                        false,
                                    });
                                  }}
                                  className="text-gray-600 hover:text-gray-900"
                                  title="Editar facturación y contrato"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Transactions Row */}
                      {isExpanded && !isRefund && (
                        <tr
                          key={`${payment.id}-transactions`}
                          className="bg-gray-50"
                        >
                          <td colSpan={10} className="px-6 py-4">
                            <div className="space-y-4">
                              <h4 className="font-medium text-gray-900">
                                Transacciones de Pago - {payment.payment_type}
                              </h4>

                              {payment.transactions.length === 0 ? (
                                <p className="text-gray-500 text-sm">
                                  No hay transacciones registradas
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-white">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Fecha
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Monto
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Método
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Comprobante
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Notas
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Acciones
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {payment.transactions.map(
                                        (transaction) => (
                                          <tr
                                            key={transaction.id}
                                            className="hover:bg-gray-50"
                                          >
                                            <td className="px-4 py-2 text-sm text-gray-900">
                                              {format(
                                                new Date(
                                                  transaction.transaction_date,
                                                ),
                                                "dd/MM/yyyy",
                                                { locale: es },
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                              $
                                              {transaction.amount.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-900">
                                              {transaction.payment_method}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-900">
                                              {transaction.receipt_photo_url ? (
                                                <div className="flex items-center space-x-2">
                                                  <img
                                                    src={
                                                      transaction.receipt_photo_url
                                                    }
                                                    alt="Comprobante"
                                                    className="w-8 h-8 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80"
                                                    onClick={() =>
                                                      window.open(
                                                        transaction.receipt_photo_url,
                                                        "_blank",
                                                      )
                                                    }
                                                    title="Haz clic para ver la imagen completa"
                                                  />
                                                  <span className="text-xs text-blue-600">
                                                    Ver
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-gray-400 text-xs">
                                                  Sin comprobante
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-900">
                                              <div className="flex items-center space-x-2">
                                                <span className="flex-1">
                                                  {transaction.notes || "-"}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-900">
                                              <div className="flex items-center space-x-2">
                                                <button
                                                  onClick={() =>
                                                    handleEditTransaction(
                                                      payment,
                                                      transaction,
                                                    )
                                                  }
                                                  className="text-blue-600 hover:text-blue-900"
                                                  title="Editar transacción"
                                                >
                                                  <Edit2 size={14} />
                                                </button>
                                                {userRole &&
                                                  ROLE_GROUPS.ADMIN_ONLY.includes(
                                                    userRole,
                                                  ) && (
                                                    <button
                                                      onClick={() =>
                                                        handleDeleteTransaction(
                                                          payment,
                                                          transaction,
                                                        )
                                                      }
                                                      className="text-red-600 hover:text-red-900"
                                                      title="Eliminar transacción"
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  )}
                                              </div>
                                            </td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
