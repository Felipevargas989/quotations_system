import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Coins,
  Edit,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  createFixedSection,
  deleteFixedSection,
  getFixedSections,
  reorderFixedSections,
  reorderFixedServices,
  updateFixedSection,
} from "../../../services/services.service";
import { FixedService } from "../../../types/services.types";
import SectionChipSelect from "../../../components/selects/SectionChipSelect";

// SERVICIOS FIJOS EN UNA SOLA CAJA (migración 53, diseño de Felipe
// 30-07 tras dos vueltas): las secciones NO son cajas apiladas — son
// rótulos DENTRO de la caja, exactamente como las secciones de una
// categoría de variables. El modal "Secciones" (⋮) es el calco del de
// arriba, sin la estrella de "fija" (exclusiva del cotizador de
// variables). Monedas NARANJAS para costos (el gorro es de recetas).

interface Props {
  readonly fixedServices: FixedService[];
  readonly onEdit: (s: FixedService) => void;
  readonly onEditRecipe: (s: FixedService) => void;
  readonly onDelete: (id: number) => void;
  readonly onToggleActive: (s: FixedService) => void;
  readonly onServicesChanged: () => void;
  // Códigos presentes en alguna cotización: su basurero se apaga.
  readonly usedCodes: Set<string>;
}

const clp = (n?: number) =>
  n || n === 0 ? `$${Number(n).toLocaleString("es-CL")}` : "—";

