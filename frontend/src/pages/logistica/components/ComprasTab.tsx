import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  PackageCheck,
  ShoppingCart,
  Truck,
} from "lucide-react";
import {
  PurchasingEvent,
  getAcceptedEvents,
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getFixedServiceCostsById,
  getFurnitureItems,
  getSupplies,
  getSuppliers,
  markQuotationsProvisioned,
} from "../../../services/logistics.service";
import {
  FurnitureItem,
  RecipeItem,
  Supplier,
  Supply,
  UNIT_FAMILY_INFO,
} from "../../../types/logistics.types";
import {
  ConsolidatedSupply,
  EventItemsSnapshot,
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
} from "../../../utils/eventConsolidation";

// Compras multi-evento (Fase 3): selecciona eventos cerrados, consolida los
// insumos de todas sus recetas agrupados por proveedor, exporta el Excel de
// compras y marca los eventos como provisionados (foto del costo estimado).

interface SupplierGroup {
  supplier: Supplier | null; // null = sin proveedor asignado
  rows: ConsolidatedSupply[];
  subtotal: number;
}

const fmtQty = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("es-CL", { maximumFractionDigits: 2 });

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CL") : "—";

export default function ComprasTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const [events, setEvents] = useState<PurchasingEvent[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [nameIds, setNameIds] = useState<{
    variable: Record<string, number>;
    fixed: Record<string, number>;
  }>({ variable: {}, fixed: {} });
  const [fixedCosts, setFixedCosts] = useState<
    Record<
      number,
      { cost_fixed: number | null; cost_per_person: number | null }
    >
  >({});
  const [loading, setLoading] = useState(true);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      getAcceptedEvents(companyId),
      getAllRecipeItems(companyId),
      getSupplies(companyId),
      getFurnitureItems(companyId),
      getSuppliers(companyId),
      getCatalogServiceNameIds(companyId),
      getFixedServiceCostsById(companyId),
    ])
      .then(([ev, r, s, f, sup, n, fc]) => {
        setEvents(ev);
        setRecipes(r);
        setSupplies(s);
        setFurniture(f);
        setSuppliers(sup);
        setNameIds(n);
        setFixedCosts(fc);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [companyId]);

  // Eventos visibles según el rango de fecha del evento.
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (!e.event_date) return !desde && !hasta;
      const d = e.event_date.slice(0, 10);
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    });
  }, [events, desde, hasta]);

  const selectedEvents = useMemo(
    () => filtered.filter((e) => selected.has(e.id)),
    [filtered, selected],
  );

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setConfirming(false);
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((e) => e.id)),
    );
  };

  // Consolidación de los eventos seleccionados, agrupada por proveedor.
  const consolidation = useMemo(() => {
    const ctx = buildConsolidationContext(
      recipes,
      supplies,
      furniture,
      nameIds,
      fixedCosts,
    );
    const acc = newAccumulator();
    const perEvent: { id: string; cost: number }[] = [];
    let costoTotal = 0;
    selectedEvents.forEach((ev) => {
      const r = consolidateEvent(
        ev.items as EventItemsSnapshot,
        ev.people_count || 0,
        ctx,
        acc,
      );
      const cost = r.costoInsumos + r.costoFijos;
      perEvent.push({ id: ev.id, cost });
      costoTotal += cost;
    });

    // Agrupar insumos por proveedor.
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const groupMap = new Map<number | 0, SupplierGroup>();
    [...acc.supplyTotals.values()].forEach((row) => {
      const key = row.supply.supplier_id || 0;
      let g = groupMap.get(key);
      if (!g) {
        g = {
          supplier: key ? supplierById.get(key) || null : null,
          rows: [],
          subtotal: 0,
        };
        groupMap.set(key, g);
      }
      g.rows.push(row);
      g.subtotal += row.totalBase * (row.supply.price || 0);
    });
    const groups = [...groupMap.values()]
      .map((g) => ({
        ...g,
        rows: g.rows.sort((a, b) =>
          a.supply.name.localeCompare(b.supply.name),
        ),
      }))
      .sort((a, b) => {
        if (!a.supplier) return 1; // "sin proveedor" al final
        if (!b.supplier) return -1;
        return a.supplier.name.localeCompare(b.supplier.name);
      });

    return {
      groups,
      mobiliario: [...acc.furnTotals.values()]
        .map((m) => ({ ...m, total: Math.ceil(m.total) }))
        .sort((a, b) => a.item.name.localeCompare(b.item.name)),
      sinReceta: [...new Set(acc.noRecipe)],
      perEvent,
      costoTotal,
    };
  }, [selectedEvents, recipes, supplies, furniture, suppliers, nameIds, fixedCosts]);

  const provision = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    const { error } = await markQuotationsProvisioned(consolidation.perEvent);
    setSaving(false);
    setConfirming(false);
    if (error) {
      setFlash("Error al provisionar, intenta de nuevo");
      return;
    }
    setFlash(`✓ ${consolidation.perEvent.length} evento(s) provisionado(s)`);
    setSelected(new Set());
    load();
    setTimeout(() => setFlash(""), 4000);
  };

  const downloadExcel = () => {
    const lines: string[] = [];
    lines.push(`Lista de compras;${selectedEvents.length} evento(s)`);
    selectedEvents.forEach((e) => {
      lines.push(
        `#${e.quotation_number};${e.client_name};${fmtDate(e.event_date)};${e.people_count} personas`,
      );
    });
    consolidation.groups.forEach((g) => {
      lines.push("");
      lines.push(
        `PROVEEDOR;${g.supplier ? g.supplier.name : "Sin proveedor asignado"}${
          g.supplier?.phone ? `;${g.supplier.phone}` : ""
        }`,
      );
      lines.push("Insumo;Cantidad;Unidad;Costo estimado");
      g.rows.forEach((c) => {
        const qty = fmtQty(c.totalBase).replace(".", "");
        lines.push(
          `${c.supply.name};${qty};${UNIT_FAMILY_INFO[c.supply.unit_family].base};${Math.round(
            c.totalBase * (c.supply.price || 0),
          )}`,
        );
      });
      lines.push(`Subtotal;;;${Math.round(g.subtotal)}`);
    });
    if (consolidation.mobiliario.length) {
      lines.push("");
      lines.push("MOBILIARIO");
      lines.push("Ítem;Cantidad");
      consolidation.mobiliario.forEach((m) => {
        lines.push(`${m.item.name};${m.total}`);
      });
    }
    lines.push("");
    lines.push("RESUMEN");
    lines.push(
      `Costo estimado total;${Math.round(consolidation.costoTotal)}`,
    );
    if (consolidation.sinReceta.length) {
      lines.push("");
      lines.push("SERVICIOS SIN RECETA (no incluidos)");
      consolidation.sinReceta.forEach((n) => lines.push(n));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compras_${selectedEvents.length}_eventos.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="py-14 flex justify-center">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-900">
            Compras consolidadas por proveedor
          </h2>
          <p className="text-sm text-gray-500">
            Selecciona los eventos que vas a provisionar: se suman los insumos
            de todas sus recetas en una sola lista de compra.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label
              htmlFor="compras-desde"
              className="block text-[11px] font-semibold text-gray-500 uppercase"
            >
              Evento desde
            </label>
            <input
              id="compras-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="compras-hasta"
              className="block text-[11px] font-semibold text-gray-500 uppercase"
            >
              Hasta
            </label>
            <input
              id="compras-hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {flash && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-lg px-3 py-2">
          {flash}
        </div>
      )}

      {/* ---------- Lista de eventos ---------- */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <ShoppingCart className="mx-auto mb-3 text-gray-300" size={34} />
          <p className="font-medium">Sin eventos cerrados en este rango</p>
          <p className="text-sm mt-1">
            Ajusta el rango de fechas o cierra ventas en Post Venta.
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 && selected.size === filtered.length
                    }
                    onChange={toggleAll}
                    className="rounded"
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Cotización
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Cliente
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha evento
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Personas
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Provisión
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    selected.has(e.id) ? "bg-blue-50" : ""
                  }`}
                  onClick={() => toggle(e.id)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="rounded"
                      aria-label={`Seleccionar cotización ${e.quotation_number}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold text-gray-900">
                    #{e.quotation_number}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{e.client_name}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {fmtDate(e.event_date)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {e.people_count}
                  </td>
                  <td className="px-3 py-2">
                    {e.provisioned_at ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-green-100 text-green-700">
                        <PackageCheck size={12} /> Provisionado ·{" "}
                        {fmtDate(e.provisioned_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Consolidado ---------- */}
      {selectedEvents.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800">
                Lista de compra · {selectedEvents.length} evento(s) ·{" "}
                {selectedEvents.reduce(
                  (s, e) => s + (e.people_count || 0),
                  0,
                )}{" "}
                personas
              </h3>
              <p className="text-xs text-gray-500">
                Costo estimado total: {fmtMoney(consolidation.costoTotal)}{" "}
                (según catálogo)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadExcel}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
              >
                <Download size={15} /> Excel
              </button>
              <button
                type="button"
                onClick={provision}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 ${
                  confirming
                    ? "bg-orange-600 hover:bg-orange-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <CheckCircle2 size={15} />
                {saving
                  ? "Guardando..."
                  : confirming
                    ? `¿Confirmar ${selectedEvents.length} evento(s)?`
                    : "Marcar provisionados"}
              </button>
            </div>
          </div>

          {consolidation.groups.map((g) => (
            <div key={g.supplier?.id || 0}>
              <div className="flex items-center gap-2 mb-1.5">
                <Truck size={14} className="text-gray-400" />
                <h5 className="text-xs font-bold uppercase text-gray-600">
                  {g.supplier ? g.supplier.name : "Sin proveedor asignado"}
                </h5>
                {g.supplier?.phone && (
                  <span className="text-[11px] text-gray-400">
                    {g.supplier.phone}
                  </span>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {g.rows.map((c) => (
                      <tr key={c.supply.id}>
                        <td className="px-3 py-2">
                          <span className="text-gray-900">
                            {c.supply.name}
                          </span>
                          {c.services.length > 1 && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700">
                              consolidado
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                          {fmtQty(c.totalBase)}{" "}
                          {UNIT_FAMILY_INFO[c.supply.unit_family].base}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                          {c.supply.price
                            ? fmtMoney(c.totalBase * c.supply.price)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-500 uppercase">
                        Subtotal
                      </td>
                      <td />
                      <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">
                        {fmtMoney(g.subtotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}

          {consolidation.mobiliario.length > 0 && (
            <div>
              <h5 className="text-xs font-bold uppercase text-gray-500 mb-1.5">
                Mobiliario total
              </h5>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {consolidation.mobiliario.map((m) => (
                      <tr key={m.item.id}>
                        <td className="px-3 py-2 text-gray-900">
                          {m.item.name}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {m.total.toLocaleString("es-CL")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {consolidation.sinReceta.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800">
                ⚠ Servicios sin receta (no incluidos en el cálculo):
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {consolidation.sinReceta.join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
