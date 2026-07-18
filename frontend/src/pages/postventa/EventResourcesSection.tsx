import { useEffect, useMemo, useState } from "react";
import { Check, Users, X } from "lucide-react";
import {
  EventResource,
  addEventResource,
  createManagementResource,
  deleteEventResource,
  getEventResources,
  getManagementResources,
  getSuppliers,
  updateEventResource,
  updateManagementResource,
} from "../../services/logistics.service";
import {
  ManagementResource,
  RESOURCE_TYPE_LABEL,
  ResourceType,
  Supplier,
  resourcePriceLabel,
} from "../../types/logistics.types";
import { NumberInput } from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

// Recursos asignados a UN evento (Fase 4): staff, arriendos y compras del
// catálogo. El precio llega precargado desde la lista pero es editable por
// evento (rebajas negociadas; el staff se valoriza aquí). Seleccionar =
// agregar; autosave por línea.
export default function EventResourcesSection({
  companyId,
  quotationId,
  personas,
  onCostChange,
}: {
  readonly companyId: number;
  readonly quotationId: string;
  readonly personas: number;
  readonly onCostChange: (total: number) => void;
}) {
  const [lines, setLines] = useState<EventResource[]>([]);
  const [resources, setResources] = useState<ManagementResource[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Mini-form de creación al vuelo (inline)
  const [newOpen, setNewOpen] = useState(false);
  const [nName, setNName] = useState("");
  const [nType, setNType] = useState<ResourceType>("personal");
  const [nPriceFixed, setNPriceFixed] = useState<number>(0);
  const [nPricePerPerson, setNPricePerPerson] = useState<number>(0);
  const [nSupplier, setNSupplier] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      getEventResources(companyId, quotationId),
      getManagementResources(companyId),
      getSuppliers(companyId),
    ])
      .then(([l, r, s]) => {
        setLines(l);
        setResources(r);
        setSuppliers(s);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [companyId, quotationId]);

  const resById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );
  const supName = (id: number | null | undefined) =>
    suppliers.find((s) => s.id === id)?.name;

  const lineTotal = (l: EventResource) =>
    ((l.price_fixed || 0) + (l.price_per_person || 0) * personas) *
    (l.quantity || 1);

  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  useEffect(() => {
    onCostChange(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  // Pista en el catálogo: último precio usado para este recurso.
  const updateLastPrice = (resourceId: number, fixed: number, pp: number) => {
    updateManagementResource(resourceId, { last_price: fixed + pp }).catch(
      () => {},
    );
  };

  // Seleccionar = agregar: precio de lista precargado, editable en la fila.
  const addLine = async (val: string) => {
    const r = resById.get(Number(val));
    if (!r) return;
    setErr(null);
    const { error } = await addEventResource({
      company_id: companyId,
      quotation_id: quotationId,
      resource_id: r.id,
      quantity: 1,
      price_fixed: r.list_price_fixed || 0,
      price_per_person: r.list_price_per_person || 0,
    });
    if (error) {
      setErr("No se pudo agregar el recurso");
      return;
    }
    flashSaved();
    load();
  };

  const saveLine = async (
    id: number,
    fields: Partial<
      Pick<EventResource, "quantity" | "price_fixed" | "price_per_person">
    >,
  ) => {
    const { error } = await updateEventResource(id, fields);
    if (error) {
      setErr("No se pudo guardar");
      return;
    }
    setErr(null);
    flashSaved();
    const line = lines.find((l) => l.id === id);
    if (line) {
      const merged = { ...line, ...fields };
      updateLastPrice(
        line.resource_id,
        merged.price_fixed || 0,
        merged.price_per_person || 0,
      );
    }
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...fields } : l)),
    );
  };

  const removeLine = async (id: number) => {
    const { error } = await deleteEventResource(id);
    if (!error) setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const createResource = async () => {
    if (!nName.trim()) return;
    const { data, error } = await createManagementResource({
      company_id: companyId,
      name: nName.trim(),
      type: nType,
      supplier_id: nSupplier ? Number(nSupplier) : null,
      list_price_fixed: nPriceFixed || null,
      list_price_per_person: nPricePerPerson || null,
    });
    if (error || !data) {
      setErr("No se pudo crear el recurso");
      return;
    }
    setNewOpen(false);
    setNName("");
    setNPriceFixed(0);
    setNPricePerPerson(0);
    setNSupplier("");
    // agregar directo al evento
    await addEventResource({
      company_id: companyId,
      quotation_id: quotationId,
      resource_id: data.id,
      quantity: 1,
      price_fixed: data.list_price_fixed || 0,
      price_per_person: data.list_price_per_person || 0,
    });
    flashSaved();
    load();
  };

  const options = useMemo(() => {
    const order: ResourceType[] = ["personal", "arriendo", "compra"];
    return [...resources]
      .filter((r) => r.is_active !== false)
      .sort(
        (a, b) =>
          order.indexOf(a.type) - order.indexOf(b.type) ||
          a.name.localeCompare(b.name),
      )
      .map((r) => ({
        value: String(r.id),
        label: `${r.name} · ${RESOURCE_TYPE_LABEL[r.type]} · ${resourcePriceLabel(r)}${
          supName(r.supplier_id) ? ` · ${supName(r.supplier_id)}` : ""
        }`,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, suppliers]);

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-gray-500" />
        <h4 className="text-sm font-bold text-gray-800">
          Recursos del evento
        </h4>
        <span className="text-xs text-gray-400">
          staff · arriendos · compras
        </span>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={13} /> Guardado
          </span>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        El precio llega desde la lista del catálogo pero se ajusta para este
        evento (rebajas, staff por evento).
      </p>

      <SelectWithSearch
        options={options}
        value=""
        onChange={addLine}
        placeholder="Buscar y agregar recurso (garzón, audiovisual…)"
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
          <input
            value={nName}
            onChange={(e) => setNName(e.target.value)}
            placeholder="Nombre (ej: Garzón turno completo)"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
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
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <NumberInput
                value={nPriceFixed || undefined}
                onChange={(v) => setNPriceFixed(v || 0)}
                min={0}
                formatThousands
                placeholder="0"
              />
              <p className="mt-0.5 text-[11px] text-gray-500">
                Fijo por evento
              </p>
            </div>
            <div>
              <NumberInput
                value={nPricePerPerson || undefined}
                onChange={(v) => setNPricePerPerson(v || 0)}
                min={0}
                formatThousands
                placeholder="0"
              />
              <p className="mt-0.5 text-[11px] text-gray-500">Por persona</p>
            </div>
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

      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          Agrega los recursos de este evento: garzones, staff de cocina,
          arriendos…
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Recurso
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">
                  Cant.
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                  $ fijo
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                  $ /persona
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Total
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l) => {
                const r = resById.get(l.resource_id);
                const hasListPrice =
                  r && (r.list_price_fixed || r.list_price_per_person);
                const isRebaja =
                  hasListPrice &&
                  ((l.price_fixed || 0) < (r?.list_price_fixed || 0) ||
                    (l.price_per_person || 0) <
                      (r?.list_price_per_person || 0));
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      <span className="text-gray-900">
                        {r?.name || "Recurso eliminado"}
                      </span>
                      {r && (
                        <span className="ml-1.5 text-[11px] text-gray-400">
                          {RESOURCE_TYPE_LABEL[r.type]}
                          {supName(r.supplier_id)
                            ? ` · ${supName(r.supplier_id)}`
                            : ""}
                        </span>
                      )}
                      {isRebaja && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                          rebaja
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={l.quantity}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (v > 0 && v !== l.quantity)
                            saveLine(l.id, { quantity: v });
                        }}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                        aria-label="Cantidad"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={l.price_fixed || ""}
                        placeholder="0"
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          if (v !== l.price_fixed)
                            saveLine(l.id, { price_fixed: v });
                        }}
                        className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                        aria-label="Precio fijo"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={l.price_per_person || ""}
                        placeholder="0"
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          if (v !== l.price_per_person)
                            saveLine(l.id, { price_per_person: v });
                        }}
                        className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                        aria-label="Precio por persona"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      {clp(lineTotal(l))}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className="text-gray-300 hover:text-red-500"
                        aria-label="Quitar recurso"
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                >
                  Total recursos
                </td>
                <td className="px-3 py-2 text-right font-bold whitespace-nowrap">
                  {clp(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
