import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import {
  addRecipeItem,
  createFurnitureItem,
  createSupply,
  deleteRecipeItem,
  getFurnitureItems,
  getRecipeItems,
  getSupplies,
  updateRecipeItem,
} from "../../../services/logistics.service";
import {
  FurnitureItem,
  RecipeItem,
  RecipeServiceType,
  RecipeUnit,
  Supply,
  UNIT_FAMILY_INFO,
  UNITS_BY_FAMILY,
  UnitFamily,
  grossQty,
  toBaseQty,
} from "../../../types/logistics.types";
import { NumberInput } from "../../../components/inputs";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import PhotoPopup from "../../../components/PhotoPopup";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

interface RecipeTabProps {
  readonly companyId: number;
  readonly serviceType: RecipeServiceType;
  readonly serviceId: number;
  readonly servicePrice?: number;
}

// Editor de receta de un servicio. Variables: insumos + mobiliario; fijos:
// solo mobiliario. Todo por persona; cada línea se guarda al agregar/editar.
export default function RecipeTab({
  companyId,
  serviceType,
  serviceId,
  servicePrice,
}: RecipeTabProps) {
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [photoView, setPhotoView] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Alta de ingrediente
  const [addSupplyId, setAddSupplyId] = useState("");
  const [addQty, setAddQty] = useState<number | undefined>(undefined);
  const [addUnit, setAddUnit] = useState<RecipeUnit>("kg");
  // Mini-forms de creación al vuelo (inline, sin modal anidado)
  const [newSupplyOpen, setNewSupplyOpen] = useState(false);
  const [nsName, setNsName] = useState("");
  const [nsFamily, setNsFamily] = useState<UnitFamily>("masa");
  const [nsPrice, setNsPrice] = useState<number>(0);
  const [newFurnOpen, setNewFurnOpen] = useState(false);
  const [nfName, setNfName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const showIngredients = serviceType === "variable";

  const load = () => {
    setLoading(true);
    Promise.all([
      getRecipeItems(companyId, serviceType, serviceId),
      getSupplies(companyId),
      getFurnitureItems(companyId),
    ])
      .then(([r, s, f]) => {
        setItems(r);
        setSupplies(s);
        setFurniture(f);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [companyId, serviceType, serviceId]);

  const supplyById = useMemo(
    () => new Map(supplies.map((s) => [s.id, s])),
    [supplies],
  );
  const furnById = useMemo(
    () => new Map(furniture.map((f) => [f.id, f])),
    [furniture],
  );

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  // Al elegir insumo, ajustar la unidad a la base de su familia.
  const onPickSupply = (id: string) => {
    setAddSupplyId(id);
    const s = supplyById.get(Number(id));
    if (s) setAddUnit(UNITS_BY_FAMILY[s.unit_family][0]);
  };

  const ingredientItems = items.filter((i) => i.item_kind === "insumo");
  const furnitureItems = items.filter((i) => i.item_kind === "mobiliario");

  // Costo sobre la cantidad BRUTA (neta + merma del insumo): es lo que se
  // compra de verdad. La receta se ingresa siempre en NETO (lo servido).
  const lineCost = (it: RecipeItem): number => {
    const s = it.supply_id ? supplyById.get(it.supply_id) : undefined;
    if (!s) return 0;
    return grossQty(toBaseQty(it.qty_per_person, it.unit), s) * (s.price || 0);
  };
  // Bruta mostrada en la MISMA unidad en que está escrita la línea.
  const lineGross = (it: RecipeItem): number => {
    const s = it.supply_id ? supplyById.get(it.supply_id) : undefined;
    const w = s?.waste_pct || 0;
    return w > 0 && w < 100
      ? it.qty_per_person / (1 - w / 100)
      : it.qty_per_person;
  };
  const costPerPerson = ingredientItems.reduce((t, it) => t + lineCost(it), 0);
  const margin = (servicePrice || 0) - costPerPerson;

  const addIngredient = async () => {
    const qty = addQty;
    if (!addSupplyId || !qty || qty <= 0) return;
    setErr(null);
    const { error } = await addRecipeItem({
      company_id: companyId,
      service_type: serviceType,
      service_id: serviceId,
      item_kind: "insumo",
      supply_id: Number(addSupplyId),
      qty_per_person: qty,
      unit: addUnit,
    });
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ese insumo ya está en la receta."
          : "No se pudo agregar.",
      );
      return;
    }
    setAddSupplyId("");
    setAddQty(undefined);
    flashSaved();
    load();
  };

  // Seleccionar en el buscador AGREGA el mobiliario al tiro (1 por persona,
  // editable después en la fila).
  const addFurniture = async (furnitureId: string) => {
    if (!furnitureId) return;
    setErr(null);
    const { error } = await addRecipeItem({
      company_id: companyId,
      service_type: serviceType,
      service_id: serviceId,
      item_kind: "mobiliario",
      furniture_id: Number(furnitureId),
      qty_per_person: 1,
      unit: "u",
    });
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ese ítem ya está en la receta."
          : "No se pudo agregar.",
      );
      return;
    }
    flashSaved();
    load();
  };

  const removeItem = async (id: number) => {
    await deleteRecipeItem(id);
    flashSaved();
    load();
  };

  // Norma general: coma o punto valen como decimal ("0,1" = "0.1").
  const parseNum = (raw: string) => parseFloat(raw.replace(",", "."));

  const changeQty = async (it: RecipeItem, raw: string) => {
    const qty = parseNum(raw);
    if (!qty || qty <= 0 || qty === it.qty_per_person) return;
    await updateRecipeItem(it.id, { qty_per_person: qty });
    flashSaved();
    load();
  };

  const createNewSupply = async () => {
    if (!nsName.trim()) return;
    const { data, error } = await createSupply({
      company_id: companyId,
      name: nsName.trim(),
      unit_family: nsFamily,
      price: nsPrice || 0,
    });
    if (error || !data) {
      setErr("No se pudo crear el insumo (¿nombre repetido?).");
      return;
    }
    setSupplies((prev) => [...prev, data]);
    setAddSupplyId(String(data.id));
    setAddUnit(UNITS_BY_FAMILY[data.unit_family][0]);
    setNewSupplyOpen(false);
    setNsName("");
    setNsPrice(0);
  };

  const createNewFurniture = async () => {
    if (!nfName.trim()) return;
    const { data, error } = await createFurnitureItem({
      company_id: companyId,
      name: nfName.trim(),
    });
    if (error || !data) {
      setErr("No se pudo crear el ítem (¿nombre repetido?).");
      return;
    }
    setFurniture((prev) => [...prev, data]);
    setNewFurnOpen(false);
    setNfName("");
    // Recién creado → directo a la receta.
    addFurniture(String(data.id));
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  const selectedSupply = addSupplyId
    ? supplyById.get(Number(addSupplyId))
    : undefined;
  const unitOptions = selectedSupply
    ? UNITS_BY_FAMILY[selectedSupply.unit_family]
    : [];

  const qtyInputCls =
    "w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right";

  return (
    <div className="space-y-6">
      {/* Indicador de guardado */}
      <div className="h-5 -mb-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={13} /> Guardado
          </span>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {/* ===== Ingredientes (solo servicios variables) ===== */}
      {showIngredients && (
        <div>
          <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">
            Ingredientes · cantidad neta por persona (lo que llega al plato)
          </h3>

          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <SelectWithSearch
                options={supplies
                  .filter((s) => s.is_active)
                  .map((s) => ({
                    value: String(s.id),
                    label: `${s.name} · ${UNIT_FAMILY_INFO[s.unit_family].units}`,
                  }))}
                value={addSupplyId}
                onChange={onPickSupply}
                placeholder="Buscar insumo…"
                searchPlaceholder="Buscar insumo…"
                noResultsText="Sin resultados"
              />
            </div>
            <span className="inline-block w-20 align-middle">
              {/* Campo del sistema: coma decimal, punto→coma */}
              <NumberInput
                value={addQty}
                min={0}
                onChange={setAddQty}
                placeholder="Cant."
                className="!px-2 text-sm text-right"
              />
            </span>
            {/* Píldoras de unidad (sin desplegable nativo), mismo
                lenguaje que el formulario de insumos. */}
            <div
              className={`flex rounded-lg border border-gray-300 overflow-hidden shrink-0 ${
                !selectedSupply ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {((unitOptions.length ? unitOptions : ["kg"]) as RecipeUnit[]).map(
                (u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setAddUnit(u)}
                    className={`px-3 py-2 text-sm font-semibold transition-colors ${
                      addUnit === u
                        ? "bg-blue-50 text-blue-700"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {u}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={addIngredient}
              disabled={!addSupplyId || !addQty || addQty <= 0}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Crear insumo al vuelo (inline, sin modal anidado) */}
          {!newSupplyOpen ? (
            <button
              type="button"
              onClick={() => setNewSupplyOpen(true)}
              className="mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              + ¿No está? Crear insumo nuevo
            </button>
          ) : (
            <div className="mt-2 border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={nsName}
                  onChange={(e) => setNsName(e.target.value)}
                  placeholder="Nombre del insumo…"
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <div className="w-36">
                  <NumberInput
                    value={nsPrice || undefined}
                    onChange={(v) => setNsPrice(v || 0)}
                    min={0}
                    formatThousands
                    placeholder={`$ por ${UNIT_FAMILY_INFO[nsFamily].base}`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(Object.keys(UNIT_FAMILY_INFO) as UnitFamily[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setNsFamily(f)}
                    className={`px-2 py-1 rounded-md border text-xs font-semibold ${
                      nsFamily === f
                        ? "border-blue-600 bg-white text-blue-700"
                        : "border-gray-300 text-gray-500"
                    }`}
                  >
                    {UNIT_FAMILY_INFO[f].label} ({UNIT_FAMILY_INFO[f].units})
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setNewSupplyOpen(false)}
                  className="text-xs text-gray-500"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createNewSupply}
                  disabled={!nsName.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  Crear y usar
                </button>
              </div>
            </div>
          )}

          {/* Tabla de ingredientes */}
          {ingredientItems.length > 0 && (
            <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Insumo
                    </th>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
                      title="Lo que llega al plato, por persona"
                    >
                      Cant. neta
                    </th>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
                      title="% de pérdida definido en el insumo"
                    >
                      Merma
                    </th>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
                      title="Lo que se compra: neta + merma (calculado)"
                    >
                      Cant. bruta
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Costo / persona
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ingredientItems.map((it) => {
                    const s = it.supply_id
                      ? supplyById.get(it.supply_id)
                      : undefined;
                    const w = s?.waste_pct || 0;
                    return (
                      <tr key={it.id}>
                        <td className="px-3 py-2 text-gray-900">
                          {s?.name || "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={it.qty_per_person.toLocaleString(
                              "es-CL",
                              { maximumFractionDigits: 6 },
                            )}
                            onBlur={(e) => changeQty(it, e.target.value)}
                            className={qtyInputCls}
                          />{" "}
                          <span className="text-gray-500">{it.unit}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {w ? `${w}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {Number(
                            lineGross(it).toFixed(
                              lineGross(it) < 10 ? 2 : 1,
                            ),
                          ).toLocaleString("es-CL")}{" "}
                          {it.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {clp(lineCost(it))}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
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
        </div>
      )}

      {/* ===== Mobiliario (variables y fijos) ===== */}
      <div>
        <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">
          Mobiliario · cantidad por persona
        </h3>
        <SelectWithSearch
          options={furniture
            .filter((f) => f.is_active)
            .map((f) => ({ value: String(f.id), label: f.name }))}
          value=""
          onChange={addFurniture}
          placeholder="Buscar y agregar mobiliario…"
          searchPlaceholder="Buscar mobiliario…"
          noResultsText="Sin resultados"
        />

        {!newFurnOpen ? (
          <button
            type="button"
            onClick={() => setNewFurnOpen(true)}
            className="mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            + ¿No está? Crear ítem de mobiliario
          </button>
        ) : (
          <div className="mt-2 border border-blue-200 bg-blue-50 rounded-lg p-3 flex gap-2 items-center">
            <input
              value={nfName}
              onChange={(e) => setNfName(e.target.value)}
              placeholder="Ej: Plato de fondo"
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => setNewFurnOpen(false)}
              className="text-xs text-gray-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createNewFurniture}
              disabled={!nfName.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Crear y usar
            </button>
          </div>
        )}

        {furnitureItems.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {furnitureItems.map((it) => {
                  const f = it.furniture_id
                    ? furnById.get(it.furniture_id)
                    : undefined;
                  return (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-gray-900">
                        <div className="flex items-center gap-2">
                          {f?.photo_url && (
                            <button
                              type="button"
                              onClick={() =>
                                setPhotoView({
                                  url: f.photo_url as string,
                                  title: f.name,
                                })
                              }
                              className="shrink-0"
                              title="Ver foto de referencia"
                            >
                              <img
                                src={f.photo_url}
                                alt={f.name}
                                className="w-8 h-8 rounded-md object-cover border border-gray-200 hover:ring-2 hover:ring-blue-400"
                              />
                            </button>
                          )}
                          <span>{f?.name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {/* Campo del sistema (coma decimal, punto→coma);
                            guarda al salir vía onCommit. */}
                        <span className="inline-block w-20 align-middle">
                          <NumberInput
                            value={it.qty_per_person}
                            min={0}
                            onCommit={(n) =>
                              changeQty(it, n === undefined ? "" : String(n))
                            }
                            className="!px-2 !py-1.5 text-sm text-right"
                          />
                        </span>{" "}
                        <span className="text-gray-500">/ persona</span>
                      </td>
                      <td className="w-10 px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
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
      </div>

      {/* ===== Costo por persona (solo variables) ===== */}
      {showIngredients && (
        <div className="border-t-2 border-gray-900 pt-3 flex items-end justify-between">
          <div>
            <p className="text-xs text-gray-500">Costo de insumos por persona</p>
            <p className="text-xl font-bold text-gray-900">
              {clp(costPerPerson)}
            </p>
          </div>
          {servicePrice !== undefined && servicePrice > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">
                Margen por persona (venta {clp(servicePrice)} − insumos)
              </p>
              <p
                className={`text-xl font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {clp(margin)}
                <span className="text-sm font-semibold">
                  {" "}
                  ·{" "}
                  {servicePrice > 0
                    ? Math.round((margin / servicePrice) * 100)
                    : 0}
                  %
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {serviceType === "fixed" && (
        <p className="text-xs text-gray-400">
          Los servicios fijos solo llevan mobiliario asociado (los ingredientes
          viven en los servicios variables).
        </p>
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
