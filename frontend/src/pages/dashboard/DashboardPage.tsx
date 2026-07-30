import React, { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listPortalReceipts } from "../../services/portalReceipts.service";
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Building,
  Calendar,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCompleteStats } from "../../services/analytics.service";
import { getHoyAlerts } from "../../services/hoy.service";
import {
  getAllEventResources,
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getEventSupplyProvisions,
  getFixedServiceCostsById,
  getFurnitureItems,
  getManagementResources,
  getSupplies,
  getSuppliers,
  getWonEventsSince,
  getBaseCatalogo,
} from "../../services/logistics.service";
import {
  EventItemsSnapshot,
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
} from "../../utils/eventConsolidation";
import { CompleteStatsResponse } from "../../types/analytics.types";
import QuotationStatusStatsComponent from "../analytics/components/QuotationStatusStats";
import EventTypeConversionStatsComponent from "../analytics/components/EventTypeConversionStats";
import EventTypeRevenueStatsComponent from "../analytics/components/EventTypeRevenueStats";
import RevenueByClientTypeStatsComponent from "../analytics/components/RevenueByClientTypeStats";
import TopClientsByRevenueStatsComponent from "../analytics/components/TopClientsByRevenueStats";
import TopClientsByQuotationsStatsComponent from "../analytics/components/TopClientsByQuotationsStats";
import RecurringClientsStatsComponent from "../analytics/components/RecurringClientsStats";
import VariableServicesUsageStatsComponent from "../analytics/components/VariableServicesUsageStats";
import FixedServicesUsageStatsComponent from "../analytics/components/FixedServicesUsageStats";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

// Abreviatura chilena de cifras para los gráficos (Felipe, 23-07):
// 16.000.000 -> "16M", 4.500.000 -> "4,5M", 450.000 -> "450k".
const abrevCifra = (n: number): string => {
  const abs = Math.abs(n);
  const f = (v: number) =>
    v.toLocaleString("es-CL", {
      maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0,
    });
  if (abs >= 1_000_000) return `${f(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${f(n / 1_000)}k`;
  return n.toLocaleString("es-CL");
};

// Plugin liviano (sin dependencias): pinta la cifra abreviada sobre cada
// punto de la curva, del color de la serie. El monto exacto sigue en el
// tooltip. Se activa con `puntoAbrev` (dinero) o `puntoEntero` (conteos)
// en las options del gráfico.
const etiquetasDePunto = {
  id: "etiquetasDePunto",
  afterDatasetsDraw(chart: any) {
    const opts: any = chart.options || {};
    if (!opts.puntoAbrev && !opts.puntoEntero) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((ds: any, di: number) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      ctx.save();
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillStyle = ds.borderColor || "#374151";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      meta.data.forEach((pt: any, i: number) => {
        const v = Number(ds.data[i]);
        if (!Number.isFinite(v) || v === 0) return;
        const label = opts.puntoAbrev
          ? abrevCifra(v)
          : v.toLocaleString("es-CL");
        ctx.fillText(label, pt.x, pt.y - 6);
      });
      ctx.restore();
    });
  },
};


import { useAuth } from "../../contexts/AuthContext";
import { getDashboardStats } from "../../services/analytics.service";
import NewAccount from "./components/NewAccount";
import { UserRole } from "../../constants/users";
import { subMonths, subYears } from "date-fns";
import { MONTHS } from "../../constants/dates";
import { QuotationStatus } from "../../types/quotations.types";
import { formatCurrency } from "../../utils/currencies";

interface DashboardData {
  totalRequests: number;
  totalClients: number;
  totalSales: number;
  requestsByMonth: { month: string; count: number; monthKey: string }[];
  quotationsByStatus: { status: string; count: number; amount: number }[];
  eventsByMonth: {
    month: string;
    count: number;
    amount: number;
    monthKey: string;
  }[];
  salesPipeline: { status: string; amount: number; count: number }[];
  // FASE 3: la plata se lee en tabla — una fila por mes.
  moneyByMonth: {
    month: string;
    monthKey: string;
    eventos: number;
    ventas: number;
    cobrado: number;
    porCobrar: number;
  }[];
}

type TimeRangeOption = {
  label: string;
  value: string;
  getDateRange: () => { start_date: string; end_date: string };
};

