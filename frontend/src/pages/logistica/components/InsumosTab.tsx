import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, Pencil, Search, Trash2, X } from "lucide-react";
import {
  createSupply,
  deleteSupply,
  getSuppliers,
  getSupplies,
  getSupplyUsage,
  updateSupply,
} from "../../../services/logistics.service";
import {
  RecipeUnit,
  Supplier,
  Supply,
  UNIT_FAMILY_INFO,
  UNITS_BY_FAMILY,
  UnitFamily,
  toBaseQty,
} from "../../../types/logistics.types";
import { NumberInput } from "../../../components/inputs";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");

export default function InsumosTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const [rows, setRows] = useState<Supply[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supply | null>(null);
  const [name, setName] = useState("");
  const [family, setFamily] = useState<UnitFamily>("masa");
  const [supplierId, setSupplierId] = useState<string>("");
  // Formato de compra: el precio unificado por unidad base se calcula solo.
  const [pkgName, setPkgName] = useState("");
  const [pkgQty, setPkgQty] = useState<number>(1);
  const [pkgUnit, setPkgUnit] = useState<RecipeUnit>("kg");
  const [pkgPrice, setPkgPrice] = useState<number>(0);
  const [waste, setWaste] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Uso por insumo (recetas y compras): decide si la papelera está disponible.
  const [usage, setUsage] = useState<
    Record<number, { recipes: number; provisions: number }>
  >({});
  // Los inactivos se ocultan por defecto para no ensuciar la vista.
  const [showInactive, setShowInactive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);

  // Refresco silencioso: el spinner solo en la PRIMERA carga; al guardar,
  // editar o eliminar, los datos se actualizan por detrás sin mover nada.
  const firstLoad = useRef(true);
  const load = () => {
    if (firstLoad.current) setLoading(true);
    Promise.all([getSupplies(companyId), getSuppliers(companyId)])
      .then(async ([s, p]) => {
        setRows(s);
        setSuppliers(p);
        setUsage(await getSupplyUsage(s.map((x) => x.id)));
      })
      .finally(() => {
        firstLoad.current = false;
        setLoading(false);
      });
  };
  useEffect(load, [companyId]);

  const doDelete = async (s: Supply) => {
    setDeleting(true);
    setListErr(null);
    const { error } = await deleteSupply(s.id);
    setDeleting(false);
    setConfirmDeleteId(null);
    if (error) {
      setListErr(`No se pudo eliminar "${s.name}". Intenta de nuevo.`);
      return;
    }
    load();
  };

  const supplierName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: number | null) => (id ? m.get(id) || "—" : "—");
  }, [suppliers]);

  const open = (s?: Supply) => {
    setEditing(s || null);
    setName(s?.name || "");
    const fam = s?.unit_family || "masa";
    setFamily(fam);
    setSupplierId(s?.supplier_id ? String(s.supplier_id) : "");
    setWaste(s?.waste_pct || 0);
    setPkgName(s?.package_name || "");
    // Sin formato guardado: contenido 1 unidad base y el precio directo,
    // idéntico al comportamiento anterior.
    const baseUnit = UNITS_BY_FAMILY[fam][0];
    if (s?.package_qty && s.package_qty > 0) {
      // Contenidos chicos se muestran en subunidad (750 ml, no 0,75 L).
      if (s.package_qty < 1 && baseUnit !== "u") {
        setPkgQty(s.package_qty * 1000);
        setPkgUnit(UNITS_BY_FAMILY[fam][1] || baseUnit);
      } else {
        setPkgQty(s.package_qty);
        setPkgUnit(baseUnit);
      }
      setPkgPrice(s.package_price || 0);
    } else if (s) {
      // Insumo antiguo sin formato: a granel (contenido 1, precio directo).
      setPkgQty(1);
      setPkgUnit(baseUnit);
      setPkgPrice(s.price || 0);
    } else {
      // Nuevo: parte vacío — Contenido y Precio son obligatorios.
      setPkgQty(0);
      setPkgUnit(baseUnit);
      setPkgPrice(0);
    }
    setErr(null);
    setShowModal(true);
  };

  // Precio unificado por unidad base, calculado en vivo del formato.
  const pkgQtyBase = toBaseQty(pkgQty || 0, pkgUnit);
  const unifiedPrice = pkgQtyBase > 0 ? (pkgPrice || 0) / pkgQtyBase : 0;

  const save = async () => {
    if (!name.trim() || pkgQtyBase <= 0 || !pkgPrice) return;
    setSaving(true);
    setErr(null);
    const fields = {
      name: name.trim(),
      unit_family: family,
      price: unifiedPrice,
      supplier_id: supplierId ? Number(supplierId) : null,
      waste_pct: waste || 0,
      package_name: pkgName.trim() || null,
      package_qty: pkgQtyBase,
      package_price: pkgPrice || 0,
    };
    const { error } = editing
      ? await updateSupply(editing.id, fields)
      : await createSupply({ company_id: companyId, ...fields });
    setSaving(false);
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ya existe un insumo con ese nombre."
          : "No se pudo guardar.",
      );
      return;
    }
    setShowModal(false);
    load();
  };

  const toggleActive = async (s: Supply) => {
    await updateSupply(s.id, { is_active: !s.is_active });
    load();
  };

  const q = search.trim().toLowerCase();
  const inactiveCount = rows.filter((r) => !r.is_active).length;
  const filtered = rows
    .filter((r) => showInactive || r.is_active)
    .filter((r) => !q || r.name.toLowerCase().includes(q));

  // Agrupado por proveedor, como Compras: proveedores alfabéticos,
  // "Sin proveedor" al final, insumos alfabéticos dentro de cada grupo.
  const grouped = (() => {
    const m = new Map<string, Supply[]>();
    filtered.forEach((s) => {
      const key = s.supplier_id
        ? supplierName(s.supplier_id)
        : "Sin proveedor";
      m.set(key, [...(m.get(key) || []), s]);
    });
    return [...m.entries()]
      .map(([name, items]) => ({
        name,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.name === "Sin proveedor") return 1;
        if (b.name === "Sin proveedor") return -1;
        return a.name.localeCompare(b.name);
      });
  })();

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
            placeholder="Buscar insumo…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => open()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          + Nuevo insumo
        </button>
      </div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">
          El precio va por unidad base (kg, L o unidad). Cambiarlo afecta solo
          a eventos futuros; los provisionados mantienen su costo congelado.
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
            ? "Aún no hay insumos. Crea el primero (ej: harina, carne de vacuno…)."
            : "Sin resultados."}
        </p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {["Insumo", "Familia de unidad", "Precio base", "Merma", "Acciones"].map(
                (h) => (
                  <th
                    key={h}
                    // Ancho fijo en Acciones: la confirmación de borrado ocupa
                    // lo mismo que los iconos y la tabla no se reacomoda.
                    className={`px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      h === "Acciones" ? "w-36" : ""
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grouped.map((g) => [
              <tr key={`g-${g.name}`}>
                <td
                  colSpan={5}
                  className="px-4 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50"
                >
                  {g.name}
                </td>
              </tr>,
              ...g.items.map((s) => {
              const fam = UNIT_FAMILY_INFO[s.unit_family];
              return (
                <tr key={s.id} className={s.is_active ? "" : "opacity-45"}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                      {fam.label}
                    </span>{" "}
                    <span className="text-xs text-gray-400">{fam.units}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {clp(Math.round(s.price))}{" "}
                    <span className="text-xs text-gray-400">/{fam.base}</span>
                    {s.package_qty &&
                      s.package_qty > 0 &&
                      (s.package_name || s.package_qty !== 1) && (
                        <div className="text-xs text-gray-400">
                          {s.package_name || "formato"} de{" "}
                          {Number(s.package_qty).toLocaleString("es-CL")}{" "}
                          {fam.base} · {clp(s.package_price || 0)}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {s.waste_pct ? `${s.waste_pct}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {/* La confirmación flota ENCIMA de los iconos (que quedan
                        invisibles pero ocupando su espacio): el contenido que
                        dimensiona la tabla nunca cambia → cero movimiento. */}
                    <div className="relative">
                      {confirmDeleteId === s.id && (
                        <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 whitespace-nowrap bg-white">
                          <span className="text-xs text-gray-600">
                            ¿Eliminar?
                          </span>
                          <button
                            disabled={deleting}
                            onClick={() => doDelete(s)}
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
                          confirmDeleteId === s.id ? "invisible" : ""
                        }`}
                      >
                        <button
                          onClick={() => open(s)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => toggleActive(s)}
                          className={`p-1.5 rounded-md hover:bg-gray-100 ${
                            s.is_active ? "text-green-600" : "text-gray-400"
                          }`}
                          title={s.is_active ? "Desactivar" : "Activar"}
                        >
                          {s.is_active ? (
                            <Eye size={15} />
                          ) : (
                            <EyeOff size={15} />
                          )}
                        </button>
                        {(() => {
                          const u = usage[s.id];
                          const inUse =
                            !!u && (u.recipes > 0 || u.provisions > 0);
                          if (inUse) {
                            const parts = [];
                            if (u.recipes > 0)
                              parts.push(
                                `${u.recipes} receta${u.recipes === 1 ? "" : "s"}`,
                              );
                            if (u.provisions > 0)
                              parts.push(
                                `${u.provisions} compra${u.provisions === 1 ? "" : "s"} registrada${u.provisions === 1 ? "" : "s"}`,
                              );
                            return (
                              <button
                                disabled
                                className="p-1.5 rounded-md text-gray-300 cursor-not-allowed"
                                title={`En uso (${parts.join(", ")}): no se puede eliminar, solo desactivar`}
                              >
                                <Trash2 size={15} />
                              </button>
                            );
                          }
                          return (
                            <button
                              onClick={() => setConfirmDeleteId(s.id)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                              title="Eliminar (no está en ninguna receta)"
                            >
                              <Trash2 size={15} />
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </td>
                </tr>
              );
              }),
            ])}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {editing ? "Editar insumo" : "Nuevo insumo"}
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
                  placeholder="Ej: Harina"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Familia de unidad *
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(Object.keys(UNIT_FAMILY_INFO) as UnitFamily[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setFamily(f);
                        if (!UNITS_BY_FAMILY[f].includes(pkgUnit))
                          setPkgUnit(UNITS_BY_FAMILY[f][0]);
                      }}
                      className={`px-2 py-2 rounded-lg border text-xs font-semibold ${
                        family === f
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {UNIT_FAMILY_INFO[f].label}
                      <div className="font-normal text-[10px] text-gray-400">
                        {UNIT_FAMILY_INFO[f].units}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {/* Cómo se compra de verdad: el precio unificado se calcula solo */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-gray-700">
                  ¿Cómo lo compras?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Formato (opcional)
                    </label>
                    <input
                      value={pkgName}
                      onChange={(e) => setPkgName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Ej: botella, caja"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Contenido *
                    </label>
                    <div className="flex gap-1">
                      <NumberInput
                        value={pkgQty || undefined}
                        onChange={(v) => setPkgQty(v || 0)}
                        min={0}
                        className="text-sm text-right"
                        placeholder="0"
                      />
                      <select
                        value={pkgUnit}
                        onChange={(e) =>
                          setPkgUnit(e.target.value as RecipeUnit)
                        }
                        className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                      >
                        {UNITS_BY_FAMILY[family].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">
                    Precio del formato *
                  </label>
                  <NumberInput
                    value={pkgPrice || undefined}
                    onChange={(v) => setPkgPrice(v || 0)}
                    min={0}
                    formatThousands
                    placeholder="0"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {pkgQtyBase > 0 ? (
                    <>
                      Precio unificado:{" "}
                      <span className="font-semibold text-gray-800">
                        {clp(Math.round(unifiedPrice))} por{" "}
                        {UNIT_FAMILY_INFO[family].base}
                      </span>
                    </>
                  ) : (
                    "Ingresa el contenido del formato para calcular el precio unificado."
                  )}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Merma (%)
                </label>
                <NumberInput
                  value={waste || undefined}
                  onChange={(v) => setWaste(Math.min(v || 0, 99))}
                  min={0}
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Lo que se pierde al limpiar o cocinar. Las recetas se
                  ingresan en neto (lo servido); compras y costos usan la
                  cantidad bruta.
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
                  disabled={
                    saving || !name.trim() || pkgQtyBase <= 0 || !pkgPrice
                  }
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
