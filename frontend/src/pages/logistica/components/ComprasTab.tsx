import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  PackageCheck,
  RotateCcw,
  ShoppingCart,
  Truck,
} from "lucide-react";
import {
  EventSupplyProvision,
  PurchasingEvent,
  clearQuotationsProvisioned,
  deleteEventSupplyProvisions,
  getAcceptedEvents,
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getEventSupplyProvisions,
  getFixedServiceCostsById,
  getFurnitureItems,
  getSupplies,
  getSuppliers,
  markQuotationsProvisioned,
  upsertEventSupplyProvisions,
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
  servicesSignature,
} from "../../../utils/eventConsolidation";

// Compras multi-evento (Fase 3): selecciona eventos cerrados, consolida los
// insumos por proveedor y provisiona POR PARTES (hoy carnes, mañana verduras)
// o de forma masiva. Cada provisión guarda la foto de cantidad y costo.

interface SupplierGroup {
  supplier: Supplier | null; // null = sin proveedor asignado
  rows: ConsolidatedSupply[];
  subtotal: number;
}

interface EventAnalysis {
  supplyUse: Map<number, number>; // supply_id → cantidad base
  costoInsumos: number;
  costoFijos: number;
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
  const queryClient = useQueryClient();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkedSupplies, setCheckedSupplies] = useState<Set<number>>(
    new Set(),
  );
  const [confirmAction, setConfirmAction] = useState<
    "" | "todo" | "desprovisionar"
  >("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  // Vía React Query (Etapa 3), en DOS consultas para conservar el
  // comportamiento histórico: la "base" (recetas, insumos, mobiliario,
  // proveedores, catálogo, costos) cambia poco; el "estado" (eventos +
  // provisiones) se refresca tras cada aprovisionar/desaprovisionar
  // sin recargar la base completa.
  const baseQuery = useQuery({
    queryKey: ["logistica", "compras", "base", companyId],
    queryFn: async () => {
      const [r, s, f, sup, n, fc] = await Promise.all([
        getAllRecipeItems(companyId),
        getSupplies(companyId),
        getFurnitureItems(companyId),
        getSuppliers(companyId),
        getCatalogServiceNameIds(companyId),
        getFixedServiceCostsById(companyId),
      ]);
      return {
        recipes: r,
        supplies: s,
        furniture: f,
        suppliers: sup,
        nameIds: n,
        fixedCosts: fc,
      };
    },
  });
  const estadoQuery = useQuery({
    queryKey: ["logistica", "compras", "estado", companyId],
    queryFn: async () => {
      const [ev, pr] = await Promise.all([
        getAcceptedEvents(companyId),
        getEventSupplyProvisions(companyId),
      ]);
      return { events: ev, provisions: pr };
    },
  });

  const events = estadoQuery.data?.events ?? [];
  const provisions = estadoQuery.data?.provisions ?? [];
  const recipes = baseQuery.data?.recipes ?? [];
  const supplies = baseQuery.data?.supplies ?? [];
  const furniture = baseQuery.data?.furniture ?? [];
  const suppliers = baseQuery.data?.suppliers ?? [];
  const nameIds = baseQuery.data?.nameIds ?? { variable: {}, fixed: {} };
  const fixedCosts = baseQuery.data?.fixedCosts ?? {};
  const loading = baseQuery.isPending || estadoQuery.isPending;

  // Tras aprovisionar/desaprovisionar solo se refresca el estado.
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["logistica", "compras", "estado"],
    });
  };

  // provisiones indexadas por evento y por (evento, insumo)
  const provByEvent = useMemo(() => {
    const m = new Map<string, Set<number>>();
    provisions.forEach((p) => {
      const s = m.get(p.quotation_id) || new Set<number>();
      s.add(p.supply_id);
      m.set(p.quotation_id, s);
    });
    return m;
  }, [provisions]);

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

  // Análisis por evento (insumos que usa + costos), para estados y fotos.
  const perEvent = useMemo(() => {
    const ctx = buildConsolidationContext(
      recipes,
      supplies,
      furniture,
      nameIds,
      fixedCosts,
    );
    const m = new Map<string, EventAnalysis>();
    filtered.forEach((ev) => {
      const acc = newAccumulator();
      const r = consolidateEvent(
        ev.items as EventItemsSnapshot,
        ev.people_count || 0,
        ctx,
        acc,
      );
      m.set(ev.id, r);
    });
    return m;
  }, [filtered, recipes, supplies, furniture, nameIds, fixedCosts]);

  const eventStatus = (
    ev: PurchasingEvent,
  ): { label: string; kind: "full" | "partial" | "none" } => {
    const use = perEvent.get(ev.id)?.supplyUse;
    const used = use?.size || 0;
    const provSet = provByEvent.get(ev.id);
    const prov = use
      ? [...use.keys()].filter((sid) => provSet?.has(sid)).length
      : 0;
    if (ev.provisioned_at || (used > 0 && prov === used)) {
      return {
        label: ev.provisioned_at
          ? `Completo · ${fmtDate(ev.provisioned_at)}`
          : "Completo",
        kind: "full",
      };
    }
    if (prov > 0) return { label: `Parcial ${prov}/${used}`, kind: "partial" };
    return { label: "Pendiente", kind: "none" };
  };

  const selectedEvents = useMemo(
    () => filtered.filter((e) => selected.has(e.id)),
    [filtered, selected],
  );

  const toggle = (id: string) => {
    setConfirmAction("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setConfirmAction("");
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((e) => e.id)),
    );
  };

  // Consolidación global de los seleccionados, agrupada por proveedor.
  const consolidation = useMemo(() => {
    const ctx = buildConsolidationContext(
      recipes,
      supplies,
      furniture,
      nameIds,
      fixedCosts,
    );
    const acc = newAccumulator();
    let costoTotal = 0; // solo insumos: Compras es la lista de compra
    selectedEvents.forEach((ev) => {
      const r = consolidateEvent(
        ev.items as EventItemsSnapshot,
        ev.people_count || 0,
        ctx,
        acc,
      );
      costoTotal += r.costoInsumos;
    });

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

    // El mobiliario NO va en Compras (no se compra: se reutiliza). Su
    // disponibilidad se gestiona en Logística → Mobiliario y en Gestión.
    return {
      groups,
      sinReceta: [...new Set(acc.noRecipe)],
      costoTotal,
    };
  }, [selectedEvents, recipes, supplies, furniture, suppliers, nameIds, fixedCosts]);

  // Estado de provisión de UN insumo entre los eventos seleccionados.
  const supplyStatus = (supplyId: number) => {
    let used = 0;
    let prov = 0;
    selectedEvents.forEach((ev) => {
      if (perEvent.get(ev.id)?.supplyUse.has(supplyId)) {
        used++;
        if (provByEvent.get(ev.id)?.has(supplyId)) prov++;
      }
    });
    return { used, prov };
  };

  const toggleSupply = (id: number) => {
    setConfirmAction("");
    setCheckedSupplies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (g: SupplierGroup) => {
    setConfirmAction("");
    setCheckedSupplies((prev) => {
      const next = new Set(prev);
      const ids = g.rows.map((r) => r.supply.id);
      const allIn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const flashMsg = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 4000);
  };

  // Si un evento quedó con todos sus insumos provisionados → marcar completo.
  const stampCompleted = async (
    provMap: Map<string, Set<number>>,
  ): Promise<number> => {
    const complete: {
      id: string;
      cost: number;
      people: number;
      services: { nombre: string; quantity: number }[];
    }[] = [];
    selectedEvents.forEach((ev) => {
      const a = perEvent.get(ev.id);
      if (!a || a.supplyUse.size === 0) return;
      const set = provMap.get(ev.id);
      const all = [...a.supplyUse.keys()].every((sid) => set?.has(sid));
      if (all && !ev.provisioned_at) {
        complete.push({
          id: ev.id,
          cost: a.costoInsumos, // se congelan solo los insumos
          people: ev.people_count || 0,
          services: servicesSignature(ev.items as EventItemsSnapshot),
        });
      }
    });
    if (complete.length) await markQuotationsProvisioned(complete);
    return complete.length;
  };

  const buildRows = (onlySupplies?: Set<number>) => {
    const rows: {
      company_id: number;
      quotation_id: string;
      supply_id: number;
      qty_base: number;
      cost: number;
      supplier_id: number | null;
      supplier_name: string | null;
    }[] = [];
    const supplyById = new Map(supplies.map((s) => [s.id, s]));
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    selectedEvents.forEach((ev) => {
      const a = perEvent.get(ev.id);
      if (!a) return;
      a.supplyUse.forEach((base, sid) => {
        if (onlySupplies && !onlySupplies.has(sid)) return;
        // Foto del proveedor al momento de comprar: la estadística por
        // proveedor queda fiel aunque el insumo cambie de proveedor después.
        const supplier = supplyById.get(sid)?.supplier_id
          ? supplierById.get(supplyById.get(sid)!.supplier_id!)
          : undefined;
        rows.push({
          company_id: companyId,
          quotation_id: ev.id,
          supply_id: sid,
          qty_base: base,
          cost: Math.round(base * (supplyById.get(sid)?.price || 0)),
          supplier_id: supplier?.id ?? null,
          supplier_name: supplier?.name ?? null,
        });
      });
    });
    return rows;
  };

  const provisionChecked = async () => {
    setSaving(true);
    const rows = buildRows(checkedSupplies);
    const { error } = await upsertEventSupplyProvisions(rows);
    if (!error) {
      // recalcular cobertura con las filas recién insertadas
      const provMap = new Map<string, Set<number>>();
      provisions.forEach((p) => {
        const s = provMap.get(p.quotation_id) || new Set<number>();
        s.add(p.supply_id);
        provMap.set(p.quotation_id, s);
      });
      rows.forEach((r) => {
        const s = provMap.get(r.quotation_id) || new Set<number>();
        s.add(r.supply_id);
        provMap.set(r.quotation_id, s);
      });
      const completed = await stampCompleted(provMap);
      flashMsg(
        `✓ ${checkedSupplies.size} insumo(s) provisionado(s) en ${selectedEvents.length} evento(s)` +
          (completed ? ` · ${completed} evento(s) completo(s)` : ""),
      );
      setCheckedSupplies(new Set());
      await refresh();
    } else {
      flashMsg("Error al provisionar, intenta de nuevo");
    }
    setSaving(false);
  };

  const provisionAll = async () => {
    if (confirmAction !== "todo") {
      setConfirmAction("todo");
      return;
    }
    setSaving(true);
    const rows = buildRows();
    const { error } = await upsertEventSupplyProvisions(rows);
    if (!error) {
      await markQuotationsProvisioned(
        selectedEvents.map((ev) => {
          const a = perEvent.get(ev.id);
          return {
            id: ev.id,
            cost: a?.costoInsumos || 0, // se congelan solo los insumos
            people: ev.people_count || 0,
            services: servicesSignature(ev.items as EventItemsSnapshot),
          };
        }),
      );
      flashMsg(`✓ ${selectedEvents.length} evento(s) provisionado(s) completos`);
      setSelected(new Set());
      setCheckedSupplies(new Set());
      await refresh();
    } else {
      flashMsg("Error al provisionar, intenta de nuevo");
    }
    setConfirmAction("");
    setSaving(false);
  };

  const unprovision = async () => {
    if (confirmAction !== "desprovisionar") {
      setConfirmAction("desprovisionar");
      return;
    }
    setSaving(true);
    const ids = selectedEvents.map((e) => e.id);
    const supplyIds = checkedSupplies.size ? [...checkedSupplies] : undefined;
    const { error } = await deleteEventSupplyProvisions(ids, supplyIds);
    if (!error) {
      // al quitar insumos, el evento deja de estar "completo"
      await clearQuotationsProvisioned(ids);
      flashMsg(
        supplyIds
          ? `↩ ${supplyIds.length} insumo(s) desprovisionado(s)`
          : `↩ ${ids.length} evento(s) desprovisionado(s) por completo`,
      );
      setCheckedSupplies(new Set());
      await refresh();
    } else {
      flashMsg("Error al desprovisionar, intenta de nuevo");
    }
    setConfirmAction("");
    setSaving(false);
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
          g.supplier?.contact_name ? `;${g.supplier.contact_name}` : ""
        }${g.supplier?.phone ? `;${g.supplier.phone}` : ""}`,
      );
      lines.push("Insumo;Cantidad;Unidad;Formato;Costo estimado;Provisión");
      g.rows.forEach((c) => {
        const qty = fmtQty(c.totalBase).replace(".", "");
        const st = supplyStatus(c.supply.id);
        const estado =
          st.prov === st.used && st.used > 0
            ? "provisionado"
            : st.prov > 0
              ? `parcial ${st.prov}/${st.used}`
              : "pendiente";
        // Equivalencia en formato de compra (informativa, redondeada arriba)
        const formato =
          c.supply.package_qty &&
          c.supply.package_qty > 0 &&
          (c.supply.package_name || c.supply.package_qty !== 1)
            ? `${Math.ceil(c.totalBase / c.supply.package_qty)} x ${
                c.supply.package_name || "formato"
              } de ${c.supply.package_qty} ${UNIT_FAMILY_INFO[c.supply.unit_family].base}`
            : "";
        lines.push(
          `${c.supply.name};${qty};${UNIT_FAMILY_INFO[c.supply.unit_family].base};${formato};${Math.round(
            c.totalBase * (c.supply.price || 0),
          )};${estado}`,
        );
      });
      lines.push(`Subtotal;;;;${Math.round(g.subtotal)};`);
    });
    lines.push("");
    lines.push("RESUMEN");
    lines.push(
      `Costo insumos estimado;${Math.round(consolidation.costoTotal)}`,
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
            Selecciona eventos, marca los insumos que vas a pedir hoy (por
            insumo o por proveedor) y provisiona por partes o todo de una vez.
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
              {filtered.map((e) => {
                const st = eventStatus(e);
                return (
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
                    <td className="px-3 py-2 text-gray-700">
                      {e.client_name}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {fmtDate(e.event_date)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {e.people_count}
                    </td>
                    <td className="px-3 py-2">
                      {st.kind === "full" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-green-100 text-green-700">
                          <PackageCheck size={12} /> {st.label}
                        </span>
                      )}
                      {st.kind === "partial" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700">
                          {st.label}
                        </span>
                      )}
                      {st.kind === "none" && (
                        <span className="text-xs text-gray-400">
                          {st.label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
                Costo insumos estimado: {fmtMoney(consolidation.costoTotal)}{" "}
                (según catálogo)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={downloadExcel}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
              >
                <Download size={15} /> Excel
              </button>
              <button
                type="button"
                onClick={provisionChecked}
                disabled={saving || checkedSupplies.size === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
              >
                <CheckCircle2 size={15} />
                Provisionar seleccionados
                {checkedSupplies.size > 0 && ` (${checkedSupplies.size})`}
              </button>
              <button
                type="button"
                onClick={provisionAll}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${
                  confirmAction === "todo"
                    ? "bg-orange-600 text-white hover:bg-orange-700"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
              >
                <PackageCheck size={15} />
                {confirmAction === "todo"
                  ? `¿Confirmar todo (${selectedEvents.length})?`
                  : "Provisionar todo"}
              </button>
              <button
                type="button"
                onClick={unprovision}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${
                  confirmAction === "desprovisionar"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <RotateCcw size={15} />
                {confirmAction === "desprovisionar"
                  ? checkedSupplies.size
                    ? `¿Quitar ${checkedSupplies.size} insumo(s)?`
                    : "¿Desprovisionar eventos?"
                  : "Desprovisionar"}
              </button>
            </div>
          </div>

          {consolidation.groups.map((g) => {
            const groupIds = g.rows.map((r) => r.supply.id);
            const allChecked = groupIds.every((id) =>
              checkedSupplies.has(id),
            );
            return (
              <div key={g.supplier?.id || 0}>
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => toggleGroup(g)}
                    className="rounded"
                    aria-label={`Seleccionar grupo ${
                      g.supplier?.name || "sin proveedor"
                    }`}
                  />
                  <Truck size={14} className="text-gray-400" />
                  <h5 className="text-xs font-bold uppercase text-gray-600">
                    {g.supplier ? g.supplier.name : "Sin proveedor asignado"}
                  </h5>
                  {(g.supplier?.contact_name || g.supplier?.phone) && (
                    <span className="text-[11px] text-gray-400">
                      {[g.supplier.contact_name, g.supplier.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {g.rows.map((c) => {
                        const st = supplyStatus(c.supply.id);
                        const full = st.used > 0 && st.prov === st.used;
                        return (
                          <tr
                            key={c.supply.id}
                            className={
                              checkedSupplies.has(c.supply.id)
                                ? "bg-blue-50"
                                : ""
                            }
                          >
                            <td className="px-3 py-2 w-8">
                              <input
                                type="checkbox"
                                checked={checkedSupplies.has(c.supply.id)}
                                onChange={() => toggleSupply(c.supply.id)}
                                className="rounded"
                                aria-label={`Seleccionar ${c.supply.name}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-gray-900">
                                {c.supply.name}
                              </span>
                              {c.services.length > 1 && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700">
                                  consolidado
                                </span>
                              )}
                              {full && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">
                                  ✓ provisionado
                                </span>
                              )}
                              {!full && st.prov > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">
                                  parcial {st.prov}/{st.used}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                              {fmtQty(c.totalBase)}{" "}
                              {UNIT_FAMILY_INFO[c.supply.unit_family].base}
                              {/* Equivalencia en formato de compra (informativa,
                                  redondeada hacia arriba). El costo es lineal. */}
                              {c.supply.package_qty &&
                                c.supply.package_qty > 0 &&
                                (c.supply.package_name ||
                                  c.supply.package_qty !== 1) && (
                                  <div className="text-[11px] font-normal text-gray-400">
                                    →{" "}
                                    {Math.ceil(
                                      c.totalBase / c.supply.package_qty,
                                    ).toLocaleString("es-CL")}{" "}
                                    × {c.supply.package_name || "formato"} de{" "}
                                    {Number(
                                      c.supply.package_qty,
                                    ).toLocaleString("es-CL")}{" "}
                                    {UNIT_FAMILY_INFO[c.supply.unit_family].base}
                                  </div>
                                )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                              {c.supply.price
                                ? fmtMoney(c.totalBase * c.supply.price)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td />
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
            );
          })}

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
