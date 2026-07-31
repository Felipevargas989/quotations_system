import { useState, useLayoutEffect } from "react";
import { X, Save, Plus, ChefHat } from "lucide-react";
import {
  CreateVariableService,
  ServiceCategorySetting,
  VariableService,
} from "../../../../types/services.types";
import {
  createVariableService,
  updateVariableService,
  setServiceCategories,
  createCategory,
} from "../../../../services/services.service";
import { NumberInput } from "../../../../components/inputs";
import { useAuth } from "../../../../contexts/AuthContext";
import RecipeTab from "../RecipeTab";

interface VariableServiceFormProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly service?: VariableService;
  readonly isEditing?: boolean;
  readonly initialTab?: "datos" | "receta";
  // Catálogo que la página YA tiene en memoria (30-07): el formulario
  // dejó de descargar todo el catálogo solo para marcar checkboxes.
  readonly allCategories: ServiceCategorySetting[];
  readonly allCategoryLinks: { variable_service_id: number; category_id: number }[];
}

export default function VariableServiceForm({
  isOpen,
  onClose,
  onSuccess,
  service,
  isEditing = false,
  initialTab = "datos",
  allCategories,
  allCategoryLinks,
}: VariableServiceFormProps) {
  const { company } = useAuth();
  const [tab, setTab] = useState<"datos" | "receta">(initialTab);

  // Reposicionar la pestaña cada vez que se abre el modal.
  // useLayoutEffect en los TRES inicializadores (31-07): corren ANTES
  // de que el navegador pinte. Con useEffect el modal mostraba un
  // primer cuadro con el estado anterior (u opciones vacías en la
  // primera apertura) y un segundo cuadro ya corregido — el "pestañeo"
  // que quedó a la vista cuando las categorías se volvieron instantáneas.
  useLayoutEffect(() => {
    if (isOpen) setTab(isEditing ? initialTab : "datos");
  }, [isOpen, isEditing, initialTab]);
  const defaultFormData = {
    name: undefined,
    price: undefined,
  };
  const [formData, setFormData] =
    useState<CreateVariableService>(defaultFormData);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category entities and the ones selected for this service.
  const [categories, setCategories] = useState<ServiceCategorySetting[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  // Categorías y vínculos vienen de la PÁGINA (ya en memoria): los
  // checkboxes aparecen al instante, sin viaje al servidor (30-07 —
  // antes el formulario re-descargaba el catálogo completo).
  // La foto se toma UNA vez al abrir (31-07): si el efecto siguiera a
  // los datos vivos, cada revalidación (volver a la ventana, recarga
  // tras guardar) repintaba las casillas al estado del servidor y
  // pisaba las marcas sin guardar — el "pestañeo" del modal.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const cats = allCategories.slice().sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER),
    );
    setCategories(cats);

    if (isEditing && service) {
      const links = allCategoryLinks.filter(
        (l) => l.variable_service_id === service.id,
      );
      let ids = links.map((l) => l.category_id);
      // Fallback: match by legacy category name if there are no links yet.
      if (ids.length === 0 && service.category) {
        const match = cats.find((c) => c.name === service.category);
        if (match) ids = [match.id];
      }
      setSelectedCategoryIds(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- foto al abrir
  }, [isOpen, isEditing, service]);

  // Initialize form data when editing
  useLayoutEffect(() => {
    if (isEditing && service) {
      setFormData({ name: service.name, price: service.price });
    } else {
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

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const created = (await createCategory(name)) as ServiceCategorySetting;
      if (created?.id) {
        setCategories((prev) =>
          prev.some((c) => c.id === created.id) ? prev : [...prev, created],
        );
        setSelectedCategoryIds((prev) =>
          prev.includes(created.id) ? prev : [...prev, created.id],
        );
      }
      setNewCategoryName("");
    } catch {
      setError("No se pudo crear la categoría");
    } finally {
      setAddingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedCategoryIds.length === 0) {
      setError("El servicio debe pertenecer al menos a una categoría");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && service) {
        await updateVariableService(service.id, {
          name: formData.name,
          price: formData.price,
        });
        // Sync the exact set of categories this service belongs to (>= 1).
        await setServiceCategories(service.id, selectedCategoryIds);
      } else {
        await createVariableService({
          name: formData.name,
          price: formData.price,
          category_ids: selectedCategoryIds,
        });
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
    setSelectedCategoryIds([]);
    setNewCategoryName("");
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
          {/* Al editar, el título ES el servicio (nombre original, no el
              del formulario: no baila mientras se escribe). */}
          <h2 className="text-xl font-semibold text-gray-900 truncate pr-4">
            {isEditing
              ? service?.name || "Editar Servicio Variable"
              : "Crear Nuevo Servicio Variable"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Pestañas: Datos generales / Receta */}
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
              isEditing ? undefined : "Guarda el servicio primero para definir su receta"
            }
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 ${
              tab === "receta"
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 border-transparent hover:text-gray-700"
            } ${!isEditing ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <ChefHat size={15} /> Receta
          </button>
        </div>

        {tab === "receta" && isEditing && service && company?.id ? (
          <div className="p-6">
            <RecipeTab
              companyId={Number(company.id)}
              serviceType="variable"
              serviceId={service.id}
              servicePrice={service.price}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                value={formData.name || ""}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nombre del servicio"
              />
            </div>

            <div>
              <label
                htmlFor="price"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Precio
              </label>
              <NumberInput
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categorías * (al menos una)
            </label>
            <div className="border border-gray-300 rounded-lg p-3 max-h-56 overflow-y-auto space-y-1">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No hay categorías. Crea una abajo.
                </p>
              ) : (
                categories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-800">
                      {cat.name}
                      {cat.is_active === false && (
                        <span className="ml-2 text-xs text-gray-400">
                          (inactiva)
                        </span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>

            {/* Inline create new category */}
            <div className="flex items-center space-x-2 mt-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
                placeholder="Nueva categoría..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={addingCategory || !newCategoryName.trim()}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center space-x-1 text-sm"
              >
                <Plus size={16} />
                <span>Agregar</span>
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              El servicio aparecerá en cada categoría marcada, sin duplicarse.
            </p>
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
