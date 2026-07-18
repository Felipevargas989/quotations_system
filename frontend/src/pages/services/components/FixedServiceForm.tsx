import { useState, useEffect } from "react";
import { X, Save, Calculator } from "lucide-react";
import {
  CreateFixedService,
  FixedService,
} from "../../../types/services.types";
import {
  createFixedService,
  updateFixedService,
} from "../../../services/services.service";
import {
  CALCULATION_TYPES_EXPLANATIONS,
  CALCULATION_TYPES_NAMES,
  CalculationType,
  SELECTABLE_CALCULATION_TYPES,
} from "../../../constants/services";
import { NumberInput } from "../../../components/inputs";
import { useAuth } from "../../../contexts/AuthContext";
import RecipeTab from "./RecipeTab";
import FixedCostSection from "./FixedCostSection";

interface FixedServiceFormProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly service?: FixedService;
  readonly isEditing?: boolean;
  readonly initialTab?: "datos" | "receta";
}

export default function FixedServiceForm({
  isOpen,
  onClose,
  onSuccess,
  service,
  isEditing = false,
  initialTab = "datos",
}: FixedServiceFormProps) {
  const { company } = useAuth();
  const [tab, setTab] = useState<"datos" | "receta">(initialTab);

  useEffect(() => {
    if (isOpen) setTab(isEditing ? initialTab : "datos");
  }, [isOpen, isEditing, initialTab]);
  const defaultFormData: CreateFixedService = {
    name: "",
    price: undefined,
    calculation_type: "" as CalculationType,
    min_price: undefined,
    max_price: undefined,
    price_per_person: undefined,
  };

  const [formData, setFormData] = useState<CreateFixedService>(defaultFormData);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data when editing
  useEffect(() => {
    if (isEditing && service) {
      setFormData({
        name: service.name,
        price: service.price,
        calculation_type: service.calculation_type,
        min_price: service.min_price,
        max_price: service.max_price,
        price_per_person: service.price_per_person,
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
      // validate and format service data
      const payload = {
        name: formData.name,
        price:
          formData.calculation_type === CalculationType.FIJO ||
          formData.calculation_type === CalculationType.FIJO_VARIABLE
            ? formData.price
            : undefined,
        calculation_type: formData.calculation_type,
        min_price:
          formData.calculation_type === CalculationType.VARIABLE_CON_LIMITES
            ? formData.min_price
            : undefined,
        max_price:
          formData.calculation_type === CalculationType.VARIABLE_CON_LIMITES
            ? formData.max_price
            : undefined,
        price_per_person:
          formData.calculation_type === CalculationType.VARIABLE_CON_LIMITES ||
          formData.calculation_type === CalculationType.FIJO_VARIABLE
            ? formData.price_per_person
            : undefined,
      };

      if (isEditing && service) {
        // Update existing fixed service
        await updateFixedService(service.id, payload);
      } else {
        // Create new fixed service
        await createFixedService(payload);
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
        <div className="flex items-center justify-between p-6 pb-0 border-b-0">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing ? "Editar Servicio Fijo" : "Crear Nuevo Servicio Fijo"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Pestañas: Datos generales / Costo (tercerización + por persona,
            no excluyentes, con mobiliario asociado abajo) */}
        <div className="flex gap-1 px-6 border-b mt-3">
          <button
            type="button"
            onClick={() => setTab("datos")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${
              tab === "datos"
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            Datos generales
          </button>
          <button
            type="button"
            onClick={() => isEditing && setTab("receta")}
            disabled={!isEditing}
            title={
              isEditing ? undefined : "Guarda el servicio primero para definir su costo"
            }
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 ${
              tab === "receta"
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 border-transparent hover:text-gray-700"
            } ${!isEditing ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <Calculator size={15} /> Costo
          </button>
        </div>

        {tab === "receta" && isEditing && service && company?.id ? (
          <div className="p-6 space-y-6">
            <FixedCostSection
              service={service}
              companyId={Number(company.id)}
            />
            <div className="border-t border-gray-200 pt-5">
              <RecipeTab
                companyId={Number(company.id)}
                serviceType="fixed"
                serviceId={service.id}
              />
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

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

          <div>
            <label
              htmlFor="calculation_type"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tipo de Cálculo *
            </label>
            <select
              id="calculation_type"
              name="calculation_type"
              value={formData.calculation_type || ""}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Seleccionar tipo</option>
              {SELECTABLE_CALCULATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CALCULATION_TYPES_NAMES[type]}
                </option>
              ))}
            </select>
            <div className="text-sm text-gray-500">
              {formData.calculation_type !== CalculationType.FIJO &&
                CALCULATION_TYPES_EXPLANATIONS[formData.calculation_type]}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {formData.calculation_type ===
              CalculationType.VARIABLE_CON_LIMITES && (
              <>
                <div>
                  <label
                    htmlFor="min_price"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Precio Mínimo
                  </label>
                  <NumberInput
                    id="min_price"
                    name="min_price"
                    value={formData.min_price}
                    onChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        min_price: value ? Number(value) : undefined,
                      }));
                    }}
                    min={0}
                    formatThousands={true}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label
                    htmlFor="max_price"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Precio Máximo
                  </label>
                  <NumberInput
                    id="max_price"
                    name="max_price"
                    value={formData.max_price}
                    onChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        max_price: value ? Number(value) : undefined,
                      }));
                    }}
                    min={0}
                    formatThousands={true}
                    placeholder="0.00"
                  />
                </div>
              </>
            )}

            {(formData.calculation_type === CalculationType.FIJO_VARIABLE ||
              formData.calculation_type ===
                CalculationType.VARIABLE_CON_LIMITES) && (
              <div>
                <label
                  htmlFor="price_per_person"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Precio por Persona
                </label>
                <NumberInput
                  id="price_per_person"
                  name="price_per_person"
                  value={formData.price_per_person}
                  onChange={(value) => {
                    setFormData((prev) => ({
                      ...prev,
                      price_per_person: value ? Number(value) : undefined,
                    }));
                  }}
                  min={0}
                  formatThousands={true}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.calculation_type !==
              CalculationType.VARIABLE_CON_LIMITES &&
              formData.calculation_type !== ("" as CalculationType) && (
                <div>
                  <label
                    htmlFor="price"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Precio
                  </label>
                  <NumberInput
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        price: value ? Number(value) : undefined,
                      }));
                    }}
                    min={0}
                    formatThousands={true}
                    placeholder="0.00"
                  />
                </div>
              )}
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
        )}
      </div>
    </div>
  );
}