export default function DashboardPage() {
  const { user, company, userRole } = useAuth();
  const navigate = useNavigate();

  // Time range options
  const timeRangeOptions: TimeRangeOption[] = [
    {
      label: "Último mes",
      value: "1_month",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subMonths(endDate, 1);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Últimos 3 meses",
      value: "3_months",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subMonths(endDate, 3);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Últimos 6 meses",
      value: "6_months",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subMonths(endDate, 6);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Último año",
      value: "1_year",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subYears(endDate, 1);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Últimos 5 años",
      value: "5_years",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subYears(endDate, 5);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
  ];

  // Selected time range (default to 1 year)
  const [selectedTimeRange, setSelectedTimeRange] = useState("1_year");
  // Fechas libres (Fase 2): al tocar cualquiera, el rango personalizado
  // manda; al elegir un preset, se vuelve a los presets.
  const [customRange, setCustomRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  // Secciones de análisis plegables (ex-Analytics). Comercial parte
  // abierta; el estado es solo de la sesión.
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["comercial"]),
  );
  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const resolveRange = () => {
    if (customRange) {
      return { start_date: customRange.start, end_date: customRange.end };
    }
    const selectedOption = timeRangeOptions.find(
      (option) => option.value === selectedTimeRange,
    );
    return (
      selectedOption?.getDateRange() || timeRangeOptions[3].getDateRange()
    );
  };

  const EMPTY_DASHBOARD: DashboardData = {
    totalRequests: 0,
    totalClients: 0,
    totalSales: 0,
    requestsByMonth: [],
    quotationsByStatus: [],
    eventsByMonth: [],
    salesPipeline: [],
    moneyByMonth: [],
  };

  // Dashboard vía React Query (Etapa 5): una clave por rango de tiempo;
  // al cambiar el rango se sigue mostrando el anterior mientras llega
  // el nuevo (sin parpadeo), y volver al dashboard es instantáneo.
  const dashboardQuery = useQuery({
    queryKey: [
      "dashboard",
      company?.id,
      selectedTimeRange,
      customRange?.start,
      customRange?.end,
    ],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DashboardData> => {
      const dateRange = resolveRange();

      // Get dashboard stats from analytics service
      const analyticsData = await getDashboardStats(
        dateRange.start_date,
        dateRange.end_date,
      );

      if (!analyticsData) {
        throw new Error("No analytics data received");
      }

      // Get total requests count from analytics service
      const totalRequests = analyticsData.totalQuotations;

      const totalClients = analyticsData.totalClients;

      // Ventas del período = concretadas (aceptada + realizada),
      // coherente con las curvas de eventos/ventas (Fase 1, 23-07).
      const totalSales =
        (analyticsData.totalQuotationsByStatus?.aceptada?.amount || 0) +
        (analyticsData.totalQuotationsByStatus?.realizada?.amount || 0);

      // Convert totalQuotationsByMonth to requestsByMonth format
      const requestsByMonth = Object.keys(analyticsData.totalQuotationsByMonth)
        .sort((a, b) => {
          // Sort by year first, then by month
          const [yearA, monthA] = a.split("-").map(Number);
          const [yearB, monthB] = b.split("-").map(Number);
          if (yearA !== yearB) return yearA - yearB;
          return monthA - monthB;
        })
        .map((monthYearKey: string) => ({
          month: formatMonthYear(monthYearKey),
          count: analyticsData.totalQuotationsByMonth[monthYearKey],
          monthKey: monthYearKey,
        }));

      // Convert quotations by status to the expected format
      const quotationsByStatus = Object.entries(
        analyticsData.totalQuotationsByStatus || {},
      ).map(([status, data]) => ({
        status,
        count: data.count,
        amount: data.amount,
      }));

      // Convert totalQuotationsByEventDate to eventsByMonth format
      const eventsByMonth = Object.keys(
        analyticsData.totalQuotationsByEventDate,
      )
        .sort((a, b) => {
          // Sort by year first, then by month
          const [yearA, monthA] = a.split("-").map(Number);
          const [yearB, monthB] = b.split("-").map(Number);
          if (yearA !== yearB) return yearA - yearB;
          return monthA - monthB;
        })
        .map((monthYearKey: string) => ({
          month: formatMonthYear(monthYearKey),
          count: analyticsData.totalQuotationsByEventDate[monthYearKey].count,
          amount: analyticsData.totalQuotationsByEventDate[monthYearKey].amount,
          monthKey: monthYearKey,
        }));

      // Pipeline de ventas (excluye rechazadas)
      // Embudo completo (23-07): TODOS los estados — la zona "perdidas"
      // (rechazada/cancelada) es parte de la lectura del pipeline.
      const salesPipeline = quotationsByStatus;

      // Convert totalPaymentsByMonth to paymentsByMonth format
      // FASE 3: una fila por mes con eventos, ventas, cobrado y por
      // cobrar — unión de los ejes de eventos y de pagos.
      const detail = analyticsData.totalPaymentsDetailByMonth || {};
      const byEvent = analyticsData.totalQuotationsByEventDate || {};
      const moneyKeys = [
        ...new Set([...Object.keys(byEvent), ...Object.keys(detail)]),
      ].sort((a, b) => {
        const [yearA, monthA] = a.split("-").map(Number);
        const [yearB, monthB] = b.split("-").map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return monthA - monthB;
      });
      const moneyByMonth = moneyKeys.map((monthYearKey: string) => ({
        month: formatMonthYear(monthYearKey),
        monthKey: monthYearKey,
        eventos: byEvent[monthYearKey]?.count || 0,
        ventas: byEvent[monthYearKey]?.amount || 0,
        cobrado: detail[monthYearKey]?.cobrado || 0,
        porCobrar: detail[monthYearKey]?.porCobrar || 0,
      }));

      return {
        totalRequests,
        totalClients,
        totalSales,
        requestsByMonth: requestsByMonth as {
          month: string;
          count: number;
          monthKey: string;
        }[],
        quotationsByStatus,
        eventsByMonth: eventsByMonth as {
          month: string;
          count: number;
          amount: number;
          monthKey: string;
        }[],
        salesPipeline,
        moneyByMonth,
      };
    },
  });
  const data = dashboardQuery.data ?? EMPTY_DASHBOARD;
  const loading = dashboardQuery.isPending;

  // Fila HOY: comprobantes del portal por confirmar (Fase 2b) — el
  // aviso más temprano de que llegó plata declarada.
  const receiptsQuery = useQuery({
    queryKey: ["postventa", "comprobantes"],
    staleTime: 0,
    queryFn: listPortalReceipts,
  });
  const comprobantesPortal = (receiptsQuery.data ?? []).length;

  const getStatusLabel = (status: string) => {
    const labels = {
      solicitada: "📋 Solicitada",
      enviada: "📤 Enviada",
      en_negociacion: "💬 En Negociación",
      aceptada: "✅ Aceptada",
      rechazada: "❌ Rechazada",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      solicitada: "bg-yellow-500",
      enviada: "bg-blue-500",
      en_negociacion: "bg-purple-500",
      aceptada: "bg-green-500",
      realizada: "bg-teal-600",
      rechazada: "bg-red-500",
      cancelada: "bg-gray-400",
    };
    return colors[status as keyof typeof colors] || "bg-gray-500";
  };

  // Tablas de análisis (ex-Analytics) bajo el MISMO período (Fase 2).
  const statsQuery = useQuery({
    queryKey: [
      "dashboard-complete",
      company?.id,
      selectedTimeRange,
      customRange?.start,
      customRange?.end,
    ],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CompleteStatsResponse | null> => {
      const dateRange = resolveRange();
      return getCompleteStats(dateRange.start_date, dateRange.end_date);
    },
  });
  const stats = statsQuery.data || null;

  // ---------- FASE 4 (23-07): MÁRGENES ----------
  // Costo por evento = insumos + recursos asignados (igual que Gestión).
  // Insumos: CONGELADOS si el evento está provisionado (foto de compras),
  // ESTIMADOS por recetas si no — misma consolidación que Compras/Gestión.
  // La "base" comparte queryKey (y caché) con la pestaña Compras.
  const marginBaseQuery = useQuery({
    queryKey: ["logistica", "compras", "base", company?.id],
    staleTime: 5 * 60 * 1000,
    enabled: !!user && !!company?.id,
    queryFn: getBaseCatalogo,
  });
  const wonEventsQuery = useQuery({
    queryKey: [
      "dashboard-margin-events",
      company?.id,
      selectedTimeRange,
      customRange?.start,
      customRange?.end,
    ],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      getWonEventsSince(company!.id, resolveRange().start_date),
  });

  // Análisis de proveedores (23-07): provisiones reales + recursos.
  // 24-07: subido de más abajo, sin tocarle nada, porque el cálculo de
  // márgenes necesita los recursos y se ejecuta antes que esta línea.
  const provQuery = useQuery({
    queryKey: ["dashboard-proveedores", company?.id],
    enabled: !!user && !!company?.id,
    queryFn: async () => {
      const cid = company!.id;
      const [provisions, resourceDefs, eventResources] = await Promise.all([
        getEventSupplyProvisions(cid),
        getManagementResources(cid),
        getAllEventResources(cid),
      ]);
      return { provisions, resourceDefs, eventResources };
    },
  });

  // costo/margen por mes de evento (clave de mes en UTC, igual que el
  // backend que corre en UTC — regla de fechas de eventos del sistema)
  const marginData = (() => {
    const base = marginBaseQuery.data;
    const events = wonEventsQuery.data || [];
    const map = new Map<string, { costo: number; estimado: boolean }>();
    // Acumulador COMPARTIDO entre los eventos del período: alimenta el
    // análisis de proveedores e insumos (23-07) sin recorrer dos veces.
    const acc = newAccumulator();
    // 24-07: se espera también a los recursos. Si se calculara sin ellos
    // se vería medio segundo el margen viejo (inflado) antes de corregirse.
    if (!base || !provQuery.data || events.length === 0)
      return { byMonth: map, acc };
    const ctx = buildConsolidationContext(
      base.recipes,
      base.supplies,
      base.furniture,
      base.nameIds,
      base.fixedCosts,
    );
    // 24-07 (lo pilló Felipe): el costo del evento se arma como en
    // Post-venta → Gestión, insumos + RECURSOS ASIGNADOS. Antes eran
    // insumos + costos fijos de catálogo, y los recursos no entraban
    // nunca: el margen del dashboard salía inflado.
    // Los recursos ya llevan adentro los servicios fijos importados, con
    // el precio realmente negociado; por eso REEMPLAZAN a costoFijos en
    // vez de sumarse encima (si no, se contaría dos veces). Evento sin
    // recursos cargados: sigue mandando costoFijos.
    const personasPorEvento = new Map<string, number>();
    events.forEach((ev) =>
      personasPorEvento.set(ev.id, Number(ev.people_count) || 0),
    );
    const recursosPorEvento = new Map<string, number>();
    (provQuery.data?.eventResources || []).forEach((er) => {
      const personas = personasPorEvento.get(er.quotation_id);
      if (personas === undefined) return; // evento fuera del período
      const gasto =
        ((Number(er.price_fixed) || 0) +
          (Number(er.price_per_person) || 0) * personas) *
        (Number(er.quantity) || 1);
      recursosPorEvento.set(
        er.quotation_id,
        (recursosPorEvento.get(er.quotation_id) || 0) + gasto,
      );
    });

    events.forEach((ev) => {
      const d = new Date(ev.event_date || 0);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      const r = consolidateEvent(
        (ev.items || null) as EventItemsSnapshot | null,
        Number(ev.people_count) || 0,
        ctx,
        acc,
      );
      // insumos: la foto congelada de Compras si el evento está
      // provisionado (ojo: congela SOLO insumos), estimados si no
      const provisionado = !!ev.provisioned_at && ev.provisioned_cost != null;
      const costoInsumos = provisionado
        ? Number(ev.provisioned_cost) || 0
        : r.costoInsumos;
      const recursos = recursosPorEvento.get(ev.id);
      const costo =
        costoInsumos + (recursos !== undefined ? recursos : r.costoFijos);
      // "~" = el costo todavía no está cerrado: o los insumos son
      // estimación de receta, o el evento no tiene recursos cargados
      const estimado = !provisionado || recursos === undefined;
      const cur = map.get(key) || { costo: 0, estimado: false };
      cur.costo += costo;
      cur.estimado = cur.estimado || estimado;
      map.set(key, cur);
    });
    return { byMonth: map, acc };
  })();
  const marginByMonth = marginData.byMonth;
  const margenTotales = data?.moneyByMonth
    ? data.moneyByMonth.reduce(
        (acc, row) => {
          const m = marginByMonth.get(row.monthKey);
          acc.ventas += row.ventas;
          acc.costo += m?.costo || 0;
          acc.estimado = acc.estimado || !!m?.estimado;
          return acc;
        },
        { ventas: 0, costo: 0, estimado: false },
      )
    : { ventas: 0, costo: 0, estimado: false };

  // FASE 5: la fila HOY — independiente del período (el hoy no se
  // filtra). Se refresca sola cada 5 minutos.
  const hoyQuery = useQuery({
    queryKey: ["dashboard-hoy", company?.id],
    enabled: !!user && !!company?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => getHoyAlerts(company!.id),
  });
  const hoy = hoyQuery.data;

  // ---------- ANÁLISIS DE PROVEEDORES (23-07, con Felipe) ----------
  const proveedores = (() => {
    const base = marginBaseQuery.data;
    const extra = provQuery.data;
    if (!base) return null;
    const supplyById = new Map(base.supplies.map((su) => [su.id, su]));
    const supplierById = new Map(base.suppliers.map((sp) => [sp.id, sp]));
    interface FilaProv {
      id: number;
      nombre: string;
      insumos: number;
      sinPrecio: number;
      recetas: number;
      servicios: Set<string>;
      est: number;
      real: number;
      ultima: string | null;
    }
    const filas = new Map<number, FilaProv>();
    const fila = (id: number | null | undefined, nombre?: string) => {
      const key = id ?? 0;
      let f = filas.get(key);
      if (!f) {
        f = {
          id: key,
          nombre:
            supplierById.get(key)?.name || nombre || "Sin proveedor",
          insumos: 0,
          sinPrecio: 0,
          recetas: 0,
          servicios: new Set(),
          est: 0,
          real: 0,
          ultima: null,
        };
        filas.set(key, f);
      }
      return f;
    };
    // catálogo: insumos por proveedor y huecos de precio
    base.supplies.forEach((su) => {
      const f = fila(su.supplier_id);
      f.insumos += 1;
      if (!su.price) f.sinPrecio += 1;
    });
    // recetas y servicios donde participa cada proveedor
    base.recipes.forEach((rc) => {
      if (rc.item_kind !== "insumo" || !rc.supply_id) return;
      const su = supplyById.get(rc.supply_id);
      if (!su) return;
      const f = fila(su.supplier_id);
      f.recetas += 1;
      f.servicios.add(`${rc.service_type}-${rc.service_id}`);
    });
    // gasto estimado del período (acumulador compartido del margen)
    marginData.acc.supplyTotals.forEach((cs) => {
      fila(cs.supply.supplier_id).est += cs.costTotal;
    });
    // compra real (provisiones de eventos del período) + última compra
    const wonIds = new Set((wonEventsQuery.data || []).map((e) => e.id));
    (extra?.provisions || []).forEach((pr) => {
      const sid =
        pr.supplier_id ?? supplyById.get(pr.supply_id)?.supplier_id ?? null;
      const f = fila(sid, pr.supplier_name || undefined);
      if (wonIds.has(pr.quotation_id)) f.real += Number(pr.cost) || 0;
      if (!f.ultima || pr.provisioned_at > f.ultima)
        f.ultima = pr.provisioned_at;
    });
    const lista = [...filas.values()]
      .filter((f) => f.est > 0 || f.real > 0 || f.recetas > 0)
      .sort((a, b) => b.est - a.est);
    const totalEst = lista.reduce((sum, f) => sum + f.est, 0);
    const top3Pct =
      totalEst > 0
        ? (lista.slice(0, 3).reduce((sum, f) => sum + f.est, 0) * 100) /
          totalEst
        : 0;
    const topInsumos = [...marginData.acc.supplyTotals.values()]
      .sort((a, b) => b.costTotal - a.costTotal)
      .slice(0, 10);
    // recursos del período agrupados por tipo
    const peopleByQ = new Map(
      (wonEventsQuery.data || []).map((e) => [e.id, Number(e.people_count) || 0]),
    );
    const resById = new Map(
      (extra?.resourceDefs || []).map((r) => [r.id, r]),
    );
    const tipos = new Map<
      string,
      {
        gasto: number;
        items: Map<number, { nombre: string; gasto: number; eventos: number }>;
      }
    >();
    (extra?.eventResources || []).forEach((er) => {
      if (!wonIds.has(er.quotation_id)) return;
      const people = peopleByQ.get(er.quotation_id) || 0;
      const gasto =
        ((Number(er.price_fixed) || 0) +
          (Number(er.price_per_person) || 0) * people) *
        (Number(er.quantity) || 1);
      const def = resById.get(er.resource_id);
      const tipo = def?.type || "otro";
      const t = tipos.get(tipo) || { gasto: 0, items: new Map() };
      t.gasto += gasto;
      const it = t.items.get(er.resource_id) || {
        nombre: def?.name || `Recurso ${er.resource_id}`,
        gasto: 0,
        eventos: 0,
      };
      it.gasto += gasto;
      it.eventos += 1;
      t.items.set(er.resource_id, it);
      tipos.set(tipo, t);
    });
    return { lista, totalEst, top3Pct, topInsumos, tipos };
  })();

  const handleTimeRangeChange = (value: string) => {
    setSelectedTimeRange(value);
    setCustomRange(null);
  };

  // Helper function to format month-year keys (e.g., "2024-0" -> "Enero 2024")
  const formatMonthYear = (monthYearKey: string): string => {
    const [year, monthIndex] = monthYearKey.split("-");
    const monthName = MONTHS[parseInt(monthIndex)];
    return `${monthName} ${year}`;
  };

  // Helper function to determine if a month is in the future
  const isMonthInFuture = (monthYearKey: string): boolean => {
    const [year, monthIndex] = monthYearKey.split("-").map(Number);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (year > currentYear) return true;
    if (year === currentYear && monthIndex > currentMonth) return true;
    return false;
  };

  // Chart configuration for the line chart
  const chartOptions = {
    responsive: true,
    puntoEntero: true,
    layout: { padding: { top: 16 } },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: false,
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
    maintainAspectRatio: false,
  };

  // Prepare chart data for quotations
  const chartData = {
    labels: data.requestsByMonth.map((item) => item.month),
    datasets: [
      {
        label: "Cotizaciones",
        data: data.requestsByMonth.map((item) => item.count),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2,
        pointBackgroundColor: "rgb(59, 130, 246)",
        pointBorderColor: "rgb(59, 130, 246)",
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // Chart configuration for the events line chart
  const eventsChartOptions = {
    responsive: true,
    puntoEntero: true,
    layout: { padding: { top: 16 } },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: false,
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
    maintainAspectRatio: false,
  };

  // Prepare chart data for events
  const eventsChartData = {
    labels: data.eventsByMonth.map((item) => item.month),
    datasets: [
      {
        label: "Eventos",
        data: data.eventsByMonth.map((item) => item.count),
        borderColor: "rgb(147, 51, 234)", // Purple color
        backgroundColor: "rgba(147, 51, 234, 0.1)",
        borderWidth: 2,
        pointBackgroundColor: "rgb(147, 51, 234)",
        pointBorderColor: "rgb(147, 51, 234)",
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
        segment: {
          borderColor: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.eventsByMonth.length)
              return "rgb(147, 51, 234)";
            return isMonthInFuture(data.eventsByMonth[nextIndex].monthKey)
              ? "rgba(147, 51, 234, 0.3)"
              : "rgb(147, 51, 234)";
          },
          borderDash: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.eventsByMonth.length) return undefined;
            return isMonthInFuture(data.eventsByMonth[nextIndex].monthKey)
              ? [5, 5]
              : undefined;
          },
        },
      },
    ],
  };

  // Esqueleto SOLO en la primera visita de la sesión (sin datos aún);
  // después, la pantalla nunca se borra: muestra lo último y refresca.
  if (loading && !dashboardQuery.data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-xl"></div>
          ))}
        </div>
        <div className="h-72 bg-gray-200 rounded-xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-200 rounded-xl"></div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Account Setup Component */}
      {userRole === UserRole.ADMINISTRADOR && <NewAccount />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {/* Recarga manual discreta (decisión de Felipe 29-07): el
            Dashboard ya se refresca solo cada 5 min; esto queda para
            el apuro y como reintento si una carga falla. */}
        <button
          onClick={() => dashboardQuery.refetch()}
          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
          title="Actualizar datos ahora"
        >
          <RefreshCw
            size={18}
            className={dashboardQuery.isFetching ? "animate-spin" : ""}
          />
        </button>
      </div>

      {/* ================= FILA "HOY" (Fase 5, 23-07) =================
          Dónde actuar al abrir el sistema. Independiente del período;
          cada tarjeta navega a su módulo. */}
      {hoy && (
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">
            Para actuar hoy
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {comprobantesPortal > 0 && (
              <button
                onClick={() => navigate("/post-venta")}
                className="bg-white p-4 rounded-lg shadow text-left hover:shadow-md transition-shadow border-l-4 border-amber-500"
                title="Comprobantes subidos por clientes desde el portal, esperando confirmación en Post-Venta"
              >
                <p className="text-sm font-medium text-gray-600">
                  💸 Comprobantes del portal
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {comprobantesPortal}
                </p>
                <p className="text-xs mt-0.5 text-amber-700 font-semibold">
                  por confirmar
                </p>
              </button>
            )}
            <button
              onClick={() => navigate("/post-venta")}
              className={`bg-white p-4 rounded-lg shadow text-left hover:shadow-md transition-shadow border-l-4 ${
                hoy.porCobrar.vencido > 0
                  ? "border-red-500"
                  : "border-emerald-400"
              }`}
              title="Ir a Post-Venta (cobranza)"
            >
              <p className="text-sm font-medium text-gray-600">Por cobrar</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(
                  hoy.porCobrar.pendiente + hoy.porCobrar.vencido,
                  company?.currency || "CLP",
                )}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  hoy.porCobrar.vencido > 0
                    ? "text-red-600 font-semibold"
                    : "text-gray-500"
                }`}
              >
                {hoy.porCobrar.vencido > 0
                  ? `${formatCurrency(hoy.porCobrar.vencido, company?.currency || "CLP")} VENCIDO`
                  : "Nada vencido"}
              </p>
            </button>

            <button
              onClick={() => navigate("/calendar")}
              className="bg-white p-4 rounded-lg shadow text-left hover:shadow-md transition-shadow border-l-4 border-blue-400"
              title="Ir al Calendario"
            >
              <p className="text-sm font-medium text-gray-600">
                Eventos próximos 30 días
              </p>
              <p className="text-xl font-bold text-gray-900">
                {hoy.proximos.count}
              </p>
              <p className="text-xs mt-0.5 text-gray-500">
                {hoy.proximos.primera
                  ? `El más cercano: ${new Date(hoy.proximos.primera).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "short" })}`
                  : "Sin eventos agendados"}
              </p>
            </button>

            <button
              onClick={() => navigate("/requests")}
              className={`bg-white p-4 rounded-lg shadow text-left hover:shadow-md transition-shadow border-l-4 ${
                hoy.requerimientos.count > 0
                  ? "border-amber-400"
                  : "border-gray-200"
              }`}
              title="Ir a Requerimientos"
            >
              <p className="text-sm font-medium text-gray-600">
                Requerimientos sin responder
              </p>
              <p className="text-xl font-bold text-gray-900">
                {hoy.requerimientos.count}
              </p>
              <p className="text-xs mt-0.5 text-gray-500">
                {hoy.requerimientos.count > 0
                  ? `El más antiguo espera hace ${hoy.requerimientos.oldestDays} día${hoy.requerimientos.oldestDays === 1 ? "" : "s"}`
                  : "Todo respondido"}
              </p>
            </button>

            <button
              onClick={() => navigate("/quotations")}
              className={`bg-white p-4 rounded-lg shadow text-left hover:shadow-md transition-shadow border-l-4 ${
                hoy.enviadas.count > 0 ? "border-amber-400" : "border-gray-200"
              }`}
              title="Ir a Cotizaciones"
            >
              <p className="text-sm font-medium text-gray-600">
                Enviadas sin respuesta (+7 días)
              </p>
              <p className="text-xl font-bold text-gray-900">
                {hoy.enviadas.count}
              </p>
              <p className="text-xs mt-0.5 text-gray-500">
                {hoy.enviadas.count > 0
                  ? `La más fría lleva ${hoy.enviadas.oldestDays} días — llámalos`
                  : "Ningún lead enfriándose"}
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Período: barra delgada (rediseño 23-07). Chips + fechas
          desde/hasta; editar una fecha activa el modo personalizado
          (pintado azul) y la × vuelve al preset. */}
      <div className="bg-white px-4 py-2.5 rounded-lg shadow flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mr-1">
          <Clock className="h-4 w-4 text-blue-600" />
          Período:
        </span>
        {timeRangeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => handleTimeRangeChange(option.value)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              !customRange && selectedTimeRange === option.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="mx-1 h-5 border-l border-gray-200 hidden sm:block" />
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
            customRange
              ? "border-blue-500 bg-blue-50 text-blue-900"
              : "border-gray-200 text-gray-500"
          }`}
        >
          <span className="font-medium">desde</span>
          <input
            type="date"
            value={customRange?.start || resolveRange().start_date}
            onChange={(e) =>
              setCustomRange({
                start: e.target.value,
                end: customRange?.end || resolveRange().end_date,
              })
            }
            className="bg-transparent border-0 p-0 text-xs focus:ring-0 w-[110px]"
          />
          <span className="font-medium">hasta</span>
          <input
            type="date"
            value={customRange?.end || resolveRange().end_date}
            onChange={(e) =>
              setCustomRange({
                start: customRange?.start || resolveRange().start_date,
                end: e.target.value,
              })
            }
            className="bg-transparent border-0 p-0 text-xs focus:ring-0 w-[110px]"
          />
          {customRange && (
            <button
              onClick={() => setCustomRange(null)}
              className="ml-0.5 text-blue-700 hover:text-blue-900 font-bold"
              title="Volver a los presets"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* KPIs del período (Fase 5): concretado, conversión y ticket.
          "Requerimientos" vive en la fila HOY; "Clientes" era un total
          de vanidad — su análisis está en las tablas de abajo. */}
      {(() => {
        const won =
          (data.quotationsByStatus.find((s) => s.status === "aceptada")
            ?.count || 0) +
          (data.quotationsByStatus.find((s) => s.status === "realizada")
            ?.count || 0);
        const conversion =
          data.totalRequests > 0 ? (won * 100) / data.totalRequests : 0;
        const ticket = won > 0 ? data.totalSales / won : 0;
        return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Ventas concretadas
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(data.totalSales, company?.currency || "CLP")}
              </p>
              {/* 24-07: sin propina, igual que el margen. La propina va
                  entera al equipo, no es venta. */}
              <p className="text-xs text-gray-500 mt-0.5">
                del período, sin propina
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Eventos concretados
              </p>
              <p className="text-2xl font-bold text-purple-600">{won}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                de {data.totalRequests} cotizadas
              </p>
            </div>
            <Calendar className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Tasa de conversión
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {conversion.toLocaleString("es-CL", {
                  maximumFractionDigits: 1,
                })}
                %
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                cotizada → concretada
              </p>
            </div>
            <BarChart3 className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Ticket promedio
              </p>
              <p className="text-2xl font-bold text-indigo-600">
                {formatCurrency(ticket, company?.currency || "CLP")}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">por evento</p>
            </div>
            <ClipboardList className="h-8 w-8 text-indigo-600" />
          </div>
        </div>

        {/* FASE 4: margen del período (ventas − costos = insumos +
            recursos asignados). "~" = algún costo todavía no está
            cerrado: evento sin provisionar o sin recursos cargados.
            24-07: las ventas vienen SIN propina desde el backend
            (analytics.service.ts usa saleWithoutTip), así que este
            margen ya es sin propina y aquí no hay nada que restar. */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Margen del período
              </p>
              <p
                className={`text-2xl font-bold ${
                  margenTotales.ventas - margenTotales.costo >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}
              >
                {margenTotales.estimado ? "~" : ""}
                {formatCurrency(
                  margenTotales.ventas - margenTotales.costo,
                  company?.currency || "CLP",
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {margenTotales.ventas > 0
                  ? `${(((margenTotales.ventas - margenTotales.costo) * 100) / margenTotales.ventas).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% de la venta (sin propina)`
                  : "Sin ventas en el período"}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
      </div>
        );
      })()}

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cotizaciones por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Cotizaciones por Mes
            </h2>
            <span className="text-sm text-gray-500">(Todos los estados)</span>
          </div>
          <div className="h-64">
            <Line data={chartData} options={chartOptions} plugins={[etiquetasDePunto]} />
          </div>
        </div>

        {/* Eventos por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <Calendar className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Eventos por Mes
            </h2>
            {/* 24-07: la leyenda decía "(Solo aceptados)" desde noviembre y ya
                no era cierta: desde el 23-07 el gráfico trae aceptadas Y
                realizadas. El dato siempre estuvo bien; el letrero mentía. */}
            <span className="text-sm text-gray-500">(eventos concretados)</span>
          </div>
          <div className="h-64">
            <Line data={eventsChartData} options={eventsChartOptions} plugins={[etiquetasDePunto]} />
          </div>
        </div>

      </div>

      {/* Ingresos y Caja por Mes — TRANSPUESTA (23-07, pedido Felipe):
          los MESES son columnas (máx 12, los más recientes del período,
          futuros incluidos) y los CONCEPTOS son filas, como un estado de
          resultados. Cifras abreviadas (16M) con el monto exacto en el
          tooltip; columna TOTAL de los meses visibles. */}
      {(() => {
        const meses = data.moneyByMonth.slice(-12);
        const recortada = data.moneyByMonth.length > meses.length;
        // Cifras EN MILES (pedido Felipe 23-07): 1.000.000 se lee 1.000.
        // El monto exacto sigue en el tooltip.
        const miles = (n: number) =>
          Math.round(n / 1000).toLocaleString("es-CL");
        const shortMonth = (monthKey: string) => {
          const [year, monthIndex] = monthKey.split("-");
          return `${MONTHS[parseInt(monthIndex)].slice(0, 3)} ${year.slice(2)}`;
        };
        const filas: {
          label: string;
          cell: (r: (typeof meses)[number]) => {
            text: string;
            title?: string;
            cls?: string;
          };
          total: () => { text: string; title?: string; cls?: string };
        }[] = [
          {
            label: "Eventos",
            cell: (r) => ({
              text: r.eventos ? String(r.eventos) : "—",
            }),
            total: () => ({
              text: String(meses.reduce((sum, r) => sum + r.eventos, 0)),
            }),
          },
          {
            label: "Ventas",
            cell: (r) => ({
              text: r.ventas ? miles(r.ventas) : "—",
              title: r.ventas
                ? formatCurrency(r.ventas, company?.currency || "CLP")
                : undefined,
              cls: "font-semibold",
            }),
            total: () => {
              const t = meses.reduce((sum, r) => sum + r.ventas, 0);
              return {
                text: miles(t),
                title: formatCurrency(t, company?.currency || "CLP"),
                cls: "font-bold",
              };
            },
          },
          {
            label: "Costo",
            cell: (r) => {
              const m = marginByMonth.get(r.monthKey);
              return {
                text:
                  m && m.costo > 0
                    ? `${m.estimado ? "~" : ""}${miles(m.costo)}`
                    : "—",
                title:
                  m && m.costo > 0
                    ? formatCurrency(m.costo, company?.currency || "CLP")
                    : undefined,
              };
            },
            total: () => ({
              text: `${margenTotales.estimado ? "~" : ""}${miles(
                meses.reduce(
                  (sum, r) => sum + (marginByMonth.get(r.monthKey)?.costo || 0),
                  0,
                ),
              )}`,
              cls: "font-bold",
            }),
          },
          {
            label: "Margen",
            cell: (r) => {
              const m = marginByMonth.get(r.monthKey);
              if (!m || r.ventas === 0) return { text: "—" };
              const val = r.ventas - m.costo;
              return {
                text: miles(val),
                title: formatCurrency(val, company?.currency || "CLP"),
                cls:
                  val >= 0
                    ? "text-emerald-700 font-semibold"
                    : "text-red-600 font-semibold",
              };
            },
            total: () => {
              const v = meses.reduce((sum, r) => sum + r.ventas, 0);
              const c = meses.reduce(
                (sum, r) => sum + (marginByMonth.get(r.monthKey)?.costo || 0),
                0,
              );
              return {
                text: v ? miles(v - c) : "—",
                title: formatCurrency(v - c, company?.currency || "CLP"),
                cls:
                  v - c >= 0
                    ? "text-emerald-700 font-bold"
                    : "text-red-600 font-bold",
              };
            },
          },
          {
            label: "Margen %",
            cell: (r) => {
              const m = marginByMonth.get(r.monthKey);
              if (!m || r.ventas === 0) return { text: "—" };
              const val = r.ventas - m.costo;
              return {
                text: `${((val * 100) / r.ventas).toLocaleString("es-CL", { maximumFractionDigits: 0 })}%`,
                cls:
                  val >= 0
                    ? "text-emerald-700"
                    : "text-red-600 font-semibold",
              };
            },
            total: () => {
              const v = meses.reduce((sum, r) => sum + r.ventas, 0);
              const c = meses.reduce(
                (sum, r) => sum + (marginByMonth.get(r.monthKey)?.costo || 0),
                0,
              );
              return {
                text: v
                  ? `${(((v - c) * 100) / v).toLocaleString("es-CL", { maximumFractionDigits: 0 })}%`
                  : "—",
                cls:
                  v - c >= 0
                    ? "text-emerald-700 font-bold"
                    : "text-red-600 font-bold",
              };
            },
          },
          {
            label: "Cobrado",
            cell: (r) => ({
              text: r.cobrado ? miles(r.cobrado) : "—",
              title: r.cobrado
                ? formatCurrency(r.cobrado, company?.currency || "CLP")
                : undefined,
              cls: "text-green-700",
            }),
            total: () => {
              const t = meses.reduce((sum, r) => sum + r.cobrado, 0);
              return {
                text: miles(t),
                title: formatCurrency(t, company?.currency || "CLP"),
                cls: "text-green-700 font-bold",
              };
            },
          },
          {
            label: "Por cobrar",
            cell: (r) => ({
              text: r.porCobrar ? miles(r.porCobrar) : "—",
              title: r.porCobrar
                ? formatCurrency(r.porCobrar, company?.currency || "CLP")
                : undefined,
              cls:
                r.porCobrar && !isMonthInFuture(r.monthKey)
                  ? "text-red-600 font-semibold"
                  : "",
            }),
            total: () => {
              const t = meses.reduce((sum, r) => sum + r.porCobrar, 0);
              return {
                text: miles(t),
                title: formatCurrency(t, company?.currency || "CLP"),
                cls: "text-red-700 font-bold",
              };
            },
          },
        ];
        return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-4">
          <DollarSign className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Ingresos y Caja por Mes
          </h2>
          <span className="text-sm text-gray-500">
            (en miles de pesos
            {recortada ? " · últimos 12 meses del período" : ""})
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2 text-left font-medium sticky left-0 bg-white">
                  Concepto
                </th>
                {meses.map((r) => (
                  <th
                    key={r.monthKey}
                    className={`py-2 px-2 text-right font-medium whitespace-nowrap ${
                      isMonthInFuture(r.monthKey) ? "text-gray-300" : ""
                    }`}
                    title={r.month}
                  >
                    {shortMonth(r.monthKey)}
                    {isMonthInFuture(r.monthKey) ? " ·f" : ""}
                  </th>
                ))}
                <th className="py-2 pl-2 text-right font-bold text-gray-700 border-l border-gray-200">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((fila) => (
                <tr key={fila.label} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2 font-semibold text-gray-700 sticky left-0 bg-white whitespace-nowrap">
                    {fila.label}
                  </td>
                  {meses.map((r) => {
                    const c = fila.cell(r);
                    return (
                      <td
                        key={r.monthKey}
                        title={c.title}
                        className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap ${
                          isMonthInFuture(r.monthKey)
                            ? "text-gray-400"
                            : c.cls || ""
                        }`}
                      >
                        {c.text}
                      </td>
                    );
                  })}
                  {(() => {
                    const t = fila.total();
                    return (
                      <td
                        title={t.title}
                        className={`py-1.5 pl-2 text-right tabular-nums whitespace-nowrap border-l border-gray-200 bg-gray-50 ${t.cls || ""}`}
                      >
                        {t.text}
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">
            Cifras en MILES de pesos ($1.000 = un millón). ·f = mes futuro
            (venta agendada). Ventas y Margen van SIN propina: la propina la
            paga el cliente pero va entera al equipo, no es venta ni margen.
            Cobrado y Por cobrar sí la incluyen, porque es plata que se
            factura; por eso Ventas y Cobrado no calzan al peso. El costo son
            los insumos más los recursos asignados al evento. Costo con ~ =
            todavía no está cerrado (evento sin provisionar en Compras, o sin
            recursos cargados en Post-venta); sin ~ = insumos congelados y
            recursos ya asignados. La merma va solo en el costo. Pasa el
            mouse por una cifra para ver el monto exacto.
          </p>
        </div>
      </div>
        );
      })()}

      {/* Cotizaciones por estado */}
      {/* <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-4">
          <PieChart className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Cotizaciones por Estado
          </h2>
        </div>
        <div className="space-y-3">
          {data.quotationsByStatus.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${getStatusColor(item.status)}`}
                ></div>
                <span className="text-sm text-gray-600">
                  {getStatusLabel(item.status)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {item.count}
                </div>
                <div className="text-xs text-gray-500">
                  {formatCurrency(item.amount, company?.currency || "CLP")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div> */}

      {/* Pipeline de Negocio — EMBUDO transpuesto (23-07, con Felipe):
          estados como columnas en orden de viaje, agrupados en zonas
          vivas | ganadas | perdidas con sus subtotales (reemplazan al
          TOTAL mezclado). Cifras en miles; venta viva destacada. */}
      {(() => {
        const ORDER = [
          { key: "solicitada", label: "Solicitada", zone: "viva" },
          { key: "enviada", label: "Enviada", zone: "viva" },
          { key: "en_negociacion", label: "En Negociación", zone: "viva" },
          { key: "aceptada", label: "Aceptada", zone: "ganada" },
          { key: "realizada", label: "Realizada", zone: "ganada" },
          { key: "rechazada", label: "Rechazada", zone: "perdida" },
          { key: "cancelada", label: "Cancelada", zone: "perdida" },
        ] as const;
        const by = new Map(data.salesPipeline.map((i) => [i.status, i]));
        const item = (k: string) =>
          by.get(k) || { status: k, amount: 0, count: 0 };
        const zoneSum = (z: string) =>
          ORDER.filter((o) => o.zone === z).reduce(
            (acc, o) => {
              const it = item(o.key);
              return {
                count: acc.count + it.count,
                amount: acc.amount + it.amount,
              };
            },
            { count: 0, amount: 0 },
          );
        const vivas = zoneSum("viva");
        const ganadas = zoneSum("ganada");
        const perdidas = zoneSum("perdida");
        const totalCount = vivas.count + ganadas.count + perdidas.count;
        const milesP = (n: number) =>
          Math.round(n / 1000).toLocaleString("es-CL");
        const ventaViva =
          item("enviada").amount + item("en_negociacion").amount;
        const zonaCls = (zone: string, sub: boolean) => {
          const base = sub ? "bg-gray-50 font-bold " : "";
          if (zone === "ganada") return base + "text-emerald-700";
          if (zone === "perdida") return base + "text-gray-400";
          return base + "text-gray-800";
        };
        const cols: {
          key: string;
          label: string;
          zone: string;
          it: { count: number; amount: number };
          sub: boolean;
          borde: boolean;
        }[] = [
          ...ORDER.map((o, i) => ({
            key: o.key,
            label: o.label,
            zone: o.zone as string,
            it: item(o.key),
            sub: false,
            borde: i > 0 && ORDER[i - 1].zone !== o.zone,
          })),
          {
            key: "z-vivas",
            label: "VIVAS",
            zone: "viva",
            it: vivas,
            sub: true,
            borde: true,
          },
          {
            key: "z-ganadas",
            label: "GANADAS",
            zone: "ganada",
            it: ganadas,
            sub: true,
            borde: false,
          },
          {
            key: "z-perdidas",
            label: "PERDIDAS",
            zone: "perdida",
            it: perdidas,
            sub: true,
            borde: false,
          },
        ];
        const filas = [
          {
            label: "Cotizaciones",
            cell: (it: { count: number; amount: number }) =>
              it.count ? String(it.count) : "—",
            title: () => undefined as string | undefined,
          },
          {
            label: "% de cotizaciones",
            cell: (it: { count: number; amount: number }) =>
              totalCount && it.count
                ? `${((it.count * 100) / totalCount).toLocaleString("es-CL", { maximumFractionDigits: 0 })}%`
                : "—",
            title: () => undefined as string | undefined,
          },
          {
            label: "Monto",
            cell: (it: { count: number; amount: number }) =>
              it.amount ? milesP(it.amount) : "—",
            title: (it: { count: number; amount: number }) =>
              it.amount
                ? formatCurrency(it.amount, company?.currency || "CLP")
                : undefined,
          },
          {
            label: "Ticket promedio",
            cell: (it: { count: number; amount: number }) =>
              it.count ? milesP(it.amount / it.count) : "—",
            title: (it: { count: number; amount: number }) =>
              it.count
                ? formatCurrency(
                    it.amount / it.count,
                    company?.currency || "CLP",
                  )
                : undefined,
          },
        ];
        return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Pipeline de Negocio
            </h2>
            <span className="text-sm text-gray-500">(en miles de pesos)</span>
          </div>
          {/* EL número del pipeline: lo que puedes ganar si empujas */}
          <span className="text-sm font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
            Venta viva en juego:{" "}
            {formatCurrency(ventaViva, company?.currency || "CLP")}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider border-b border-gray-200">
                <th className="py-2 pr-2 text-left font-medium text-gray-500 sticky left-0 bg-white">
                  Concepto
                </th>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    className={`py-2 px-2 text-right font-medium whitespace-nowrap ${
                      c.borde ? "border-l border-gray-200" : ""
                    } ${zonaCls(c.zone, c.sub)}`}
                  >
                    {!c.sub && (
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1 ${getStatusColor(c.key)}`}
                      />
                    )}
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((fila) => (
                <tr key={fila.label} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2 font-semibold text-gray-700 sticky left-0 bg-white whitespace-nowrap">
                    {fila.label}
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      title={fila.title(c.it)}
                      className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap ${
                        c.borde ? "border-l border-gray-200" : ""
                      } ${zonaCls(c.zone, c.sub)}`}
                    >
                      {fila.cell(c.it)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">
            Cifras en MILES de pesos. Zonas: vivas (aún en juego) · ganadas
            (aceptadas y realizadas) · perdidas (rechazadas y canceladas).
            Del período seleccionado; el monto exacto está en el tooltip.
          </p>
        </div>
      </div>
        );
      })()}

      {/* ================= ANÁLISIS (ex-Analytics, Fase 2) =================
          Las 9 tablas viven aquí bajo el MISMO período, en secciones
          plegables. La pestaña Analytics se jubiló: /analytics redirige. */}
      {[
        {
          key: "comercial",
          titulo: "Análisis comercial",
          sub: "Estados, conversión e ingresos del período",
          contenido: stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QuotationStatusStatsComponent
                stats={stats.quotation_status_stats}
              />
              <EventTypeConversionStatsComponent
                stats={stats.event_type_conversion_stats}
              />
              {company && (
                <EventTypeRevenueStatsComponent
                  stats={stats.event_type_revenue_stats}
                  currency={company.currency}
                />
              )}
              {company && (
                <RevenueByClientTypeStatsComponent
                  stats={stats.revenue_by_client_type}
                  currency={company.currency}
                />
              )}
            </div>
          ),
        },
        {
          key: "clientes",
          titulo: "Análisis de clientes",
          sub: "Top 10 por ingresos y cotizaciones, recurrentes",
          contenido: stats && company && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopClientsByRevenueStatsComponent
                stats={stats.top_clients_by_revenue}
                currency={company.currency}
              />
              <TopClientsByQuotationsStatsComponent
                stats={stats.top_clients_by_quotations || []}
              />
              <RecurringClientsStatsComponent
                stats={stats.recurring_clients || []}
                currency={company.currency}
              />
            </div>
          ),
        },
        {
          key: "servicios",
          titulo: "Análisis de servicios",
          sub: "Los más presentes en eventos concretados",
          contenido: stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <VariableServicesUsageStatsComponent
                stats={stats.variable_services_usage}
              />
              <FixedServicesUsageStatsComponent
                stats={stats.fixed_services_usage}
              />
            </div>
          ),
        },
        {
          key: "proveedores",
          titulo: "Análisis de proveedores",
          sub: "Compra estimada, insumos, recursos y dependencia",
          contenido: proveedores && (
            <div className="space-y-6">
              {/* concentración: el riesgo de dependencia en una frase */}
              {proveedores.totalEst > 0 && (
                <p className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 inline-block">
                  El top 3 de proveedores concentra el{" "}
                  <span className="font-bold">
                    {proveedores.top3Pct.toLocaleString("es-CL", {
                      maximumFractionDigits: 0,
                    })}
                    %
                  </span>{" "}
                  de la compra estimada del período.
                </p>
              )}

              {/* A. tabla maestra */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-2 font-medium">Proveedor</th>
                      <th className="py-2 px-2 text-right font-medium">
                        Insumos
                      </th>
                      <th className="py-2 px-2 text-right font-medium">
                        Sin precio
                      </th>
                      <th className="py-2 px-2 text-right font-medium">
                        Recetas
                      </th>
                      <th className="py-2 px-2 text-right font-medium">
                        Servicios
                      </th>
                      <th className="py-2 px-2 text-right font-medium">
                        Compra estimada
                      </th>
                      <th className="py-2 px-2 text-right font-medium">
                        % gasto
                      </th>
                      <th className="py-2 px-2 text-right font-medium">
                        Comprado real
                      </th>
                      <th className="py-2 pl-2 text-right font-medium">
                        Última compra
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {proveedores.lista.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="py-1.5 pr-2 font-medium text-gray-800">
                          {f.nombre}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {f.insumos || "—"}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right tabular-nums ${
                            f.sinPrecio > 0
                              ? "text-amber-700 font-semibold"
                              : "text-gray-400"
                          }`}
                        >
                          {f.sinPrecio || "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {f.recetas || "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {f.servicios.size || "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                          {f.est
                            ? formatCurrency(f.est, company?.currency || "CLP")
                            : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">
                          {proveedores.totalEst > 0 && f.est
                            ? `${((f.est * 100) / proveedores.totalEst).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`
                            : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-green-700">
                          {f.real
                            ? formatCurrency(f.real, company?.currency || "CLP")
                            : "—"}
                        </td>
                        <td className="py-1.5 pl-2 text-right text-gray-500 whitespace-nowrap">
                          {f.ultima
                            ? new Date(f.ultima).toLocaleDateString("es-CL")
                            : "nunca"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-gray-400">
                  Compra estimada: recetas de los eventos concretados del
                  período (merma incluida en el costo). Comprado real: fotos
                  de provisión de Compras. Recetas y Servicios miden en
                  cuántas preparaciones participa cada proveedor — pocos
                  puntos de contacto = candidato a consolidar.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* B. principales insumos */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    Principales insumos del período
                  </h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                        <th className="py-1.5 pr-2 font-medium w-5">#</th>
                        <th className="py-1.5 pr-2 font-medium">Insumo</th>
                        <th className="py-1.5 px-2 font-medium">Proveedor</th>
                        <th className="py-1.5 pl-2 text-right font-medium">
                          Costo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {proveedores.topInsumos.map((cs, i) => (
                        <tr key={cs.supply.id} className="hover:bg-gray-50">
                          <td className="py-1.5 pr-2 text-gray-400 tabular-nums">
                            {i + 1}
                          </td>
                          <td className="py-1.5 pr-2 text-gray-800">
                            {cs.supply.name}
                          </td>
                          <td className="py-1.5 px-2 text-gray-500">
                            {marginBaseQuery.data?.suppliers.find(
                              (sp) => sp.id === cs.supply.supplier_id,
                            )?.name || "—"}
                          </td>
                          <td className="py-1.5 pl-2 text-right tabular-nums font-semibold">
                            {formatCurrency(
                              cs.costTotal,
                              company?.currency || "CLP",
                            )}
                          </td>
                        </tr>
                      ))}
                      {proveedores.topInsumos.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-2 text-center text-gray-400"
                          >
                            Sin consumos estimables en el período
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* C. gasto en recursos por tipo */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    Gasto en recursos por tipo
                  </h4>
                  {proveedores.tipos.size === 0 ? (
                    <p className="text-xs text-gray-400">
                      Sin recursos asignados a eventos del período todavía —
                      esta tabla crece a medida que uses Recursos del evento.
                    </p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                          <th className="py-1.5 pr-2 font-medium">
                            Tipo / Recurso
                          </th>
                          <th className="py-1.5 px-2 text-right font-medium">
                            Eventos
                          </th>
                          <th className="py-1.5 pl-2 text-right font-medium">
                            Gasto
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...proveedores.tipos.entries()].map(
                          ([tipo, t]) => (
                            <React.Fragment key={tipo}>
                              <tr className="bg-gray-50">
                                <td className="py-1.5 pr-2 font-bold uppercase text-[11px] text-gray-700">
                                  {tipo}
                                </td>
                                <td className="py-1.5 px-2" />
                                <td className="py-1.5 pl-2 text-right tabular-nums font-bold">
                                  {formatCurrency(
                                    t.gasto,
                                    company?.currency || "CLP",
                                  )}
                                </td>
                              </tr>
                              {[...t.items.values()].map((it) => (
                                <tr
                                  key={`${tipo}-${it.nombre}`}
                                  className="hover:bg-gray-50"
                                >
                                  <td className="py-1.5 pr-2 pl-4 text-gray-700">
                                    {it.nombre}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">
                                    {it.eventos}
                                  </td>
                                  <td className="py-1.5 pl-2 text-right tabular-nums">
                                    {formatCurrency(
                                      it.gasto,
                                      company?.currency || "CLP",
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ),
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ),
        },
      ].map((sec) => (
        <div key={sec.key} className="bg-white rounded-lg shadow">
          <button
            type="button"
            onClick={() => toggleSection(sec.key)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span>
                <span className="block text-lg font-semibold text-gray-900">
                  {sec.titulo}
                </span>
                <span className="block text-xs text-gray-500">{sec.sub}</span>
              </span>
            </span>
            {openSections.has(sec.key) ? (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronRight className="h-5 w-5 text-gray-400" />
            )}
          </button>
          {openSections.has(sec.key) && (
            <div className="px-6 pb-6">
              {sec.contenido || (
                <p className="text-sm text-gray-400">
                  {statsQuery.isError
                    ? "No se pudieron cargar estas tablas — reintenta con Actualizar."
                    : "Cargando análisis…"}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
