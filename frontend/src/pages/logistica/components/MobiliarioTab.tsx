import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Camera,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createFurnitureItem,
  deleteFurnitureItem,
  getAcceptedEvents,
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getFurnitureItems,
  getFurnitureUsage,
  getSupplies,
  updateFurnitureItem,
} from "../../../services/logistics.service";
import {
  FURNITURE_CATEGORY_LABEL,
  FurnitureCategory,
  FurnitureItem,
} from "../../../types/logistics.types";
import { uploadFurniturePhoto } from "../../../services/storage.service";
import {
  EventItemsSnapshot,
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
} from "../../../utils/eventConsolidation";
import PhotoPopup from "../../../components/PhotoPopup";

// Inventario de mobiliario (Fase 5): stock editable (fluctúa por temporada),
// categoría fija, y foto de referencia en popup para distinguir ítems
// parecidos (7 tipos de platos, 5 cuchillos...). Abajo, el radar de
// disponibilidad: fechas futuras donde la demanda de los eventos supera el
// stock (el mobiliario se libera al día siguiente → conflicto = misma fecha).

interface DateConflict {
  date: string; // yyyy-mm-dd
  events: string[]; // "#5 Tour Sur"
  items: { name: string; needed: number; stock: number }[];
}

export default function MobiliarioTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FurnitureItem | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FurnitureCategory>("otro");
  const [stock, setStock] = useState<number>(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [photoView, setPhotoView] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Datos para el radar de disponibilidad.
  const [availData, setAvailData] = useState<{
    conflicts: DateConflict[];
    loaded: boolean;
  }>({ conflicts: [], loaded: false });

  // Los inactivos se ocultan por defecto para no ensuciar la vista.
  const [showInactive, setShowInactive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);

  // Vía React Query (Etapa 3): spinner solo la PRIMERA carga; refrescos
  // silenciosos tras cada guardado (histórico). usage (recetas por
  // ítem) decide si la papelera está disponible.
  const mobiliarioQuery = useQuery({
    queryKey: ["logistica", "mobiliario", companyId],
    queryFn: async () => {
      const [f, u] = await Promise.all([
        getFurnitureItems(companyId),
        getFurnitureUsage(companyId),
      ]);
      return { rows: f, usage: u };
    },
  });
  const rows = mobiliarioQuery.data?.rows ?? [];
  const usage = mobiliarioQuery.data?.usage ?? {};
  const loading = mobiliarioQuery.isPending;
  const load = () =>
    queryClient.invalidateQueries({ queryKey: ["logistica", "mobiliario"] });

  const doDelete = async (f: FurnitureItem) => {
    setDeleting(true);
    setListErr(null);
    const { error } = await deleteFurnitureItem(f.id);
    setDeleting(false);
    setConfirmDeleteId(null);
    if (error) {
      setListErr(`No se pudo eliminar "${f.name}". Intenta de nuevo.`);
      return;
    }
    load();
  };

  // Radar: consolida los eventos futuros y busca fechas en conflicto.
  useEffect(() => {
    let alive = true;
    Promise.all([
      getAcceptedEvents(companyId),
      getAllRecipeItems(companyId),
      getSupplies(companyId),
      getFurnitureItems(companyId),
      getCatalogServiceNameIds(companyId),
    ]).then(([events, recipes, supplies, furniture, nameIds]) => {
      if (!alive) return;
      const ctx = buildConsolidationContext(
        recipes,
        supplies,
        furniture,
        nameIds,
        {},
      );
      const stockById = new Map(furniture.map((f) => [f.id, f.stock || 0]));
      const nameById = new Map(furniture.map((f) => [f.id, f.name]));
      const today = new Date().toISOString().slice(0, 10);

      // demanda por fecha: fecha → (item → total)
      const byDate = new Map<
        string,
        { events: string[]; need: Map<number, number> }
      >();
      // (tipado explícito para evitar inferencia never[] en events)
      // Un evento multi-día retiene su mobiliario TODOS los días del rango:
      // su necesidad se suma en cada día, no solo en el primero.
      events.forEach((ev) => {
        if (!ev.event_date) return;
        const start = new Date(ev.event_date).toISOString().slice(0, 10);
        const end = ev.event_end_date
          ? new Date(ev.event_end_date).toISOString().slice(0, 10)
          : start;
        const lastDay = end >= start ? end : start;

        const acc = newAccumulator();
        const r = consolidateEvent(
          ev.items as EventItemsSnapshot,
          ev.people_count || 0,
          ctx,
          acc,
        );
        if (r.furnPeak.size === 0) return;

        // días del rango (tope de seguridad: 60 días)
        let cursor = new Date(`${start}T00:00:00Z`).getTime();
        const lastMs = new Date(`${lastDay}T00:00:00Z`).getTime();
        for (
          let dayN = 0;
          cursor <= lastMs && dayN < 60;
          cursor += 86400000, dayN++
        ) {
          const date = new Date(cursor).toISOString().slice(0, 10);
          if (date < today) continue;
          const entry = byDate.get(date) || {
            events: [] as string[],
            need: new Map<number, number>(),
          };
          entry.events.push(`#${ev.quotation_number} ${ev.client_name}`);
          r.furnPeak.forEach((p, itemId) => {
            entry.need.set(
              itemId,
              (entry.need.get(itemId) || 0) + Math.ceil(p.total),
            );
          });
          byDate.set(date, entry);
        }
      });

      const conflicts: DateConflict[] = [];
      [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([date, entry]) => {
          const items: DateConflict["items"] = [];
          entry.need.forEach((needed, itemId) => {
            const s = stockById.get(itemId) || 0;
            if (s > 0 && needed > s) {
              items.push({
                name: nameById.get(itemId) || "—",
                needed,
                stock: s,
              });
            }
          });
          if (items.length) {
            conflicts.push({ date, events: entry.events, items });
          }
        });
      setAvailData({ conflicts, loaded: true });
    });
    return () => {
      alive = false;
    };
  }, [companyId, rows]);

  const open = (f?: FurnitureItem) => {
    setEditing(f || null);
    setName(f?.name || "");
    setCategory(f?.category || "otro");
    setStock(f?.stock || 0);
    setPhotoFile(null);
    setErr(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    let itemId = editing?.id;
    if (editing) {
      const { error } = await updateFurnitureItem(editing.id, {
        name: name.trim(),
        category,
        stock: stock || 0,
      });
      if (error) {
        setSaving(false);
        setErr("No se pudo guardar.");
        return;
      }
    } else {
      const { data, error } = await createFurnitureItem({
        company_id: companyId,
        name: name.trim(),
        category,
        stock: stock || 0,
      });
      if (error || !data) {
        setSaving(false);
        setErr(
          String((error as any)?.message || error).includes("unique")
            ? "Ya existe un ítem con ese nombre."
            : "No se pudo guardar.",
        );
        return;
      }
      itemId = data.id;
    }
    // Foto (opcional): se sube al final, cuando ya existe el id.
    if (photoFile && itemId) {
      const up = await uploadFurniturePhoto(photoFile, companyId, itemId);
      if (up.success && up.url) {
        await updateFurnitureItem(itemId, { photo_url: up.url });
      } else if (up.error) {
        setErr(up.error);
      }
    }
    setSaving(false);
    setShowModal(false);
    load();
  };

  const toggleActive = async (f: FurnitureItem) => {
    await updateFurnitureItem(f.id, { is_active: !f.is_active });
    load();
  };

  // Stock editable en la fila (autosave onBlur): el caché se actualiza
  // quirúrgicamente para que la fila no salte, y se confirma por detrás.
  const saveStock = async (f: FurnitureItem, value: number) => {
    if (value === f.stock || value < 0) return;
    await updateFurnitureItem(f.id, { stock: value });
    queryClient.setQueryData<{
      rows: FurnitureItem[];
      usage: Record<number, { recipes: number }>;
    }>(["logistica", "mobiliario", companyId], (prev) =>
      prev && {
        ...prev,
        rows: prev.rows.map((r) =>
          r.id === f.id ? { ...r, stock: value } : r,
        ),
      },
    );
    load();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const q = search.trim().toLowerCase();
  const inactiveCount = rows.filter((r) => !r.is_active).length;
  const filtered = useMemo(() => {
    const catOrder = Object.keys(FURNITURE_CATEGORY_LABEL);
    return rows
      .filter((r) => showInactive || r.is_active)
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          catOrder.indexOf(a.category) - catOrder.indexOf(b.category) ||
          a.name.localeCompare(b.name),
      );
  }, [rows, q, showInactive]);

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1 gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar mobiliario…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            {savedFlash && (
              <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                <Check size={13} /> Guardado
              </span>
            )}
            <button
              onClick={() => open()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              + Nuevo ítem
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400">
            Inventario: stock editable en la fila (fluctúa por temporada) y
            foto de referencia — clic en la miniatura para verla en grande.
          </p>
          {inactiveCount > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="text-xs text-blue-600 hover:underline shrink-0"
            >
              {showInactive
                ? "Ocultar inactivos"
                : `Ver inactivos (${inactiveCount})`}
            </button>
          )}
        </div>
        {listErr && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{listErr}</p>
          </div>
        )}

        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            {rows.length === 0
              ? "Aún no hay mobiliario. Crea el primero (ej: Plato de fondo, Silla…)."
              : "Sin resultados."}
          </p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Ítem
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Categoría
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                    Stock
                  </th>
                  {/* Ancho fijo: la confirmación de borrado ocupa lo mismo
                      que los iconos y la tabla no se reacomoda. */}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-36">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((f) => (
                  <tr key={f.id} className={f.is_active ? "" : "opacity-45"}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        {f.photo_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoView({
                                url: f.photo_url as string,
                                title: f.name,
                              })
                            }
                            title="Ver foto"
                            className="shrink-0"
                          >
                            <img
                              src={f.photo_url}
                              alt={f.name}
                              className="w-9 h-9 rounded-md object-cover border border-gray-200 hover:ring-2 hover:ring-blue-400"
                            />
                          </button>
                        ) : (
                          <div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                            <Camera size={14} className="text-gray-300" />
                          </div>
                        )}
                        <span className="font-medium text-gray-900">
                          {f.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {FURNITURE_CATEGORY_LABEL[f.category] || "Otro"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        defaultValue={f.stock || ""}
                        placeholder="0"
                        onBlur={(e) => {
                          const v =
                            parseFloat(
                              e.target.value.replace(/\./g, ""),
                            ) || 0;
                          saveStock(f, v);
                          e.target.value = v
                            ? v.toLocaleString("es-CL")
                            : "";
                        }}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                        aria-label={`Stock de ${f.name}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      {/* La confirmación flota ENCIMA de los iconos (que
                          quedan invisibles pero ocupando su espacio). */}
                      <div className="relative">
                        {confirmDeleteId === f.id && (
                          <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 whitespace-nowrap bg-white">
                            <span className="text-xs text-gray-600">
                              ¿Eliminar?
                            </span>
                            <button
                              disabled={deleting}
                              onClick={() => doDelete(f)}
                              className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                              title="Sí, eliminar"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              disabled={deleting}
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 text-gray-500 hover:text-gray-700"
                              title="Cancelar"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        )}
                        <div
                          className={`flex items-center gap-2 h-7 ${
                            confirmDeleteId === f.id ? "invisible" : ""
                          }`}
                        >
                          <button
                            onClick={() => open(f)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => toggleActive(f)}
                            className={`p-1.5 rounded-md hover:bg-gray-100 ${
                              f.is_active ? "text-green-600" : "text-gray-400"
                            }`}
                            title={f.is_active ? "Desactivar" : "Activar"}
                          >
                            {f.is_active ? (
                              <Eye size={15} />
                            ) : (
                              <EyeOff size={15} />
                            )}
                          </button>
                          {(() => {
                            const u = usage[f.id];
                            const inUse = !!u && u.recipes > 0;
                            if (inUse) {
                              return (
                                <button
                                  disabled
                                  className="p-1.5 rounded-md text-gray-300 cursor-not-allowed"
                                  title={`En uso en ${u.recipes} receta${u.recipes === 1 ? "" : "s"}: no se puede eliminar, solo desactivar`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              );
                            }
                            return (
                              <button
                                onClick={() => setConfirmDeleteId(f.id)}
                                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                                title="Eliminar"
                              >
                                <Trash2 size={15} />
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Radar de disponibilidad ---------- */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <CalendarDays size={15} className="text-gray-500" />
          <h3 className="text-sm font-bold text-gray-800">
            Disponibilidad por fecha
          </h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Fechas futuras donde los eventos del día superan el stock. La
          necesidad de cada evento es su máximo simultáneo entre servicios (el
          mobiliario se lava y reutiliza; se libera al día siguiente).
        </p>
        {!availData.loaded ? (
          <div className="py-4 flex justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          </div>
        ) : availData.conflicts.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-medium">
            ✓ Sin conflictos de stock en los eventos futuros.
          </div>
        ) : (
          <div className="space-y-3">
            {availData.conflicts.map((c) => (
              <div
                key={c.date}
                className="border border-red-200 bg-red-50 rounded-lg p-3"
              >
                <p className="text-sm font-bold text-red-700 capitalize">
                  {fmtDate(c.date)}
                </p>
                <p className="text-xs text-red-500 mb-1.5">
                  {c.events.join(" · ")}
                </p>
                <ul className="text-xs text-red-700 space-y-0.5">
                  {c.items.map((it) => (
                    <li key={it.name}>
                      <span className="font-semibold">{it.name}</span>: se
                      necesitan {it.needed.toLocaleString("es-CL")} · stock{" "}
                      {it.stock.toLocaleString("es-CL")} →{" "}
                      <span className="font-bold">
                        faltan {(it.needed - it.stock).toLocaleString("es-CL")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Modal crear/editar ---------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {editing ? "Editar ítem" : "Nuevo ítem de mobiliario"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Nombre *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: Plato de fondo"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Categoría
                </label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(
                    Object.keys(FURNITURE_CATEGORY_LABEL) as FurnitureCategory[]
                  ).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                        category === c
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {FURNITURE_CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Stock disponible
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={stock ? stock.toLocaleString("es-CL") : ""}
                  onChange={(e) => {
                    const v =
                      parseFloat(e.target.value.replace(/\./g, "")) || 0;
                    setStock(v);
                  }}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Foto de referencia (opcional)
                </label>
                <div className="flex items-center gap-3 mt-1">
                  {editing?.photo_url && !photoFile && (
                    <img
                      src={editing.photo_url}
                      alt={editing.name}
                      className="w-12 h-12 rounded-md object-cover border border-gray-200"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) =>
                      setPhotoFile(e.target.files?.[0] || null)
                    }
                    className="text-xs text-gray-600"
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  Para distinguir ítems parecidos (7 tipos de platos…). JPG,
                  PNG o WebP, máx 5MB.
                </p>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 text-sm text-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {photoView && (
        <PhotoPopup
          url={photoView.url}
          title={photoView.title}
          onClose={() => setPhotoView(null)}
        />
      )}
    </div>
  );
}
