import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Coins,
  Edit,
  GripVertical,
  MoreVertical,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react";
import {
  createFixedSection,
  deleteFixedSection,
  getFixedSections,
  reorderFixedSections,
  reorderFixedServices,
  updateFixedSection,
} from "../../../services/services.service";
import { FixedSection, FixedService } from "../../../types/services.types";

// SECCIONES DE SERVICIOS FIJOS (migración 53, pedido de Felipe 30-07:
// "ídem que servicios variables"): cajas con nombre libre, arrastre
// para ordenar secciones y servicios, y mover servicios entre cajas.
// Mismo arrastre nativo del componente de variables. Los servicios sin
// sección viven en la caja "Sin sección" (la herencia parte ahí).

interface Props {
  readonly fixedServices: FixedService[];
  readonly showInactive: boolean;
  readonly onEdit: (s: FixedService) => void;
  readonly onEditRecipe: (s: FixedService) => void;
  readonly onDelete: (id: number) => void;
  readonly onToggleActive: (s: FixedService) => void;
  readonly onServicesChanged: () => void;
}

const clp = (n?: number) =>
  n || n === 0
    ? new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
      }).format(n)
    : "—";

export default function FixedServicesBySection({
  fixedServices,
  showInactive,
  onEdit,
  onEditRecipe,
  onDelete,
  onToggleActive,
  onServicesChanged,
}: Props) {
  const queryClient = useQueryClient();
  const sectionsQuery = useQuery({
    queryKey: ["fixedSections"],
    queryFn: getFixedSections,
  });
  const sections = (sectionsQuery.data ?? []).filter(
    (sec) => showInactive || sec.is_active !== false,
  );
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["fixedSections"] });

  // ---- Estado de edición de secciones ----
  const [newName, setNewName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- Arrastre (mismo patrón nativo que variables) ----
  const dragService = useRef<number | null>(null);
  const dragSection = useRef<number | null>(null);

  const servicesOf = (sectionId: number | null) =>
    fixedServices
      .filter((s) => (s.section_id ?? null) === sectionId)
      .sort(
        (a, b) =>
          (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id,
      );

  const dropOnService = async (
    sectionId: number | null,
    targetId: number,
  ) => {
    const moved = dragService.current;
    dragService.current = null;
    if (moved == null || moved === targetId) return;
    const lista = servicesOf(sectionId)
      .map((s) => s.id)
      .filter((id) => id !== moved);
    const idx = lista.indexOf(targetId);
    lista.splice(idx < 0 ? lista.length : idx, 0, moved);
    await reorderFixedServices(sectionId, lista);
    onServicesChanged();
  };

  const dropOnBox = async (sectionId: number | null) => {
    const moved = dragService.current;
    dragService.current = null;
    if (moved == null) return;
    const lista = servicesOf(sectionId)
      .map((s) => s.id)
      .filter((id) => id !== moved);
    lista.push(moved);
    await reorderFixedServices(sectionId, lista);
    onServicesChanged();
  };

  const dropOnSectionHeader = async (targetId: number) => {
    const moved = dragSection.current;
    dragSection.current = null;
    if (moved == null || moved === targetId) return;
    const ids = sections.map((s) => s.id).filter((id) => id !== moved);
    const idx = ids.indexOf(targetId);
    ids.splice(idx < 0 ? ids.length : idx, 0, moved);
    await reorderFixedSections(ids);
    await invalidate();
  };

  const crearSeccion = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await createFixedSection(name);
      setNewName("");
      setAddingSection(false);
      await invalidate();
    } finally {
      setSaving(false);
    }
  };

  const renombrar = async () => {
    if (!renaming || !renaming.name.trim()) return;
    setSaving(true);
    try {
      await updateFixedSection(renaming.id, { name: renaming.name.trim() });
      setRenaming(null);
      await invalidate();
    } finally {
      setSaving(false);
    }
  };

  const toggleSeccion = async (sec: FixedSection) => {
    await updateFixedSection(sec.id, { is_active: sec.is_active === false });
    setMenuOpen(null);
    await invalidate();
  };

  const eliminarSeccion = async (id: number) => {
    await deleteFixedSection(id);
    setConfirmDelId(null);
    setMenuOpen(null);
    await invalidate();
    onServicesChanged(); // sus servicios caen a "Sin sección"
  };

  const fila = (s: FixedService, sectionId: number | null) => {
    const inactive = s.is_active === false;
    return (
      <div
        key={s.id}
        draggable
        onDragStart={() => {
          dragService.current = s.id;
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.stopPropagation();
          void dropOnService(sectionId, s.id);
        }}
        className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 bg-white hover:bg-gray-50 cursor-grab ${
          inactive ? "opacity-50" : ""
        }`}
      >
        <GripVertical size={14} className="text-gray-300 shrink-0" />
        <span
          className="flex-1 min-w-0 truncate text-sm text-gray-900"
          title={s.name}
        >
          {s.name}
        </span>
        <span className="text-xs text-gray-500 whitespace-nowrap hidden md:inline">
          {s.min_price && s.max_price
            ? `${clp(s.min_price)} – ${clp(s.max_price)}`
            : clp(s.price)}
          {s.price_per_person ? ` · ${clp(s.price_per_person)}/p` : ""}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEditRecipe(s)}
            className="p-1.5 text-gray-400 hover:text-amber-600"
            title="Costos del servicio"
          >
            <Coins size={14} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(s)}
            className="p-1.5 text-gray-400 hover:text-blue-600"
            title="Editar"
          >
            <Edit size={14} />
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(s)}
            className={`p-1.5 ${inactive ? "text-gray-300" : "text-green-500"} hover:text-gray-700`}
            title={inactive ? "Activar" : "Desactivar"}
          >
            <Power size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(s.id)}
            className="p-1.5 text-gray-400 hover:text-red-600"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
    );
  };

  const caja = (sec: FixedSection | null) => {
    const items = servicesOf(sec?.id ?? null);
    if (sec === null && items.length === 0) return null;
    const inactiveSec = sec?.is_active === false;
    return (
      <div
        key={sec?.id ?? "sin-seccion"}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => void dropOnBox(sec?.id ?? null)}
        className={`border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm ${
          inactiveSec ? "opacity-60" : ""
        }`}
      >
        <div
          draggable={!!sec}
          onDragStart={() => {
            if (sec) dragSection.current = sec.id;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            if (sec && dragSection.current != null) {
              e.stopPropagation();
              void dropOnSectionHeader(sec.id);
            }
          }}
          className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-200"
        >
          {sec && (
            <GripVertical size={15} className="text-gray-400 cursor-grab" />
          )}
          {renaming && sec && renaming.id === sec.id ? (
            <span className="flex items-center gap-1 flex-1">
              <input
                autoFocus
                value={renaming.name}
                onChange={(e) =>
                  setRenaming({ id: sec.id, name: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && void renombrar()}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-lg"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void renombrar()}
                className="p-1 text-green-600"
              >
                <Check size={15} />
              </button>
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="p-1 text-gray-500"
              >
                <X size={15} />
              </button>
            </span>
          ) : (
            <span className="flex-1 text-sm font-semibold text-gray-800">
              {sec ? sec.name : "Sin sección"}
              {inactiveSec && " (inactiva)"}
              <span className="ml-2 text-xs font-normal text-gray-400">
                {items.length}
              </span>
            </span>
          )}
          {sec && confirmDelId === sec.id ? (
            <span className="flex items-center gap-1 text-xs">
              ¿Eliminar? Los servicios quedan en "Sin sección"
              <button
                type="button"
                onClick={() => void eliminarSeccion(sec.id)}
                className="px-2 py-0.5 bg-red-600 text-white rounded font-semibold"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelId(null)}
                className="px-2 py-0.5 bg-gray-200 rounded font-semibold"
              >
                No
              </button>
            </span>
          ) : (
            sec && (
              <span className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setMenuOpen(menuOpen === sec.id ? null : sec.id)
                  }
                  className="p-1 text-gray-400 hover:text-gray-700"
                >
                  <MoreVertical size={15} />
                </button>
                {menuOpen === sec.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(null)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming({ id: sec.id, name: sec.name });
                          setMenuOpen(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleSeccion(sec)}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                      >
                        {inactiveSec ? "Activar" : "Desactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelId(sec.id);
                          setMenuOpen(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </span>
            )
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-400">
            Arrastra servicios aquí.
          </p>
        ) : (
          items.map((s) => fila(s, sec?.id ?? null))
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {sections.map((sec) => caja(sec))}
      {caja(null)}
      {addingSection ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void crearSeccion()}
            placeholder="Nombre de la sección (Ej: Arriendo de espacios)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
          />
          <button
            type="button"
            disabled={saving || !newName.trim()}
            onClick={() => void crearSeccion()}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg font-semibold disabled:opacity-50"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingSection(false);
              setNewName("");
            }}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg font-semibold"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingSection(true)}
          className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <Plus size={15} /> Nueva sección
        </button>
      )}
    </div>
  );
}
