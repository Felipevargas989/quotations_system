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
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import PaymentPlanEditor from "../components/PaymentPlanEditor";
import PaymentTransactionModal from "../components/PaymentTransactionModal";
import QuotationForm from "../components/QuotationForm";
import {
  PaymentWithTransactions,
  getPaymentsWithTransactions,
  deletePaymentTransaction,
} from "../services/paymentTransactions.service";
import {
  checkAndUpdateOverduePayments,
  deletePayment,
} from "../services/payments.service";
import { ROLE_GROUPS } from "../constants/permissions";

export default function PaymentsPage() {
  const { userRole } = useAuth();
  const [payments, setPayments] = useState<PaymentWithTransactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    requires_invoice: false,
    has_contract: false,
    notes: "",
  });
  // const [showPlanEditor, setShowPlanEditor] = useState(false);
  // const [selectedQuotation, setSelectedQuotation] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] =
    useState<PaymentWithTransactions | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    paid_date: "",
    payment_method: "",
    notes: "",
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
  const [updatingPayments, setUpdatingPayments] = useState(false);
  const [lastUpdateResult, setLastUpdateResult] = useState<{
    success: boolean;
    updatedCount: number;
    message: string;
  } | null>(null);

  const paymentMethods = [
    "Efectivo",
    "Transferencia bancaria",
    "Tarjeta de credito",
    "Deposito",
  ];

  useEffect(() => {
    loadPayments();
  }, [userRole]);

  const loadPayments = async () => {
    try {
      const { data: paymentsData } = await getPaymentsWithTransactions();
      setPayments(paymentsData);
    } catch (error) {
      console.error("Error loading payments:", error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpdateOverduePayments = async () => {
    alert("Not implemented yet");
    //   setUpdatingPayments(true);
    //   setLastUpdateResult(null);

    //   try {
    //     const result = await checkAndUpdateOverduePayments(companyId);

    //     if (result?.success) {
    //       setLastUpdateResult({
    //         success: true,
    //         updatedCount: result.updatedCount || 0,
    //         message:
    //           result.updatedCount > 0
    //             ? `✅ Se actualizaron ${result.updatedCount} pagos vencidos`
    //             : "✅ No se encontraron pagos vencidos",
    //       });

    //       // Reload payments to show updated statuses
    //       await loadPayments();
    //     } else {
    //       setLastUpdateResult({
    //         success: false,
    //         updatedCount: 0,
    //         message: "❌ Error al actualizar pagos vencidos",
    //       });
    //     }
    //   } catch (error) {
    //     console.error("Error in manual update:", error);
    //     setLastUpdateResult({
    //       success: false,
    //       updatedCount: 0,
    //       message: "❌ Error inesperado al actualizar pagos",
    //     });
    //   } finally {
    //     setUpdatingPayments(false);
    //   }
    // };

    // const createCustomPaymentPlan = async (
    //   quotationId: string,
    //   totalAmount: number,
    //   eventDate: string,
    //   customPlan: any[],
    // ) => {
    //   try {
    //     // Eliminar pagos existentes
    //     await supabase.from("payments").delete().eq("quotation_id", quotationId);

    //     const eventDateObj = new Date(eventDate);
    //     const today = new Date();

    //     const paymentsToCreate = customPlan.map((payment, index) => {
    //       let dueDate;

    //       if (
    //         payment.payment_type === "Pago Único" ||
    //         payment.payment_type === "Abono de Reserva"
    //       ) {
    //         dueDate = today;
    //       } else {
    //         dueDate = addDays(eventDateObj, -payment.days_before_event);
    //       }

    //       return {
    //         quotation_id: quotationId,
    //         payment_number: index + 1,
    //         amount: Math.round((totalAmount * payment.percentage) / 100),
    //         due_date: format(dueDate, "yyyy-MM-dd"),
    //         status: "pendiente",
    //         payment_type: payment.payment_type,
    //         notes: payment.notes || "",
    //       };
    //     });

    //     const { error } = await supabase
    //       .from("payments")
    //       .insert(paymentsToCreate);

    //     if (error) throw error;

    //     await loadPayments();
    //     return { success: true };
    //   } catch (error) {
    //     console.error("Error creating custom payment plan:", error);
    //     return { success: false, error };
    //   }
  };

  // const handleStatusChange = (
  //   payment: PaymentWithTransactions,
  //   newStatus: string,
  // ) => {
  //   if (newStatus === "pagado") {
  //     // Abrir modal para capturar fecha y medio de pago
  //     setSelectedPayment(payment);
  //     setPaymentForm({
  //       paid_date: new Date().toISOString().split("T")[0],
  //       payment_method: "",
  //       notes: payment.notes || "",
  //     });
  //     setShowPaymentModal(true);
  //   } else {
  //     // Cambiar directamente a pendiente o vencido
  //     updatePaymentStatus(payment.id, newStatus);
  //   }
  // };

  const updatePaymentStatus = async (
    paymentId: string,
    newStatus: string,
    paymentData?: any,
  ) => {
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === "pagado") {
        updateData.paid_date =
          paymentData?.paid_date || new Date().toISOString().split("T")[0];
        updateData.payment_method = paymentData?.payment_method || "";
        updateData.notes = paymentData?.notes || "";
      } else if (newStatus === "pendiente") {
        updateData.paid_date = null;
        updateData.payment_method = null;
      }

      const { error } = await supabase
        .from("payments")
        .update(updateData)
        .eq("id", paymentId);

      if (error) throw error;

      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, ...updateData } : p)),
      );

      alert(`✅ Estado del pago actualizado a: ${newStatus}`);
    } catch (error) {
      console.error("Error updating payment:", error);
      alert("Error al actualizar el pago");
    }
  };

  const updateQuotationDetails = async (quotationId: string) => {
    try {
      const { error } = await supabase
        .from("quotations")
        .update({
          requires_invoice: editForm.requires_invoice,
          has_contract: editForm.has_contract,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quotationId);

      if (error) throw error;

      // Actualizar el estado local
      setPayments((prev) =>
        prev.map((p) =>
          p.quotation_id === quotationId
            ? {
                ...p,
                quotations: p.quotations
                  ? {
                      ...p.quotations,
                      requires_invoice: editForm.requires_invoice,
                      has_contract: editForm.has_contract,
                    }
                  : p.quotations,
              }
            : p,
        ),
      );

      setEditingPayment(null);
      alert("✅ Detalles actualizados correctamente");
    } catch (error) {
      console.error("Error updating quotation details:", error);
      if (
        (error as any).message?.includes("column") &&
        (error as any).message?.includes("does not exist")
      ) {
        alert(
          '⚠️ Las columnas de facturación/contrato no existen aún. Ve a /admin y ejecuta "Configurar Base de Datos"',
        );
      } else {
        alert("❌ Error al actualizar los detalles: " + (error as any).message);
      }
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

    const matchesSearch =
      !searchTerm ||
      payment.quotations?.quotation_number?.toString() ===
        searchTerm.toLowerCase() ||
      payment.quotations?.client_name
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

  const handleSavePayment = async () => {
    if (!selectedPayment) return;

    if (!paymentForm.payment_method) {
      alert("Por favor selecciona un medio de pago");
      return;
    }

    await updatePaymentStatus(selectedPayment.id, "pagado", paymentForm);
    setShowPaymentModal(false);
    setSelectedPayment(null);
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
      // Fetch the quotation details
      const { data: quotation, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", payment.quotation_id)
        .eq("company_id", companyId)
        .single();

      if (error) throw error;
      if (!quotation) throw new Error("Cotización no encontrada");

      setEditingQuotation(quotation);
      setShowQuotationForm(true);
    } catch (error) {
      console.error("Error loading quotation for editing:", error);
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
          {/* Manual Update Overdue Payments Button */}
          <button
            onClick={handleManualUpdateOverduePayments}
            disabled={updatingPayments}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              updatingPayments
                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                : "bg-orange-600 text-white hover:bg-orange-700"
            }`}
            title="Verificar y actualizar pagos vencidos"
          >
            <Clock size={16} />
            <span>
              {updatingPayments ? "Actualizando..." : "Verificar Vencidos"}
            </span>
          </button>
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

      {/* Editor de Plan de Pagos */}
      {/* {showPlanEditor && selectedQuotation && (
        <PaymentPlanEditor
          quotation={selectedQuotation}
          onSave={async (customPlan) => {
            const result = await createCustomPaymentPlan(
              selectedQuotation.id,
              selectedQuotation.total_amount,
              selectedQuotation.event_date ||
                format(addDays(new Date(), 30), "yyyy-MM-dd"),
              customPlan,
            );
            if (result.success) {
              alert("✅ Plan de pagos personalizado creado exitosamente");
              setShowPlanEditor(false);
              setSelectedQuotation(null);
            } else {
              alert("❌ Error al crear el plan de pagos");
            }
          }}
          onCancel={() => {
            setShowPlanEditor(false);
            setSelectedQuotation(null);
          }}
        />
      )} */}

      {/* Modal para capturar fecha y medio de pago */}
      {showPaymentModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Registrar Pago
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {selectedPayment.quotations?.quotation_number} -{" "}
                {selectedPayment.payment_type}
              </p>
              <p className="text-lg font-bold text-green-600">
                ${selectedPayment.amount.toLocaleString()}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Pago *
                </label>
                <input
                  type="date"
                  value={paymentForm.paid_date}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      paid_date: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Medio de Pago *
                </label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      payment_method: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seleccionar medio de pago</option>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas (opcional)
                </label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Información adicional sobre el pago..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedPayment(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePayment}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Registrar Pago
              </button>
            </div>
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
        <div className="overflow-x-auto">
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

                  return (
                    <>
                      <tr key={payment.id} className="hover:bg-gray-50">
                        {/* Expand/Collapse */}
                        <td className="px-2 py-2 whitespace-nowrap">
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
                        </td>

                        {/* Cotización */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                          {payment.quotations?.quotation_number || "N/A"}
                        </td>

                        {/* Cliente */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 truncate max-w-24">
                          {payment.quotations?.client_name || "N/A"}
                        </td>

                        {/* Número de Pago */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 text-center">
                          <span className="font-medium ">
                            {payment.payment_number}
                          </span>
                        </td>

                        {/* Tipo de Pago */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          <span className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                            {payment.payment_type ||
                              `Cuota ${payment.payment_number}`}
                          </span>
                        </td>

                        {/* Fecha Vencimiento */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          {format(new Date(payment.due_date), "dd/MM/yy", {
                            locale: es,
                          })}
                        </td>

                        {/* Monto */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          <div className="text-center">
                            <div className="font-medium">
                              ${payment.amount.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              ${payment.paid_amount.toLocaleString()}
                            </div>
                          </div>
                        </td>

                        {/* Progreso */}
                        <td className="px-2 py-2 whitespace-nowrap">
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
                        </td>

                        {/* Estado */}
                        <td className="px-2 py-2 whitespace-nowrap">
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
                        </td>

                        {/* Facturación/Contrato */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          {editingPayment === payment.id ? (
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
                          ) : (
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
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="px-2 py-2 whitespace-nowrap text-xs font-medium">
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
                                    updateQuotationDetails(payment.quotation_id)
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
                                      payment.quotations?.has_contract || false,
                                    notes: payment.notes || "",
                                  });
                                }}
                                className="text-gray-600 hover:text-gray-900"
                                title="Editar facturación y contrato"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Transactions Row */}
                      {isExpanded && (
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
