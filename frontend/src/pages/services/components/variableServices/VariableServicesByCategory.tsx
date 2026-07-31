import { useState, useEffect, useRef } from "react";
import SectionChipSelect from "../../../../components/selects/SectionChipSelect";
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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  Star,
  X,
} from "lucide-react";
import {
  CategorySection,
  ServiceCategorySetting,
  VariableService,
  VariableServiceCategoryLink,
} from "../../../../types/services.types";
import { reorderServicesInCategory } from "../../../../services/services.service";
import {
  createCategorySection,
  deleteCategorySection,
  getCategorySections,
  renameCategorySection,
  reorderCategorySections,
  setDefaultSection,
  setLinkSection,
} from "../../../../services/sections.service";

interface Props {
  readonly companyId: number | null;
  readonly orderedCategories: ServiceCategorySetting[];
  readonly variableServices: VariableService[];
  readonly categoryLinks: VariableServiceCategoryLink[];
  readonly onEdit: (service: VariableService) => void;
  readonly onDelete: (id: number) => void;
  // Códigos presentes en alguna cotización: su basurero se apaga.
  readonly usedCodes: Set<string>;
  readonly onToggleActive: (service: VariableService) => void;
  readonly onEditRecipe?: (service: VariableService) => void;
  // Costo de insumos por persona (desde la receta), por id de servicio.
  readonly recipeCosts?: Record<number, number>;
  readonly onReordered: () => void;
  // Category-level management, handled by the parent (calls the API + reload).
  readonly onRenameCategory: (id: number, name: string) => Promise<void>;
  readonly onToggleCategoryActive: (
    id: number,
    nextActive: boolean,
  ) => Promise<void>;
  readonly onDeleteCategory: (id: number) => Promise<void>;
  readonly onReorderCategories: (orderedIds: number[]) => Promise<void>;
  /** Búsqueda activa en el catálogo: las categorías con coincidencias
   *  se abren solas y las sin coincidencias se ocultan (el estado de
   *  pliegues guardado NO se toca). */
  readonly searchActive?: boolean;
}

