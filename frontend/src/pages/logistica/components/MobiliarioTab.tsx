import { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Search, X } from "lucide-react";
import {
  createFurnitureItem,
  getFurnitureItems,
  updateFurnitureItem,
} from "../../../services/logistics.service";
import { FurnitureItem } from "../../../types/logistics.types";

// Mini-catálogo de mobiliario. La Fase 5 (inventario) le agregará foto y
// cantidades disponibles sobre esta misma base.
export default function MobiliarioTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const [rows, setRows] = useState<FurnitureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FurnitureItem | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getFurnitureItems(companyId)
      .then(setRows)
      .finally(() => setLoading(false));
  };
  useEffect(load, [companyId]);

  const open = (f?: FurnitureItem) => {
    setEditing(f || null);
    setName(f?.name || "");
    setErr(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    const { error } = editing
      ? await updateFurnitureItem(editing.id, { name: name.trim() })
      : await createFurnitureItem({ company_id: companyId, name: name.trim() });
    setSaving(false);
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ya existe un ítem con ese nombre."
          : "No se pudo guardar.",
      );
      return;
    }
    setShowModal(false);
    load();
  };

  const toggleActive = async (f: FurnitureItem) => {
    await updateFurnitureItem(f.id, { is_active: !f.is_active });
    load();
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || r.name.toLowerCase().includes(q));

  return (
    <div className="p-6">
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
        <button
          onClick={() => open()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          + Nuevo ítem
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Platos, cubiertos, sillas, mesas… Se usan en las recetas de los
        servicios. En una fase futura este catálogo tendrá foto y cantidades
        para hacer inventario.
      </p>

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
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {["Ítem", "Acciones"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((f) => (
              <tr key={f.id} className={f.is_active ? "" : "opacity-45"}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {f.name}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
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
                      {f.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
    </div>
  );
}
