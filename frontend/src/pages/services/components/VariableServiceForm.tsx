import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import {
  CreateVariableService,
  VariableService,
} from "../../../types/services.types";
import {
  createVariableService,
  updateVariableService,
} from "../../../services/services.service";

interface VariableServiceFormProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly service?: VariableService;
  readonly isEditing?: boolean;
}

export default function VariableServiceForm({
  isOpen,
  onClose,
  onSuccess,
  service,
  isEditing = false,
}: VariableServiceFormProps) {
  const defaultFormData = {
    code: "",
    name: "",
    price: 0,
    category: "",
  };
  const [formData, setFormData] =
    useState<CreateVariableService>(defaultFormData);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data when editing
  useEffect(() => {
    if (isEditing && service) {
      setFormData({
        code: service.code || "",
        name: service.name,
        price: service.price,
        category: service.category,
      });
    } else {
      // Reset form for new service
      resetForm();
    }
  }, [isEditing, service]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && service) {
        // Update existing variable service
        await updateVariableService(service.id, formData);
      } else {
        // Create new variable service
        await createVariableService(formData);
      }

      onSuccess();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Error al procesar el servicio",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing
              ? "Editar Servicio Variable"
              : "Crear Nuevo Servicio Variable"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Código
              </label>
              <input
                type="text"
                id="code"
                name="code"
                value={formData.code}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: SERV001"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Nombre *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nombre del servicio"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="price"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Precio
              </label>
              <input
                type="number"
                id="price"
                name="price"
                value={formData.price || ""}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div>
              <label
                htmlFor="category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Categoría *
              </label>
              <input
                type="text"
                id="category"
                name="category"
                value={formData.category || ""}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Categoría del servicio"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save size={16} />
              )}
              <span>
                {(() => {
                  if (isSubmitting) return "Procesando...";
                  if (isEditing) return "Actualizar";
                  return "Crear";
                })()}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
