import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { FixedService } from "../../../types/services.types";
import {
  addFixedServiceCostItem,
  createManagementResource,
  deleteFixedServiceCostItem,
  getFixedServiceCostItems,
  getManagementResources,
  getSuppliers,
  updateFixedServiceCostItem,
  updateFixedServiceCosts,
} from "../../../services/logistics.service";
import {
  CHARGE_MODE_LABEL,
  ChargeMode,
  FixedServiceCostItem,
  ManagementResource,
  RESOURCE_TYPE_LABEL,
  ResourceType,
  Supplier,
} from "../../../types/logistics.types";
import { NumberInput } from "../../../components/inputs";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

// Costo de un servicio fijo como REFERENCIAS al catálogo de recursos:
// cada línea apunta a un recurso con precio de lista (ej: la lista anual de
// FL Services). Al actualizar el precio en el catálogo, todos los servicios
// que lo referencian se actualizan solos. Totales cacheados en cost_fixed /
// cost_per_person para otras vistas.
export default function FixedCostSection({
  service,
  companyId,
}: {
  readonly service: FixedService;
  readonly companyId: number;
}) {
  const [items, setItems] = useState<FixedServiceCostItem[]>([]);
  const [resources, setResources] = useState<ManagementResource[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);


  // Mini-form de creación al vuelo (inline)
  const [newOpen, setNewOpen] = useState(false);
  const [nName, setNName] = useState("");
  const [nType, setNType] = useState<ResourceType>("arriendo");
  const [nMode, setNMode] = useState<ChargeMode>("por_evento");
  const [nPrice, setNPrice] = useState<number>(0);
  const [nSupplier, setNSupplier] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      getFixedServiceCostItems(companyId, service.id),
      getManagementResources(companyId),
      getSuppliers(companyId),
    ])
      .then(([i, r, s]) => {
        setItems(i);
        setResources(r);
        setSuppliers(s);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [companyId, service.id]);

  const resById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );
  const supName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: number | null) => (id ? m.get(id) : undefined);
  }, [suppliers]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const lineAmount = (it: FixedServiceCostItem): number => {
    const r = resById.get(it.resource_id);
    return (r?.list_price || 0) * (it.quantity || 1);
  };
  const totalFixed = items
    .filter((it) => resById.get(it.resource_id)?.charge_mode === "por_evento")
    .reduce((t, it) => t + lineAmount(it), 0);
  const totalPerPerson = items
    .filter((it) => resById.get(it.resource_id)?.charge_mode === "por_persona")
    .reduce((t, it) => t + lineAmount(it), 0);

  // Mantener los totales cacheados en fixed_services al día.
  const syncTotals = async (
    current: FixedServiceCostItem[],
    res: Map<number, ManagementResource>,
  ) => {
    const fixed = current
      .filter((it) => res.get(it.resource_id)?.charge_mode === "por_evento")
      .reduce((t, it) => t + (res.get(it.resource_id)?.list_price || 0) * it.quantity, 0);
    const perPerson = current
      .filter((it) => res.get(it.resource_id)?.charge_mode === "por_persona")
      .reduce((t, it) => t + (res.get(it.resource_id)?.list_price || 0) * it.quantity, 0);
    await updateFixedServiceCosts(service.id, {
      cost_fixed: Math.round(fixed),
      cost_per_person: Math.round(perPerson),
    });
  };

  const reloadAndSync = async () => {
    const fresh = await getFixedServiceCostItems(companyId, service.id);
    setItems(fresh);
    await syncTotals(fresh, resById);
    flashSaved();
  };

  // Seleccionar en el buscador AGREGA la línea al tiro (cantidad 1, editable
  // después en la fila). Sin estados intermedios ni botón +.
  const addLine = async (resourceId: string) => {
    if (!resourceId) return;
    setErr(null);
    const { error } = await addFixedServiceCostItem({
      company_id: companyId,
      fixed_service_id: service.id,
      resource_id: Number(resourceId),
      quantity: 1,
    });
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ese recurso ya está en el costo."
          : "No se pudo agregar.",
      );
      return;
    }
    reloadAndSync();
  };

  const removeLine = async (id: number) => {
    await deleteFixedServiceCostItem(id);
    reloadAndSync();
  };

  const changeQty = async (it: FixedServiceCostItem, raw: string) => {
    const qty = parseFloat(raw);
    if (!qty || qty <= 0 || qty === it.quantity) return;
    await updateFixedServiceCostItem(it.id, { quantity: qty });
    reloadAndSync();
  };

  const createResource = async () => {
    if (!nName.trim()) return;
    const { data, error } = await createManagementResource({
      company_id: companyId,
      name: nName.trim(),
      type: nType,
      charge_mode: nMode,
      list_price: nPrice > 0 ? nPrice : null,
      supplier_id: nSupplier ? Number(nSupplier) : null,
    });
    if (error || !data) {
      setErr("No se pudo crear el recurso (¿nombre repetido?).");
      return;
    }
    setResources((prev) => [...prev, data]);
    setNewOpen(false);
    setNName("");
    setNPrice(0);
    setNSupplier("");
    // Recién creado → directo al costo del servicio.
    await addFixedServiceCostItem({
      company_id: companyId,
      fixed_service_id: service.id,
      resource_id: data.id,
      quantity: 1,
    });
    const fresh = await getFixedServiceCostItems(companyId, service.id);
    setItems(fresh);
    await syncTotals(fresh, new Map([...resById, [data.id, data]]));
    flashSaved();
  };

  // Opciones ordenadas por tipo (Arriendo / Compra / Personal) y nombre,
  // con etiqueta corta: "Silla arrendada · $1.500 /persona · FL Eventos".
  const typeOrder: ResourceType[] = ["arriendo", "compra", "personal"];
  const options = resources
    .filter((r) => r.is_active)
    .slice()
    .sort(
      (a, b) =>
        typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) ||
        a.name.localeCompare(b.name),
    )
    .map((r) => ({
      value: String(r.id),
      label: `${r.name}${
        r.list_price
          ? ` · ${clp(r.list_price)} ${
              r.charge_mode === "por_persona" ? "/persona" : "/evento"
            }`
          : " · sin precio"
      }${supName(r.supplier_id) ? ` · ${supName(r.supplier_id)}` : ""}`,
    }));

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-5 -mb-2">
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={13} /> Guardado
          </span>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      <h3 className="text-xs font-bold uppercase text-gray-500">
        Costo del servicio · referencias al catálogo de recursos
      </h3>

      {/* Alta de línea: seleccionar = agregar (cantidad editable en la fila) */}
      <SelectWithSearch
        options={options}
        value=""
        onChange={addLine}
        placeholder="Buscar y agregar recurso (silla, fiesta 8 hrs…)"
        searchPlaceholder="Buscar recurso…"
        noResultsText="Sin resultados"
      />

      {!newOpen ? (
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          + ¿No está? Crear recurso nuevo
        </button>
      ) : (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={nName}
              onChange={(e) => setNName(e.target.value)}
              placeholder="Nombre (ej: Silla arrendada)"
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
            <div className="w-36">
              <NumberInput
                value={nPrice || undefined}
                onChange={(v) => setNPrice(v || 0)}
                min={0}
                formatThousands
                placeholder="Precio lista"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(RESOURCE_TYPE_LABEL) as ResourceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNType(t)}
                className={`px-2 py-1 rounded-md border text-xs font-semibold ${
                  nType === t
                    ? "border-blue-600 bg-white text-blue-700"
                    : "border-gray-300 text-gray-500"
                }`}
              >
                {RESOURCE_TYPE_LABEL[t]}
              </button>
            ))}
            <span className="text-gray-300">|</span>
            {(Object.keys(CHARGE_MODE_LABEL) as ChargeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setNMode(m)}
                className={`px-2 py-1 rounded-md border text-xs font-semibold ${
                  nMode === m
                    ? "border-blue-600 bg-white text-blue-700"
                    : "border-gray-300 text-gray-500"
                }`}
              >
                {CHARGE_MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SelectWithSearch
                options={suppliers
                  .filter((s) => s.is_active)
                  .map((s) => ({ value: String(s.id), label: s.name }))}
                value={nSupplier}
                onChange={setNSupplier}
                placeholder="Proveedor (opcional)"
                searchPlaceholder="Buscar proveedor…"
                noResultsText="Sin resultados"
              />
            </div>
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              className="text-xs text-gray-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createResource}
              disabled={!nName.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Crear y usar
            </button>
          </div>
        </div>
      )}

      {/* Líneas */}
      {items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Recurso
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Cant.
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Precio lista
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Subtotal
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => {
                const r = resById.get(it.resource_id);
                if (!r) return null;
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2">
                      <span className="text-gray-900">{r.name}</span>
                      <span className="text-xs text-gray-400">
                        {" "}
                        · {CHARGE_MODE_LABEL[r.charge_mode]}
                        {supName(r.supplier_id)
                          ? ` · ${supName(r.supplier_id)}`
                          : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={it.quantity}
                        onBlur={(e) => changeQty(it, e.target.value)}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {r.list_price ? (
                        clp(r.list_price)
                      ) : (
                        <span className="text-amber-600 text-xs font-semibold">
                          ⚠ sin precio
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {clp(lineAmount(it))}
                      {r.charge_mode === "por_persona" && (
                        <span className="text-xs text-gray-400"> /persona</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(it.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Quitar"
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Resumen: sin margen (el margen real se calcula en cada evento, donde
          se conocen las personas). Solo filas con valor. */}
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          Agrega recursos para calcular el costo del servicio.
        </p>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
          {totalFixed > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Costo fijo (por evento)</span>
              <span className="font-semibold">{clp(totalFixed)}</span>
            </div>
          )}
          {totalPerPerson > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Costo variable</span>
              <span className="font-semibold">
                {clp(totalPerPerson)}{" "}
                <span className="text-xs text-gray-400">/persona</span>
              </span>
            </div>
          )}
          {totalFixed === 0 && totalPerPerson === 0 && (
            <p className="text-xs text-amber-600">
              Los recursos agregados no tienen precio de lista — asigna precio
              en el catálogo o al usarlos en cada evento.
            </p>
          )}
          {totalPerPerson > 0 && (
            <p className="text-xs text-gray-400 border-t border-gray-200 pt-1 mt-1">
              El costo total (y el margen) se calculan en cada evento según sus
              personas.
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-gray-400">
        Los precios vienen del catálogo de Recursos (Logística): al actualizar
        la lista anual de un proveedor, este costo se actualiza solo. Las
        rebajas puntuales se hacen en cada evento, no aquí.
      </p>
    </div>
  );
}
