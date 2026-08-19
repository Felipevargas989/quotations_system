import {
  costoDeRecursos,
  type LineaDeRecurso,
} from "../../utils/costoDeRecursos";
import { getCostoPersonal } from "../../services/people.service";
import React, { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { listPortalReceipts } from "../../services/portalReceipts.service";
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Calendar,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import type { ActiveElement, Chart, ChartEvent } from "chart.js";
import { Bar } from "react-chartjs-2";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCompleteStats } from "../../services/analytics.service";
import { getHoyAlerts } from "../../services/hoy.service";
import {
  getAllEventResources,
  getEventSupplyProvisions,
  getManagementResources,
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
import { etiquetaEstado, puntoEstado } from "../../utils/estadoCotizacion";
import {
  agruparPorMes,
  cosechaDelMes,
  ESTADOS_COSECHA,
  metaEstado,
  etiquetaMes,
  unAnioAntes,
  ETIQUETA_ESTADO,
  ES_EVENTO,
  indiceMesActual,
  primerMesConDatos,
  serieInteranual,
  ventanaMeses,
} from "./tendencias";
import type { EstadoCosecha, FilaCosecha } from "./tendencias";
import {
  getQuotations,
  guardarEstadoCosecha,
} from "../../services/quotations.service";
import {
  QuotationRequestType,
  QuotationStatus,
} from "../../types/quotations.types";
import type { QuotationWithClient } from "../../types/quotations.types";
import { etiquetaMotivo } from "../../components/MotivoPerdida";
import { getClientTypeColor } from "../../utils/clientTypeColor";
import SectionChipSelect from "../../components/selects/SectionChipSelect";
import { toast } from "../../components/toast/Toast";
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
  BarElement,
  Title,
  Tooltip,
  Legend,
);

