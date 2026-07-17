import { useState, useEffect, useRef } from "react";
import {
  Edit,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
  MoreVertical,
  Pencil,
  Check,
  ChefHat,
  X,
} from "lucide-react";
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
  readonly onEditRecipe?: (service: VariableService) => void;
  readonly onReordered: () => void;
  // Category-level management, handled by the parent (calls the API + reload).
  readonly onRenameCategory: (id: number, name: string) => Promise<void>;
  readonly onToggleCategoryActive: (
    id: number,
    nextActive: boolean,
  ) => Promise<void>;
  readonly onDeleteCategory: (id: number) => Promise<void>;
  readonly onReorderCategories: (orderedIds: number[]) => Promise<void>;
}

// Variable services grouped by category. Each category box has its own header
// with a drag handle (reorder categories vertically) and a ⋮ menu (rename /
// activate-deactivate / delete). Inside each box, services drag to reorder.
export default function VariableServicesByCategory({
  orderedCategories,
  variableServices,
  categoryLinks,
  onEdit,
  onDelete,
  onToggleActive,
  onEditRecipe,
  onReordered,
  onRenameCategory,
  onToggleCategoryActive,
  onDeleteCategory,
  onReorderCategories,
}: Props) {
  // --- Service drag (within a category) ---
  const [dragCategory, setDragCategory] = useState<number | null>(null);
  const [dragServiceId, setDragServiceId] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Record<number, number[]>>({});

  // --- Category drag (reorder the boxes) + ⋮ menu ---
  const [dragCategoryId, setDragCategoryId] = useState<number | null>(null);
  const [localCategoryOrder, setLocalCategoryOrder] = useState<number[] | null>(
    null,
  );
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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

  const handleServiceDrop = async (
    categoryId: number,
    targetServiceId: number,
  ) => {
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
      onReordered();
    }
  };

  // --- Category ordering ---
  const catById = new Map(orderedCategories.map((c) => [c.id, c]));
  const categoryOrderIds =
    localCategoryOrder ?? orderedCategories.map((c) => c.id);
  const orderedCats = [
    ...categoryOrderIds
      .map((id) => catById.get(id))
      .filter((c): c is ServiceCategorySetting => !!c),
    ...orderedCategories.filter((c) => !categoryOrderIds.includes(c.id)),
  ];

  const handleCategoryDragStart = (id: number) => {
    setDragCategoryId(id);
    setLocalCategoryOrder(orderedCategories.map((c) => c.id));
  };

  const handleCategoryDrop = async (targetId: number) => {
    const base = localCategoryOrder ?? orderedCategories.map((c) => c.id);
    if (dragCategoryId === null || dragCategoryId === targetId) {
      setDragCategoryId(null);
      return;
    }
    const without = base.filter((id) => id !== dragCategoryId);
    const idx = without.indexOf(targetId);
    const next = [...without];
    next.splice(idx < 0 ? without.length : idx, 0, dragCategoryId);
    setLocalCategoryOrder(next);
    setDragCategoryId(null);
    try {
      await onReorderCategories(next);
    } catch {
      // parent reload restores the server order
    } finally {
      setLocalCategoryOrder(null);
    }
  };

  // --- Category menu actions ---
  const toggleMenu = (id: number) => {
    setError(null);
    setOpenMenuId((cur) => (cur === id ? null : id));
  };

  const startRename = (cat: ServiceCategorySetting) => {
    setOpenMenuId(null);
    setError(null);
    setConfirmDeleteId(null);
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const submitRename = async (cat: ServiceCategorySetting) => {
    const name = editName.trim();
    if (!name) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    if (name === cat.name) {
      setEditingId(null);
      return;
    }
    const clash = orderedCategories.some(
      (c) =>
        c.id !== cat.id &&
        c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      setError(`Ya existe una categoría llamada "${name}".`);
      return;
    }
    setBusy(true);
    try {
      await onRenameCategory(cat.id, name);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renombrar.");
    } finally {
      setBusy(false);
    }
  };

  const doToggle = async (cat: ServiceCategorySetting) => {
    setOpenMenuId(null);
    setError(null);
    setBusy(true);
    try {
      await onToggleCategoryActive(cat.id, cat.is_active === false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setBusy(false);
    }
  };

  const askDelete = (cat: ServiceCategorySetting) => {
    setOpenMenuId(null);
    setError(null);
    setEditingId(null);
    setConfirmDeleteId(cat.id);
  };

  const doDelete = async (cat: ServiceCategorySetting) => {
    setBusy(true);
    try {
      await onDeleteCategory(cat.id);
      setConfirmDeleteId(null);
    } catch (e) {
      setConfirmDeleteId(null);
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
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
    <div className="space-y-4" ref={containerRef}>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {orderedCats.map((cat) => {
        const ids = serviceIdsForCategory(cat.id);
        const inactiveCat = cat.is_active === false;
        const isEditing = editingId === cat.id;
        const isConfirming = confirmDeleteId === cat.id;
        const headerDraggable = !isEditing && !isConfirming;

        return (
          <div
            key={cat.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleCategoryDrop(cat.id)}
            className={`bg-white rounded-lg shadow ${
              dragCategoryId === cat.id ? "opacity-50" : ""
            }`}
          >
            {/* Category header: drag handle + name + count + ⋮ menu */}
            <div
              draggable={headerDraggable}
              onDragStart={() =>
                headerDraggable && handleCategoryDragStart(cat.id)
              }
              onDragEnd={() => setDragCategoryId(null)}
              className={`relative px-4 py-3 border-b border-gray-200 flex items-center justify-between ${
                inactiveCat ? "bg-gray-50" : ""
              }`}
            >
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitRename(cat);
                      }
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setError(null);
                      }
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    title="Guardar"
                    disabled={busy}
                    onClick={() => submitRename(cat)}
                    className="text-green-600 hover:text-green-800 disabled:opacity-50"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    title="Cancelar"
                    onClick={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : isConfirming ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{cat.name}</span>
                  <span className="text-sm text-gray-600">
                    — ¿Eliminar categoría?
                  </span>
                  <button
                    type="button"
                    title="Sí, eliminar"
                    disabled={busy}
                    onClick={() => doDelete(cat)}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    title="Cancelar"
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical
                    size={16}
                    className="text-gray-400 cursor-grab flex-shrink-0"
                  />
                  <h3
                    className={`font-medium ${
                      inactiveCat ? "text-gray-500" : "text-gray-900"
                    }`}
                  >
                    {cat.name}
                  </h3>
                  {inactiveCat && (
                    <span className="text-xs text-gray-400">(inactiva)</span>
                  )}
                </div>
              )}

              {!isEditing && !isConfirming && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm text-gray-500">
                    {ids.length} servicio{ids.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    title="Opciones"
                    onClick={() => toggleMenu(cat.id)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {openMenuId === cat.id && (
                    <div className="absolute right-2 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-gray-700">
                      <button
                        type="button"
                        onClick={() => startRename(cat)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <Pencil size={14} /> Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => doToggle(cat)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {inactiveCat ? (
                          <>
                            <Eye size={14} /> Activar
                          </>
                        ) : (
                          <>
                            <EyeOff size={14} /> Desactivar
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(cat)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Services within this category (drag to reorder) */}
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
                      onDrop={() => handleServiceDrop(cat.id, id)}
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
                        {onEditRecipe && (
                          <button
                            type="button"
                            title="Receta"
                            onClick={() => onEditRecipe(service)}
                            className="text-amber-600 hover:text-amber-800"
                          >
                            <ChefHat size={16} />
                          </button>
                        )}
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
