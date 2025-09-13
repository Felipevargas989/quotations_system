import { useState } from "react";
import { Save, X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";

interface PaymentPlanEditorProps {
  quotation: {
    id: string;
    quotation_number: string;
    client_name: string;
    total_amount: number;
    event_date?: string;
  };
  onSave: (customPlan: any[]) => void;
  onCancel: () => void;
}

export default function PaymentPlanEditor({
  quotation,
  onSave,
  onCancel,
}: PaymentPlanEditorProps) {
  const [planType, setPlanType] = useState<
    "default" | "contado" | "three_payments" | "custom"
  >("default");
  const [customPayments, setCustomPayments] = useState([
    {
      payment_type: "Abono de Reserva",
      percentage: 50,
      days_before_event: 0,
      notes: "Pago de reserva - 50% del total",
    },
    {
      payment_type: "Pago Final",
      percentage: 50,
      days_before_event: 15,
      notes: "Pago final - 50% del total, 15 días antes del evento",
    },
  ]);
  const [customDueDates, setCustomDueDates] = useState<{
    [key: number]: string;
  }>({});

  const eventDate = quotation.event_date
    ? new Date(quotation.event_date)
    : addDays(new Date(), 30);
  const today = new Date();

  const addCustomPayment = () => {
    setCustomPayments((prev) => [
      ...prev,
      {
        payment_type: "Pago Regular",
        percentage: 0,
        days_before_event: 0,
        notes: "",
      },
    ]);
  };

  const removeCustomPayment = (index: number) => {
    setCustomPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCustomPayment = (index: number, field: string, value: any) => {
    setCustomPayments((prev) =>
      prev.map((payment, i) =>
        i === index ? { ...payment, [field]: value } : payment,
      ),
    );
  };

  const updateDueDate = (index: number, dueDate: string) => {
    setCustomDueDates((prev) => ({
      ...prev,
      [index]: dueDate,
    }));
  };

  const resetCustomDueDates = () => {
    setCustomDueDates({});
  };

  const getPresetPlan = () => {
    switch (planType) {
      case "contado":
        return [
          {
            payment_type: "Pago Único",
            percentage: 100,
            days_before_event: 0,
            notes: "Pago completo al contado",
          },
        ];

      case "three_payments":
        return [
          {
            payment_type: "Abono de Reserva",
            percentage: 40,
            days_before_event: 0,
            notes: "Pago de reserva - 40% del total",
          },
          {
            payment_type: "Segundo Pago",
            percentage: 40,
            days_before_event: 30,
            notes: "Segundo pago - 40% del total, 30 días antes del evento",
          },
          {
            payment_type: "Pago Final",
            percentage: 20,
            days_before_event: 7,
            notes: "Pago final - 20% del total, 7 días antes del evento",
          },
        ];

      case "default":
        return [
          {
            payment_type: "Abono de Reserva",
            percentage: 50,
            days_before_event: 0,
            notes: "Pago de reserva - 50% del total",
          },
          {
            payment_type: "Pago Final",
            percentage: 50,
            days_before_event: 15,
            notes: "Pago final - 50% del total, 15 días antes del evento",
          },
        ];

      case "custom":
        return customPayments;

      default:
        return [];
    }
  };

  const currentPlan = getPresetPlan();
  const totalPercentage = currentPlan.reduce(
    (sum, payment) => sum + payment.percentage,
    0,
  );

  const handleSave = () => {
    if (totalPercentage !== 100) {
      alert("El total de porcentajes debe ser 100%");
      return;
    }

    if (currentPlan.length === 0) {
      alert("Debe haber al menos un pago en el plan");
      return;
    }

    // Add custom due dates to the plan
    const planWithDueDates = currentPlan.map((payment, index) => {
      const defaultDueDate =
        payment.payment_type === "Pago Único" ||
        payment.payment_type === "Abono de Reserva"
          ? today
          : addDays(eventDate, -payment.days_before_event);

      const customDueDate = customDueDates[index];
      let dueDate;

      if (customDueDate) {
        const parsedCustomDate = new Date(customDueDate);
        if (!isNaN(parsedCustomDate.getTime())) {
          dueDate = parsedCustomDate;
        } else {
          console.error(
            `Invalid custom due date for payment ${index + 1}:`,
            customDueDate,
          );
          dueDate = defaultDueDate;
        }
      } else {
        dueDate = defaultDueDate;
      }

      const paymentWithDueDate = {
        ...payment,
        due_date: format(dueDate, "yyyy-MM-dd"),
      };

      // Ensure the due_date is properly set
      if (!paymentWithDueDate.due_date) {
        console.error(`No due_date set for payment ${index + 1}`);
      }

      return paymentWithDueDate;
    });
    onSave(planWithDueDates);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Editar Plan de Pagos
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {quotation.quotation_number} - {quotation.client_name}
              </p>
              <p className="text-lg font-bold text-green-600">
                Total: ${quotation.total_amount.toLocaleString()}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Selector de tipo de plan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Tipo de Plan de Pagos
            </label>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <button
                onClick={() => {
                  setPlanType("contado");
                  resetCustomDueDates();
                }}
                className={`p-3 border rounded-lg text-left ${
                  planType === "contado"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <div className="font-medium">Pago al Contado</div>
                <div className="text-sm text-gray-500">100% inmediato</div>
              </button>

              <button
                onClick={() => {
                  setPlanType("default");
                  resetCustomDueDates();
                }}
                className={`p-3 border rounded-lg text-left ${
                  planType === "default"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <div className="font-medium">Plan Estándar</div>
                <div className="text-sm text-gray-500">50% + 50%</div>
              </button>

              <button
                onClick={() => {
                  setPlanType("three_payments");
                  resetCustomDueDates();
                }}
                className={`p-3 border rounded-lg text-left ${
                  planType === "three_payments"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <div className="font-medium">Tres Pagos</div>
                <div className="text-sm text-gray-500">40% + 40% + 20%</div>
              </button>

              <button
                onClick={() => {
                  setPlanType("custom");
                  resetCustomDueDates();
                }}
                className={`p-3 border rounded-lg text-left ${
                  planType === "custom"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <div className="font-medium">Personalizado</div>
                <div className="text-sm text-gray-500">
                  Configurar manualmente
                </div>
              </button>
            </div>
          </div>

          {/* Editor de pagos personalizados */}
          {planType === "custom" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Pagos Personalizados
                </h3>
                <button
                  onClick={addCustomPayment}
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Plus size={16} />
                  <span>Agregar Pago</span>
                </button>
              </div>

              <div className="space-y-4">
                {customPayments.map((payment, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">
                        Pago {index + 1}
                      </h4>
                      {customPayments.length > 1 && (
                        <button
                          onClick={() => removeCustomPayment(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tipo de Pago
                        </label>
                        <input
                          type="text"
                          value={payment.payment_type}
                          onChange={(e) =>
                            updateCustomPayment(
                              index,
                              "payment_type",
                              e.target.value,
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Ej: Abono de Reserva"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Porcentaje (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={payment.percentage}
                          onChange={(e) =>
                            updateCustomPayment(
                              index,
                              "percentage",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Días antes del evento
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={payment.days_before_event}
                          onChange={(e) =>
                            updateCustomPayment(
                              index,
                              "days_before_event",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Monto
                        </label>
                        <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                          <span className="font-medium text-gray-900">
                            $
                            {Math.round(
                              (quotation.total_amount * payment.percentage) /
                                100,
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notas
                      </label>
                      <input
                        type="text"
                        value={payment.notes}
                        onChange={(e) =>
                          updateCustomPayment(index, "notes", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Descripción del pago..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vista previa del plan */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Vista Previa del Plan
              </h3>
              {planType !== "custom" && (
                <p className="text-sm text-gray-600">
                  💡 Puedes modificar las fechas de vencimiento haciendo clic en
                  ellas
                </p>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-700">
                        Tipo de Pago
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-700">
                        Porcentaje
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-700">
                        Monto
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-700">
                        Fecha Vencimiento
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPlan.map((payment, index) => {
                      const defaultDueDate =
                        payment.payment_type === "Pago Único" ||
                        payment.payment_type === "Abono de Reserva"
                          ? today
                          : addDays(eventDate, -payment.days_before_event);

                      const customDueDate = customDueDates[index];
                      const dueDate = customDueDate
                        ? new Date(customDueDate)
                        : defaultDueDate;

                      return (
                        <tr key={index} className="border-b border-gray-100">
                          <td className="py-2 px-3">{payment.payment_type}</td>
                          <td className="py-2 px-3 text-right">
                            {payment.percentage}%
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            $
                            {Math.round(
                              (quotation.total_amount * payment.percentage) /
                                100,
                            ).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {planType === "custom" ? (
                              <span>
                                {format(dueDate, "dd/MM/yyyy", { locale: es })}
                              </span>
                            ) : (
                              <div className="flex items-center justify-end space-x-2">
                                <input
                                  type="date"
                                  value={
                                    customDueDate ||
                                    format(defaultDueDate, "yyyy-MM-dd")
                                  }
                                  onChange={(e) =>
                                    updateDueDate(index, e.target.value)
                                  }
                                  className={`px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent ${
                                    customDueDate
                                      ? "border-blue-500 bg-blue-50"
                                      : "border-gray-300"
                                  }`}
                                  min={format(today, "yyyy-MM-dd")}
                                />
                                {customDueDate && (
                                  <span
                                    className="text-xs text-blue-600"
                                    title="Fecha modificada"
                                  >
                                    ✏️
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
                      <td className="py-2 px-3">TOTAL</td>
                      <td className="py-2 px-3 text-right">
                        {totalPercentage}%
                      </td>
                      <td className="py-2 px-3 text-right">
                        ${quotation.total_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {totalPercentage !== 100 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">
                    ⚠️ El total de porcentajes debe ser 100%. Actual:{" "}
                    {totalPercentage}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          {/* Warning message */}
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle size={16} className="text-yellow-600" />
              <p className="text-yellow-800 text-sm font-medium">
                ⚠️ Al aceptar este plan de pagos, la cotización será marcada
                como "Aceptada" y no podrá ser modificada.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={totalPercentage !== 100}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Save size={16} />
              <span>Aceptar Plan y Cotización</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
