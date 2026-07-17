import { useState, useEffect, useRef } from "react";
import {
  Layers,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
} from "lucide-react";
import { ServiceCategorySetting } from "../../../types/services.types";

interface CategoriesManagerProps {
  // Categories as first-class entities, already ordered by sort_order.
  readonly categories: ServiceCategorySetting[];
  readonly onRename: (id: number, name: string) => Promise<void>;
  readonly onToggleActive: (id: number, nextActive: boolean) => Promise<void>;
  readonly onDelete: (id: number) => Promise<void>;
  readonly onReorder: (orderedIds: number[]) => Promise<void>;
}

export default function CategoriesManager({
  categories,
  onRename,
  onToggleActive,
  onDelete,
  onReorder,
}: CategoriesManagerProps) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  // Local ordering override, active only during/right after a drag.
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close the ⋯ menu when clicking anywhere outside the panel.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const orderedIds = localOrder ?? categories.map((c) => c.id);
  // Render in the chosen order, then append any category missing from that
  // order (e.g. one added elsewhere while a stale local order lingers), so a
  // category can never be hidden by the drag override.
  const ordered = [
    ...orderedIds
      .map((id) => byId.get(id))
      .filter((c): c is ServiceCategorySetting => !!c),
    ...categories.filter((c) => !orderedIds.includes(c.id)),
  ];

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
    // Case-insensitive duplicate guard against the other categories.
    const clash = categories.some(
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
      await onRename(cat.id, name);
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
      await onToggleActive(cat.id, cat.is_active === false);
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
      await onDelete(cat.id);
      setConfirmDeleteId(null);
    } catch (e) {
      setConfirmDeleteId(null);
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  };

  // --- Drag & drop to reorder categories ---
  const handleDragStart = (id: number) => {
    setDragId(id);
    setLocalOrder(categories.map((c) => c.id));
  };

  const handleDrop = async (targetId: number) => {
    const base = localOrder ?? categories.map((c) => c.id);
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      return;
    }
    const without = base.filter((id) => id !== dragId);
    const targetIndex = without.indexOf(targetId);
    const next = [...without];
    next.splice(targetIndex < 0 ? without.length : targetIndex, 0, dragId);
    setLocalOrder(next);
    setDragId(null);
    try {
      await onReorder(next);
    } catch {
      // parent reload restores the server order
    } finally {
      setLocalOrder(null);
    }
  };

  const activeChip =
    "bg-green-50 border-green-200 text-green-800";
  const inactiveChip =
    "bg-gray-100 border-gray-300 text-gray-500";

  return (
    <div className="bg-white rounded-lg shadow" ref={containerRef}>
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
            <Layers className="h-5 w-5 text-purple-600" />
            <span>Categorías</span>
          </h3>
          <span className="text-sm text-gray-500">
            {categories.length} categoría{categories.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Arrastra para reordenar. Usa el menú (⋮) de cada categoría para
          renombrar, activar/desactivar o eliminar. Las desactivadas se ocultan
          al crear nuevas cotizaciones, pero siguen visibles en las ya creadas.
        </p>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">No hay categorías registradas</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {ordered.map((cat) => {
              const active = cat.is_active !== false;
              const isEditing = editingId === cat.id;
              const isConfirming = confirmDeleteId === cat.id;
              const draggable = !isEditing && !isConfirming;

              return (
                <div
                  key={cat.id}
                  draggable={draggable}
                  onDragStart={() => draggable && handleDragStart(cat.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(cat.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`relative inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    active ? activeChip : inactiveChip
                  } ${dragId === cat.id ? "opacity-50" : ""}`}
                >
                  {/* Inline rename */}
                  {isEditing ? (
                    <div className="flex items-center gap-1">
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
                        <Check size={16} />
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
                        <X size={16} />
                      </button>
                    </div>
                  ) : isConfirming ? (
                    /* Inline delete confirmation */
                    <div className="flex items-center gap-2">
                      <GripVertical size={14} className="text-gray-300" />
                      <span>{cat.name}</span>
                      <span className="text-gray-600">— ¿Eliminar?</span>
                      <button
                        type="button"
                        title="Sí, eliminar"
                        disabled={busy}
                        onClick={() => doDelete(cat)}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        title="Cancelar"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    /* Normal chip: drag handle + name + ⋯ menu */
                    <>
                      <GripVertical
                        size={14}
                        className="text-gray-400 cursor-grab flex-shrink-0"
                      />
                      {!active && <EyeOff size={14} className="flex-shrink-0" />}
                      <span>{cat.name}</span>
                      {!active && (
                        <span className="text-xs text-gray-400">(inactiva)</span>
                      )}
                      <button
                        type="button"
                        title="Opciones"
                        onClick={() => toggleMenu(cat.id)}
                        className="ml-1 -mr-1 p-1 rounded hover:bg-black/5 text-gray-500"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {openMenuId === cat.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-gray-700">
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
                            {active ? (
                              <>
                                <EyeOff size={14} /> Desactivar
                              </>
                            ) : (
                              <>
                                <Eye size={14} /> Activar
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
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
