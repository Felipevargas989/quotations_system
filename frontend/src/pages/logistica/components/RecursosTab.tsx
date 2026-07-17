import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Search, X } from "lucide-react";
import {
  createManagementResource,
  getManagementResources,
  getSuppliers,
  updateManagementResource,
} from "../../../services/logistics.service";
import {
  ManagementResource,
  RESOURCE_TYPE_LABEL,
  ResourceType,
  Supplier,
  resourcePriceLabel,
} from "../../../types/logistics.types";
import { NumberInput } from "../../../components/inputs";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");

const TYPE_CHIP: Record<ResourceType, string> = {
  personal: "bg-blue-100 text-blue-700",
  arriendo: "bg-purple-100 text-purple-700",
  compra: "bg-emerald-100 text-emerald-700",
};

export default function RecursosTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const [rows, setRows] = useState<ManagementResource[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ManagementResource | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<ResourceType>("personal");
  const [priceFixed, setPriceFixed] = useState<number>(0);
  const [pricePerPerson, setPricePerPerson] = useState<number>(0);
  const [supplierId, setSupplierId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getManagementResources(companyId), getSuppliers(companyId)])
      .then(([r, s]) => {
        setRows(r);
        setSuppliers(s);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [companyId]);

  const supplierName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: number | null) => (id ? m.get(id) || "—" : "—");
  }, [suppliers]);

  const open = (r?: ManagementResource) => {
    setEditing(r || null);
    setName(r?.name || "");
    setType(r?.type || "personal");
    setPriceFixed(r?.list_price_fixed || 0);
    setPricePerPerson(r?.list_price_per_person || 0);
    setSupplierId(r?.supplier_id ? String(r.supplier_id) : "");
    setErr(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    const fields = {
      name: name.trim(),
      type,
      list_price_fixed: priceFixed > 0 ? priceFixed : null,
      list_price_per_person: pricePerPerson > 0 ? pricePerPerson : null,
      supplier_id: supplierId ? Number(supplierId) : null,
    };
    const { error } = editing
      ? await updateManagementResource(editing.id, fields)
      : await createManagementResource({ company_id: companyId, ...fields });
    setSaving(false);
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ya existe un recurso con ese nombre."
          : "No se pudo guardar.",
      );
      return;
    }
    setShowModal(false);
    load();
  };

  const toggleActive = async (r: ManagementResource) => {
    await updateManagementResource(r.id, { is_active: !r.is_active });
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
            placeholder="Buscar recurso…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => open()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          + Nuevo recurso
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Staff, arriendos y compras. El precio de lista es opcional (la lista
        anual de tus proveedores): sirve de referencia y en cada evento siempre
        es editable. El staff puede ir sin precio.
      </p>

      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {rows.length === 0
            ? "Aún no hay recursos. Crea el primero (ej: Garzón, Silla arrendada…)."
            : "Sin resultados."}
        </p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {[
                "Recurso",
                "Tipo",
                "Proveedor",
                "Precio de lista",
                "Últ. precio usado",
                "Acciones",
              ].map((h) => (
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
            {filtered.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "opacity-45"}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {r.name}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${TYPE_CHIP[r.type]}`}
                  >
                    {RESOURCE_TYPE_LABEL[r.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {supplierName(r.supplier_id)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {r.list_price_fixed || r.list_price_per_person ? (
                    resourcePriceLabel(r)
                  ) : (
                    <span className="text-gray-400">se asigna por evento</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {r.last_price ? clp(r.last_price) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => open(r)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      className={`p-1.5 rounded-md hover:bg-gray-100 ${
                        r.is_active ? "text-green-600" : "text-gray-400"
                      }`}
                      title={r.is_active ? "Desactivar" : "Activar"}
                    >
                      {r.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
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
                {editing ? "Editar recurso" : "Nuevo recurso"}
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
                  placeholder="Ej: Silla arrendada"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Tipo *
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(Object.keys(RESOURCE_TYPE_LABEL) as ResourceType[]).map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`px-2 py-2 rounded-lg border text-xs font-semibold ${
                          type === t
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {RESOURCE_TYPE_LABEL[t]}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Precio de lista (opcional)
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <NumberInput
                      value={priceFixed || undefined}
                      onChange={(v) => setPriceFixed(v || 0)}
                      min={0}
                      formatThousands
                      placeholder="0"
                    />
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Fijo por evento (ej: transporte)
                    </p>
                  </div>
                  <div>
                    <NumberInput
                      value={pricePerPerson || undefined}
                      onChange={(v) => setPricePerPerson(v || 0)}
                      min={0}
                      formatThousands
                      placeholder="0"
                    />
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Por persona (ej: c/silla)
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Puedes llenar uno, ambos o ninguno. Vacíos = el precio se
                  negocia en cada evento (ej: staff).
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Proveedor (opcional)
                </label>
                <SelectWithSearch
                  options={suppliers
                    .filter((s) => s.is_active)
                    .map((s) => ({ value: String(s.id), label: s.name }))}
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Sin proveedor"
                  searchPlaceholder="Buscar proveedor…"
                  noResultsText="Sin resultados"
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