// Variable services grouped by category. Each category box has its own header
// with a drag handle (reorder categories vertically) and a ⋮ menu (rename /
// activate-deactivate / delete). Inside each box, services drag to reorder.
export default function VariableServicesByCategory({
  companyId,
  orderedCategories,
  variableServices,
  categoryLinks,
  onEdit,
  onDelete,
  usedCodes,
  onToggleActive,
  onEditRecipe,
  recipeCosts,
  onReordered,
  onRenameCategory,
  onToggleCategoryActive,
  onDeleteCategory,
  onReorderCategories,
  searchActive = false,
}: Props) {
  // --- Service drag (within a category+sección) ---
  const [dragCategory, setDragCategory] = useState<number | null>(null);
  const [dragSection, setDragSection] = useState<number | 0 | null>(null);
  const [dragServiceId, setDragServiceId] = useState<number | null>(null);
  // clave "categoryId:sectionId" (0 = sin sección) → ids ordenados
  const [localOrder, setLocalOrder] = useState<Record<string, number[]>>({});
  // El optimismo caduca cuando el servidor habla (30-07, caso "jugo de
  // naranja a Once"): datos frescos de vínculos borran la memoria local
  // — si no, la pantalla pinta membresías viejas hasta recargar.
  useEffect(() => {
    setLocalOrder({});
  }, [categoryLinks]);

  // --- Secciones por categoría ---
  const [sections, setSections] = useState<CategorySection[]>([]);
  const [sectionsEditFor, setSectionsEditFor] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [renamingSectionId, setRenamingSectionId] = useState<number | null>(
    null,
  );
  const [renameSectionName, setRenameSectionName] = useState("");

  const loadSections = () => {
    if (companyId === null) return;
    getCategorySections(companyId).then(setSections);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSections, [companyId]);

  const sectionsFor = (categoryId: number) =>
    sections
      .filter((s) => s.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order);

  // --- Categorías desplegables ---
  // El navegador recuerda cuáles quedaron abiertas; la primera vez parten
  // todas cerradas para que la página sea una lista corta de encabezados.
  const OPEN_CATS_KEY = "eventia_open_categories";
  const [openCats, setOpenCats] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_CATS_KEY);
      return new Set(raw ? (JSON.parse(raw) as number[]) : []);
    } catch {
      return new Set();
    }
  });
  const persistOpenCats = (next: Set<number>) => {
    setOpenCats(next);
    try {
      localStorage.setItem(OPEN_CATS_KEY, JSON.stringify([...next]));
    } catch {
      /* si no se puede guardar, solo dura la sesión */
    }
  };
  const toggleCategoryOpen = (id: number) => {
    const next = new Set(openCats);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    persistOpenCats(next);
  };
  const openAllCategories = () =>
    persistOpenCats(new Set(orderedCategories.map((c) => c.id)));
  const closeAllCategories = () => persistOpenCats(new Set());

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

  // Vínculos de una categoría ordenados; agrupables por sección.
  const linksForCategory = (categoryId: number) =>
    categoryLinks
      .filter((l) => l.category_id === categoryId)
      .sort(
        (a, b) =>
          (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER),
      )
      .filter((l) => serviceById.has(l.variable_service_id));

  // Ids de servicios de una categoría dentro de UNA sección (0 = sin sección).
  const serviceIdsForGroup = (
    categoryId: number,
    sectionId: number | 0,
  ): number[] => {
    const key = `${categoryId}:${sectionId}`;
    if (localOrder[key]) return localOrder[key];
    return linksForCategory(categoryId)
      .filter((l) => (l.section_id || 0) === sectionId)
      .map((l) => l.variable_service_id);
  };

  // Grupos visibles de una categoría: sus secciones (en orden) y, al final,
  // "sin sección" si hay servicios sueltos. Categoría sin secciones → un solo
  // grupo plano sin encabezado.
  const groupsForCategory = (categoryId: number) => {
    const cats = sectionsFor(categoryId);
    const groups: { section: CategorySection | null; ids: number[] }[] =
      cats.map((s) => ({ section: s, ids: serviceIdsForGroup(categoryId, s.id) }));
    const loose = serviceIdsForGroup(categoryId, 0);
    if (loose.length > 0 || cats.length === 0) {
      groups.push({ section: null, ids: loose });
    }
    return groups;
  };

  // Persistir el orden global de la categoría = concatenación de sus grupos
  // en orden visual (así el sort_order queda coherente dentro y entre secciones).
  const persistCategoryOrder = async (
    categoryId: number,
    overrides: Record<string, number[]>,
  ) => {
    const cats = sectionsFor(categoryId);
    const full: number[] = [];
    cats.forEach((s) => {
      const key = `${categoryId}:${s.id}`;
      full.push(...(overrides[key] ?? serviceIdsForGroup(categoryId, s.id)));
    });
    const looseKey = `${categoryId}:0`;
    full.push(...(overrides[looseKey] ?? serviceIdsForGroup(categoryId, 0)));
    try {
      await reorderServicesInCategory(categoryId, full);
      onReordered();
    } catch {
      onReordered();
    }
  };

  const handleServiceDrop = async (
    categoryId: number,
    sectionId: number | 0,
    targetServiceId: number,
  ) => {
    if (
      dragServiceId === null ||
      dragCategory !== categoryId ||
      dragSection !== sectionId
    ) {
      setDragServiceId(null);
      setDragSection(null);
      return;
    }
    const current = serviceIdsForGroup(categoryId, sectionId);
    const without = current.filter((id) => id !== dragServiceId);
    const targetIndex = without.indexOf(targetServiceId);
    const next = [...without];
    next.splice(targetIndex, 0, dragServiceId);

    const key = `${categoryId}:${sectionId}`;
    const overrides = { ...localOrder, [key]: next };
    setLocalOrder(overrides);
    setDragServiceId(null);
    setDragCategory(null);
    setDragSection(null);
    await persistCategoryOrder(categoryId, overrides);
  };

  // Cambiar un servicio de sección (selector): entra AL FINAL del destino.
  const changeSection = async (
    link: VariableServiceCategoryLink,
    newSectionId: number | 0,
  ) => {
    if ((link.section_id || 0) === newSectionId) return;
    const destIds = serviceIdsForGroup(link.category_id, newSectionId);
    const maxSort = Math.max(
      0,
      ...linksForCategory(link.category_id).map((l) => l.sort_order ?? 0),
    );
    const { error: err } = await setLinkSection(
      link.id,
      newSectionId === 0 ? null : newSectionId,
      maxSort + 1,
    );
    if (err) {
      setError("No se pudo cambiar la sección.");
      return;
    }
    // refresco local optimista + confirmación silenciosa del servidor
    setLocalOrder((prev) => {
      const next = { ...prev };
      const fromKey = `${link.category_id}:${link.section_id || 0}`;
      const toKey = `${link.category_id}:${newSectionId}`;
      next[fromKey] = serviceIdsForGroup(
        link.category_id,
        link.section_id || 0,
      ).filter((id) => id !== link.variable_service_id);
      next[toKey] = [...destIds, link.variable_service_id];
      return next;
    });
    onReordered();
  };

  // --- Gestión de secciones (panel bajo el encabezado de la categoría) ---
  const addSection = async (categoryId: number) => {
    const name = newSectionName.trim();
    if (!name || companyId === null) return;
    const existing = sectionsFor(categoryId);
    if (existing.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
      setError(`Ya existe la sección "${name}" en esta categoría.`);
      return;
    }
    const { error: err } = await createCategorySection({
      company_id: companyId,
      category_id: categoryId,
      name,
      sort_order: existing.length,
    });
    if (err) {
      setError("No se pudo crear la sección.");
      return;
    }
    setNewSectionName("");
    loadSections();
  };

  const submitRenameSection = async (s: CategorySection) => {
    const name = renameSectionName.trim();
    if (!name) return;
    const { error: err } = await renameCategorySection(s.id, name);
    if (err) {
      setError("No se pudo renombrar la sección.");
      return;
    }
    setRenamingSectionId(null);
    loadSections();
  };

  const removeSection = async (s: CategorySection) => {
    // Sus servicios quedan "sin sección" (la base lo hace sola).
    const { error: err } = await deleteCategorySection(s.id);
    if (err) {
      setError("No se pudo eliminar la sección.");
      return;
    }
    setLocalOrder({});
    loadSections();
    onReordered();
  };

  const moveSection = async (categoryId: number, id: number, dir: -1 | 1) => {
    const list = sectionsFor(categoryId).map((s) => s.id);
    const idx = list.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    await reorderCategorySections(list);
    loadSections();
  };

  // Marcar/desmarcar la sección FIJA de la categoría (a lo más una).
  const toggleDefaultSection = async (s: CategorySection) => {
    const { error: err } = await setDefaultSection(
      s.category_id,
      s.is_default ? null : s.id,
    );
    if (err) {
      setError("No se pudo marcar la sección fija.");
      return;
    }
    loadSections();
  };

  const closeSectionsModal = () => {
    setSectionsEditFor(null);
    setRenamingSectionId(null);
    setNewSectionName("");
    setError(null);
  };

  // Escape cierra el modal de secciones (todo ya quedó guardado).
  useEffect(() => {
    if (sectionsEditFor === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSectionsModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsEditFor]);

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

      {/* Abrir/cerrar todas las categorías de un viaje */}
      <div className="flex justify-end gap-4 -mb-1">
        <button
          type="button"
          onClick={openAllCategories}
          className="text-xs text-blue-600 hover:underline"
        >
          Abrir todo
        </button>
        <button
          type="button"
          onClick={closeAllCategories}
          className="text-xs text-blue-600 hover:underline"
        >
          Cerrar todo
        </button>
      </div>

      {orderedCats.map((cat) => {
        const catLinks = linksForCategory(cat.id);
        const groups = groupsForCategory(cat.id);
        const catSections = sectionsFor(cat.id);
        const linkForService = (serviceId: number) =>
          catLinks.find((l) => l.variable_service_id === serviceId);
        const ids = catLinks.map((l) => l.variable_service_id);
        const inactiveCat = cat.is_active === false;
        const isEditing = editingId === cat.id;
        const isConfirming = confirmDeleteId === cat.id;
        const headerDraggable = !isEditing && !isConfirming;
        // Con búsqueda activa: abiertas si tienen coincidencias,
        // ocultas si no (sin tocar los pliegues guardados).
        if (searchActive && ids.length === 0) return null;
        const isOpen = searchActive || openCats.has(cat.id);

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
              onClick={() => {
                if (!isEditing && !isConfirming) toggleCategoryOpen(cat.id);
              }}
              className={`relative px-4 py-3 flex items-center justify-between ${
                isOpen ? "border-b border-gray-200" : ""
              } ${inactiveCat ? "bg-gray-50" : ""} ${
                !isEditing && !isConfirming ? "cursor-pointer" : ""
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
                  {isOpen ? (
                    <ChevronDown
                      size={16}
                      className="text-gray-400 flex-shrink-0"
                    />
                  ) : (
                    <ChevronRight
                      size={16}
                      className="text-gray-400 flex-shrink-0"
                    />
                  )}
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
                    onClick={(e) => {
                      // que abrir el menú no pliegue/despliegue la categoría
                      e.stopPropagation();
                      toggleMenu(cat.id);
                    }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {openMenuId === cat.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-2 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-gray-700"
                    >
                      <button
                        type="button"
                        onClick={() => startRename(cat)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <Pencil size={14} /> Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setError(null);
                          setSectionsEditFor((cur) =>
                            cur === cat.id ? null : cat.id,
                          );
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <Layers size={14} /> Secciones
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

            {/* Services within this category (drag to reorder por sección),
                visibles solo con la categoría desplegada */}
            {isOpen && (
            <div className="p-2">
              {ids.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">
                  Sin servicios en esta categoría.
                </p>
              ) : (
                groups.map((group) => {
                  const sectionKey = group.section?.id ?? 0;
                  return (
                    <div key={`sec-${sectionKey}`}>
                      {(group.section || catSections.length > 0) && (
                        <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1">
                          {group.section ? group.section.name : "Sin sección"}
                          {group.section?.is_default && (
                            <span
                              className="inline-flex items-center gap-0.5 text-amber-500"
                              title="Sección fija: sus servicios entran solos a la cotización"
                            >
                              <Star size={10} fill="currentColor" /> fija
                            </span>
                          )}
                        </div>
                      )}
                      {group.ids.map((id) => {
                  const service = serviceById.get(id);
                  if (!service) return null;
                  const inactive = service.is_active === false;
                  const link = linkForService(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => {
                        setDragCategory(cat.id);
                        setDragSection(sectionKey);
                        setDragServiceId(id);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleServiceDrop(cat.id, sectionKey, id)}
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
                        {(() => {
                          const cost = recipeCosts?.[service.id];
                          if (cost === undefined) return null;
                          const price = Number(service.price) || 0;
                          const marginPct =
                            price > 0
                              ? Math.round(((price - cost) / price) * 100)
                              : 0;
                          return (
                            <span className="text-xs flex-shrink-0 text-gray-400">
                              costo ${Math.round(cost).toLocaleString("es-CL")}{" "}
                              ·{" "}
                              <span
                                className={`font-semibold ${
                                  price - cost >= 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {marginPct}%
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {catSections.length > 0 && link && (
                          <SectionChipSelect
                            value={link.section_id || 0}
                            options={catSections.map((sc) => ({
                              id: sc.id,
                              name: sc.name,
                            }))}
                            onChange={(id) => changeSection(link, id)}
                            title="Sección"
                            ariaLabel={`Sección de ${service.name}`}
                          />
                        )}
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
                        {usedCodes.has(service.code || "") ? (
                          <span className="text-gray-300 cursor-not-allowed">
                            <Trash2 size={16} />
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => onDelete(service.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            )}
          </div>
        );
      })}

      {/* Modal de secciones: flotante sobre la lista, para no ver los nombres
          duplicados. Cada acción se guarda al instante; "Listo" solo cierra. */}
      {(() => {
        const editCat =
          sectionsEditFor !== null ? catById.get(sectionsEditFor) : null;
        if (!editCat) return null;
        const modalSections = sectionsFor(editCat.id);
        return (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeSectionsModal();
            }}
          >
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
              <div className="px-5 py-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">
                  Secciones · {editCat.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Ordenan la carta de esta categoría. La sección con la
                  estrella es la <b>fija</b>: sus servicios entran solos a la
                  cotización y no se pueden quitar del evento.
                </p>
              </div>

              <div className="px-3 py-2 overflow-y-auto flex-1">
                {error && (
                  <p className="mx-2 my-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    {error}
                  </p>
                )}
                {modalSections.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-gray-400">
                    Aún no hay secciones. Crea la primera abajo.
                  </p>
                ) : (
                  modalSections.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      {renamingSectionId === s.id ? (
                        <>
                          <input
                            autoFocus
                            value={renameSectionName}
                            onChange={(e) =>
                              setRenameSectionName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitRenameSection(s);
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setRenamingSectionId(null);
                              }
                            }}
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => submitRenameSection(s)}
                            className="text-green-600 hover:text-green-800 p-1"
                            aria-label="Guardar nombre"
                          >
                            <Check size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleDefaultSection(s)}
                            title={
                              s.is_default
                                ? "Sección fija (clic para quitar)"
                                : "Marcar como sección fija: sus servicios entran solos a la cotización"
                            }
                            aria-label={`Sección fija: ${s.name}`}
                            className={`p-1 ${
                              s.is_default
                                ? "text-amber-500 hover:text-amber-600"
                                : "text-gray-300 hover:text-amber-500"
                            }`}
                          >
                            <Star
                              size={16}
                              fill={s.is_default ? "currentColor" : "none"}
                            />
                          </button>
                          <span className="flex-1 text-sm text-gray-800 truncate">
                            {s.name}
                            {s.is_default && (
                              <span className="ml-2 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                fija
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveSection(editCat.id, s.id, -1)}
                            disabled={i === 0}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-25 p-1"
                            aria-label="Subir sección"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(editCat.id, s.id, 1)}
                            disabled={i === modalSections.length - 1}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-25 p-1"
                            aria-label="Bajar sección"
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingSectionId(s.id);
                              setRenameSectionName(s.name);
                            }}
                            className="text-gray-400 hover:text-blue-600 p-1"
                            aria-label="Renombrar sección"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSection(s)}
                            className="text-gray-400 hover:text-red-600 p-1"
                            title="Eliminar (sus servicios quedan sin sección)"
                            aria-label="Eliminar sección"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
                <input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSection(editCat.id);
                  }}
                  placeholder="Nueva sección (ej: Entradas, Fondos, Postres…)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => addSection(editCat.id)}
                  disabled={!newSectionName.trim()}
                  className="px-3 py-2 bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-blue-50"
                >
                  + Agregar
                </button>
              </div>

              <div className="px-5 pb-4">
                <button
                  type="button"
                  onClick={closeSectionsModal}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
