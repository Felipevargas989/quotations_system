import { useState } from "react";
import { Save, X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { NumberInput } from "./inputs";

// Plan de pagos al aceptar: una lista simple de cuotas — comentario, fecha y
// MONTO en pesos (el % se calcula solo, informativo). Parte con una sola
// cuota por el total: el caso "una cuota" es solo apretar Aceptar. Sin
// plantillas preseteadas: rara vez le achuntaban a la realidad.

interface PlanRow {
  label: string;
  due_date: string;
  amount: number | undefined;
}

interface PaymentPlanEditorProps {
  readonly quotation: {
    id: string;
    quotation_number: string;
    client_name?: string;
    total_amount: number;
    event_date?: Date;
  };
  readonly onSave: (
    plan: { payment_type: string; amount: number; due_date: string; notes: string }[],
  ) => void;
  readonly onCancel: () => void;
}

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

export default function PaymentPlanEditor({
  quotation,
  onSave,
  onCancel,
}: PaymentPlanEditorProps) {
  const total = quotation.total_amount || 0;
  const today = format(new Date(), "yyyy-MM-dd");
  const eventDateTxt = quotation.event_date
    ? new Date(quotation.event_date).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  const [rows, setRows] = useState<PlanRow[]>([
    { label: "Cuota 1", due_date: today, amount: total },
  ]);

  const suma = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const diff = total - suma; // >0 falta asignar · <0 sobra
  const pct = (amount: number | undefined) =>
    total > 0 ? Math.round(((amount || 0) / total) * 1000) / 10 : 0;

  const updateRow = (i: number, patch: Partial<PlanRow>) =>
    setRows((prev) => prev.map((r, ix) => (ix === i ? { ...r, ...patch } : r)));

  // La cuota nueva nace con lo que falta por asignar (si hay algo).
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        label: `Cuota ${prev.length + 1}`,
        due_date: today,
        amount: diff > 0 ? diff : undefined,
      },
    ]);

  const removeRow = (i: number) =>
    setRows((prev) => prev.filter((_, ix) => ix !== i));

  const rowsValid = rows.every(
    (r) => (r.amount || 0) > 0 && r.due_date && r.label.trim(),
  );
  const canSave = rows.length > 0 && rowsValid && diff === 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave(
      rows.map((r) => ({
        payment_type: r.label.trim(),
        amount: Math.round(r.amount || 0),
        due_date: r.due_date,
        notes: "",
      })),
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Plan de pagos
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Cotización #{quotation.quotation_number}
                {quotation.client_name ? ` · ${quotation.client_name}` : ""}
                {eventDateTxt ? ` · Evento: ${eventDateTxt}` : ""}
              </p>
              <p className="text-lg font-bold text-green-600">
                Total: {clp(total)}
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

        <div className="p-6 space-y-3">
          {/* Encabezados de la lista */}
          <div className="grid grid-cols-[1fr,150px,150px,64px,32px] gap-2 px-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Comentario</span>
            <span>Vence</span>
            <span className="text-right">Monto</span>
            <span className="text-right">%</span>
            <span></span>
          </div>

          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr,150px,150px,64px,32px] gap-2 items-center"
            >
              <input
                value={r.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="Ej: Abono reserva, contra factura…"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="date"
                value={r.due_date}
                onChange={(e) => updateRow(i, { due_date: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <NumberInput
                value={r.amount}
                onChange={(v) => updateRow(i, { amount: v || undefined })}
                min={0}
                formatThousands
                placeholder="0"
              />
              <span className="text-right text-sm text-gray-400 tabular-nums">
                {pct(r.amount)}%
              </span>
              {rows.length > 1 ? (
                <button
                  onClick={() => removeRow(i)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 justify-self-end"
                  title="Quitar cuota"
                >
                  <Trash2 size={15} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              <Plus size={16} /> Agregar cuota
            </button>
            {/* Suma contra el total, en vivo */}
            {diff === 0 ? (
              <span className="text-sm font-semibold text-green-600">
                Suma {clp(suma)}
              </span>
            ) : diff > 0 ? (
              <span className="text-sm font-semibold text-amber-600">
                Suma {clp(suma)} · falta asignar {clp(diff)}
              </span>
            ) : (
              <span className="text-sm font-semibold text-red-600">
                Suma {clp(suma)} · sobran {clp(-diff)}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
              <p className="text-yellow-800 text-sm font-medium">
                Al aceptar, la cotización queda Aceptada y el evento pasa a
                Post-Venta con estas cuotas para el seguimiento de pagos.
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
              disabled={!canSave}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Save size={16} />
              <span>Aceptar plan y cotización</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