import { useAuth } from "../../contexts/AuthContext";
import { getDashboardStats } from "../../services/analytics.service";
import NewAccount from "./components/NewAccount";
import { UserRole } from "../../constants/users";
import { subMonths, subYears } from "date-fns";
import { MONTHS } from "../../constants/dates";
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
    return selectedOption?.getDateRange() || timeRangeOptions[3].getDateRange();
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

  // TENDENCIA INTERANUAL (06-08, diseño de Felipe): estos gráficos NO
  // obedecen al filtro del período — muestran el pulso contra el año
  // anterior. Una sola consulta con todo (son ~320 filas) da control
  // total sobre la ventana móvil y la comparación mes contra mes.
  const tendenciaQuery = useQuery({
    queryKey: ["dashboard-tendencia", company?.id],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION);
      return data || [];
    },
  });
  // LA COSECHA DEL MES (06-08, hallazgo de Felipe): pinchar una barra de
  // cotizaciones abre la lista de quiénes pidieron ese mes — la lista de
  // llamados de un año después.
  // La cosecha se abre desde una barra. Guardamos la COLUMNA (el mes de
  // la ventana) y cuál de las dos barras se pinchó: la firme es este año,
  // la tenue es el mismo mes del año pasado. Sin esto se pinchaba la
  // barra alta de 2025 y se abría la lista vacía de 2026 (Felipe, 06-08).
  const [mesElegido, setMesElegido] = useState<{
    base: string;
    anterior: boolean;
  } | null>(null);
  // Filtros y orden de la cosecha (07-08, pedido de Felipe). Viven acá
  // arriba, no dentro del panel, para que sobrevivan al salto entre las
  // pestañas de año: mirar Empresas en Ago 25 y saltar a Ago 26 es
  // justo la comparación que uno quiere hacer. Se limpian al cerrar.
  const [filtroEvento, setFiltroEvento] = useState<string | null>(null);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<EstadoCosecha | null>(null);
  const [orden, setOrden] = useState<{
    col: "monto" | "cliente";
    desc: boolean;
  }>({ col: "monto", desc: true });
  const limpiarFiltros = () => {
    setFiltroEvento(null);
    setFiltroCliente(null);
    setFiltroEstado(null);
    setOrden({ col: "monto", desc: true });
  };
  // Cerrar con el botón es un gesto deliberado y limpia todo. Un clic en
  // el blanco del gráfico NO lo es: cierra el panel y respeta los
  // filtros, para no borrar tres selecciones por un roce (07-08).
  const cerrarCosecha = () => {
    setMesElegido(null);
    limpiarFiltros();
  };
  // EL ESTADO DE LA COSECHA (07-08, diseño de Felipe). La máquina
  // sugiere con el cruce empresa+mandante+tipo; él corrige con el
  // desplegable. Se guarda para TODAS las cotizaciones de la misma
  // oportunidad de ese mes: FEPASA parte un evento en dos (adultos y
  // niños) y las dos son un solo llamado, así que se mueven juntas.
  // Todo el cálculo de la cosecha en UNA pasada: las dos pestañas de
  // año, las opciones de los filtros, el filtrado y el orden. Antes esto
  // vivía suelto dentro del JSX y se rehacía en cada render, incluso al
  // abrir una sección sin relación (revisiones del 07-08).
  const cosecha = useMemo(() => {
    const vacio = {
      filas: [],
      todasDelMes: [],
      anios: [],
      tiposEvento: [],
      tiposCliente: [],
      estadosPresentes: [],
      pendientes: 0,
      pendientesMes: 0,
      enGestion: 0,
      enGestionMes: 0,
    };
    if (!mesElegido) return vacio;
    const todas = tendenciaQuery.data ?? [];
    const claveDe = (anterior: boolean) =>
      anterior ? unAnioAntes(mesElegido.base) : mesElegido.base;
    const porAnio = [true, false].map((ant) => {
      const clave = claveDe(ant);
      return { ant, clave, filas: cosechaDelMes(todas, clave) };
    });
    const todasDelMes =
      porAnio.find((a) => a.ant === mesElegido.anterior)?.filas ?? [];

    // Las opciones salen del mes COMPLETO —si salieran de lo ya
    // filtrado, elegir un tipo haría desaparecer los demás—, PERO el
    // valor que está filtrando nunca se cae de la lista aunque ese mes
    // no lo tenga. Sin esa red, saltar de Ago 25 a Ago 26 con "Paseo fin
    // de año" puesto dejaba el chip diciendo "Todo evento" con el filtro
    // igual aplicado: tabla vacía y ninguna forma de soltarlo.
    const opcionesDe = (
      saca: (f: FilaCosecha) => string,
      activo: string | null,
    ) => {
      const vistos = new Set(todasDelMes.map(saca).filter(Boolean));
      if (activo) vistos.add(activo);
      return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
    };
    const tiposEvento = opcionesDe((f) => f.tipo, filtroEvento);
    const tiposCliente = opcionesDe((f) => f.tipoCliente, filtroCliente);
    // Mismo cuidado con el estado: marcar la última fila de un estado no
    // puede hacer desaparecer el filtro que la estaba mostrando.
    const estadosPresentes = ESTADOS_COSECHA.filter(
      (e) =>
        e.v === filtroEstado || todasDelMes.some((f) => f.efectivo === e.v),
    );

    const filas = todasDelMes
      .filter(
        (f) =>
          (!filtroEvento || f.tipo === filtroEvento) &&
          (!filtroCliente || f.tipoCliente === filtroCliente) &&
          (!filtroEstado || f.efectivo === filtroEstado),
      )
      .sort((a, b) => {
        const d =
          orden.col === "monto"
            ? a.monto - b.monto
            : a.cliente.localeCompare(b.cliente, "es");
        return orden.desc ? -d : d;
      });

    // Se cuentan las dos cosas: lo que se ve y el total del mes, para
    // que "8 de 26 por llamar" no se confunda con "26 por llamar".
    const cuantos = (lista: FilaCosecha[], e: EstadoCosecha) =>
      lista.filter((f) => f.efectivo === e).length;
    return {
      filas,
      todasDelMes,
      anios: porAnio.map((a) => ({
        ant: a.ant,
        clave: a.clave,
        n: a.filas.length,
      })),
      tiposEvento,
      tiposCliente,
      estadosPresentes,
      pendientes: cuantos(filas, "no_ha_vuelto"),
      pendientesMes: cuantos(todasDelMes, "no_ha_vuelto"),
      enGestion: cuantos(filas, "en_gestion"),
      enGestionMes: cuantos(todasDelMes, "en_gestion"),
    };
  }, [
    tendenciaQuery.data,
    mesElegido,
    filtroEvento,
    filtroCliente,
    filtroEstado,
    orden,
  ]);

  // Quién dejó puesto el estado, para el tooltip: el uuid solo sirve
  // para saber si fuiste tú (migración 62; sin join a usuarios).
  const anotadoPor = (f: {
    anotadoEl: string | null;
    anotadoPor: string | null;
  }) => {
    const cuando = f.anotadoEl
      ? ` el ${new Date(f.anotadoEl).toLocaleDateString("es-CL", {
          day: "numeric",
          month: "short",
        })}`
      : "";
    if (!f.anotadoPor) return `Lo pusiste a mano${cuando}.`;
    return f.anotadoPor === user?.id
      ? `Lo pusiste tú${cuando}.`
      : `Lo puso otra persona del equipo${cuando}.`;
  };

  const clienteQuery = useQueryClient();
  const estadoMut = useMutation({
    mutationKey: ["cosecha"],
    mutationFn: (p: { ids: string[]; estado: EstadoCosecha | null }) =>
      // En paralelo: FEPASA mueve dos cotizaciones a la vez y no hay
      // razón para que la segunda espere a la primera.
      Promise.all(p.ids.map((id) => guardarEstadoCosecha(id, p.estado))),
    // El chip cambia AL TIRO (07-08: "se demora mucho en cambiar de
    // selección"). Antes cada cambio invalidaba la consulta y volvía a
    // bajar las 374 cotizaciones con sus clientes: medio segundo largo
    // de espera para escribir un texto de once letras. Ahora se escribe
    // en la caché y el servidor confirma por detrás; si falla, se
    // devuelve la foto anterior y no queda nada mentido en pantalla.
    onMutate: async (p) => {
      const llave = ["dashboard-tendencia"];
      await clienteQuery.cancelQueries({ queryKey: llave });
      const antes = clienteQuery.getQueriesData({ queryKey: llave });
      clienteQuery.setQueriesData({ queryKey: llave }, (viejo: unknown) =>
        Array.isArray(viejo)
          ? (viejo as QuotationWithClient[]).map((q) =>
              p.ids.includes(String(q.id))
                ? { ...q, harvest_status: p.estado }
                : q,
            )
          : viejo,
      );
      return { antes };
    },
    onError: (_e, _p, ctx) => {
      ctx?.antes?.forEach(([llave, datos]) =>
        clienteQuery.setQueryData(llave, datos),
      );
      // Sin esto el chip volvía solo a su valor anterior y nadie se
      // enteraba: uno cree que quedó anotado y al día siguiente vuelve a
      // llamar al mismo cliente (revisión del 07-08).
      toast.error("No se pudo guardar el estado. Inténtalo de nuevo.");
    },
    // Cuando ya no queda ningún guardado en vuelo, se vuelve a pedir la
    // verdad al servidor. Hace falta porque dos cambios encadenados se
    // pisan: el `onError` del primero restauraría una foto anterior al
    // segundo y borraría de pantalla un cambio que sí se guardó.
    onSettled: () => {
      if (clienteQuery.isMutating({ mutationKey: ["cosecha"] }) <= 1)
        clienteQuery.invalidateQueries({ queryKey: ["dashboard-tendencia"] });
    },
  });

  const tieneAnterior = (
    mapa: Map<string, { n: number; monto: number }>,
    clave: string,
  ) => {
    const [a, m] = clave.split("-");
    return mapa.has(`${Number(a) - 1}-${m}`);
  };
  const tendencia = (() => {
    const filas = tendenciaQuery.data ?? [];
    // Cotizaciones: por fecha de emisión, TODO lo que salió a la calle.
    const mesesCot = ventanaMeses(12, 4);
    const porEmision = agruparPorMes(filas, "created_at");
    // Eventos: por fecha del evento y solo lo CONFIRMADO; 12 corridos
    // más 4 de proyección (lo ya agendado).
    const mesesEv = ventanaMeses(12, 4);
    const porEvento = agruparPorMes(
      filas.filter((q) => ES_EVENTO.has(String(q.quotation_status))),
      "event_date",
    );
    // Antes del primer mes con datos el sistema no existía: ahí no se
    // dibuja nada (un cero sería mentira).
    const desde = primerMesConDatos([porEmision, porEvento]);
    return {
      cotCantidad: serieInteranual(mesesCot, porEmision, "n", desde),
      cotMonto: serieInteranual(mesesCot, porEmision, "monto", desde),
      evCantidad: serieInteranual(mesesEv, porEvento, "n", desde),
      evMonto: serieInteranual(mesesEv, porEvento, "monto", desde),
      // Los meses tal cual, para traducir un clic en la barra a su mes.
      mesesCot,
      // El mes en curso va a medias; de ahí en adelante, proyección.
      mesActualCot: indiceMesActual(mesesCot),
      mesActualEv: indiceMesActual(mesesEv),
      hayComparacion: mesesCot.some(
        (m, i) => tieneAnterior(porEmision, m.clave) && i >= 0,
      ),
    };
  })();

  // POR QUÉ PERDIMOS (06-08, migración 61). Nació de un dato medido: el
  // ticket promedio de las ganadas y el de las perdidas es casi idéntico
  // — el precio NO explica las derrotas. Este cuadro convierte cada
  // derrota en información.
  const perdidasQuery = useQuery({
    queryKey: ["dashboard-motivos", company?.id, selectedTimeRange],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION, [
        QuotationStatus.RECHAZADA,
        QuotationStatus.CANCELADA,
      ]);
      const desde = resolveRange().start_date;
      return (data || []).filter(
        (q) => String(q.updated_at || q.created_at).slice(0, 10) >= desde,
      );
    },
  });
  const motivosPerdida = (() => {
    const filas = perdidasQuery.data ?? [];
    const conMotivo = filas.filter((q) => q.loss_reason);
    const cuenta = new Map<string, { n: number; monto: number }>();
    conMotivo.forEach((q) => {
      const k = String(q.loss_reason);
      const a = cuenta.get(k) || { n: 0, monto: 0 };
      cuenta.set(k, { n: a.n + 1, monto: a.monto + (q.total_amount || 0) });
    });
    const lista = [...cuenta.entries()]
      .map(([motivo, v]) => ({ motivo, ...v }))
      .sort((a, b) => b.n - a.n);
    return {
      lista,
      total: conMotivo.length,
      sinMotivo: filas.length - conMotivo.length,
    };
  })();

  // Análisis de proveedores (23-07): provisiones reales + recursos.
  // 24-07: subido de más abajo, sin tocarle nada, porque el cálculo de
  // márgenes necesita los recursos y se ejecuta antes que esta línea.
  // El costo de personal por evento, desde las sillas (migración 84).
  const costoPersonalQuery = useQuery({
    queryKey: ["dashboard-costo-personal", company?.id],
    enabled: !!user && !!company?.id,
    queryFn: getCostoPersonal,
  });

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
    // El costo se calcula por EVENTO, no línea por línea: el fijo de un
    // recurso mixto se cobra UNA vez aunque vaya en varios días. Es la
    // misma cuenta de Gestión y Servicios (revisión del 16-08).
    const lineasPorEvento = new Map<string, LineaDeRecurso[]>();
    (provQuery.data?.eventResources || []).forEach((er) => {
      if (!personasPorEvento.has(er.quotation_id)) return; // fuera del período
      const suyas = lineasPorEvento.get(er.quotation_id) ?? [];
      suyas.push(er as LineaDeRecurso);
      lineasPorEvento.set(er.quotation_id, suyas);
    });
    const recursosPorEvento = new Map<string, number>();
    for (const [quotationId, suyas] of lineasPorEvento) {
      recursosPorEvento.set(
        quotationId,
        costoDeRecursos(suyas, personasPorEvento.get(quotationId) ?? 0),
      );
    }
    // El personal viene de LAS SILLAS (migración 84): con nombre al
    // monto acordado, vacías al estimado — el mismo número de Gestión.
    for (const cp of costoPersonalQuery.data ?? []) {
      if (!personasPorEvento.has(cp.quotation_id)) continue;
      recursosPorEvento.set(
        cp.quotation_id,
        (recursosPorEvento.get(cp.quotation_id) || 0) + cp.total,
      );
    }

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
          nombre: supplierById.get(key)?.name || nombre || "Sin proveedor",
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
      (wonEventsQuery.data || []).map((e) => [
        e.id,
        Number(e.people_count) || 0,
      ]),
    );
    const resById = new Map((extra?.resourceDefs || []).map((r) => [r.id, r]));
    const tipos = new Map<
      string,
      {
        gasto: number;
        items: Map<number, { nombre: string; gasto: number; eventos: number }>;
      }
    >();
    // El personal, desde las sillas (migración 84).
    for (const cp of costoPersonalQuery.data ?? []) {
      if (!wonIds.has(cp.quotation_id)) continue;
      const def = cp.role_id ? resById.get(cp.role_id) : undefined;
      const t = tipos.get("personal") || { gasto: 0, items: new Map() };
      t.gasto += cp.total;
      const it = t.items.get(cp.role_id ?? 0) || {
        nombre: def?.name || "Personal",
        gasto: 0,
        eventos: 0,
      };
      it.gasto += cp.total;
      it.eventos += 1;
      t.items.set(cp.role_id ?? 0, it);
      tipos.set("personal", t);
    }

    // Se agrupa por evento Y recurso antes de contar: el fijo de un
    // recurso mixto se cobra UNA vez por evento, aunque esté repartido
    // en varios días (revisión del 16-08). Contar línea por línea lo
    // cobraba tantas veces como días tuviera.
    const porEventoYRecurso = new Map<string, LineaDeRecurso[]>();
    (extra?.eventResources || []).forEach((er) => {
      if (!wonIds.has(er.quotation_id)) return;
      const clave = `${er.quotation_id}|${er.resource_id}`;
      const suyas = porEventoYRecurso.get(clave) ?? [];
      suyas.push(er as LineaDeRecurso);
      porEventoYRecurso.set(clave, suyas);
    });
    for (const [clave, suyas] of porEventoYRecurso) {
      const quotationId = clave.split("|")[0];
      const gasto = costoDeRecursos(suyas, peopleByQ.get(quotationId) || 0);
      const def = resById.get(suyas[0].resource_id);
      const tipo = def?.type || "otro";
      const t = tipos.get(tipo) || { gasto: 0, items: new Map() };
      t.gasto += gasto;
      const it = t.items.get(suyas[0].resource_id) || {
        nombre: def?.name || `Recurso ${suyas[0].resource_id}`,
        gasto: 0,
        eventos: 0,
      };
      it.gasto += gasto;
      // Un evento cuenta UNA vez por recurso, no una por línea de día.
      it.eventos += 1;
      t.items.set(suyas[0].resource_id, it);
      tipos.set(tipo, t);
    }
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
              // Si hay plata vencida, el clic lleva a Post-Venta CON el
              // filtro puesto: quien pincha un número rojo quiere ver
              // esas cuotas, no la lista completa (07-08, Felipe).
              onClick={() =>
                navigate(
                  hoy.porCobrar.vencido > 0
                    ? "/post-venta?plata=vencido"
                    : "/post-venta",
                )
              }
              className={`bg-white p-4 rounded-lg shadow text-left hover:shadow-md transition-shadow border-l-4 ${
                hoy.porCobrar.vencido > 0
                  ? "border-red-500"
                  : "border-emerald-400"
              }`}
              title={
                hoy.porCobrar.vencido > 0
                  ? "Ver en Post-Venta solo las cuotas vencidas"
                  : "Ir a Post-Venta (cobranza)"
              }
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
                    {formatCurrency(
                      data.totalSales,
                      company?.currency || "CLP",
                    )}
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
      {/* TENDENCIA INTERANUAL (06-08, diseño de Felipe): estos cuatro NO
          obedecen al filtro del período — muestran el pulso del negocio
          contra el año anterior. Arriba la cantidad (líneas), abajo la
          plata (barras). En eventos, los últimos 4 meses son PROYECCIÓN:
          lo ya agendado contra lo que realmente pasó el año pasado. */}
      {(() => {
        const azul = "rgb(59, 130, 246)";
        const morado = "rgb(147, 51, 234)";
        const tenue = "rgba(148, 163, 184, 0.55)";
        const barras = (
          serie: typeof tendencia.cotMonto,
          color: string,
          corte: number,
        ) => ({
          labels: serie.etiquetas,
          datasets: [
            {
              label: "Hace un año",
              data: serie.anterior,
              backgroundColor: tenue,
              borderRadius: 3,
            },
            {
              label: "Este año",
              data: serie.actual,
              // Del mes en curso hacia adelante, la barra va translúcida:
              // ese tramo no está cerrado (mes a medias) o es solo lo
              // agendado. Se nota sin tener que explicarlo.
              backgroundColor: serie.actual.map((_, i) =>
                corte >= 0 && i >= corte
                  ? color.replace("rgb", "rgba").replace(")", ", 0.35)")
                  : color.replace("rgb", "rgba").replace(")", ", 0.85)"),
              ),
              borderRadius: 3,
            },
          ],
        });
        // Al pasar el cursor por un mes se muestran AMBOS años y la
        // diferencia entre ellos (pedido de Felipe 06-08): la pregunta
        // real no es "cuánto llevo" sino "cómo voy contra el año pasado".
        const comparativo = {
          // `intersect: true` es lo que permite CERRARLO: solo cuenta el
          // clic sobre una barra, así un clic en el espacio vacío lo
          // apaga. Con `false`, cualquier punto acertaba y no se iba
          // nunca (06-08).
          interaction: { mode: "index" as const, intersect: true },
          plugins: {
            tooltip: {
              callbacks: {
                footer: (items: { parsed: { y: number } }[]) => {
                  if (items.length < 2) return "";
                  const antes = items[0].parsed.y;
                  const ahora = items[1].parsed.y;
                  if (!antes) return "";
                  const dif = Math.round(((ahora - antes) / antes) * 100);
                  return `${dif >= 0 ? "▲" : "▼"} ${Math.abs(dif)}% vs hace un año`;
                },
              },
            },
          },
        };
        // Pinchar una barra abre la lista de ESE mes y ESE año. El
        // `elems` que entrega Chart.js viene en modo "index" (trae las
        // dos barras de la columna), así que preguntamos aparte por la
        // barra realmente pinchada para saber de qué año hablamos.
        const alPinchar = (
          e: ChartEvent,
          elems: ActiveElement[],
          chart: Chart,
        ) => {
          if (!elems.length) return setMesElegido(null);
          const exacta = chart.getElementsAtEventForMode(
            e.native as Event,
            "nearest",
            { intersect: true },
            false,
          );
          const punto = exacta[0] ?? elems[0];
          const m = tendencia.mesesCot[punto.index];
          if (m)
            setMesElegido({
              base: m.clave,
              anterior: punto.datasetIndex === 0,
            });
        };
        const opcionesBase = {
          responsive: true,
          maintainAspectRatio: false,
          // El detalle aparece SOLO al pinchar una barra (06-08: al
          // pasar el cursor se disparaba solo y estorbaba). Se pincha
          // otra parte y se va. `touchstart` para que sirva en tableta.
          events: ["click", "touchstart"] as ("click" | "touchstart")[],
          interaction: comparativo.interaction,
          plugins: {
            legend: {
              display: true,
              position: "bottom" as const,
              labels: { boxWidth: 12, font: { size: 11 }, usePointStyle: true },
            },
            tooltip: comparativo.plugins.tooltip,
          },
          scales: { y: { beginAtZero: true } },
        };
        const opcionesCot = { ...opcionesBase, onClick: alPinchar };
        const opcionesPlata = {
          ...opcionesBase,
          plugins: {
            ...opcionesBase.plugins,
            tooltip: {
              callbacks: {
                label: (ctx: {
                  dataset: { label?: string };
                  parsed: { y: number };
                }) =>
                  `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y, company?.currency || "CLP")}`,
                footer: comparativo.plugins.tooltip.callbacks.footer,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v: string | number) =>
                  `$${(Number(v) / 1_000_000).toFixed(0)}M`,
              },
            },
          },
        };
        const marco = (
          titulo: string,
          sub: string,
          icono: React.ReactNode,
          grafico: React.ReactNode,
        ) => (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-1">
              {icono}
              <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">{sub}</p>
            <div className="h-64">{grafico}</div>
          </div>
        );
        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {marco(
                "Cotizaciones por Mes",
                "12 meses + 4 adelante · la línea tenue del año pasado es la meta a superar",
                <BarChart3 className="h-5 w-5 text-blue-600" />,
                <Bar
                  data={barras(
                    tendencia.cotCantidad,
                    azul,
                    tendencia.mesActualCot,
                  )}
                  options={opcionesCot}
                />,
              )}
              {marco(
                "Eventos por Mes",
                "12 meses + 4 de proyección (lo ya agendado) · solo confirmados",
                <Calendar className="h-5 w-5 text-purple-600" />,
                <Bar
                  data={barras(
                    tendencia.evCantidad,
                    morado,
                    tendencia.mesActualEv,
                  )}
                  options={opcionesBase}
                />,
              )}
            </div>

            {/* LA COSECHA DEL MES (06-08, hallazgo de Felipe): "el año
                pasado en agosto saqué 47 cotizaciones... ¿y a quién?".
                Un año después, esa lista ES la lista de llamados. */}
            {mesElegido &&
              (() => {
                // La cosecha es una lista de trabajo: se va abriendo una
                // ficha tras otra. Si cada clic se llevara la pantalla,
                // habría que rehacer el camino —gráfico, barra, mes— para
                // volver a la siguiente (Felipe, 07-08). Se abre al lado.
                const abrirAlLado = (id: string) => {
                  if (id) window.open(`/negocio/${id}`, "_blank", "noopener");
                };
                const claveDe = (anterior: boolean) =>
                  anterior ? unAnioAntes(mesElegido.base) : mesElegido.base;
                const clave = claveDe(mesElegido.anterior);
                const {
                  filas,
                  todasDelMes,
                  tiposEvento,
                  tiposCliente,
                  estadosPresentes,
                  pendientes,
                  pendientesMes,
                  enGestion,
                  enGestionMes,
                } = cosecha;
                // Encabezado que ordena. Primer clic en una columna nueva
                // parte por lo más útil —el monto de mayor a menor, los
                // nombres de la A a la Z—; el segundo la da vuelta.
                const encabezadoOrden = (
                  col: "monto" | "cliente",
                  texto: string,
                  aLaDerecha = false,
                ) => {
                  const activa = orden.col === col;
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setOrden(
                          activa
                            ? { col, desc: !orden.desc }
                            : { col, desc: col === "monto" },
                        )
                      }
                      className={`inline-flex items-center gap-0.5 hover:text-gray-700 ${
                        activa ? "text-gray-700" : ""
                      } ${aLaDerecha ? "flex-row-reverse" : ""}`}
                      title={`Ordenar por ${texto.toLowerCase()}`}
                    >
                      {texto}
                      <span className={activa ? "" : "opacity-0"}>
                        {orden.desc ? "▼" : "▲"}
                      </span>
                    </button>
                  );
                };
                const hayFiltro = !!(
                  filtroEvento ||
                  filtroCliente ||
                  filtroEstado
                );
                // Las dos pestañas: el mismo mes de este año y del pasado,
                // con su cuenta a la vista para saber cuál mirar.
                const anios = cosecha.anios;
                return (
                  <div className="bg-white rounded-lg shadow p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">
                          Quién cotizó en {etiquetaMes(clave)}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {hayFiltro
                            ? `${filas.length} de ${todasDelMes.length} cotizaciones`
                            : `${filas.length} cotización${filas.length === 1 ? "" : "es"}`}
                          {pendientes > 0 && (
                            <>
                              {" · "}
                              <b className="text-amber-700">
                                {hayFiltro
                                  ? `${pendientes} de ${pendientesMes} por llamar`
                                  : `${pendientes} por llamar`}
                              </b>
                            </>
                          )}
                          {/* Fuera del guard de pendientes: el avance
                              tiene que verse JUSTO cuando ya no queda
                              nadie por llamar (revisión del 07-08). */}
                          {enGestion > 0 && (
                            <span className="text-blue-700">
                              {" · "}
                              {hayFiltro
                                ? `${enGestion} de ${enGestionMes} en gestión`
                                : `${enGestion} en gestión`}
                            </span>
                          )}
                        </p>
                        <div className="flex gap-1.5 mt-2">
                          {anios.map((a) => (
                            <button
                              key={a.clave}
                              type="button"
                              onClick={() =>
                                setMesElegido({
                                  base: mesElegido.base,
                                  anterior: a.ant,
                                })
                              }
                              className={`px-2.5 py-1 rounded-full text-xs border ${
                                a.ant === mesElegido.anterior
                                  ? "bg-blue-600 text-white border-blue-600 font-semibold"
                                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              {etiquetaMes(a.clave)} · {a.n}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* La columna de la derecha: cerrar arriba y los
                          tres filtros debajo, en el mismo orden (pedido
                          de Felipe, 07-08). Así el encabezado de la
                          izquierda queda solo con el título y las cuentas. */}
                      <div className="ml-auto">
                        <div className="text-right">
                          <button
                            type="button"
                            onClick={cerrarCosecha}
                            className="text-gray-400 hover:text-gray-600 text-sm"
                          >
                            Cerrar
                          </button>
                        </div>
                        {/* Los tres filtros, con el desplegable de la
                              casa. La opción cero es el "todos": así se
                              limpia sin un botón aparte. */}
                        <div className="flex flex-wrap justify-end gap-1.5 mt-2">
                          <SectionChipSelect
                            value={
                              filtroEvento
                                ? tiposEvento.indexOf(filtroEvento) + 1
                                : 0
                            }
                            options={tiposEvento.map((t, i) => ({
                              id: i + 1,
                              name: t,
                            }))}
                            zeroLabel="Todo evento"
                            onChange={(id) =>
                              setFiltroEvento(
                                id === 0 ? null : tiposEvento[id - 1],
                              )
                            }
                            chipClass={
                              filtroEvento
                                ? "bg-blue-50 border-blue-300 text-blue-800 font-semibold"
                                : undefined
                            }
                            widthClass="w-[152px]"
                            title="Filtrar por tipo de evento"
                            ariaLabel="Filtrar por tipo de evento"
                          />
                          <SectionChipSelect
                            value={
                              filtroCliente
                                ? tiposCliente.indexOf(filtroCliente) + 1
                                : 0
                            }
                            options={tiposCliente.map((t, i) => ({
                              id: i + 1,
                              name: t,
                            }))}
                            zeroLabel="Todo cliente"
                            onChange={(id) =>
                              setFiltroCliente(
                                id === 0 ? null : tiposCliente[id - 1],
                              )
                            }
                            chipClass={
                              filtroCliente
                                ? "bg-blue-50 border-blue-300 text-blue-800 font-semibold"
                                : undefined
                            }
                            widthClass="w-[152px]"
                            title="Filtrar por tipo de cliente"
                            ariaLabel="Filtrar por tipo de cliente"
                          />
                          <SectionChipSelect
                            value={
                              filtroEstado
                                ? estadosPresentes.findIndex(
                                    (e) => e.v === filtroEstado,
                                  ) + 1
                                : 0
                            }
                            options={estadosPresentes.map((e, i) => ({
                              id: i + 1,
                              name: e.l,
                            }))}
                            zeroLabel="Todo estado"
                            onChange={(id) =>
                              setFiltroEstado(
                                id === 0 ? null : estadosPresentes[id - 1].v,
                              )
                            }
                            chipClass={
                              filtroEstado
                                ? metaEstado(filtroEstado).chip +
                                  " font-semibold"
                                : undefined
                            }
                            widthClass="w-[152px]"
                            title="Filtrar por estado de la cosecha"
                            ariaLabel="Filtrar por estado de la cosecha"
                          />
                        </div>
                      </div>
                    </div>
                    {filas.length === 0 ? (
                      <p className="text-sm text-gray-500 py-3">
                        {hayFiltro
                          ? "Ninguna cotización de ese mes cumple con el filtro."
                          : "Sin cotizaciones ese mes."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto -mx-1">
                        {/* Anchos fijos (07-08, pedido de Felipe: "no es
                            capricho, es para darle más espacio a todo").
                            En modo automático el navegador le regalaba el
                            sobrante a CLIENTE —la columna de texto más
                            largo— y dejaba apretadas las dos últimas, que
                            son con las que se trabaja. Además el recorte
                            de las celdas solo obedece con table-fixed. */}
                        <table className="w-full text-sm table-fixed">
                          <colgroup>
                            <col className="w-[6%]" />
                            <col className="w-[19%]" />
                            <col className="w-[10%]" />
                            <col className="w-[12%]" />
                            <col className="w-[14%]" />
                            <col className="w-[9%]" />
                            <col className="w-[11%]" />
                            <col className="w-[14%]" />
                            <col className="w-[5%]" />
                          </colgroup>
                          <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b">
                              <th className="text-left font-semibold py-2 px-1">
                                N°
                              </th>
                              <th
                                className="text-left font-semibold px-1"
                                aria-sort={
                                  orden.col !== "cliente"
                                    ? "none"
                                    : orden.desc
                                      ? "descending"
                                      : "ascending"
                                }
                              >
                                {encabezadoOrden("cliente", "Cliente")}
                              </th>
                              <th className="text-left font-semibold px-1">
                                Tipo de cliente
                              </th>
                              <th className="text-left font-semibold px-1">
                                Mandante
                              </th>
                              <th className="text-left font-semibold px-1">
                                Tipo de evento
                              </th>
                              <th className="text-left font-semibold px-1">
                                Cómo terminó
                              </th>
                              <th
                                className="text-right font-semibold px-1"
                                aria-sort={
                                  orden.col !== "monto"
                                    ? "none"
                                    : orden.desc
                                      ? "descending"
                                      : "ascending"
                                }
                              >
                                {encabezadoOrden("monto", "Monto", true)}
                              </th>
                              <th className="text-left font-semibold px-1">
                                ¿Volvió a pedirlo?
                              </th>
                              <th className="text-right font-semibold px-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filas.map((f) => (
                              <tr
                                key={f.id}
                                onClick={() => abrirAlLado(f.id)}
                                className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/50 ${
                                  f.efectivo === "no_ha_vuelto"
                                    ? "bg-amber-50/40"
                                    : ""
                                }`}
                                title="Abrir la ficha del negocio en otra pestaña"
                              >
                                <td className="py-2 px-1 text-gray-500">
                                  #{f.numero}
                                </td>
                                <td className="px-1 font-medium text-gray-900">
                                  <div className="truncate" title={f.cliente}>
                                    {f.cliente}
                                  </div>
                                </td>
                                <td className="px-1">
                                  {f.tipoCliente ? (
                                    <span
                                      className={`block truncate px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-center ${getClientTypeColor(f.tipoCliente)}`}
                                      title={f.tipoCliente}
                                    >
                                      {f.tipoCliente}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                {/* El recorte va en un div, no en la celda:
                                    en una tabla de ancho automático el
                                    navegador ignora el max-width de un
                                    <td> y el nowrap la ensancha en vez de
                                    achicarla (revisión del 07-08). */}
                                <td className="px-1 text-gray-600">
                                  <div
                                    className="truncate"
                                    title={f.mandante || undefined}
                                  >
                                    {f.mandante || (
                                      <span className="text-gray-400 italic">
                                        sin mandante
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-1 text-gray-600">
                                  <div className="truncate" title={f.tipo}>
                                    {f.tipo}
                                  </div>
                                </td>
                                <td className="px-1">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                      ETIQUETA_ESTADO[f.estado]?.c ||
                                      "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {ETIQUETA_ESTADO[f.estado]?.l || f.estado}
                                  </span>
                                </td>
                                <td className="px-1 text-right font-semibold text-gray-900">
                                  {formatCurrency(
                                    f.monto,
                                    company?.currency || "CLP",
                                  )}
                                </td>
                                <td
                                  className="px-1"
                                  onClick={(ev) => ev.stopPropagation()}
                                  role="presentation"
                                >
                                  <SectionChipSelect
                                    value={
                                      ESTADOS_COSECHA.findIndex(
                                        (e) => e.v === f.efectivo,
                                      ) + 1
                                    }
                                    options={ESTADOS_COSECHA.map((e, i) => ({
                                      id: i + 1,
                                      name: e.l,
                                    }))}
                                    // La opción cero solo aparece cuando hay
                                    // una corrección puesta: es la puerta de
                                    // vuelta a lo que sugiere la máquina.
                                    zeroLabel={
                                      f.estadoManual ? "↺ Automático" : null
                                    }
                                    onChange={(id) =>
                                      estadoMut.mutate({
                                        ids: [f.id],
                                        estado:
                                          id === 0
                                            ? null
                                            : ESTADOS_COSECHA[id - 1].v,
                                      })
                                    }
                                    chipClass={metaEstado(f.efectivo).chip}
                                    // TODOS DEL MISMO ANCHO (Felipe, 18-08):
                                    // con w-full el envoltorio inline-block
                                    // medía lo que medía cada texto. Fijo,
                                    // con aire para el rótulo más largo.
                                    widthClass="w-40"
                                    disabled={
                                      estadoMut.isPending &&
                                      !!estadoMut.variables?.ids.includes(f.id)
                                    }
                                    title={
                                      f.estadoManual
                                        ? `${metaEstado(f.efectivo).ayuda}. ${anotadoPor(f)}`
                                        : `${metaEstado(f.efectivo).ayuda}. Sugerido por el sistema.`
                                    }
                                    ariaLabel="Estado de la cosecha"
                                  />
                                </td>
                                <td className="px-1 text-right whitespace-nowrap">
                                  {f.posteriorNumero ? (
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        abrirAlLado(f.posteriorId || "");
                                      }}
                                      className="text-xs text-gray-500 hover:text-blue-700 hover:underline"
                                      title={`Cotización posterior de este mismo cruce (${etiquetaMes(
                                        String(f.posteriorEl).slice(0, 7),
                                      )}). Se abre en otra pestaña.`}
                                    >
                                      #{f.posteriorNumero}
                                    </button>
                                  ) : (
                                    <span
                                      className="text-gray-300 text-xs"
                                      title="No hay pedidos posteriores de este cruce"
                                    >
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[11px] text-gray-400 mt-2">
                          El sistema <b>sugiere</b> el estado cruzando{" "}
                          <b>empresa + mandante + tipo de evento</b>: si hubo un
                          pedido después de este mes, propone «Revendido»; si
                          no, «No ha vuelto». <b>La última palabra es tuya</b> —
                          cámbialo en el desplegable y se guarda. Cada fila es
                          independiente: si un evento viene partido en dos
                          cotizaciones, marca las dos. Los tres filtros de
                          arriba se combinan y se mantienen al saltar de año;
                          pincha «Cliente» o «Monto» para ordenar. Las fichas se
                          abren en otra pestaña para no perder la lista.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {marco(
                "Cotizado por Mes",
                "El dinero que pusiste sobre la mesa · el mes en curso va a medias",
                <BarChart3 className="h-5 w-5 text-blue-600" />,
                <Bar
                  data={barras(
                    tendencia.cotMonto,
                    azul,
                    tendencia.mesActualCot,
                  )}
                  options={opcionesPlata}
                />,
              )}
              {marco(
                "Vendido por Mes",
                "Eventos confirmados · los últimos 4 meses son lo ya agendado",
                <Calendar className="h-5 w-5 text-purple-600" />,
                <Bar
                  data={barras(
                    tendencia.evMonto,
                    morado,
                    tendencia.mesActualEv,
                  )}
                  options={opcionesPlata}
                />,
              )}
            </div>
          </>
        );
      })()}

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
                  val >= 0 ? "text-emerald-700" : "text-red-600 font-semibold",
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
                factura; por eso Ventas y Cobrado no calzan al peso. El costo
                son los insumos más los recursos asignados al evento. Costo con
                ~ = todavía no está cerrado (evento sin provisionar en Compras,
                o sin recursos cargados en Post-venta); sin ~ = insumos
                congelados y recursos ya asignados. La merma va solo en el
                costo. Pasa el mouse por una cifra para ver el monto exacto.
              </p>
            </div>
          </div>
        );
      })()}

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
          { key: "cancelada", label: etiquetaEstado("cancelada"), zone: "perdida" },
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
                <span className="text-sm text-gray-500">
                  (en miles de pesos)
                </span>
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
                            className={`inline-block w-2 h-2 rounded-full mr-1 ${puntoEstado(c.key)}`}
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
              {/* POR QUÉ PERDIMOS (06-08, migración 61): el mapa que
                  convierte cada derrota en algo accionable. */}
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="text-sm font-bold text-gray-700">
                  Por qué perdimos
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">
                  Cotizaciones rechazadas y eventos anulados del período.
                </p>
                {motivosPerdida.total === 0 ? (
                  <p className="text-sm text-gray-500 py-3">
                    Sin motivos registrados todavía. Se piden al rechazar o
                    anular.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {motivosPerdida.lista.map((m) => {
                      const pct = Math.round(
                        (100 * m.n) / motivosPerdida.total,
                      );
                      return (
                        <div key={m.motivo}>
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="text-gray-800 font-medium">
                              {etiquetaMotivo(m.motivo)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {m.n} ·{" "}
                              {formatCurrency(
                                m.monto,
                                company?.currency || "CLP",
                              )}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {motivosPerdida.sinMotivo > 0 && (
                      <p className="text-[11px] text-gray-400 pt-1">
                        {motivosPerdida.sinMotivo} sin motivo (anteriores a esta
                        función).
                      </p>
                    )}
                  </div>
                )}
              </div>
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
                  período (merma incluida en el costo). Comprado real: fotos de
                  provisión de Compras. Recetas y Servicios miden en cuántas
                  preparaciones participa cada proveedor — pocos puntos de
                  contacto = candidato a consolidar.
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
                        {[...proveedores.tipos.entries()].map(([tipo, t]) => (
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
                        ))}
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
