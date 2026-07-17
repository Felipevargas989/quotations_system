import { useState } from "react";
import { Edit, Trash2, Eye, EyeOff, GripVertical } from "lucide-react";
import {
  ServiceCategorySetting,
  VariableService,
  VariableServiceCategoryLink,
} from "../../../../types/services.types";
import { reorderServicesInCategory } from "../../../../services/services.service";

interface Props {
  readonly orderedCategories: ServiceCategorySetting[];
  readonly variableServices: VariableService[];
  readonly categoryLinks: VariableServiceCategoryLink[];
  readonly onEdit: (service: VariableService) => void;
  readonly onDelete: (id: number) => void;
  readonly onToggleActive: (service: VariableService) => void;
  readonly onReordered: () => void;
}

// Variable services grouped by category, with drag & drop to reorder items
// within each category. A service shared across categories shows in each block.
export default function VariableServicesByCategory({
  orderedCategories,
  variableServices,
  categoryLinks,
  onEdit,
  onDelete,
  onToggleActive,
  onReordered,
}: Props) {
  const [dragCategory, setDragCategory] = useState<number | null>(null);
  const [dragServiceId, setDragServiceId] = useState<number | null>(null);
  // Local override of ordering while dragging, keyed by category id.
  const [localOrder, setLocalOrder] = useState<Record<number, number[]>>({});

  const serviceById = new Map(variableServices.map((s) => [s.id, s]));

  const serviceIdsForCategory = (categoryId: number): number[] => {
    if (localOrder[categoryId]) return localOrder[categoryId];
    return categoryLinks
      .filter((l) => l.category_id === categoryId)
      .sort(
        (a, b) =>
          (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER),
      )
      .map((l) => l.variable_service_id)
      .filter((id) => serviceById.has(id));
  };

  const handleDrop = async (categoryId: number, targetServiceId: number) => {
    if (dragServiceId === null || dragCategory !== categoryId) return;
    const current = serviceIdsForCategory(categoryId);
    const without = current.filter((id) => id !== dragServiceId);
    const targetIndex = without.indexOf(targetServiceId);
    const next = [...without];
    next.splice(targetIndex, 0, dragServiceId);

    setLocalOrder((prev) => ({ ...prev, [categoryId]: next }));
    setDragServiceId(null);
    setDragCategory(null);
    try {
      await reorderServicesInCategory(categoryId, next);
      onReordered();
    } catch {
      // reload will restore the server order
      onReordered();
    }
  };

  if (orderedCategories.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">
        No hay categorías todavía. Crea un servicio y asígnale una categoría.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orderedCategories.map((cat) => {
        const ids = serviceIdsForCategory(cat.id);
        return (
          <div key={cat.id} className="bg-white rounded-lg shadow">
            <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                {cat.name}
                {cat.is_active === false && (
                  <span className="ml-2 text-xs text-gray-400">(inactiva)</span>
                )}
              </h3>
              <span className="text-sm text-gray-500">
                {ids.length} servicio{ids.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="p-2">
              {ids.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">
                  Sin servicios en esta categoría.
                </p>
              ) : (
                ids.map((id) => {
                  const service = serviceById.get(id);
                  if (!service) return null;
                  const inactive = service.is_active === false;
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => {
                        setDragCategory(cat.id);
                        setDragServiceId(id);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(cat.id, id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 ${
                        inactive ? "opacity-60" : ""
                      } ${dragServiceId === id ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <GripVertical
                          size={16}
                          className="text-gray-400 cursor-grab flex-shrink-0"
                        />
                        <span className="text-sm text-gray-900 truncate">
                          {service.name}
                        </span>
                        <span className="text-sm text-gray-500 flex-shrink-0">
                          ${Number(service.price).toLocaleString("es-CL")}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <button
                          type="button"
                          title={inactive ? "Activar" : "Desactivar"}
                          onClick={() => onToggleActive(service)}
                          className="text-gray-400 hover:text-gray-700"
                        >
                          {inactive ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => onEdit(service)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => onDelete(service.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
