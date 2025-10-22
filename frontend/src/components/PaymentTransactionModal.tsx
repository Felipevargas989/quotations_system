import { useState, useRef, useEffect } from "react";
import {
  Save,
  X,
  DollarSign,
  Upload,
  Image,
  Trash2,
  FileText,
} from "lucide-react";
import {
  PaymentWithTransactions,
  PaymentTransaction,
  createPaymentTransaction,
  updatePaymentTransaction,
} from "../services/paymentTransactions.service";
import {
  uploadPaymentReceipt,
  validateImageFile,
} from "../services/storage.service";

interface PaymentTransactionModalProps {
  payment: PaymentWithTransactions;
  transaction?: PaymentTransaction; // Optional: if provided, we're editing
  onSave: () => void;
  onCancel: () => void;
}

export default function PaymentTransactionModal({
  payment,
  transaction,
  onSave,
  onCancel,
}: PaymentTransactionModalProps) {
  const isEditing = !!transaction;

  const [formData, setFormData] = useState({
    amount: 0,
    payment_method: "",
    transaction_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [amountDisplay, setAmountDisplay] = useState("");

  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const paymentMethods = [
    "Efectivo",
    "Transferencia bancaria",
    "Tarjeta de credito",
    "Deposito",
    "Cheque",
  ];

  // Initialize form data when editing
  useEffect(() => {
    if (transaction) {
      setFormData({
        amount: transaction.amount,
        payment_method: transaction.payment_method,
        transaction_date: transaction.transaction_date.split("T")[0],
        notes: transaction.notes || "",
      });
      if (transaction.amount > 0) {
        const parts = transaction.amount.toString().split(".");
        const integerPart = parts[0];
        const decimalPart = parts[1] || "";
        const formattedInteger = integerPart.replace(
          /\B(?=(\d{3})+(?!\d))/g,
          ".",
        );
        const formattedValue = decimalPart
          ? `${formattedInteger},${decimalPart}`
          : formattedInteger;
        setAmountDisplay(formattedValue);
      } else {
        setAmountDisplay("");
      }
      setPhotoUrl(transaction.receipt_photo_url || null);
    }
  }, [transaction]);

  // Calculate remaining amount differently for editing
  const remainingAmount = isEditing
    ? payment.amount - payment.paid_amount + transaction!.amount // Add back the current transaction amount
    : payment.amount - payment.paid_amount;

  const maxAmount = Math.max(0, remainingAmount);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    setSelectedFile(file);

    // Create preview only for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // For PDFs, set a placeholder preview
      setPhotoPreview("pdf-preview");
    }
  };

  const handleUploadPhoto = async () => {
    if (!selectedFile) return;

    setUploadingPhoto(true);
    try {
      const result = await uploadPaymentReceipt(
        selectedFile,
        payment.quotation_id,
        payment.id,
      );

      if (result.success && result.url) {
        setPhotoUrl(result.url);
        alert("✅ Archivo subido exitosamente");
      } else {
        alert(`❌ Error al subir el archivo: ${result.error}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("❌ Error al subir el archivo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setPhotoPreview(null);
    setPhotoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || formData.amount <= 0) {
      alert("Por favor ingresa un monto válido");
      return;
    }

    if (formData.amount > maxAmount) {
      alert(
        `El monto no puede exceder el saldo pendiente: $${maxAmount.toLocaleString()}`,
      );
      return;
    }

    if (!formData.payment_method) {
      alert("Por favor selecciona un medio de pago");
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        // Update existing transaction
        await updatePaymentTransaction(transaction!.id, {
          amount: formData.amount,
          payment_method: formData.payment_method,
          transaction_date: formData.transaction_date,
          notes: formData.notes || undefined,
          receipt_photo_url: photoUrl || undefined,
        });

        alert("✅ Transacción de pago actualizada exitosamente");
      } else {
        // Create new transaction
        await createPaymentTransaction({
          payment_id: payment.id,
          quotation_id: payment.quotation_id,
          amount: formData.amount,
          payment_method: formData.payment_method,
          transaction_date: formData.transaction_date,
          notes: formData.notes || undefined,
          receipt_photo_url: photoUrl || undefined,
        });

        alert(
          "✅ Transacción de pago creada exitosamente. Se ha enviado un correo de confirmación de pago al cliente.",
        );
      }

      onSave();
    } catch (error) {
      console.error("Error saving payment transaction:", error);
      alert(
        `Error al ${isEditing ? "actualizar" : "crear"} la transacción: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {isEditing ? "Editar Pago" : "Agregar Pago"}
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Cuota {payment.payment_number} - {payment.payment_type}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 w-full">
          {/* Payment Summary */}
          <div className="bg-gray-50 rounded-lg p-3 mb-3 w-full">
            <div className="flex justify-between items-center mb-1 w-full">
              <span className="text-xs font-medium text-gray-700">Total:</span>
              <span className="text-sm font-bold text-gray-900">
                ${payment.amount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center mb-1 w-full">
              <span className="text-xs font-medium text-gray-700">Pagado:</span>
              <span className="text-xs text-green-600">
                ${payment.paid_amount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center w-full">
              <span className="text-xs font-medium text-gray-700">
                Pendiente:
              </span>
              <span className="text-xs font-bold text-red-600">
                ${remainingAmount.toLocaleString()}
              </span>
            </div>
            {isEditing && (
              <div className="flex justify-between items-center w-full mt-1 pt-1 border-t border-gray-200">
                <span className="text-xs font-medium text-gray-700">
                  Monto actual:
                </span>
                <span className="text-xs text-blue-600">
                  ${transaction!.amount.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="w-full">
            <label className="block text-xs font-medium text-gray-700 mb-1 w-full">
              Monto a Pagar *
            </label>
            <div className="relative w-full">
              <DollarSign
                className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={14}
              />
              <input
                type="text"
                value={amountDisplay}
                onChange={(e) => {
                  const inputValue = e.target.value;

                  // Remove all non-numeric characters except dots and commas
                  const cleanValue = inputValue.replace(/[^\d.,]/g, "");

                  // Remove all dots (thousand separators) and replace comma with dot for decimal
                  const numericString = cleanValue
                    .replace(/\./g, "")
                    .replace(",", ".");

                  // Parse to number
                  const numericValue = parseFloat(numericString) || 0;

                  // Format for display with thousand separators
                  let formattedValue = "";
                  if (numericValue > 0) {
                    // Manual formatting to ensure it works consistently
                    const parts = numericValue.toString().split(".");
                    const integerPart = parts[0];
                    const decimalPart = parts[1] || "";

                    // Add thousand separators to integer part
                    const formattedInteger = integerPart.replace(
                      /\B(?=(\d{3})+(?!\d))/g,
                      ".",
                    );

                    // Combine with decimal part if exists
                    formattedValue = decimalPart
                      ? `${formattedInteger},${decimalPart}`
                      : formattedInteger;
                  }

                  // Update both the display and the actual numeric value
                  setAmountDisplay(formattedValue);
                  setFormData((prev) => ({ ...prev, amount: numericValue }));
                }}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder={`Máx: $${maxAmount.toLocaleString("es-ES")}`}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1 w-full">
              Máximo: ${maxAmount.toLocaleString("es-ES")}
            </p>
          </div>

          {/* Payment Method */}
          <div className="w-full">
            <label className="block text-xs font-medium text-gray-700 mb-1 w-full">
              Medio de Pago *
            </label>
            <select
              value={formData.payment_method}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  payment_method: e.target.value,
                }))
              }
              className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">Seleccionar medio de pago</option>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          {/* Transaction Date */}
          <div className="w-full">
            <label className="block text-xs font-medium text-gray-700 mb-1 w-full">
              Fecha de Transacción *
            </label>
            <input
              type="date"
              value={formData.transaction_date}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  transaction_date: e.target.value,
                }))
              }
              className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Notes */}
          <div className="w-full">
            <label className="block text-xs font-medium text-gray-700 mb-1 w-full">
              Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={2}
              className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
              placeholder="Información adicional sobre el pago..."
            />
          </div>

          {/* Photo Upload */}
          <div className="w-full">
            <label className="block text-xs font-medium text-gray-700 mb-1 w-full">
              Comprobante de Pago (opcional)
            </label>

            {/* File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Upload Area */}
            {!selectedFile && !photoUrl && (
              <div className="w-full">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex flex-col items-center space-y-2">
                    <Upload size={24} className="text-gray-400" />
                    <span className="text-xs text-gray-600">
                      Haz clic para seleccionar un archivo
                    </span>
                    <span className="text-xs text-gray-500">
                      JPG, PNG, WebP, PDF - Máximo 5MB
                    </span>
                  </div>
                </button>
              </div>
            )}

            {/* File Preview */}
            {selectedFile && photoPreview && (
              <div className="w-full space-y-2">
                <div className="relative">
                  {selectedFile.type === "application/pdf" ? (
                    <div className="w-full h-32 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
                      <div className="text-center">
                        <FileText
                          size={32}
                          className="text-gray-400 mx-auto mb-2"
                        />
                        <p className="text-xs text-gray-600">
                          {selectedFile.name}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded-lg border border-gray-300"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={handleUploadPhoto}
                    disabled={uploadingPhoto}
                    className="flex-1 bg-blue-600 text-white py-1.5 px-3 rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1"
                  >
                    <Upload size={12} />
                    <span>
                      {uploadingPhoto ? "Subiendo..." : "Subir Archivo"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Uploaded File */}
            {photoUrl && (
              <div className="w-full space-y-2">
                <div className="relative">
                  {photoUrl.toLowerCase().endsWith(".pdf") ? (
                    <div className="w-full h-32 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
                      <div className="text-center">
                        <FileText
                          size={32}
                          className="text-gray-400 mx-auto mb-2"
                        />
                        <p className="text-xs text-gray-600">Comprobante PDF</p>
                        <a
                          href={photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Ver PDF
                        </a>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={photoUrl}
                      alt="Receipt"
                      className="w-full h-32 object-cover rounded-lg border border-gray-300"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="text-xs text-green-600 flex items-center space-x-1">
                  {photoUrl.toLowerCase().endsWith(".pdf") ? (
                    <FileText size={12} />
                  ) : (
                    <Image size={12} />
                  )}
                  <span>Archivo subido exitosamente</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-3 w-full">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !formData.amount || !formData.payment_method}
              className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 text-sm"
            >
              <Save size={14} />
              <span>
                {loading
                  ? isEditing
                    ? "Actualizando..."
                    : "Guardando..."
                  : isEditing
                    ? "Actualizar"
                    : "Guardar"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
