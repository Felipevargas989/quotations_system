import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  PackageCheck,
  RotateCcw,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import NumberInput from "../../../components/inputs/NumberInput";
import { matchesSearch } from "../../../utils/searchMatch";
import { formatPhone } from "../../../utils/phone";
import {
  PurchasingEvent,
  clearQuotationsProvisioned,
  deleteEventSupplyProvisions,
  markQuotationsProvisioned,
  updateSupply,
  upsertEventSupplyProvisions,
  getBaseCatalogo,
  getEstadoCompras,
} from "../../../services/logistics.service";
import {
  Supplier,
  UNIT_FAMILY_INFO,
  grossQty,
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

// SIEMPRE en UTC: las fechas de evento se guardan a medianoche UTC y el
// reloj chileno (UTC-4) las corría un día hacia atrás (bug 22-07).
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CL", { timeZone: "UTC" }) : "—";

// Días del evento (1 = un solo día).
const daysOf = (e: PurchasingEvent) => {
  if (!e.event_date || !e.event_end_date) return 1;
  const d0 = new Date(e.event_date.slice(0, 10) + "T00:00:00Z").getTime();
  const d1 = new Date(e.event_end_date.slice(0, 10) + "T00:00:00Z").getTime();
  return d1 > d0 ? Math.round((d1 - d0) / 86400000) + 1 : 1;
};

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function ComprasTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const queryClient = useQueryClient();
  const { company } = useAuth();
  // "Desde hoy" por defecto: Compras trabaja con lo que viene.
  const [desde, setDesde] = useState(hoyLocal);
  const [hasta, setHasta] = useState("");
  const [search, setSearch] = useState("");
  // Estados de evento visibles (default: pendientes y parciales).
  const [kindChips, setKindChips] = useState<Set<"none" | "partial" | "full">>(
    () => new Set(["none", "partial"] as const),
  );
  // Filtro de la lista de compra (default: lo que falta pedir).
  const [supFilter, setSupFilter] = useState<
    "faltantes" | "provisionados" | "todos"
  >("faltantes");
  // Plegado por proveedor: sin toque manual, los grupos 100% provisionados
  // parten plegados y el resto abiertos.
  const [toggledOpen, setToggledOpen] = useState<Map<number | 0, boolean>>(
    new Map(),
  );
  const [downloadOpen, setDownloadOpen] = useState(false);
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
    staleTime: 5 * 60 * 1000,
    // VELOCIDAD 2.0 (28-07): un solo viaje (paquete del backend).
    queryFn: getBaseCatalogo,
  });
  const estadoQuery = useQuery({
    queryKey: ["logistica", "compras", "estado", companyId],
    // VELOCIDAD 2.0 (28-07): un solo viaje (paquete del backend).
    queryFn: getEstadoCompras,
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

  // Eventos según rango de fecha + búsqueda (N° exacto o cliente).
  const filtered = useMemo(() => {
    const q = search.trim();
    return events.filter((e) => {
      if (q && String(e.quotation_number) !== q && !matchesSearch(q, e.client_name))
        return false;
      if (!e.event_date) return !desde && !hasta;
      const d = e.event_date.slice(0, 10);
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    });
  }, [events, desde, hasta, search]);

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

  // Los chips solo filtran la TABLA; la selección/consolidación sigue
  // operando sobre todos los eventos del rango.
  const visibleEvents = useMemo(
    () => filtered.filter((e) => kindChips.has(eventStatus(e).kind)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, kindChips, perEvent, provByEvent],
  );

  // Un evento que el filtro oculta se DES-selecciona solo: el contador de
  // la lista de compra siempre cuadra con lo que se ve.
  useEffect(() => {
    setSelected((prev) => {
      const visibles = new Set(visibleEvents.map((e) => e.id));
      const next = new Set([...prev].filter((id) => visibles.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleEvents]);

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
      prev.size === visibleEvents.length
        ? new Set()
        : new Set(visibleEvents.map((e) => e.id)),
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
      g.subtotal += row.costTotal;
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

  // Resumen ejecutivo: cuánto falta por comprar vs ya provisionado,
  // par (evento, insumo) por par, con costo de catálogo.
  const resumen = useMemo(() => {
    const supplyById = new Map(supplies.map((sp) => [sp.id, sp]));
    let faltante = 0;
    let provisionado = 0;
    const faltIds = new Set<number>();
    const provIds = new Set<number>();
    selectedEvents.forEach((ev) => {
      const a = perEvent.get(ev.id);
      if (!a) return;
      a.supplyUse.forEach((base, sid) => {
        // base es NETA; el dinero siempre lleva la merma encima.
        const sp = supplyById.get(sid);
        const cost = sp ? grossQty(base, sp) * (sp.price || 0) : 0;
        if (provByEvent.get(ev.id)?.has(sid)) {
          provisionado += cost;
          provIds.add(sid);
        } else {
          faltante += cost;
          faltIds.add(sid);
        }
      });
    });
    return {
      faltante,
      provisionado,
      nFalt: faltIds.size,
      nProv: provIds.size,
    };
  }, [selectedEvents, perEvent, provByEvent, supplies]);

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

  // Lo MARCADO se separa en dos mundos: lo aún no provisionado (acción
  // Provisionar) y lo ya provisionado (acción Desprovisionar). Los botones
  // aparecen solo cuando su mundo tiene algo.
  const checkedFalt = useMemo(
    () =>
      [...checkedSupplies].filter((id) => {
        const st = supplyStatus(id);
        return !(st.used > 0 && st.prov === st.used);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkedSupplies, selectedEvents, perEvent, provByEvent],
  );
  const checkedProv = useMemo(
    () =>
      [...checkedSupplies].filter((id) => {
        const st = supplyStatus(id);
        return st.used > 0 && st.prov === st.used;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkedSupplies, selectedEvents, perEvent, provByEvent],
  );

  const toggleSupply = (id: number) => {
    setConfirmAction("");
    setCheckedSupplies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (ids: number[]) => {
    setConfirmAction("");
    setCheckedSupplies((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const flashMsg = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 4000);
  };

  // ---- CONFIRMAR LA COMPRA ANTES DE PROVISIONAR (Felipe, 24-08) ----
  // "Al apretar provisionar debería aparecer un modal para confirmar los
  // valores... total comprado y total gastado... esto es solamente para
  // mantener los costos actualizados." Lo que el evento necesita va
  // BLOQUEADO (eso se decidió en la lista); lo editable es la compra
  // real: cuánto se compró y cuánto se gastó. Si un ítem no se toca,
  // mantiene los valores antiguos del catálogo tal cual. Si se toca, el
  // costo real alimenta la provisión (el costo final del evento) y
  // actualiza el catálogo: $/unidad = gastado ÷ comprado. Sin
  // inventario: comprado ≠ necesitado es la realidad, no un stock.
  interface LineaCompra {
    sid: number;
    comprado: number;
    gastado: number;
    compradoSug: number;
    gastadoSug: number;
  }
  const [compra, setCompra] = useState<null | {
    alcance: "marcados" | "todo";
    lineas: LineaCompra[];
  }>(null);

  const filaDe = (sid: number): ConsolidatedSupply | undefined => {
    for (const g of consolidation.groups) {
      const c = g.rows.find((r) => r.supply.id === sid);
      if (c) return c;
    }
    return undefined;
  };

  /** Lo sugerido para comprar: el formato redondeado hacia arriba (la
   *  misma cuenta que muestra la columna Formato), o el bruto con merma. */
  const compradoSugerido = (c: ConsolidatedSupply): number => {
    const bruto = grossQty(c.totalBase, c.supply);
    const pk = c.supply.package_qty || 0;
    if (pk > 0) return Math.ceil(bruto / pk - 1e-9) * pk;
    return Math.round(bruto * 100) / 100;
  };

  const abrirConfirmacion = (alcance: "marcados" | "todo") => {
    const objetivos =
      alcance === "marcados"
        ? [...checkedFalt]
        : consolidation.groups.flatMap((g) => g.rows.map((r) => r.supply.id));
    const lineas: LineaCompra[] = [];
    for (const sid of objetivos) {
      const c = filaDe(sid);
      if (!c) continue;
      const compradoSug = compradoSugerido(c);
      const gastadoSug = Math.round(c.costTotal);
      lineas.push({
        sid,
        comprado: compradoSug,
        gastado: gastadoSug,
        compradoSug,
        gastadoSug,
      });
    }
    if (lineas.length === 0) return;
    setCompra({ alcance, lineas });
  };

  /** Reparte el gastado real entre las filas por evento, al peso y sin
   *  sobrantes (piso + los pesos que faltan a los restos más grandes). */
  const repartirGastado = (total: number, pesos: number[]): number[] => {
    const suma = pesos.reduce((t, p) => t + p, 0);
    const efectivos = suma > 0 ? pesos : pesos.map(() => 1);
    const sumaEf = suma > 0 ? suma : pesos.length;
    const exactos = efectivos.map((p) => (total * p) / sumaEf);
    const pisos = exactos.map(Math.floor);
    let faltan = total - pisos.reduce((t, p) => t + p, 0);
    const orden = exactos
      .map((e, i) => ({ resto: e - pisos[i], i }))
      .sort((a, b) => b.resto - a.resto);
    for (const { i } of orden) {
      if (faltan <= 0) break;
      pisos[i] += 1;
      faltan -= 1;
    }
    return pisos;
  };

  const renderLinea = (l: LineaCompra, idx: number) => {
    const c = filaDe(l.sid);
    if (!c) return null;
    const base = UNIT_FAMILY_INFO[c.supply.unit_family].base;
    const tocada = l.comprado !== l.compradoSug || l.gastado !== l.gastadoSug;
    const cambiar = (cambios: Partial<LineaCompra>) =>
      setCompra((prev) =>
        prev
          ? {
              ...prev,
              lineas: prev.lineas.map((x, i) =>
                i === idx ? { ...x, ...cambios } : x,
              ),
            }
          : prev,
      );
    return (
      <li
        key={l.sid}
        className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px_110px] gap-2 items-center py-1.5 text-sm"
      >
        <span className="min-w-0">
          <span className="block truncate text-gray-900">
            {c.supply.name}
            {tocada && (
              <span className="ml-1.5 text-[10px] font-semibold text-blue-700">
                actualiza catálogo
              </span>
            )}
          </span>
          {(c.supply.package_qty || 0) > 0 && (
            <span className="block text-[11px] text-gray-400 truncate">
              {c.supply.package_name || "formato"} de{" "}
              {Number(c.supply.package_qty).toLocaleString("es-CL")} {base}
            </span>
          )}
        </span>
        {/* Lo necesitado: solo referencia, bloqueado. */}
        <span className="text-right tabular-nums text-gray-500">
          {fmtQty(c.totalBase)} {base}
        </span>
        <span className="relative">
          <NumberInput
            value={l.comprado || undefined}
            onChange={(v) => cambiar({ comprado: v ?? 0 })}
            min={0}
            placeholder="0"
            aria-label={`Comprado de ${c.supply.name}`}
            className="w-full !border-gray-300 !rounded-lg !pl-2 !pr-8 !py-1 text-sm text-right tabular-nums"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">
            {base}
          </span>
        </span>
        <span className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            $
          </span>
          <NumberInput
            value={l.gastado || undefined}
            onChange={(v) => cambiar({ gastado: v ?? 0 })}
            min={0}
            formatThousands
            placeholder="0"
            aria-label={`Gastado en ${c.supply.name}`}
            className="w-full !border-gray-300 !rounded-lg !pl-5 !pr-2 !py-1 text-sm text-right tabular-nums"
          />
        </span>
        <span
          className={`text-right tabular-nums text-sm ${
            tocada ? "text-blue-700 font-medium" : "text-gray-500"
          }`}
        >
          {l.comprado > 0 ? `${fmtMoney(l.gastado / l.comprado)}/${base}` : "—"}
        </span>
      </li>
    );
  };

  const confirmarCompra = async () => {
    if (!compra) return;
    setSaving(true);
    const tocadas = new Map(
      compra.lineas
        .filter(
          (l) => l.comprado !== l.compradoSug || l.gastado !== l.gastadoSug,
        )
        .map((l) => [l.sid, l]),
    );
    const objetivo = new Set(compra.lineas.map((l) => l.sid));

    // Las filas por evento: las no tocadas van con la cuenta de siempre
    // (catálogo); las tocadas reparten el gastado real por evento.
    const rows = buildRows(objetivo);
    for (const [sid, linea] of tocadas) {
      const delInsumo = rows.filter((r) => r.supply_id === sid);
      if (delInsumo.length === 0) continue;
      const montos = repartirGastado(
        Math.round(linea.gastado),
        delInsumo.map((r) => r.qty_base),
      );
      delInsumo.forEach((r, i) => (r.cost = montos[i]));
    }

    const { error } = await upsertEventSupplyProvisions(rows);
    if (error) {
      flashMsg("Error al provisionar, intenta de nuevo");
      setSaving(false);
      return;
    }

    // El catálogo aprende de la compra real: $/unidad = gastado÷comprado.
    for (const [sid, linea] of tocadas) {
      if (linea.comprado <= 0) continue;
      const c = filaDe(sid);
      if (!c) continue;
      const precio = Math.round((linea.gastado / linea.comprado) * 100) / 100;
      const cambios: Record<string, number> = { price: precio };
      const pk = c.supply.package_qty || 0;
      if (pk > 0 && Math.abs((linea.comprado / pk) % 1) < 1e-9) {
        cambios.package_price = Math.round(linea.gastado / (linea.comprado / pk));
      }
      await updateSupply(sid, cambios);
    }

    // La cobertura y el sello de evento completo, con el costo REAL:
    // lo ya provisionado + lo recién confirmado.
    const provMap = new Map<string, Set<number>>();
    const costoPorEvento = new Map<string, number>();
    provisions.forEach((p) => {
      const s = provMap.get(p.quotation_id) || new Set<number>();
      s.add(p.supply_id);
      provMap.set(p.quotation_id, s);
      if (!rows.some((r) => r.quotation_id === p.quotation_id && r.supply_id === p.supply_id)) {
        costoPorEvento.set(
          p.quotation_id,
          (costoPorEvento.get(p.quotation_id) ?? 0) + Number(p.cost || 0),
        );
      }
    });
    rows.forEach((r) => {
      const s = provMap.get(r.quotation_id) || new Set<number>();
      s.add(r.supply_id);
      provMap.set(r.quotation_id, s);
      costoPorEvento.set(
        r.quotation_id,
        (costoPorEvento.get(r.quotation_id) ?? 0) + r.cost,
      );
    });
    const completed = await stampCompleted(provMap, costoPorEvento);

    flashMsg(
      `✓ ${compra.lineas.length} insumo(s) provisionado(s)` +
        (tocadas.size ? ` · ${tocadas.size} costo(s) actualizado(s)` : "") +
        (completed ? ` · ${completed} evento(s) completo(s)` : ""),
    );
    setCompra(null);
    setCheckedSupplies(new Set());
    if (compra.alcance === "todo") setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["logistica"] });
    await refresh();
    setSaving(false);
  };

  // Si un evento quedó con todos sus insumos provisionados → marcar completo.
  const stampCompleted = async (
    provMap: Map<string, Set<number>>,
    costoReal?: Map<string, number>,
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
          // El costo real de la compra confirmada manda sobre el
          // estimado (Felipe, 24-08); sin compra confirmada, el estimado.
          cost: costoReal?.get(ev.id) ?? a.costoInsumos,
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
        const sp = supplyById.get(sid);
        rows.push({
          company_id: companyId,
          quotation_id: ev.id,
          supply_id: sid,
          qty_base: base, // NETA (regla de merma 22-07)
          cost: Math.round(sp ? grossQty(base, sp) * (sp.price || 0) : 0),
          supplier_id: supplier?.id ?? null,
          supplier_name: supplier?.name ?? null,
        });
      });
    });
    return rows;
  };

  const unprovision = async () => {
    if (confirmAction !== "desprovisionar") {
      setConfirmAction("desprovisionar");
      return;
    }
    setSaving(true);
    const ids = selectedEvents.map((e) => e.id);
    const supplyIds = checkedProv.length ? checkedProv : undefined;
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

  // PDF de la lista de compra: una página por proveedor (orden de pedido
  // lista para imprimir o mandar), con el lenguaje gráfico de la ficha.
  const downloadPDF = () => {
    const esc = (t: string) =>
      String(t || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const hexOk = (c?: string) =>
      c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
    const brandP = hexOk(company?.colors?.primary) || "#1e3a8a";
    const onBrandP = (() => {
      const n = parseInt(brandP.slice(1), 16);
      const lum =
        (0.299 * ((n >> 16) & 255) +
          0.587 * ((n >> 8) & 255) +
          0.114 * (n & 255)) /
        255;
      return lum > 0.6 ? "#111827" : "#fff";
    })();
    const logoHtml = company?.logo_url
      ? `<img src="${esc(company.logo_url)}" alt="logo">`
      : esc(
          (company?.name || "E")
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
        );
    const eventosTxt = selectedEvents
      .map((e) => `#${e.quotation_number}`)
      .join(" · ");
    const filtroTxt =
      supFilter === "faltantes"
        ? "Solo insumos FALTANTES"
        : supFilter === "provisionados"
          ? "Solo insumos provisionados"
          : "Lista completa";
    const generada = new Date().toLocaleString("es-CL");

    // PDF CONTINUO (pedido de Felipe 22-07): un solo documento, cada
    // proveedor como sección que fluye — nada de una hoja por proveedor.
    // Único cuidado: no cortar un proveedor por la mitad si cabe entero.
    let totalShown = 0;
    let itemsShown = 0;
    const secciones = consolidation.groups
      .map((g) => {
        const rows = g.rows.filter((c) => {
          const st = supplyStatus(c.supply.id);
          const full = st.used > 0 && st.prov === st.used;
          if (supFilter === "faltantes") return !full;
          if (supFilter === "provisionados") return full;
          return true;
        });
        if (rows.length === 0) return "";
        const sub = rows.reduce((t, c) => t + c.costTotal, 0);
        totalShown += sub;
        itemsShown += rows.length;
        const sinPrecio = rows.filter((c) => !c.supply.price).length;
        const filas = rows
          .map((c) => {
            const formato =
              c.supply.package_qty &&
              c.supply.package_qty > 0 &&
              (c.supply.package_name || c.supply.package_qty !== 1)
                ? `${Math.ceil(c.totalBase / c.supply.package_qty).toLocaleString("es-CL")} × ${
                    c.supply.package_name || "formato"
                  } de ${Number(c.supply.package_qty).toLocaleString("es-CL")} ${UNIT_FAMILY_INFO[c.supply.unit_family].base}`
                : "";
            return `<tr><td class="chk"><span></span></td><td>${esc(c.supply.name)}</td><td class="qty">${fmtQty(c.totalBase)} ${UNIT_FAMILY_INFO[c.supply.unit_family].base}</td><td class="fmt">${
              formato ? `· ${esc(formato)}` : ""
            }</td><td class="der">${
              c.supply.price ? fmtMoney(c.costTotal) : "—"
            }</td></tr>`;
          })
          .join("");
        return `<div class="prov">
  <div class="prov-head">
    <span class="prov-nombre">${esc(g.supplier ? g.supplier.name : "Sin proveedor asignado")}</span>
    ${
      g.supplier?.contact_name || g.supplier?.phone
        ? `<span class="prov-contacto">${esc(
            [g.supplier?.contact_name, formatPhone(g.supplier?.phone)]
              .filter(Boolean)
              .join(" · "),
          )}</span>`
        : ""
    }
    <span class="prov-sub">${fmtMoney(sub)}${sinPrecio ? ` <small>· ${sinPrecio} sin precio</small>` : ""}</span>
  </div>
  <table class="tabla">${filas}</table>
</div>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Orden de Compra — ${selectedEvents.length} evento(s)</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',Roboto,sans-serif; background:#e5e7eb; padding:24px; color:#111827; }
  .hoja { max-width:800px; margin:0 auto; background:#fff; padding:44px 52px; box-shadow:0 2px 12px rgba(0,0,0,.15); }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${brandP}; padding-bottom:16px; }
  .marca { display:flex; gap:12px; align-items:center; }
  .logo { width:64px; height:64px; border-radius:50%; background:${brandP}; color:${onBrandP}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:24px; overflow:hidden; }
  .logo img { width:100%; height:100%; object-fit:cover; }
  .marca h1 { font-size:17px; }
  .marca .sub { font-size:10.5px; color:#6b7280; margin-top:1px; }
  .folio { text-align:right; }
  .folio .tipo { font-size:11px; font-weight:800; letter-spacing:2px; color:${brandP}; text-transform:uppercase; }
  .folio .num { font-size:20px; font-weight:800; }
  .folio .fecha { font-size:11px; color:#6b7280; margin-top:2px; }
  .datos { display:grid; grid-template-columns:1.6fr 1fr .6fr .8fr; gap:12px 22px; padding:14px 0; border-bottom:1px solid #e5e7eb; }
  .dato .k { font-size:9.5px; font-weight:800; letter-spacing:1px; color:#9ca3af; text-transform:uppercase; }
  .dato .v { font-size:13px; font-weight:600; margin-top:1px; }
  .dato .v.big { font-size:16px; font-weight:800; color:${brandP}; }
  /* Sección por proveedor: franja suave, fluye una tras otra */
  .prov { margin-top:18px; page-break-inside:avoid; }
  .prov-head { display:flex; align-items:baseline; gap:10px; background:#f3f4f6; border-radius:8px; padding:6px 12px; }
  .prov-nombre { font-size:12px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:${brandP}; }
  .prov-contacto { font-size:11px; color:#6b7280; }
  .prov-sub { margin-left:auto; font-size:12.5px; font-weight:800; }
  .prov-sub small { font-weight:600; font-size:10px; color:#b45309; }
  .chk { width:26px; }
  .chk span { display:inline-block; width:13px; height:13px; border:1.5px solid #9ca3af; border-radius:3px; vertical-align:middle; }
  .tabla { width:100%; border-collapse:collapse; margin-top:2px; }
  .tabla td { font-size:12.5px; padding:4px 10px 4px 0; border-bottom:1px solid #f3f4f6; }
  .tabla td.chk { padding-left:2px; }
  .tabla td:nth-child(2) { font-weight:600; }
  .tabla .der { text-align:right; white-space:nowrap; font-weight:700; width:90px; }
  .tabla .qty { text-align:right; white-space:nowrap; font-weight:700; width:90px; }
  .tabla .fmt { white-space:nowrap; font-weight:400; font-size:10.5px; color:#9ca3af; width:170px; padding-left:8px; }
  .tabla .nota { font-weight:400; font-size:10.5px; color:#9ca3af; }
  .tabla tr:last-child td { border-bottom:none; }
  .total-final { display:flex; justify-content:flex-end; gap:14px; margin-top:16px; padding:8px 12px; background:${brandP}; color:${onBrandP}; border-radius:8px; font-size:13px; font-weight:800; }
  .pie { margin-top:26px; border-top:1px solid #e5e7eb; padding-top:10px; font-size:10.5px; color:#9ca3af; display:flex; justify-content:space-between; }
  .btn-imprimir { position:fixed; top:14px; right:14px; background:${brandP}; color:${onBrandP}; border:none; border-radius:8px; padding:10px 18px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.25); }
  .hoja, .hoja * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @media print {
    @page { size:A4 portrait; margin:12mm; }
    body { background:#fff; padding:0; }
    .hoja { box-shadow:none; padding:0; max-width:none; }
    .btn-imprimir { display:none; }
  }
</style></head><body>
<button class="btn-imprimir" onclick="window.print()">Imprimir / PDF</button>
<div class="hoja">
  <div class="head">
    <div class="marca"><div class="logo">${logoHtml}</div><div><h1>${esc(company?.name || "Eventia")}</h1><div class="sub">Documento operativo — orden de compra</div></div></div>
    <div class="folio"><div class="tipo">Orden de Compra</div><div class="num">${selectedEvents.length} evento${selectedEvents.length === 1 ? "" : "s"}</div><div class="fecha">${esc(generada)}</div></div>
  </div>
  <div class="datos">
    <div class="dato"><div class="k">Eventos</div><div class="v">${esc(eventosTxt || "—")}</div></div>
    <div class="dato"><div class="k">Filtro</div><div class="v">${esc(filtroTxt)}</div></div>
    <div class="dato"><div class="k">Ítems</div><div class="v big">${itemsShown}</div></div>
    <div class="dato"><div class="k">Total estimado</div><div class="v big">${fmtMoney(totalShown)}</div></div>
  </div>
  ${secciones || '<p style="text-align:center;color:#6b7280;margin-top:30px">No hay insumos que coincidan con el filtro actual.</p>'}
  ${secciones ? `<div class="total-final"><span>Total estimado</span><span>${fmtMoney(totalShown)}</span></div>` : ""}
  <div class="pie"><span>Generada el ${esc(generada)} · ${esc(company?.name || "Eventia")}</span><span>Cantidades netas de receta · la merma va incluida solo en el costo</span></div>
</div>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const downloadExcel = () => {
    const filtroTxt =
      supFilter === "faltantes"
        ? "solo faltantes"
        : supFilter === "provisionados"
          ? "solo provisionados"
          : "lista completa";
    const lines: string[] = [];
    lines.push(
      `Lista de compras;${selectedEvents.length} evento(s);${filtroTxt}`,
    );
    selectedEvents.forEach((e) => {
      lines.push(
        `#${e.quotation_number};${e.client_name};${fmtDate(e.event_date)};${e.people_count} personas`,
      );
    });
    consolidation.groups.forEach((g) => {
      // Mismo filtro activo de la pantalla (coherente con el PDF).
      const rowsShown = g.rows.filter((c) => {
        const st = supplyStatus(c.supply.id);
        const full = st.used > 0 && st.prov === st.used;
        if (supFilter === "faltantes") return !full;
        if (supFilter === "provisionados") return full;
        return true;
      });
      if (rowsShown.length === 0) return;
      lines.push("");
      lines.push(
        `PROVEEDOR;${g.supplier ? g.supplier.name : "Sin proveedor asignado"}${
          g.supplier?.contact_name ? `;${g.supplier.contact_name}` : ""
        }${g.supplier?.phone ? `;${formatPhone(g.supplier.phone)}` : ""}`,
      );
      lines.push("Insumo;Cantidad;Unidad;Formato;Costo estimado;Provisión");
      rowsShown.forEach((c) => {
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
            c.costTotal,
          )};${estado}`,
        );
      });
      lines.push(
        `Subtotal;;;;${Math.round(
          rowsShown.reduce(
            (t, c) => t + c.totalBase * (c.supply.price || 0),
            0,
          ),
        )};`,
      );
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
    a.download = `compras_${supFilter}_${selectedEvents.length}_eventos.csv`;
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
        <div className="flex items-end gap-2 flex-wrap">
          <div className="relative">
            <Search
              className="absolute left-2.5 bottom-2.5 text-gray-400"
              size={14}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° o cliente…"
              className="w-44 pl-8 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              aria-label="Buscar evento por número o cliente"
            />
          </div>
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

      {/* Filtro de estado de los eventos: control segmentado del sistema,
          con contadores (default: pendientes y parciales) */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit -mb-3">
        {(
          [
            ["none", "Pendientes"],
            ["partial", "Parciales"],
            ["full", "Completos"],
          ] as const
        ).map(([kind, label]) => {
          const count = filtered.filter(
            (e) => eventStatus(e).kind === kind,
          ).length;
          const on = kindChips.has(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setKindChips((prev) => {
                  const next = new Set(prev);
                  if (next.has(kind)) next.delete(kind);
                  else next.add(kind);
                  return next;
                })
              }
              className={`px-3 py-1.5 text-xs font-bold border-r border-gray-300 last:border-r-0 ${
                on
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* ---------- Lista de eventos ---------- */}
      {visibleEvents.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <ShoppingCart className="mx-auto mb-3 text-gray-300" size={34} />
          {filtered.length > 0 ? (
            <>
              <p className="font-medium">
                No hay eventos con esos estados en este rango
              </p>
              <p className="text-sm mt-1">
                Hay {filtered.length} evento{filtered.length === 1 ? "" : "s"}{" "}
                oculto{filtered.length === 1 ? "" : "s"} por el filtro de
                estado — actívalo arriba para verlo
                {filtered.length === 1 ? "" : "s"}.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Sin eventos cerrados en este rango</p>
              <p className="text-sm mt-1">
                Ajusta el rango de fechas o cierra ventas en Post Venta.
              </p>
            </>
          )}
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
                      visibleEvents.length > 0 &&
                      selected.size === visibleEvents.length
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
              {visibleEvents.map((e) => {
                const st = eventStatus(e);
                const dias = daysOf(e);
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
                      {dias > 1 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                          {dias} días
                        </span>
                      )}
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

      {flash && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-lg px-3 py-2">
          {flash}
        </div>
      )}

      {/* ---------- Consolidado ---------- */}
      {selectedEvents.length > 0 && (
        <div className="space-y-5">
          {/* Encabezado estándar del sistema + Provisionar todo como link */}
          <div>
            <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
              <ShoppingCart size={17} className="text-gray-600" />
              <h3 className="text-base font-bold text-gray-900">
                Lista de compra
              </h3>
              <span className="text-sm text-gray-500">
                · {selectedEvents.length} evento
                {selectedEvents.length === 1 ? "" : "s"} ·{" "}
                {selectedEvents
                  .reduce((t, e) => t + (e.people_count || 0), 0)
                  .toLocaleString("es-CL")}{" "}
                personas
              </span>
              {confirmAction === "todo" ? (
                <span className="ml-auto flex items-center gap-2 text-xs">
                  <span className="font-semibold text-gray-700">
                    ¿Provisionar TODO ({selectedEvents.length} evento
                    {selectedEvents.length === 1 ? "" : "s"})?
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => abrirConfirmacion("todo")}
                    className="px-2.5 py-1 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
                  >
                    {saving ? "Provisionando…" : "Sí, todo"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setConfirmAction("")}
                    className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => abrirConfirmacion("todo")}
                  disabled={saving}
                  className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  Provisionar todo
                </button>
              )}
            </div>
            <p className="text-xs mt-2">
              <span className="font-bold text-red-600">
                Faltante por comprar: {fmtMoney(resumen.faltante)} (
                {resumen.nFalt} insumo{resumen.nFalt === 1 ? "" : "s"})
              </span>
              <span className="text-gray-400"> · </span>
              <span className="font-semibold text-green-600">
                Provisionado: {fmtMoney(resumen.provisionado)} ({resumen.nProv})
              </span>
              <span className="text-gray-400">
                {" "}
                · Total estimado {fmtMoney(consolidation.costoTotal)} (catálogo)
              </span>
            </p>
          </div>

          {/* Filtro segmentado + Descargar + acciones contextuales */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
              {(
                [
                  ["faltantes", "Faltantes"],
                  ["provisionados", "Provisionados"],
                  ["todos", "Todos"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSupFilter(k)}
                  className={`px-3 py-1.5 text-xs font-bold border-r border-gray-300 last:border-r-0 ${
                    supFilter === k
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Un solo botón Descargar: Excel o PDF, según el filtro activo */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDownloadOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
                >
                  <Download size={15} /> Descargar
                  <ChevronDown size={14} />
                </button>
                {downloadOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Cerrar menú"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setDownloadOpen(false)}
                    />
                    <div className="absolute right-0 mt-1 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setDownloadOpen(false);
                          downloadPDF();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                      >
                        <FileText size={15} className="text-gray-500" />
                        <span>
                          <span className="font-semibold">
                            PDF orden de compra
                          </span>
                          <span className="block text-[11px] text-gray-400">
                            continuo, secciones por proveedor · según filtro
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDownloadOpen(false);
                          downloadExcel();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-t border-gray-100"
                      >
                        <Download size={15} className="text-gray-500" />
                        <span>
                          <span className="font-semibold">Excel</span>
                          <span className="block text-[11px] text-gray-400">
                            planilla completa · según filtro
                          </span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Acciones CONTEXTUALES: aparecen solo cuando lo marcado
                  tiene algo que hacer en su mundo */}
              {checkedFalt.length > 0 && (
                <button
                  type="button"
                  onClick={() => abrirConfirmacion("marcados")}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  <CheckCircle2 size={15} />
                  {saving
                    ? "Provisionando…"
                    : `Provisionar marcados (${checkedFalt.length})`}
                </button>
              )}
              {checkedProv.length > 0 && (
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
                  {saving
                    ? "Desprovisionando…"
                    : confirmAction === "desprovisionar"
                      ? `¿Quitar ${checkedProv.length} insumo(s)?`
                      : `Desprovisionar marcados (${checkedProv.length})`}
                </button>
              )}
            </div>
          </div>

          {/* Boceto de Felipe (31-07): UNA tabla con titulos
              (PROVEEDOR / INSUMO / CANTIDAD / FORMATO / COSTO), los
              subtotales por proveedor intactos y anchos fijos: todos
              los grupos comparten los mismos rieles. Plegado, casillas
              y contacto del proveedor siguen igual que antes. */}
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-44" />
                <col />
                <col className="w-28" />
                <col className="w-56" />
                <col className="w-28" />
              </colgroup>
              {/* Título de columnas: blanco, letra firme y línea inferior
                  gruesa — marco de la planilla, no una fila más. */}
              <thead className="bg-white border-b-2 border-gray-300">
                <tr>
                  <th />
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700">
                    Proveedor
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700">
                    Nombre insumo
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-gray-700">
                    Cantidad
                  </th>
                  <th className="px-2 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700">
                    Formato
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-gray-700">
                    Costo
                  </th>
                </tr>
              </thead>
              {consolidation.groups.map((g) => {
                const key = g.supplier?.id || 0;
                // Filtro faltantes/provisionados aplicado a las filas del grupo.
                const rowsShown = g.rows.filter((c) => {
                  const st = supplyStatus(c.supply.id);
                  const full = st.used > 0 && st.prov === st.used;
                  if (supFilter === "faltantes") return !full;
                  if (supFilter === "provisionados") return full;
                  return true;
                });
                if (rowsShown.length === 0) return null;
                const shownIds = rowsShown.map((r) => r.supply.id);
                const allChecked = shownIds.every((id) =>
                  checkedSupplies.has(id),
                );
                const groupFull = g.rows.every((c) => {
                  const st = supplyStatus(c.supply.id);
                  return st.used > 0 && st.prov === st.used;
                });
                const sinPrecio = rowsShown.filter(
                  (c) => !c.supply.price,
                ).length;
                const subShown = rowsShown.reduce((t, c) => t + c.costTotal, 0);
                // Sin toque manual: los grupos completos parten plegados.
                const isOpen = toggledOpen.get(key) ?? !groupFull;
                return (
                  <tbody
                    key={key}
                    className="divide-y divide-gray-100 border-b border-gray-200"
                  >
                    {/* Fila del proveedor: banda azul de la casa (misma
                        alma que las secciones del catálogo), plegable,
                        con contacto y subtotal a la vista (aun plegado). */}
                    <tr
                      className="bg-blue-50/60 hover:bg-blue-50 cursor-pointer"
                      onClick={() =>
                        setToggledOpen((prev) => {
                          const next = new Map(prev);
                          next.set(key, !isOpen);
                          return next;
                        })
                      }
                    >
                      <td className="px-3 py-2 border-l-4 border-blue-400">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={() => toggleGroup(shownIds)}
                          onClick={(ev) => ev.stopPropagation()}
                          className="rounded"
                          aria-label={`Seleccionar grupo ${
                            g.supplier?.name || "sin proveedor"
                          }`}
                        />
                      </td>
                      <td colSpan={4} className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {isOpen ? (
                            <ChevronDown size={15} className="text-blue-500" />
                          ) : (
                            <ChevronRight size={15} className="text-blue-500" />
                          )}
                          <Truck size={14} className="text-blue-400" />
                          <span className="text-xs font-bold uppercase text-blue-900">
                            {g.supplier
                              ? g.supplier.name
                              : "Sin proveedor asignado"}
                          </span>
                          {(g.supplier?.contact_name || g.supplier?.phone) && (
                            <span className="text-[11px] text-gray-400">
                              {[
                                g.supplier.contact_name,
                                formatPhone(g.supplier.phone),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400">
                            · {rowsShown.length} ítem
                            {rowsShown.length === 1 ? "" : "s"}
                          </span>
                          {sinPrecio > 0 && (
                            <span className="text-[11px] font-semibold text-amber-600">
                              · {sinPrecio} sin precio
                            </span>
                          )}
                          {groupFull && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">
                              ✓ completo
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-blue-900 whitespace-nowrap">
                        {fmtMoney(subShown)}
                      </td>
                    </tr>
                    {isOpen &&
                      rowsShown.map((c) => {
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
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={checkedSupplies.has(c.supply.id)}
                                onChange={() => toggleSupply(c.supply.id)}
                                className="rounded"
                                aria-label={`Seleccionar ${c.supply.name}`}
                              />
                            </td>
                            <td
                              className="px-3 py-1.5 text-[11px] text-gray-400 truncate"
                              title={g.supplier?.name || "Sin proveedor"}
                            >
                              {g.supplier?.name || "Sin proveedor"}
                            </td>
                            <td className="px-3 py-1.5">
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
                            <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">
                              {fmtQty(c.totalBase)}{" "}
                              {UNIT_FAMILY_INFO[c.supply.unit_family].base}
                            </td>
                            {/* Formato de compra en SU columna (informativo;
                                el costo es lineal). */}
                            <td className="px-2 py-1.5 text-[11px] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
                              {c.supply.package_qty &&
                              c.supply.package_qty > 0 &&
                              (c.supply.package_name ||
                                c.supply.package_qty !== 1)
                                ? `${Math.ceil(
                                    c.totalBase / c.supply.package_qty,
                                  ).toLocaleString("es-CL")} × ${
                                    c.supply.package_name || "formato"
                                  } de ${Number(
                                    c.supply.package_qty,
                                  ).toLocaleString("es-CL")} ${
                                    UNIT_FAMILY_INFO[c.supply.unit_family].base
                                  }`
                                : ""}
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">
                              {c.supply.price ? fmtMoney(c.costTotal) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    {isOpen && (
                      <tr className="bg-gray-50">
                        <td />
                        <td
                          colSpan={4}
                          className="px-3 py-1.5 text-right text-xs font-semibold text-gray-500 uppercase"
                        >
                          Subtotal
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">
                          {fmtMoney(subShown)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>

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

      {/* ---- El modal de la compra real (Felipe, 24-08) ---- */}
      {compra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                Confirmar la compra
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Lo que el evento necesita no se toca acá. Corrige lo que
                COMPRASTE y lo que GASTASTE de verdad: el costo por unidad
                se recalcula y el catálogo queda al día. Lo que no toques
                mantiene sus valores de siempre.
              </p>
            </div>

            <div className="px-5 py-3 overflow-y-auto">
              <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px_110px] gap-2 items-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 pb-1">
                <span>Insumo</span>
                <span className="text-right">Necesito</span>
                <span className="text-right">Compro</span>
                <span className="text-right">Gasto total</span>
                <span className="text-right">$ / unidad</span>
              </div>
              {/* SE COMPRA POR PROVEEDOR (Felipe, 24-08): el modal agrupa
                  igual que la lista, con el subtotal real de cada uno. */}
              {(() => {
                const porProveedor = new Map<
                  number,
                  { nombre: string; filas: { l: (typeof compra.lineas)[number]; idx: number }[] }
                >();
                const nombreProv = new Map(suppliers.map((x) => [x.id, x.name]));
                compra.lineas.forEach((l, idx) => {
                  const c = filaDe(l.sid);
                  const key = c?.supply.supplier_id || 0;
                  let g = porProveedor.get(key);
                  if (!g) {
                    g = {
                      nombre: key ? (nombreProv.get(key) ?? "Proveedor") : "Sin proveedor",
                      filas: [],
                    };
                    porProveedor.set(key, g);
                  }
                  g.filas.push({ l, idx });
                });
                const grupos = [...porProveedor.entries()]
                  .sort(([ka, a], [kb, b]) => {
                    if (!ka) return 1;
                    if (!kb) return -1;
                    return a.nombre.localeCompare(b.nombre);
                  })
                  .map(([, g]) => g);
                return grupos.map((g) => (
                  <div key={g.nombre}>
                    <div className="flex items-center justify-between pt-2 pb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-blue-900">
                        {g.nombre}
                      </span>
                      <span className="text-xs tabular-nums text-gray-500">
                        {fmtMoney(g.filas.reduce((t, f) => t + (f.l.gastado || 0), 0))}
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {g.filas.map(({ l, idx }) => renderLinea(l, idx))}
                    </ul>
                  </div>
                ));
              })()}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
              <span className="text-sm text-gray-600 tabular-nums">
                Total:{" "}
                <span className="font-semibold text-gray-900">
                  {fmtMoney(
                    compra.lineas.reduce((t, l) => t + (l.gastado || 0), 0),
                  )}
                </span>
                {(() => {
                  const est = compra.lineas.reduce(
                    (t, l) => t + l.gastadoSug,
                    0,
                  );
                  const real = compra.lineas.reduce(
                    (t, l) => t + (l.gastado || 0),
                    0,
                  );
                  return real !== est ? (
                    <span className="text-gray-400">
                      {" "}
                      · estimado {fmtMoney(est)}
                    </span>
                  ) : null;
                })()}
              </span>
              <button
                type="button"
                onClick={() => setCompra(null)}
                disabled={saving}
                className="ml-auto px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarCompra()}
                disabled={
                  saving || compra.lineas.some((l) => !(l.comprado > 0))
                }
                title={
                  compra.lineas.some((l) => !(l.comprado > 0))
                    ? "Hay un comprado en cero"
                    : undefined
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving
                  ? "Provisionando…"
                  : `Provisionar ${compra.lineas.length} insumo${compra.lineas.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