export default function FixedServicesBySection({
  fixedServices,
  onEdit,
  onEditRecipe,
  onDelete,
  onToggleActive,
  onServicesChanged,
  usedCodes,
}: Props) {
  const queryClient = useQueryClient();
  const sectionsQuery = useQuery({
    queryKey: ["fixedSections"],
    queryFn: getFixedSections,
  });
  const sections = sectionsQuery.data ?? [];
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["fixedSections"] });

  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSections, setShowSections] = useState(false);

  // ---- Modal de secciones (estado calcado del de variables) ----
  const [newSectionName, setNewSectionName] = useState("");
  const [renamingSectionId, setRenamingSectionId] = useState<number | null>(
    null,
  );
  const [renameSectionName, setRenameSectionName] = useState("");

  // ---- Arrastre de servicios (calcado de variables, 30-07 v2):
  // SOLO reordena dentro del grupo (cruzar sección = la cajita), y la
  // pantalla se mueve AL INSTANTE (orden local optimista) mientras el
  // servidor confirma en silencio. ----
  const dragService = useRef<number | null>(null);
  const dragFrom = useRef<number | null | "nada">("nada");
  // Orden/membresía local por grupo (clave: id de sección o "sin").
  const [localOrder, setLocalOrder] = useState<Record<string, number[]>>({});
  const keyOf = (sectionId: number | null) =>
    sectionId === null ? "sin" : String(sectionId);

  const byId = new Map(fixedServices.map((s) => [s.id, s]));
  const servicesOf = (sectionId: number | null): FixedService[] => {
    const override = localOrder[keyOf(sectionId)];
    if (override) {
      return override
        .map((id) => byId.get(id))
        .filter((s): s is FixedService => !!s);
    }
    return fixedServices
      .filter((s) => (s.section_id ?? null) === sectionId)
      .sort(
        (a, b) =>
          (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id,
      );
  };

  const dropOnService = async (sectionId: number | null, targetId: number) => {
    const moved = dragService.current;
    const desde = dragFrom.current;
    dragService.current = null;
    dragFrom.current = "nada";
    // Como arriba: el arrastre NO cruza secciones.
    if (moved == null || moved === targetId || desde !== sectionId) return;
    const lista = servicesOf(sectionId)
      .map((s) => s.id)
      .filter((id) => id !== moved);
    const idx = lista.indexOf(targetId);
    lista.splice(idx < 0 ? lista.length : idx, 0, moved);
    setLocalOrder((prev) => ({ ...prev, [keyOf(sectionId)]: lista }));
    await reorderFixedServices(sectionId, lista);
  };

  const dropOnGroup = async (sectionId: number | null) => {
    const moved = dragService.current;
    const desde = dragFrom.current;
    dragService.current = null;
    dragFrom.current = "nada";
    if (moved == null || desde !== sectionId) return;
    const lista = servicesOf(sectionId)
      .map((s) => s.id)
      .filter((id) => id !== moved);
    lista.push(moved);
    setLocalOrder((prev) => ({ ...prev, [keyOf(sectionId)]: lista }));
    await reorderFixedServices(sectionId, lista);
  };

  // Cajita desplegable de la fila: mover de sección (optimista).
  const changeSection = async (s: FixedService, sectionId: number | null) => {
    const origen = (s.section_id ?? null) as number | null;
    if (origen === sectionId) return;
    const listaOrigen = servicesOf(origen)
      .map((x) => x.id)
      .filter((id) => id !== s.id);
    const listaDestino = servicesOf(sectionId)
      .map((x) => x.id)
      .filter((id) => id !== s.id);
    listaDestino.push(s.id);
    setLocalOrder((prev) => ({
      ...prev,
      [keyOf(origen)]: listaOrigen,
      [keyOf(sectionId)]: listaDestino,
    }));
    await reorderFixedServices(sectionId, listaDestino);
  };

  // ---- Acciones del modal ----
  const addSection = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    await createFixedSection(name);
    setNewSectionName("");
    await invalidate();
  };

  const submitRenameSection = async () => {
    if (renamingSectionId == null || !renameSectionName.trim()) return;
    await updateFixedSection(renamingSectionId, {
      name: renameSectionName.trim(),
    });
    setRenamingSectionId(null);
    await invalidate();
  };

  const moveSection = async (id: number, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderFixedSections(ids);
    await invalidate();
  };

  const removeSection = async (id: number) => {
    await deleteFixedSection(id);
    await invalidate();
    onServicesChanged(); // sus servicios quedan en "Sin sección"
  };

  const fila = (s: FixedService, sectionId: number | null) => {
    const inactive = s.is_active === false;
    return (
      <div
        key={s.id}
        draggable
        onDragStart={() => {
          dragService.current = s.id;
          dragFrom.current = sectionId;
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.stopPropagation();
          void dropOnService(sectionId, s.id);
        }}
        className={`flex items-center justify-between px-3 py-2 rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 ${
          inactive ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-center space-x-3 min-w-0">
          <GripVertical
            size={16}
            className="text-gray-400 cursor-grab flex-shrink-0"
          />
          <span className="text-sm text-gray-900 truncate" title={s.name}>
            {s.name}
          </span>
          <span className="text-sm text-gray-500 flex-shrink-0">
            {s.min_price && s.max_price
              ? `${clp(s.min_price)} – ${clp(s.max_price)}`
              : clp(s.price)}
            {s.price_per_person ? ` · ${clp(s.price_per_person)}/p` : ""}
          </span>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          {sections.length > 0 && (
            <SectionChipSelect
              value={(() => {
                for (const [k, ids] of Object.entries(localOrder)) {
                  if (ids.includes(s.id)) return k === "sin" ? 0 : Number(k);
                }
                return s.section_id || 0;
              })()}
              options={sections.map((sec) => ({ id: sec.id, name: sec.name }))}
              onChange={(id) => void changeSection(s, id === 0 ? null : id)}
              title="Sección"
              ariaLabel={`Sección de ${s.name}`}
            />
          )}
          <button
            type="button"
            title={inactive ? "Activar" : "Desactivar"}
            onClick={() => onToggleActive(s)}
            className="text-gray-400 hover:text-gray-700"
          >
            {inactive ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            title="Costos"
            onClick={() => onEditRecipe(s)}
            className="text-amber-600 hover:text-amber-800"
          >
            <Coins size={16} />
          </button>
          <button
            type="button"
            title="Editar"
            onClick={() => onEdit(s)}
            className="text-blue-600 hover:text-blue-800"
          >
            <Edit size={16} />
          </button>
          {usedCodes.has(s.code || "") ? (
            <span className="text-gray-300 cursor-not-allowed">
              <Trash2 size={16} />
            </span>
          ) : (
            <button
              type="button"
              title="Eliminar"
              onClick={() => onDelete(s.id)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // Grupos: cada sección en su orden + "Sin sección" al final. Los
  // rótulos solo aparecen cuando existen secciones (como arriba).
  const grupos: { sectionId: number | null; nombre: string }[] = [
    ...sections.map((sec) => ({
      sectionId: sec.id as number | null,
      nombre: sec.name,
    })),
    { sectionId: null, nombre: "Sin sección" },
  ];
  const totalServicios = fixedServices.length;

  return (
    <div className="bg-white rounded-lg shadow border-l-4 border-blue-400 overflow-hidden">
      {/* Cabecera única: flechita + título + conteo + ⋮ (solo Secciones) */}
      <div
        onClick={() => setOpen((v) => !v)}
        className={`relative px-4 py-3 flex items-center justify-between cursor-pointer bg-blue-50/50 ${
          open ? "border-b border-blue-100" : ""
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
          )}
          <h3 className="font-medium text-gray-900">Servicios fijos</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {totalServicios} servicio{totalServicios === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Menú de servicios fijos"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-gray-700"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowSections(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <Layers size={14} /> Secciones
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Servicios agrupados por rótulo de sección, como arriba */}
      {open && (
        <div className="p-2">
          {totalServicios === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">
              No hay servicios fijos registrados.
            </p>
          ) : (
            grupos.map(({ sectionId, nombre }) => {
              const items = servicesOf(sectionId);
              if (sectionId === null && items.length === 0) return null;
              return (
                <div
                  key={sectionId ?? "sin"}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void dropOnGroup(sectionId)}
                >
                  {sections.length > 0 && (
                    <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      {nombre}
                    </div>
                  )}
                  {items.length === 0 && sectionId !== null ? (
                    <p className="px-3 pb-1 text-xs text-gray-300">
                      Arrastra o asigna servicios aquí.
                    </p>
                  ) : (
                    items.map((s) => fila(s, sectionId))
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal de secciones: calco del de variables, sin la estrella
          "fija" (esa es exclusiva del cotizador de variables). */}
      {showSections && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSections(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                Secciones · Servicios fijos
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Ordenan la caja de servicios fijos. Cada servicio se asigna
                desde su cajita en la lista, o arrastrándolo.
              </p>
            </div>

            <div className="px-3 py-2 overflow-y-auto flex-1">
              {sections.length === 0 ? (
                <p className="px-2 py-3 text-sm text-gray-400">
                  Aún no hay secciones. Crea la primera abajo.
                </p>
              ) : (
                sections.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                  >
                    {renamingSectionId === s.id ? (
                      <>
                        <input
                          autoFocus
                          value={renameSectionName}
                          onChange={(e) => setRenameSectionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void submitRenameSection();
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setRenamingSectionId(null);
                            }
                          }}
                          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => void submitRenameSection()}
                          className="text-green-600 hover:text-green-800 p-1"
                          aria-label="Guardar nombre"
                        >
                          <Check size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-gray-800 truncate pl-1">
                          {s.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => void moveSection(s.id, -1)}
                          disabled={i === 0}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-25 p-1"
                          aria-label="Subir sección"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveSection(s.id, 1)}
                          disabled={i === sections.length - 1}
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
                          onClick={() => void removeSection(s.id)}
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
                  if (e.key === "Enter") void addSection();
                }}
                placeholder="Nueva sección (ej: Salones, Equipamiento…)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void addSection()}
                disabled={!newSectionName.trim()}
                className="px-3 py-2 bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-blue-50"
              >
                + Agregar
              </button>
            </div>

            <div className="px-5 pb-4">
              <button
                type="button"
                onClick={() => setShowSections(false)}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
