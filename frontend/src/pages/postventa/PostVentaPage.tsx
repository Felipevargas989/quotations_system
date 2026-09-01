import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "../../components/toast/Toast";
import EventoCajitas from "../../components/EventoCajitas";
import { esEventoCongelado } from "../../utils/eventoCongelado";
import CelebracionRealizada from "../../components/CelebracionRealizada";
import MotivoPerdida from "../../components/MotivoPerdida";
import QuotationViewer from "../../components/QuotationViewer";
import { useNavigate, useParams } from "react-router-dom";
import { resolveStorageUrl } from "../../services/storage.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  DollarSign,
  Clock,
  CheckCircle,
  Link2,
  AlertTriangle,
  X,
  ChevronRight,
  Upload,
  Pencil,
  Trash2,
  FileText,
  Undo2,
  Phone,
  Mail,
} from "lucide-react";
import { format } from "date-fns";
import { formatISOUTCDateToString } from "../../utils/dates";
import { useAuth } from "../../contexts/AuthContext";
import MultiSelect, { MultiSelectOption } from "../../components/MultiSelect";
import FileViewLink from "../../components/FileViewLink";
import ConfirmInline from "../../components/ConfirmInline";
import {
  getPaymentsWithTransactions,
  createOverflowPayment,
  updatePaymentTransaction,
  deletePaymentTransaction,
  PaymentWithTransactions,
  PaymentTransaction,
} from "../../services/paymentTransactions.service";
import { getClients } from "../../services/clients.service";
import { updatePaymentSchedule } from "../../services/payments.service";
import {
  confirmPortalReceipt,
  listPortalReceipts,
  rejectPortalReceipt,
} from "../../services/portalReceipts.service";
import {
  getQuotationById,
  markEventDone,
  unmarkEventDone,
  updateQuotation,
} from "../../services/quotations.service";
import {
  Quotation,
  QuotationStatus,
  QuotationWithClient,
} from "../../types/quotations.types";
import { Refund } from "../../types/refunds.types";
import { NumberInput } from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { matchesSearch, normalizeText } from "../../utils/searchMatch";
import { formatPhone } from "../../utils/phone";
import GestionTab, { gestionQueryOpts } from "./GestionTab";
import { recursosQueryOpts } from "./EventResourcesSection";
import CocinaTab from "./CocinaTab";
// La pestaña Servicios vive en su propio archivo desde el 04-08 (también
// la monta NegocioPage); todo lo exclusivo de ella se mudó allá.
import ServiciosTab from "./ServiciosTab";
import { getFollowupsMap } from "../../services/quotationFollowups.service";
import { useCopiarDato } from "../../hooks/useCopiarDato";
import {
  HiloSeguimiento,
  AdjuntosComerciales,
} from "../quotations/SeguimientoPanel";
import {
  getRefundsByQuotation,
  getPaidRefundsByQuotation,
  registerRefund,
} from "../../services/refunds.service";
import {
  EventDocument,
  DOCUMENT_CATEGORIES,
  getDocumentsByQuotation,
  addDocument,
  deleteDocument,
} from "../../services/documents.service";
import {
  uploadRefundReceipt,
  uploadPaymentReceipt,
  uploadEventDocument,
  deleteStorageFileByUrl,
} from "../../services/storage.service";

const PAYMENT_METHODS = [
  "Transferencia",
  "Efectivo",
  "Cheque",
  "Tarjeta",
  "Otro",
];
const todayISO = () => format(new Date(), "yyyy-MM-dd");

// One row per closed event (quotation), aggregated from its payment plan.
interface EventRow {
  quotationId: string;
  quotationNumber: number;
  clientName: string;
  clientType?: string;
  contactPerson?: string;
  phone?: string;
  contactEmail?: string;
  hasContract?: boolean;
  total: number;
  paid: number; // bruto: suma de abonos del cliente
  refunded: number; // reembolsos ya devueltos (is_paid = true)
  cuotas: number;
  status: "pagado" | "vencido" | "pendiente";
  // Evento anulado: fuera de la lista por defecto, visible con el filtro.
  cancelled: boolean;
  // Evento realizado: sigue en la lista (cobranza) con su etiqueta verde.
  done: boolean;
  // Fecha del evento (y último día si es multi-día), para la columna.
  eventDate: string | null;
  eventEndDate: string | null;
  // Enlace secreto del portal del cliente (migración 47).
  portalToken: string | null;
  payments: PaymentWithTransactions[];
}

// Persistir el filtro de estado por usuario (igual que en Cotizaciones):
// la selección sobrevive recargas/navegación en vez de volver a "todos".
// Dos filtros SEPARADOS (decisión de Felipe 29-07): el estado del
// EVENTO y el estado de la PLATA son dimensiones distintas y se cruzan.
// Antes iban mezclados en una lista y un realizado con deuda quedaba
// invisible al filtrar "Pendiente" o "Vencido" — justo el más urgente
// de cobrar. La clave de storage vieja
// (eventia_postventa_status_filter_) se migra una vez y se elimina.
const EVENT_FILTER_KEY = (userId: string | number) =>
  `eventia_postventa_event_filter_${userId}`;
const MONEY_FILTER_KEY = (userId: string | number) =>
  `eventia_postventa_money_filter_${userId}`;
const LEGACY_FILTER_KEY = (userId: string | number) =>
  `eventia_postventa_status_filter_${userId}`;
const EVENT_FILTER_VALUES = ["vigente", "realizado", "cancelado"];
const MONEY_FILTER_VALUES = ["pendiente", "pagado", "vencido"];

// Vacío en Evento = vigentes + realizados (los anulados solo aparecen
// marcando su opción). Vacío en Plata = todos.
const EVENT_OPTIONS: MultiSelectOption[] = [
  { value: "vigente", label: "📅 Vigentes" },
  { value: "realizado", label: "🎉 Realizados" },
  { value: "cancelado", label: "🚫 Anulados" },
];
const MONEY_OPTIONS: MultiSelectOption[] = [
  { value: "pendiente", label: "⏳ Pendientes" },
  { value: "vencido", label: "⚠️ Vencidos" },
  { value: "pagado", label: "✅ Pagados" },
];

// Exportado: ServiciosTab (archivo propio desde el 04-08) usa el mismo
// formateador para que los montos se vean idénticos en toda Post-Venta.
export const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");
// SIEMPRE en UTC (12-08): las fechas de evento y de cuota viven como
// medianoche UTC. `new Date()` las corría a hora chilena y la lista
// mostraba un día MENOS que la ficha (pillada de Felipe: la #423
// decía 13-17 afuera y 14-18 adentro; la ficha era la correcta).
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return formatISOUTCDateToString(d);
  } catch {
    return "—";
  }
};
// Estado EFECTIVO de una cuota. El status guardado en BD solo pasa a
// "vencido" mediante un cron del backend (1 AM); si el backend no estaba
// corriendo (típico en dev) una cuota atrasada seguiría diciendo "pendiente".
// Por eso además comparamos la fecha de vencimiento con hoy (por fecha
// calendario, sin horas): vence hoy = aún pendiente; desde mañana = vencida.
const cuotaStatus = (p: PaymentWithTransactions): string => {
  if (p.status === "pagado") return "pagado";
  if (p.status === "vencido") return "vencido";
  const saldo = (p.amount || 0) - (p.paid_amount || 0);
  const due = (p.due_date || "").slice(0, 10);
  if (saldo > 0 && due && due < format(new Date(), "yyyy-MM-dd"))
    return "vencido";
  return p.status;
};

const statusBadge = (st: string) => {
  const map: Record<string, string> = {
    pagado: "bg-green-100 text-green-800",
    vencido: "bg-red-100 text-red-800",
    pendiente: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${map[st] || map.pendiente}`}
    >
      {st ? st.charAt(0).toUpperCase() + st.slice(1) : "—"}
    </span>
  );
};

export default function PostVentaPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // La búsqueda también sobrevive al viaje ficha ↔ lista (03-08).
  const [search, setSearch] = useState(
    () => localStorage.getItem("eventia_pv_search") || "",
  );
  useEffect(() => {
    localStorage.setItem("eventia_pv_search", search);
  }, [search]);
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [moneyFilter, setMoneyFilter] = useState<string[]>([]);
  const [filterRestored, setFilterRestored] = useState(false);
  // El evento abierto vive en la URL (/postventa/:id — decisión de
  // Felipe 03-08: página propia, no modal): "volver" conserva la lista
  // con sus filtros, el botón atrás funciona y el enlace se comparte.
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<
    "seguimiento" | "pagos" | "documentos" | "servicios" | "gestion" | "cocina"
  >("pagos");

  // Restaurar los filtros persistidos (por usuario) al entrar. Si solo
  // existe la clave vieja (una lista mezclada), se reparte una vez entre
  // las dos familias y se elimina.
  useEffect(() => {
    if (!user) return;
    try {
      const leer = (key: string): string[] | null => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      };
      const ev = leer(EVENT_FILTER_KEY(user.id));
      const mo = leer(MONEY_FILTER_KEY(user.id));
      if (ev || mo) {
        setEventFilter(
          (ev || []).filter((v) => EVENT_FILTER_VALUES.includes(v)),
        );
        setMoneyFilter(
          (mo || []).filter((v) => MONEY_FILTER_VALUES.includes(v)),
        );
      } else {
        const legacy = leer(LEGACY_FILTER_KEY(user.id));
        if (legacy) {
          setEventFilter(legacy.filter((v) => EVENT_FILTER_VALUES.includes(v)));
          setMoneyFilter(legacy.filter((v) => MONEY_FILTER_VALUES.includes(v)));
          localStorage.removeItem(LEGACY_FILTER_KEY(user.id));
        }
      }
    } catch {
      /* valor antiguo o storage deshabilitado: usar el default */
    }
    // Lo que venga por la dirección MANDA sobre lo guardado (07-08,
    // pillada de Felipe): pinchar "VENCIDO" en el Dashboard tiene que
    // dejar la lista mostrando lo vencido, no los filtros que uno traía
    // de la visita anterior. Se aplica al final, después de restaurar.
    const pedido = new URLSearchParams(window.location.search).get("plata");
    if (pedido && MONEY_FILTER_VALUES.includes(pedido)) {
      setMoneyFilter([pedido]);
      // El estado del evento no se toca: una cuota vencida puede estar
      // en un evento realizado o en uno por venir, y filtrar de más
      // escondería justo lo que se viene a cobrar.
      setEventFilter([]);
    }
    setFilterRestored(true);
  }, [user]);

  // Guardar los filtros cada vez que cambian (después de restaurar).
  useEffect(() => {
    if (!user || !filterRestored) return;
    try {
      localStorage.setItem(
        EVENT_FILTER_KEY(user.id),
        JSON.stringify(eventFilter),
      );
      localStorage.setItem(
        MONEY_FILTER_KEY(user.id),
        JSON.stringify(moneyFilter),
      );
    } catch {
      /* ignorar cuota/storage deshabilitado */
    }
  }, [user, filterRestored, eventFilter, moneyFilter]);

  const fetchEvents = async (): Promise<EventRow[]> => {
    const [{ data: payments }, { data: clients }, refundsPaid] =
      await Promise.all([
        getPaymentsWithTransactions(),
        getClients(),
        getPaidRefundsByQuotation(),
      ]);

    const clientByName = new Map<string, any>(
      (clients || []).map((c: any) => [c.name, c]),
    );

    const byQuotation = new Map<string, PaymentWithTransactions[]>();
    (payments || []).forEach((p) => {
      if (!p.quotation_id) return;
      const arr = byQuotation.get(p.quotation_id) || [];
      arr.push(p);
      byQuotation.set(p.quotation_id, arr);
    });

    const events: EventRow[] = [];
    byQuotation.forEach((ps, quotationId) => {
      const q = ps[0].quotations;
      const total =
        q?.total_amount || ps.reduce((s, p) => s + (p.amount || 0), 0);
      const paid = ps.reduce((s, p) => s + (p.paid_amount || 0), 0);
      const refunded = refundsPaid[quotationId] || 0;
      const client = q?.clients?.name
        ? clientByName.get(q.clients.name)
        : undefined;

      // Saldo neto: lo pagado menos lo ya devuelto al cliente.
      const saldo = total - (paid - refunded);
      let status: EventRow["status"] = "pendiente";
      if (saldo <= 0) status = "pagado";
      else if (ps.some((p) => cuotaStatus(p) === "vencido")) status = "vencido";

      const qStatus = (q as unknown as { quotation_status?: string })
        ?.quotation_status;
      const qDates = q as unknown as {
        event_date?: string | null;
        event_end_date?: string | null;
      };

      // Contacto mostrado: el MANDANTE de la cotización (quien encargó
      // ESTE evento), con su propio teléfono buscado entre los contactos
      // del cliente. Sin mandante guardado (cotizaciones antiguas) → el
      // contacto principal del cliente, como antes. Si el mandante no
      // tiene fono registrado, no se muestra el de otra persona.
      const qExtra = q as unknown as {
        contact_name?: string | null;
        clients?: {
          email?: string;
          client_contacts?: {
            name: string;
            phone?: string;
            email?: string;
          }[];
        };
      };
      const mandante = qExtra?.contact_name?.trim();
      let contactPerson = client?.contact_person;
      let phone = client?.phone;
      // Correo en la columna (pedido de Felipe 30-07), igual que en
      // Cotizaciones: el del mandante; sin mandante, el de la ficha.
      let contactEmail = qExtra?.clients?.email;
      if (mandante) {
        contactPerson = mandante;
        const match = (qExtra?.clients?.client_contacts || []).find(
          (c) => normalizeText(c.name) === normalizeText(mandante),
        );
        phone = match?.phone || undefined;
        contactEmail = match?.email || undefined;
      }

      events.push({
        quotationId,
        cancelled: qStatus === "cancelada",
        done: qStatus === "realizada",
        eventDate: qDates?.event_date ?? null,
        eventEndDate: qDates?.event_end_date ?? null,
        quotationNumber: q?.quotation_number ?? 0,
        clientName: q?.clients?.name || "—",
        clientType: client?.client_type,
        contactPerson,
        phone,
        contactEmail,
        hasContract: q?.has_contract,
        portalToken:
          (q as unknown as { mandante?: { portal_token?: string | null } })
            ?.mandante?.portal_token ?? null,
        total,
        paid,
        refunded,
        cuotas: ps.length,
        status,
        payments: ps
          .slice()
          .sort((a, b) => a.payment_number - b.payment_number),
      });
    });

    events.sort((a, b) => b.quotationNumber - a.quotationNumber);
    return events;
  };

  // ---- Post-Venta vía React Query (Etapa 4) — PANTALLA DE PLATA ----
  // staleTime 0: aquí la frescura manda. Cada vez que entras (o vuelves
  // a la pestaña) se revalida contra el servidor; el caché solo evita
  // la pantalla en blanco mientras llega la versión fresca.
  const eventsQuery = useQuery({
    queryKey: ["postventa", "events"],
    staleTime: 0,
    queryFn: fetchEvents,
  });
  const rows = eventsQuery.data ?? [];
  const loading = eventsQuery.isPending;

  // Fase 2b del portal: comprobantes subidos por clientes, por
  // confirmar. Se revisan aquí mismo (bandeja).
  // MENOS MARTILLEO (17-08, "cargar comprobantes está lento"): se
  // pedía cada 2 minutos Y en cada cambio de foco, con staleTime 0,
  // estuvieras o no mirando la bandeja. Ahora se pide al entrar, se
  // considera fresca 2 minutos, y el sondeo de fondo baja a 5. La
  // acción de confirmar/rechazar un comprobante ya la refresca a mano.
  const receiptsQuery = useQuery({
    queryKey: ["postventa", "comprobantes"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    queryFn: listPortalReceipts,
  });
  const comprobantes = receiptsQuery.data ?? [];
  // Compromisos del hilo, para el aviso ámbar del tablero (07-08,
  // pedido de Felipe): "si llego a colocar fecha, en la pantalla de
  // Post-Venta podría haber un signo de exclamación ámbar para avisar
  // que hay algo pendiente ahí". Una sola consulta para todas las filas.
  const seguimientosQuery = useQuery({
    queryKey: ["seguimientos", "map"],
    staleTime: 0,
    queryFn: getFollowupsMap,
  });
  const compromisos = seguimientosQuery.data ?? {};
  // Pendiente = hay fecha comprometida y ya llegó el día. Una fecha
  // futura NO alarma: si el ámbar apareciera al anotarla, en dos semanas
  // todos los eventos tendrían exclamación y dejaría de mirarse.
  const pendienteDe = (quotationId: string) => {
    const f = compromisos[quotationId]?.next_contact_date;
    if (!f) return null;
    const hoy = new Date();
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const dia = f.slice(0, 10);
    if (dia > hoyISO) return null;
    return { dia, vencido: dia < hoyISO };
  };

  const [verComprobantes, setVerComprobantes] = useState(false);
  const [procesandoComp, setProcesandoComp] = useState<number | null>(null);
  const [rechazoCompId, setRechazoCompId] = useState<number | null>(null);
  const [notaRechazo, setNotaRechazo] = useState("");
  const actuarComprobante = async (
    id: number,
    accion: "confirmar" | "rechazar",
  ) => {
    setProcesandoComp(id);
    try {
      if (accion === "confirmar") {
        await confirmPortalReceipt(id);
      } else {
        await rejectPortalReceipt(id, notaRechazo.trim() || undefined);
        setRechazoCompId(null);
        setNotaRechazo("");
      }
      await queryClient.invalidateQueries({ queryKey: ["postventa"] });
    } finally {
      setProcesandoComp(null);
    }
  };

  // Derivado de la URL: siempre la versión FRESCA de la lista (saldo,
  // progreso, cuotas al día) — sin estado espejo que sincronizar.
  const selected = routeId
    ? rows.find((e) => e.quotationId === routeId) || null
    : null;

  // Refresca tras guardar sin el spinner de pantalla completa. Un pago
  // cruza módulos: se invalidan también cotizaciones, fichas 360° de
  // clientes (saldo pendiente) y la cotización individual (Servicios).
  const refreshAfterSave = async () => {
    try {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["clientSummary"] });
      queryClient.invalidateQueries({ queryKey: ["quotation"] });
      await queryClient.invalidateQueries({ queryKey: ["postventa"] });
    } catch (error) {
      console.error("Error refrescando post-venta", error);
    }
  };

  const totals = useMemo(() => {
    let pend = 0;
    let venc = 0;
    let pag = 0;
    rows.forEach((r) => {
      if (r.cancelled) return; // los anulados no cuentan en los totales
      const net = r.paid - r.refunded;
      pag += net;
      const saldo = r.total - net;
      if (r.status === "vencido") venc += saldo;
      else if (r.status === "pendiente") pend += saldo;
    });
    return { pend, venc, pag, total: pend + venc + pag };
  }, [rows]);

  // 28-07 (pedido de Felipe): orden por PRÓXIMO EVENTO por defecto —
  // lo que viene primero, arriba; lo ya pasado, al final (y además se
  // puede filtrar con "Realizado"). "Número" conserva el orden clásico.
  // Orden por columnas (pedido de Felipe 29-07, fuera el desplegable):
  // sin flecha activa = "próximos primero" (lo que viene arriba, lo
  // pasado abajo, sin fecha al final). Clic en N° o Fecha = orden puro
  // descendente; otro clic lo invierte; un tercero vuelve al orden
  // inteligente.
  const [sortCol, setSortCol] = useState<"numero" | "fecha" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (col: "numero" | "fecha") => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortCol(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      // Dos filtros que se CRUZAN: el del evento (vigente/realizado/
      // anulado) y el de la plata (pendiente/vencido/pagado). Así un
      // realizado con cuotas vencidas SÍ aparece al filtrar "Vencidos".
      // Evento sin marcar = vigentes + realizados (anulados solo con su
      // opción). Plata sin marcar = todos.
      const kind = r.cancelled ? "cancelado" : r.done ? "realizado" : "vigente";
      const matchEvent =
        eventFilter.length === 0
          ? kind !== "cancelado"
          : eventFilter.includes(kind);
      const matchMoney =
        moneyFilter.length === 0 || moneyFilter.includes(r.status);
      const matchStatus = matchEvent && matchMoney;
      // Número: exacto. Cliente/contacto: búsqueda inteligente (sin
      // tildes, palabras en cualquier orden).
      const matchSearch =
        !q ||
        String(r.quotationNumber) === q ||
        matchesSearch(q, r.clientName, r.contactPerson);
      return matchStatus && matchSearch;
    });
  }, [rows, search, eventFilter, moneyFilter]);

  const ordered = useMemo(() => {
    const valor = (r: (typeof filtered)[number]) =>
      (r.eventDate ?? "").slice(0, 10);
    if (sortCol === "numero") {
      const arr = [...filtered].sort(
        (a, b) => a.quotationNumber - b.quotationNumber,
      );
      return sortDir === "desc" ? arr.reverse() : arr;
    }
    if (sortCol === "fecha") {
      const conFecha = filtered
        .filter((r) => valor(r) !== "")
        .sort((a, b) => valor(a).localeCompare(valor(b)));
      if (sortDir === "desc") conFecha.reverse();
      return [...conFecha, ...filtered.filter((r) => valor(r) === "")];
    }
    // Sin flecha activa: próximos primero.
    const hoy = new Date().toISOString().slice(0, 10);
    const futuros = filtered
      .filter((r) => valor(r) >= hoy)
      .sort((a, b) => valor(a).localeCompare(valor(b)));
    const pasados = filtered
      .filter((r) => valor(r) !== "" && valor(r) < hoy)
      .sort((a, b) => valor(b).localeCompare(valor(a)));
    const sinFecha = filtered.filter((r) => valor(r) === "");
    return [...futuros, ...pasados, ...sinFecha];
  }, [filtered, sortCol, sortDir]);

  const pct = (paid: number, total: number) =>
    total ? Math.round((paid / total) * 100) : 0;
  const barColor = (p: number) =>
    p >= 100 ? "bg-green-500" : p > 0 ? "bg-blue-500" : "bg-gray-300";

  const openEvent = (r: EventRow) => {
    setTab("seguimiento");
    navigate(`/post-venta/${r.quotationId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const metrics = [
    { l: "Pendiente", v: totals.pend, c: "text-yellow-600", Icon: Clock },
    { l: "Pagado", v: totals.pag, c: "text-green-600", Icon: CheckCircle },
    { l: "Vencido", v: totals.venc, c: "text-red-600", Icon: AlertTriangle },
    {
      l: "Total general",
      v: totals.total,
      c: "text-blue-600",
      Icon: DollarSign,
    },
  ];

  // Ficha como página propia: si la URL trae evento, la lista no se
  // pinta (queda viva detrás, con filtros y búsqueda persistidos).
  if (routeId) {
    if (!selected) {
      // Lista fresca sin ese evento (id malo o recién anulado): volver.
      return (
        <div className="flex flex-col items-center justify-center min-h-64 gap-3">
          <p className="text-sm text-gray-500">
            No se encontró ese evento en Post-Venta.
          </p>
          <button
            type="button"
            onClick={() => navigate("/post-venta")}
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            ← Volver a Post-Venta
          </button>
        </div>
      );
    }
    return (
      <EventModal
        event={selected}
        tab={tab}
        setTab={setTab}
        onClose={() => navigate("/post-venta")}
        onDataChanged={refreshAfterSave}
        pendingReceipts={
          comprobantes.filter((r) => r.quotation_id === selected.quotationId)
            .length
        }
        onOpenReceipts={() => {
          navigate("/post-venta");
          setVerComprobantes(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="w-1/4 min-w-[210px] shrink-0">
          <h1 className="text-2xl font-bold text-gray-900">Post‑Venta</h1>
          <p className="text-sm text-gray-500">
            Eventos cerrados · seguimiento de pagos
          </p>
        </div>
        <div className="flex items-center space-x-3 flex-1">
          {/* Buscador a todo el ancho disponible (pedido de Felipe
              30-07: estaba fijo en angosto, a diferencia del de
              Cotizaciones). */}
          <div className="relative flex-1 min-w-[220px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N°, cliente o mandante…"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="min-w-[180px]">
            <MultiSelect
              options={EVENT_OPTIONS}
              value={eventFilter}
              onChange={setEventFilter}
              placeholder="Evento"
              className="w-full"
            />
          </div>
          <div className="min-w-[180px]">
            <MultiSelect
              options={MONEY_OPTIONS}
              value={moneyFilter}
              onChange={setMoneyFilter}
              placeholder="Pago"
              className="w-full"
            />
          </div>
          {comprobantes.length > 0 && (
            <button
              type="button"
              onClick={() => setVerComprobantes(true)}
              className="px-4 py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-sm font-bold hover:bg-amber-200"
              title="Comprobantes subidos por clientes desde el portal, esperando confirmación"
            >
              💸 Comprobantes ({comprobantes.length})
            </button>
          )}
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {metrics.map((m) => (
          <div
            key={m.l}
            className="bg-white p-6 rounded-lg shadow flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-gray-600">{m.l}</p>
              <p className={`text-2xl font-bold ${m.c}`}>{clp(m.v)}</p>
            </div>
            <m.Icon className={`h-8 w-8 ${m.c}`} />
          </div>
        ))}
      </div>

      {/* Events list */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">
            Eventos cerrados
          </h2>
          <span className="text-sm text-gray-500">
            {ordered.length} de {rows.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* N° y Fecha ordenan con la flecha clásica; el resto
                    son encabezados planos. Sin flecha activa, manda el
                    orden "próximos primero". */}
                {(
                  [
                    ["numero", "N° Cot."],
                    ["fecha", "Fecha evento"],
                  ] as const
                ).map(([col, label]) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={`flex items-center gap-1 uppercase tracking-wider hover:text-gray-800 ${
                        sortCol === col ? "text-gray-800 font-semibold" : ""
                      }`}
                      title={`Ordenar por ${label.toLowerCase()} (otro clic invierte; un tercero vuelve a "próximos primero")`}
                    >
                      {label}
                      <span className="w-3 text-[10px]">
                        {sortCol === col
                          ? sortDir === "desc"
                            ? "▼"
                            : "▲"
                          : ""}
                      </span>
                    </button>
                  </th>
                ))}
                {["Cliente", "Contacto", "Monto", "Estado de pago", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ordered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Sin eventos que coincidan.
                  </td>
                </tr>
              ) : (
                ordered.map((r) => {
                  const net = r.paid - r.refunded;
                  const p = pct(net, r.total);
                  return (
                    <tr
                      key={r.quotationId}
                      onClick={() => openEvent(r)}
                      className={`cursor-pointer hover:bg-gray-50 ${(() => {
                        // Un filo de color al borde izquierdo: se ve al
                        // recorrer la lista sin tener que leer fila por
                        // fila, y no ensucia el resto de la tabla.
                        const p = pendienteDe(r.quotationId);
                        if (!p) return "";
                        return p.vencido
                          ? "border-l-4 border-red-500 bg-red-50/30"
                          : "border-l-4 border-amber-400 bg-amber-50/40";
                      })()}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                        <span className="inline-flex items-center gap-1.5">
                          #{r.quotationNumber}
                          {(() => {
                            const p = pendienteDe(r.quotationId);
                            if (!p) return null;
                            // Píldora rellena, no un signo suelto: en una
                            // tabla llena de texto gris un símbolo del
                            // mismo tamaño se pierde (07-08, Felipe: "no
                            // está muy llamativa"). Roja si venció.
                            return (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${
                                  p.vencido ? "bg-red-600" : "bg-amber-500"
                                }`}
                                title={
                                  p.vencido
                                    ? `Seguimiento pendiente desde el ${p.dia.slice(8, 10)}-${p.dia.slice(5, 7)}`
                                    : "Seguimiento comprometido para hoy"
                                }
                              >
                                ⚠ {p.vencido ? "Pendiente" : "Hoy"}
                              </span>
                            );
                          })()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {fmtDate(r.eventDate)}
                        </div>
                        {r.eventEndDate && r.eventEndDate !== r.eventDate && (
                          <div className="text-xs text-gray-500">
                            al {fmtDate(r.eventEndDate)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {r.clientName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.clientType || ""}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {r.contactPerson || "—"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatPhone(r.phone)}
                        </div>
                        {r.contactEmail && (
                          <div
                            className="text-xs text-gray-500 truncate max-w-[180px]"
                            title={r.contactEmail}
                          >
                            {r.contactEmail}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {clp(r.total)}
                      </td>
                      <td className="px-6 py-4">
                        {r.cancelled ? (
                          <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-600">
                            Cancelado
                          </span>
                        ) : (
                          <>
                            {r.done && (
                              <span className="inline-block mb-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-700">
                                ✓ Realizado
                              </span>
                            )}
                            <div className="w-36 bg-gray-200 rounded-full h-2">
                              {/* La barra se llena hasta el 100%; si
                                  pagaron de más (ej. 140%), el exceso
                                  lo dice el texto, no el largo. */}
                              <div
                                className={`h-2 rounded-full ${barColor(p)}`}
                                style={{ width: `${Math.min(p, 100)}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {p}% pagado · {clp(net)}
                              {r.refunded > 0
                                ? ` · reemb. ${clp(r.refunded)}`
                                : ""}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        <ChevronRight size={18} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bandeja de comprobantes del portal (Fase 2b): confirmar
          registra el pago real; rechazar lo archiva con nota. */}
      {verComprobantes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                💸 Comprobantes por confirmar
              </h3>
              <button
                onClick={() => setVerComprobantes(false)}
                className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {comprobantes.length === 0 && (
                <p className="text-sm text-gray-500">
                  No quedan comprobantes pendientes. 🎉
                </p>
              )}
              {comprobantes.map((r) => (
                <div
                  key={r.id}
                  className="border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold text-gray-900">
                        {clp(Number(r.declared_amount))} ·{" "}
                        {r.client_contacts?.name || "Cliente"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Cot. N° {r.quotations?.quotation_number} ·{" "}
                        {r.quotations?.clients?.name} · cuota{" "}
                        {r.payments?.payment_number} · {fmtDate(r.created_at)}
                      </p>
                    </div>
                    <FileViewLink url={r.file_url} title="Ver comprobante" />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {rechazoCompId === r.id ? (
                      <>
                        <input
                          type="text"
                          value={notaRechazo}
                          onChange={(e) => setNotaRechazo(e.target.value)}
                          placeholder="Motivo (opcional)"
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                        <button
                          disabled={procesandoComp === r.id}
                          onClick={() => actuarComprobante(r.id, "rechazar")}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => {
                            setRechazoCompId(null);
                            setNotaRechazo("");
                          }}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={procesandoComp === r.id}
                          onClick={() => actuarComprobante(r.id, "confirmar")}
                          className="px-4 py-1.5 bg-green-600 text-white text-xs rounded-lg font-bold hover:bg-green-700 disabled:opacity-50"
                        >
                          {procesandoComp === r.id
                            ? "Registrando…"
                            : "Confirmar y registrar pago"}
                        </button>
                        <button
                          onClick={() => setRechazoCompId(r.id)}
                          className="px-3 py-1.5 border border-red-200 text-red-600 text-xs rounded-lg font-semibold hover:bg-red-50"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Event detail modal ----
interface EventModalProps {
  readonly event: EventRow;
  readonly tab:
    | "seguimiento"
    | "pagos"
    | "documentos"
    | "servicios"
    | "gestion"
    | "cocina";
  readonly setTab: (
    t:
      | "seguimiento"
      | "pagos"
      | "documentos"
      | "servicios"
      | "gestion"
      | "cocina",
  ) => void;
  readonly onClose: () => void;
  readonly onDataChanged: () => void;
  // Comprobantes del portal PENDIENTES de este evento (Fase 2b): el
  // aviso vive donde uno los busca — dentro del evento.
  readonly pendingReceipts?: number;
  readonly onOpenReceipts?: () => void;
}

function EventModal({
  event,
  tab,
  setTab,
  onClose,
  onDataChanged,
  pendingReceipts = 0,
  onOpenReceipts,
}: EventModalProps) {
  // Visor de comprobantes de la pestaña Pagos (03-08: mismo lenguaje
  // que Documentos — lista a la izquierda, visor al lado).
  const [compView, setCompView] = useState<{
    file_url: string;
    file_name: string;
  } | null>(null);
  const netPaid = event.paid - event.refunded;
  const saldo = event.total - netPaid;
  const p = event.total ? Math.round((netPaid / event.total) * 100) : 0;

  // Load the full quotation (items, personas, discount, comments) for the
  // Servicios tab. Vía React Query con frescura inmediata (plata): la
  // misma key ["quotation", id] que usa el visor, invalidada por
  // refreshAfterSave tras cada guardado.
  const quoteQuery = useQuery({
    queryKey: ["quotation", event.quotationId],
    staleTime: 0,
    queryFn: async (): Promise<Quotation | null> => {
      const { data } = await getQuotationById(event.quotationId);
      return data || null;
    },
  });
  const quote = quoteQuery.data ?? null;
  const qLoading = quoteQuery.isPending;

  // Precalentado del evento (03-08): apenas se abre, las pestañas lentas
  // (Gestión, Recursos, Documentos) piden lo suyo por detrás y EN
  // PARALELO. La frescura total sigue intacta — al entrar a la pestaña
  // igual se re-pregunta —, solo desaparece el "cargando" en blanco de
  // la primera visita. Recetas compartidas: las mismas que usan las
  // pestañas, así el precalentado no puede desalinearse.
  const { company: empresaPre } = useAuth();
  const clientePre = useQueryClient();
  useEffect(() => {
    const cid = empresaPre?.id ? Number(empresaPre.id) : null;
    if (!cid || !quote) return;
    void clientePre.prefetchQuery(gestionQueryOpts(cid, quote.id));
    void clientePre.prefetchQuery(recursosQueryOpts(cid, String(quote.id)));
    void clientePre.prefetchQuery(docsQueryOpts(event.quotationId));
  }, [empresaPre?.id, quote, event.quotationId, clientePre]);

  // ¿Este evento tiene un compromiso que ya venció o es hoy? Se lee del
  // mismo mapa del tablero (React Query lo comparte, no hay consulta
  // nueva) para pintar la pestaña Seguimiento en ámbar y hacerla vibrar.
  const mapaSeguimiento = useQuery({
    queryKey: ["seguimientos", "map"],
    staleTime: 0,
    queryFn: getFollowupsMap,
  });
  const pendienteAqui = (() => {
    const f = mapaSeguimiento.data?.[event.quotationId]?.next_contact_date;
    if (!f) return null;
    const h = new Date();
    const hoyISO = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
    const dia = f.slice(0, 10);
    if (dia > hoyISO) return null;
    return { dia, vencido: dia < hoyISO };
  })();

  const tabs: { key: EventModalProps["tab"]; label: string }[] = [
    // Seguimiento va PRIMERO (07-08, pedido de Felipe): es la historia
    // del evento — "si algo se olvida uno va a seguimiento y está todo".
    { key: "seguimiento", label: "Seguimiento" },
    { key: "pagos", label: "Pagos" },
    { key: "documentos", label: "Documentos" },
    { key: "servicios", label: "Servicios" },
    { key: "gestion", label: "Gestión" },
    { key: "cocina", label: "Cocina" },
  ];

  // Rectificacion de registros de pago: el lapiz edita fecha/monto/
  // comprobante de un abono mal ingresado; el basurero elimina el
  // registro (la cuota vuelve a pendiente; el backend re-cuadra el plan
  // con la regla de division del 20-07).
  const [editTx, setEditTx] = useState<PaymentTransaction | null>(null);
  const [confirmTxId, setConfirmTxId] = useState<number | null>(null);
  const [deletingTx, setDeletingTx] = useState(false);
  // Portal del cliente: feedback del botón "copiar enlace de pagos".
  const [linkCopiado, setLinkCopiado] = useState(false);
  // El PDF de la propuesta, el mismo visor de Cotizaciones (Felipe,
  // 01-09: "por si necesito imprimir la propuesta").
  const [verPdf, setVerPdf] = useState(false);
  // Teléfono y correo del contacto: en azul y pinchables para COPIAR,
  // igual que en la ficha del cliente (07-08, pedido de Felipe).
  const { copiado: datoCopiado, copiar: copiarDato } = useCopiarDato();
  // Nivel A del calendario (29-07): lapiz en la CUOTA (solo sin dinero
  // registrado) para editar fecha de vencimiento y nota. Distinto del
  // lapiz del registro de pago de mas abajo.
  const [editCuota, setEditCuota] = useState<{
    id: string;
    due_date: string;
    notes: string;
  } | null>(null);
  const [savingCuota, setSavingCuota] = useState(false);
  const [errorCuota, setErrorCuota] = useState<string | null>(null);
  const onSaveCuota = async () => {
    if (!editCuota || !editCuota.due_date) return;
    setSavingCuota(true);
    setErrorCuota(null);
    const { error } = await updatePaymentSchedule(editCuota.id, {
      due_date: editCuota.due_date,
      notes: editCuota.notes.trim(),
    });
    setSavingCuota(false);
    if (error) {
      const msg = (
        error as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setErrorCuota(
        Array.isArray(msg) ? msg.join(" ") : msg || "No se pudo guardar",
      );
      return;
    }
    setEditCuota(null);
    onDataChanged();
  };
  const onDeleteTx = async (t: PaymentTransaction) => {
    setDeletingTx(true);
    try {
      await deletePaymentTransaction(t.id);
      setConfirmTxId(null);
      onDataChanged();
    } catch {
      toast.error("No se pudo eliminar el registro. Intenta de nuevo.");
    } finally {
      setDeletingTx(false);
    }
  };

  // Anular evento: pasa la cotización a "cancelada". Sale de Post-Venta,
  // Compras y mobiliario; sus pagos y comprobantes quedan como historia.
  // Solo el administrador puede anular (los demás roles no ven el botón).
  const { userRole } = useAuth();
  const canCancel = userRole === "administrador";
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Anular pide su motivo (migración 61): un evento que se cae enseña
  // tanto como uno que se gana, si queda registrado por qué.
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const doCancelEvent = async (motivo?: string) => {
    if (!motivo) {
      setPidiendoMotivo(true);
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await updateQuotation(
        {
          quotation_status: QuotationStatus.CANCELADA,
          loss_reason: motivo,
        } as never,
        event.quotationId,
      );
      onDataChanged();
      onClose();
    } catch {
      setCancelError("No se pudo anular el evento. Intenta de nuevo.");
    } finally {
      setCancelling(false);
      setPidiendoMotivo(false);
    }
  };

  // Marcar realizado: cualquier rol operativo. El backend cambia el estado y
  // envía la encuesta de satisfacción al cliente (una sola vez).
  const [confirmDone, setConfirmDone] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [doneNotice, setDoneNotice] = useState<string | null>(null);
  // El unicornio de Eventia: se celebra SOLO en el momento de marcar
  // realizado (no cada vez que se abre el evento).
  const [celebrar, setCelebrar] = useState(false);
  const [confirmUndone, setConfirmUndone] = useState(false);
  const [undoingDone, setUndoingDone] = useState(false);
  const doUnmarkDone = async () => {
    setUndoingDone(true);
    try {
      await unmarkEventDone(event.quotationId);
      toast.success(
        "El evento volvió a pendiente. La encuesta ya enviada no se toca " +
          "(y si lo vuelves a marcar, no se reenvía).",
      );
      setConfirmUndone(false);
      onDataChanged();
    } catch {
      toast.error("No se pudo volver a pendiente. Intenta de nuevo.");
    } finally {
      setUndoingDone(false);
    }
  };
  const [doneError, setDoneError] = useState<string | null>(null);
  // AVISO DE FACTURA (Felipe 28-08): marcar realizado sin su factura
  // cargada es plata sin respaldo. Se consulta al abrir la pregunta.
  // MISMA consulta que la pestaña Documentos (misma clave: react-query
  // la comparte). Corre al abrir la ficha, así el aviso ya está listo
  // cuando se aprieta — antes tardaba un segundo (Felipe 28-08).
  const facturasQuery = useQuery(docsQueryOpts(event.quotationId));
  const sinFactura =
    facturasQuery.isSuccess &&
    !facturasQuery.data.some((d) => d.category === "facturas");
  const doMarkDone = async () => {
    setMarkingDone(true);
    setDoneError(null);
    try {
      const res = await markEventDone(event.quotationId);
      let encuesta: string;
      if (res.survey_sent) {
        encuesta = "Se envió la encuesta de satisfacción al cliente.";
      } else if (res.survey_already_sent) {
        encuesta = "La encuesta ya se había enviado antes, no se reenvió.";
      } else {
        encuesta =
          "No hay correo para el contacto de esta cotización, así que la encuesta no se envió. Puedes agregarle correo en Gestión de Clientes.";
      }
      const saldoTxt =
        saldo > 0
          ? ` Ojo: quedan ${clp(saldo)} por cobrar de este evento.`
          : "";
      setDoneNotice(`Evento marcado como realizado. ${encuesta}${saldoTxt}`);
      setConfirmDone(false);
      setCelebrar(true);
      onDataChanged();
    } catch {
      setDoneError(
        "No se pudo marcar el evento como realizado. Intenta de nuevo.",
      );
    } finally {
      setMarkingDone(false);
    }
  };

  return (
    <div className="">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold mb-3"
      >
        ← Volver a Post-Venta
      </button>
      <div className="bg-white rounded-2xl w-full shadow flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between p-6 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                {event.clientName}
              </h2>
              {event.clientType && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  {event.clientType}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Cotización #{event.quotationNumber}
              {event.hasContract ? " · 📄 con contrato" : ""}
            </p>
            {/* Apilados bajo el nombre (07-08, pedido de Felipe): así
                cada dato tiene su línea y el ícono vuelve a servir de
                etiqueta, como en la ficha del cliente. En línea corrida
                los íconos sobraban; apilados, orientan. */}
            <div className="mt-1 text-sm text-gray-500">
              {/* Un guion cuando no hay mandante: la cotización se
                  ve igual de completa y se nota que ese dato falta. Las
                  nuevas ya no pueden nacer así —el cotizador lo exige—
                  pero las viejas siguen existiendo (07-08). */}
              <p>{event.contactPerson || "—"}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                {event.phone && (
                  <button
                    type="button"
                    // El número CRUDO: los espacios del formateado rompen
                    // al pegarlo en un marcador.
                    onClick={() => void copiarDato("tel", event.phone || "")}
                    title="Copiar teléfono"
                    className="flex w-fit items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <Phone size={13} className="shrink-0" />
                    {formatPhone(event.phone)}
                    <span className="inline-block w-3 text-green-600">
                      {datoCopiado === "tel" ? "✓" : ""}
                    </span>
                  </button>
                )}
                {event.contactEmail && (
                  <button
                    type="button"
                    onClick={() =>
                      void copiarDato("mail", event.contactEmail || "")
                    }
                    title="Copiar correo"
                    className="flex w-fit items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <Mail size={13} className="shrink-0" />
                    {event.contactEmail}
                    <span className="inline-block w-3 text-green-600">
                      {datoCopiado === "mail" ? "✓" : ""}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!event.cancelled &&
              (event.done ? (
                <span className="flex items-center gap-2">
                  {/* La puerta de vuelta vive EN la píldora (estilo de
                      la casa): solo admin puede pincharla; para el
                      resto es una etiqueta inerte. La encuesta ya
                      enviada no se reenvía al re-marcar. */}
                  {userRole === "administrador" ? (
                    <button
                      onClick={() => setConfirmUndone((v) => !v)}
                      className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      title="¿Marcado por error? Pincha para volverlo a pendiente"
                    >
                      ✓ REALIZADO
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">
                      ✓ REALIZADO
                    </span>
                  )}
                  {confirmUndone && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600">
                        ¿Volver a pendiente?
                      </span>
                      <button
                        disabled={undoingDone}
                        onClick={doUnmarkDone}
                        className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50"
                      >
                        Sí
                      </button>
                      <button
                        disabled={undoingDone}
                        onClick={() => setConfirmUndone(false)}
                        className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200"
                      >
                        No
                      </button>
                    </span>
                  )}
                </span>
              ) : confirmDone ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-700">
                    ¿Marcar como realizado? Se enviará la encuesta al contacto
                    de la cotización.
                    {sinFactura && (
                      <b className="block text-amber-700">
                        Ojo: este evento no tiene ninguna factura cargada en
                        Documentos.
                      </b>
                    )}
                  </span>
                  <button
                    disabled={markingDone}
                    onClick={doMarkDone}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Sí, realizado
                  </button>
                  <button
                    disabled={markingDone}
                    onClick={() => {
                      setConfirmDone(false);
                      setDoneError(null);
                    }}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setConfirmDone(true);
                    setConfirmCancel(false);
                  }}
                  className="px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-50"
                >
                  Marcar realizado
                </button>
              ))}
            {event.cancelled ? (
              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-200 text-gray-600">
                CANCELADO
              </span>
            ) : !canCancel ||
              confirmDone ||
              event.done ? null : confirmCancel ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  ¿Anular este evento?
                </span>
                <button
                  disabled={cancelling}
                  onClick={() => void doCancelEvent()}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                >
                  Sí, anular
                </button>
                <button
                  disabled={cancelling}
                  onClick={() => {
                    setConfirmCancel(false);
                    setCancelError(null);
                  }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setConfirmCancel(true);
                  setConfirmDone(false);
                }}
                className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50"
              >
                Anular evento
              </button>
            )}
            {event.portalToken && (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/portal/${event.portalToken}`,
                    );
                    setLinkCopiado(true);
                    setTimeout(() => setLinkCopiado(false), 2000);
                  } catch {
                    /* portapapeles bloqueado: no se rompe nada */
                  }
                }}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1"
                title="Copiar el enlace del portal de pagos del cliente (para mandárselo por WhatsApp o correo)"
              >
                {linkCopiado ? (
                  <CheckCircle size={13} className="text-green-600" />
                ) : (
                  <Link2 size={13} />
                )}
                {linkCopiado ? "Copiado" : "Enlace de pagos"}
              </button>
            )}
            <button
              onClick={() => setVerPdf(true)}
              disabled={!quote}
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50"
              title="Ver e imprimir el documento de la propuesta"
            >
              <FileText size={13} /> PDF
            </button>
          </div>
        </div>
        {cancelError && (
          <p className="shrink-0 px-6 pt-2 text-sm text-red-600">
            {cancelError}
          </p>
        )}
        {doneError && (
          <p className="shrink-0 px-6 pt-2 text-sm text-red-600">{doneError}</p>
        )}
        {verPdf && quote && (
          <QuotationViewer
            quotation={quote as unknown as QuotationWithClient}
            onClose={() => setVerPdf(false)}
          />
        )}
        {pidiendoMotivo && (
          <MotivoPerdida
            tipo="anulacion"
            guardando={cancelling}
            onCancelar={() => setPidiendoMotivo(false)}
            onConfirmar={(motivo) => void doCancelEvent(motivo)}
          />
        )}
        {celebrar && (
          <CelebracionRealizada
            cliente={event.clientName}
            tipoEvento={String(quote?.event_type || "") || undefined}
            personas={Number(quote?.people_count || 0) || undefined}
            monto={event.total}
            diasGestion={(() => {
              const c = quote?.created_at
                ? new Date(String(quote.created_at)).getTime()
                : NaN;
              const e = event.eventDate
                ? new Date(
                    `${String(event.eventDate).slice(0, 10)}T00:00:00Z`,
                  ).getTime()
                : NaN;
              return Number.isFinite(c) && Number.isFinite(e)
                ? Math.max(0, Math.round((e - c) / 86400000))
                : null;
            })()}
            onClose={() => setCelebrar(false)}
          />
        )}
        {doneNotice && (
          <div
            className={`shrink-0 mx-6 mt-3 rounded-lg border px-4 py-2.5 text-sm ${
              doneNotice.includes("por cobrar")
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {doneNotice}
          </div>
        )}
        {/* Sugerencia: el evento ya pasó y sigue sin marcarse realizado */}
        {!event.done &&
          !event.cancelled &&
          !doneNotice &&
          quote?.event_date &&
          String(quote.event_end_date || quote.event_date).slice(0, 10) <
            todayISO() && (
            <p className="shrink-0 px-6 pt-2 text-xs text-amber-700">
              Este evento ya pasó ({fmtDate(String(quote.event_date))}
              {quote.event_end_date &&
              String(quote.event_end_date) !== String(quote.event_date)
                ? ` al ${fmtDate(String(quote.event_end_date))}`
                : ""}
              ): cuando corresponda, márcalo como realizado.
            </p>
          )}

        {/* Las cajitas del evento: pieza única compartida con la ficha
            del negocio (diseño de Felipe 04-08) — trae al encabezado la
            fecha (editable) que antes ni se mostraba. */}
        {quote && (
          <EventoCajitas
            puedeEditarFecha={!esEventoCongelado(quote.quotation_status)}
            quotationId={event.quotationId}
            tipo={String(quote.event_type || "")}
            fechaInicio={quote.event_date}
            fechaFin={quote.event_end_date}
            adultos={Math.max(
              0,
              (quote.people_count || 0) - (quote.children_count || 0),
            )}
            ninos={quote.children_count || 0}
            monto={event.total}
            pagado={netPaid}
            saldo={saldo}
            onFechaGuardada={onDataChanged}
          />
        )}

        {/* Pestañas PEGAJOSAS (03-08): la página scrollea natural y
            estas se quedan arriba. El chip de saldo acompaña siempre. */}
        <div className="shrink-0 flex gap-1 px-6 border-b border-gray-200 items-center sticky top-0 bg-white z-30 rounded-t-2xl">
          {tabs.map((t) => {
            // La pestaña Seguimiento avisa sola cuando hay algo
            // pendiente (07-08, pedido de Felipe): se pinta de ámbar
            // —rojo si venció— y tiembla tres veces al abrir el evento.
            // Deja de temblar cuando uno ya está parado en ella: el
            // aviso cumplió su trabajo.
            const alerta = t.key === "seguimiento" && pendienteAqui;
            const activa = tab === t.key;
            const color = alerta
              ? pendienteAqui.vencido
                ? activa
                  ? "text-red-700 border-red-500"
                  : "text-red-700 border-transparent hover:text-red-800"
                : activa
                  ? "text-amber-700 border-amber-500"
                  : "text-amber-700 border-transparent hover:text-amber-800"
              : activa
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 border-transparent hover:text-gray-700";
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-semibold border-b-2 ${color} ${
                  alerta && !activa ? "animate-vibrar" : ""
                }`}
                title={
                  alerta
                    ? pendienteAqui.vencido
                      ? `Seguimiento pendiente desde el ${pendienteAqui.dia.slice(8, 10)}-${pendienteAqui.dia.slice(5, 7)}`
                      : "Seguimiento comprometido para hoy"
                    : undefined
                }
              >
                {t.label}
                {alerta && <span className="ml-1.5">⚠</span>}
              </button>
            );
          })}
          <span
            className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${saldo > 0 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-700"}`}
            title="Saldo pendiente del evento"
          >
            Saldo {clp(saldo)}
          </span>
        </div>

        {/* Panels */}
        <div className="p-6 flex-1">
          {tab === "seguimiento" && quote && (
            /* EL MISMO panel de la ficha del negocio: un solo hilo con
               la historia completa, y los respaldos comerciales pegados
               a él. Acá tipo y próximo contacto NO son obligatorios —lo
               decide el propio panel por el estado— pero si se anota una
               fecha, vence y avisa. */
            <div className="grid gap-5 lg:grid-cols-2 items-start">
              <HiloSeguimiento quotation={quote} />
              <AdjuntosComerciales quotationId={event.quotationId} />
            </div>
          )}
          {tab === "pagos" && (
            <div className="space-y-6">
              {/* Los montos viven arriba en las cajitas del evento
                  (04-08); aquí queda el progreso de cuotas. */}
              {/* Progress */}
              <div className="pt-1">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-green-400 to-green-600"
                    style={{ width: `${Math.min(p, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                  <span>{p}% pagado</span>
                  <span>
                    {event.cuotas} cuota{event.cuotas === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {pendingReceipts > 0 && (
                <button
                  type="button"
                  onClick={onOpenReceipts}
                  className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <span>
                    💸 Este evento tiene {pendingReceipts} comprobante
                    {pendingReceipts === 1 ? "" : "s"} del portal por confirmar
                  </span>
                  <span className="underline">Revisar</span>
                </button>
              )}
              {/* Dos columnas en pantallas anchas (03-08): calendario
                  protagonista a la izquierda; registrar y reembolsos en
                  la lateral. En pantalla chica se apilan igual que antes. */}
              <RegistrarPagoPanel event={event} onChanged={onDataChanged} />
              <div className="grid gap-6 lg:grid-cols-[1fr_420px] items-start">
                {/* Columna izquierda: calendario + reembolsos al final */}
                <div className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-gray-800">
                      Calendario de pagos
                    </h4>
                    {event.payments.map((pay) => {
                      const cp = pay.amount
                        ? Math.round(
                            ((pay.paid_amount || 0) / pay.amount) * 100,
                          )
                        : 0;
                      const txs = pay.transactions || [];
                      // Registro de pago con sus acciones: ver comprobante,
                      // rectificar (lapiz) y eliminar (basurero). El lapiz y
                      // el basurero son del REGISTRO, nunca de la cuota.
                      const txActions = (t: PaymentTransaction) =>
                        confirmTxId === t.id ? (
                          <ConfirmInline
                            question="¿Eliminar este registro?"
                            onYes={() => onDeleteTx(t)}
                            onNo={() => setConfirmTxId(null)}
                            busy={deletingTx}
                          />
                        ) : (
                          <span className="flex items-center gap-3 shrink-0">
                            {t.receipt_photo_url && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCompView({
                                    file_url: t.receipt_photo_url!,
                                    file_name: `Comprobante · ${clp(t.amount)} · ${fmtDate(t.transaction_date)}`,
                                  })
                                }
                                className="text-sm font-semibold text-blue-600 hover:underline"
                              >
                                Ver
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditTx(t)}
                              className="text-gray-400 hover:text-blue-600"
                              title="Rectificar registro (fecha, monto o comprobante)"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmTxId(t.id)}
                              className="text-gray-400 hover:text-red-600"
                              title="Eliminar registro (la cuota vuelve a pendiente)"
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        );
                      return (
                        <div
                          key={pay.id}
                          className="p-3 border border-gray-200 rounded-xl"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center font-bold text-sm">
                                {pay.payment_number}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-gray-900">
                                    {clp(pay.amount)}
                                  </div>
                                  {statusBadge(cuotaStatus(pay))}
                                  {txs.length === 0 &&
                                    cuotaStatus(pay) !== "pagado" &&
                                    editCuota?.id !== pay.id && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setErrorCuota(null);
                                          setEditCuota({
                                            id: pay.id,
                                            due_date: (
                                              pay.due_date || ""
                                            ).slice(0, 10),
                                            notes: pay.notes || "",
                                          });
                                        }}
                                        className="text-gray-400 hover:text-blue-600"
                                        title="Editar fecha de vencimiento y nota de la cuota"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                    )}
                                </div>
                                <div
                                  className="text-xs text-gray-500 truncate max-w-md"
                                  title={
                                    txs.length === 1 && txs[0].notes
                                      ? txs[0].notes
                                      : undefined
                                  }
                                >
                                  {pay.status === "pagado"
                                    ? fmtDate(pay.last_payment_date)
                                    : `Vence ${fmtDate(pay.due_date)}`}
                                  {cp > 0 && cp < 100
                                    ? ` · abonado ${clp(pay.paid_amount)} de ${clp(pay.amount)}`
                                    : ""}
                                  {txs.length === 1 && txs[0].notes
                                    ? ` · ${txs[0].notes}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                            {txs.length === 1 && (
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span>{txs[0].payment_method || "—"}</span>
                                {txActions(txs[0])}
                              </div>
                            )}
                          </div>
                          {editCuota?.id === pay.id && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                value={editCuota.due_date}
                                onChange={(e) =>
                                  setEditCuota(
                                    (p) =>
                                      p && { ...p, due_date: e.target.value },
                                  )
                                }
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <input
                                type="text"
                                value={editCuota.notes}
                                onChange={(e) =>
                                  setEditCuota(
                                    (p) => p && { ...p, notes: e.target.value },
                                  )
                                }
                                placeholder="Nota (opcional)"
                                className="flex-1 min-w-40 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <button
                                type="button"
                                disabled={savingCuota || !editCuota.due_date}
                                onClick={onSaveCuota}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingCuota ? "…" : "Guardar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditCuota(null);
                                  setErrorCuota(null);
                                }}
                                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold hover:bg-gray-200"
                              >
                                Cancelar
                              </button>
                              {errorCuota && (
                                <p className="w-full text-xs text-red-600">
                                  {errorCuota}
                                </p>
                              )}
                            </div>
                          )}
                          {txs.length > 1 && (
                            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                              {txs.map((t) => (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between pl-13 text-xs text-gray-600"
                                >
                                  <span
                                    className="pl-[52px] truncate max-w-lg"
                                    title={t.notes || undefined}
                                  >
                                    {fmtDate(t.transaction_date)} ·{" "}
                                    {t.payment_method || "—"} ·{" "}
                                    <span className="font-semibold text-gray-800">
                                      {clp(t.amount)}
                                    </span>
                                    {t.notes ? ` · ${t.notes}` : ""}
                                  </span>
                                  {txActions(t)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <ReembolsosManager
                    quotationId={event.quotationId}
                    onChanged={onDataChanged}
                  />
                </div>
                {/* mt-8 en ancho: alinea el visor con la PRIMERA cuota
                  (el título "Calendario de pagos" mide ese alto). */}
                <div className="lg:mt-8">
                  <DocViewerPanel
                    doc={compView}
                    emptyText="Aprieta 'Ver' en un registro para ver su comprobante aquí."
                  />
                </div>
              </div>
              {editTx && (
                <EditRegistroModal
                  tx={editTx}
                  quotationId={event.quotationId}
                  onClose={() => setEditTx(null)}
                  onSaved={() => {
                    setEditTx(null);
                    onDataChanged();
                  }}
                />
              )}
            </div>
          )}

          {tab === "documentos" && (
            <DocumentosTab quotationId={event.quotationId} />
          )}

          {tab === "gestion" &&
            (qLoading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : quote ? (
              <GestionTab quote={quote} />
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">
                No se pudo cargar la cotización del evento.
              </p>
            ))}

          {tab === "cocina" &&
            (qLoading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : quote ? (
              <CocinaTab quote={quote} />
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">
                No se pudo cargar la cotización del evento.
              </p>
            ))}

          {tab === "servicios" &&
            (qLoading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : quote ? (
              <ServiciosTab
                quote={quote}
                paidAmount={event.paid}
                onSaved={onDataChanged}
              />
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">
                No se pudieron cargar los servicios de la cotización.
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

// ---- Registrar pago con derrame (vive en la pestaña Pagos) ----
function RegistrarPagoPanel({
  event,
  onChanged,
}: {
  readonly event: EventRow;
  readonly onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  // Cuotas con saldo, de la más próxima (menor número) hacia adelante.
  const pending = event.payments
    .map((p) => ({
      id: p.id,
      number: p.payment_number,
      remaining: (p.amount || 0) - (p.paid_amount || 0),
    }))
    .filter((p) => p.remaining > 0);
  const maxAmount = pending.reduce((s, p) => s + p.remaining, 0);

  // Vista previa del derrame: cómo se repartirá el monto entre las
  // cuotas. Solo se calcula con un monto válido (si excede el saldo, el
  // panel se esconde en vez de mostrar repartos imposibles).
  const preview: { number: number; portion: number; fills: boolean }[] = [];
  let left = Math.min(amount || 0, maxAmount);
  for (const p of pending) {
    if (left <= 0) break;
    const portion = Math.min(p.remaining, left);
    preview.push({
      number: p.number,
      portion,
      fills: portion === p.remaining,
    });
    left -= portion;
  }

  if (maxAmount <= 0) return null;

  const reset = () => {
    setAmount(0);
    setDate(todayISO());
    setMethod(PAYMENT_METHODS[0]);
    setNotes("");
    setFile(null);
    setErr(null);
    setArrastrando(false);
    profundidadDrag.current = 0;
  };

  // Un solo recibidor para botón y arrastre (revisión 10-08): valida
  // tipo y tamaño AL LLEGAR el archivo, no recién al enviar.
  const profundidadDrag = useRef(0);
  const recibirComprobante = (f: File | null | undefined) => {
    if (!f) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) {
      setErr("El comprobante debe ser imagen o PDF.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setErr("El comprobante no puede superar los 5 MB.");
      return;
    }
    setErr(null);
    setFile(f);
  };
  // Red de seguridad (revisión 10-08): un archivo soltado FUERA del
  // panel no debe navegar la pestaña al archivo (perdería el formulario).
  useEffect(() => {
    const frenar = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", frenar);
    window.addEventListener("drop", frenar);
    return () => {
      window.removeEventListener("dragover", frenar);
      window.removeEventListener("drop", frenar);
    };
  }, []);

  // Monto válido: mayor que cero y hasta el saldo pendiente. Mientras
  // no lo sea, el botón queda bloqueado (el campo vibra y avisa).
  const amountValid = !!amount && amount > 0 && amount <= maxAmount;

  const submit = async () => {
    if (!amountValid) return;
    setSaving(true);
    setErr(null);
    try {
      let receipt_photo_url: string | undefined;
      if (file) {
        const up = await uploadPaymentReceipt(
          file,
          event.quotationId,
          pending[0].id,
        );
        if (!up.success)
          throw new Error(up.error || "No se pudo subir el comprobante");
        receipt_photo_url = up.url;
      }
      await createOverflowPayment({
        quotation_id: event.quotationId,
        amount: Math.round(amount),
        payment_method: method,
        transaction_date: date,
        notes: notes || undefined,
        receipt_photo_url,
      });
      toast.success(
        `Pago de ${clp(amount)} registrado${
          preview.length > 1 ? ` (repartido en ${preview.length} cuotas)` : ""
        }.`,
      );
      reset();
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          + Registrar pago
        </button>
      ) : (
        <div
          className={`border rounded-xl p-4 space-y-3 max-w-2xl transition-colors ${
            arrastrando
              ? "border-blue-400 border-dashed bg-blue-50/60"
              : "border-blue-200 bg-blue-50/40"
          }`}
          onDragEnter={(e) => {
            // Contador de profundidad: sobrevive a Safari (relatedTarget
            // nulo) y a los cruces por hijos, sin parpadeo. Solo se
            // enciende con ARCHIVOS (no con texto o enlaces arrastrados).
            e.preventDefault();
            if (!e.dataTransfer.types?.includes("Files")) return;
            profundidadDrag.current += 1;
            setArrastrando(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            profundidadDrag.current = Math.max(0, profundidadDrag.current - 1);
            if (profundidadDrag.current === 0) setArrastrando(false);
          }}
          onDrop={(e) => {
            // Soltar el comprobante en cualquier parte del panel
            // (mismo gesto de los respaldos comerciales).
            e.preventDefault();
            profundidadDrag.current = 0;
            setArrastrando(false);
            const sueltos = Array.from(e.dataTransfer.files || []);
            recibirComprobante(sueltos[0]);
            if (sueltos.length > 1)
              toast.warn(
                `Se tomó "${sueltos[0].name}". El comprobante va de a uno.`,
              );
          }}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-800">Registrar pago</h4>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setArrastrando(false);
                profundidadDrag.current = 0;
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Monto
              </label>
              <NumberInput
                value={amount || undefined}
                onChange={(v) => setAmount(v || 0)}
                min={0}
                max={maxAmount}
                formatThousands
                currency
                placeholder="0"
                className="text-right"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">
                Saldo pendiente: {clp(maxAmount)}
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Fecha
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600">
                Medio de pago
              </label>
              <SelectWithSearch
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                value={method}
                onChange={setMethod}
                placeholder="Medio de pago"
                searchPlaceholder="Buscar medio…"
                noResultsText="Sin resultados"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">
              Comprobante{" "}
              <span className="font-normal text-gray-400">
                (imagen o PDF · máx. 5 MB)
              </span>
            </label>
            <div className="mt-1.5 flex items-center gap-2.5">
              <label className="cursor-pointer shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
                Seleccionar archivo
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    recibirComprobante(e.target.files?.[0]);
                    // Valor limpio: re-elegir el MISMO archivo vuelve a sonar.
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <span
                className={
                  arrastrando
                    ? "text-xs font-bold text-blue-600"
                    : "text-xs text-gray-400"
                }
              >
                {arrastrando ? "¡Suéltalo aquí! ↓" : "o arrastra aquí"}
              </span>
            </div>
            {file && (
              <p className="text-xs text-gray-600 truncate mt-1">
                Listo para subir: <b className="text-gray-800">{file.name}</b>
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              placeholder="Información adicional…"
            />
          </div>

          {/* Vista previa del derrame (solo con monto válido) */}
          {amountValid && preview.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-[11px] font-bold uppercase text-gray-500 mb-1.5">
                Así se repartirá el pago
              </p>
              {preview.map((pv) => (
                <div
                  key={pv.number}
                  className="flex justify-between text-xs py-0.5"
                >
                  <span className="text-gray-600">
                    Cuota {pv.number}
                    {pv.fills ? (
                      <span className="ml-1.5 text-green-600 font-semibold">
                        → queda pagada
                      </span>
                    ) : (
                      <span className="ml-1.5 text-gray-400">→ abono</span>
                    )}
                  </span>
                  <span className="font-medium">{clp(pv.portion)}</span>
                </div>
              ))}
            </div>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm text-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || !amountValid}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? "Guardando…"
                : amountValid
                  ? `Registrar ${clp(amount)}`
                  : "Registrar pago"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Reembolsos: gestión/registro (vive en la pestaña Pagos) ----
// ---- Rectificar un registro de pago (fecha, monto, comprobante) ----
// Regla de cuadratura del backend: si el monto editado deja la cuota a
// medias, la cuota se divide; si la deja exacta, queda pagada. Un monto
// mayor que la cuota se rechaza con guia (eliminar y re-registrar).
function EditRegistroModal({
  tx,
  quotationId,
  onClose,
  onSaved,
}: {
  readonly tx: PaymentTransaction;
  readonly quotationId: string;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [amount, setAmount] = useState<number>(tx.amount);
  const [date, setDate] = useState<string>(
    String(tx.transaction_date || "").slice(0, 10),
  );
  const [method, setMethod] = useState<string>(
    tx.payment_method || PAYMENT_METHODS[0],
  );
  const [nota, setNota] = useState<string>(tx.notes || "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!amount || amount <= 0) {
      setErr("El monto debe ser mayor que cero.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let receipt = tx.receipt_photo_url || undefined;
      if (file) {
        const up = await uploadPaymentReceipt(
          file,
          quotationId,
          tx.payment_id,
          tx.id,
        );
        if (!up.success || !up.url) {
          throw new Error(up.error || "No se pudo subir el comprobante");
        }
        receipt = up.url;
      }
      await updatePaymentTransaction(tx.id, {
        amount,
        payment_method: method,
        transaction_date: date,
        notes: nota.trim() || undefined,
        receipt_photo_url: receipt,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900">Rectificar registro</h4>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">Monto</label>
            <NumberInput
              value={amount || undefined}
              onChange={(v) => setAmount(v || 0)}
              min={0}
              formatThousands
              currency
              placeholder="0"
              className="text-right"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">
              Fecha de pago
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">
            Medio de pago
          </label>
          <SelectWithSearch
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            value={method}
            onChange={setMethod}
            placeholder="Medio de pago"
            searchPlaceholder="Buscar medio…"
            noResultsText="Sin resultados"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Nota</label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Información adicional…"
            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">
            Reemplazar comprobante{" "}
            <span className="font-normal text-gray-400">
              (opcional · imagen o PDF · máx. 5 MB)
            </span>
          </label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-xs mt-1"
          />
          {tx.receipt_photo_url && !file && (
            <p className="text-[11px] text-gray-400 mt-1">
              Si no eliges archivo, se conserva el comprobante actual.
            </p>
          )}
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReembolsosManager({
  quotationId,
  onChanged,
}: {
  readonly quotationId: string;
  readonly onChanged: () => void;
}) {
  // Reembolsos (plata): frescura inmediata; el prefijo ["postventa"]
  // hace que refreshAfterSave también los refresque.
  const queryClient = useQueryClient();
  const refundsQuery = useQuery({
    queryKey: ["postventa", "refunds", quotationId],
    staleTime: 0,
    queryFn: () => getRefundsByQuotation(quotationId),
  });
  const refunds = refundsQuery.data ?? [];
  const loading = refundsQuery.isPending;

  const load = () => {
    queryClient.invalidateQueries({
      queryKey: ["postventa", "refunds", quotationId],
    });
  };

  // Tras registrar: recarga la lista y refresca el evento (saldo / KPIs).
  const afterRefund = () => {
    load();
    onChanged();
  };

  return (
    <div className="space-y-3 border-t border-gray-200 pt-5">
      <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
        <Undo2 size={15} className="text-red-500" /> Reembolsos
      </h4>
      {loading ? (
        <div className="py-4 flex justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500" />
        </div>
      ) : refunds.length === 0 ? (
        <p className="text-sm text-gray-500">
          Sin reembolsos. Se generan automáticamente si el total baja por debajo
          de lo ya pagado; aquí los registras con fecha, medio de pago y
          comprobante.
        </p>
      ) : (
        refunds.map((r) => (
          <RefundRow
            key={r.id}
            refund={r}
            quotationId={quotationId}
            onDone={afterRefund}
          />
        ))
      )}
    </div>
  );
}

// ---- Fila de reembolso con formulario de registro ----
function RefundRow({
  refund,
  quotationId,
  onDone,
}: {
  readonly refund: Refund;
  readonly quotationId: string;
  readonly onDone: () => void;
}) {
  const registered = refund.is_paid;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(refund.refund_date || todayISO());
  const [method, setMethod] = useState(
    refund.payment_method || PAYMENT_METHODS[0],
  );
  const [amount, setAmount] = useState<number>(refund.amount || 0);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      let receipt_url = refund.receipt_url || null;
      if (file) {
        const up = await uploadRefundReceipt(file, quotationId, refund.id);
        if (!up.success)
          throw new Error(up.error || "No se pudo subir el comprobante");
        receipt_url = up.url || null;
      }
      const { error } = await registerRefund(refund.id, {
        amount: Math.round(amount || 0),
        refund_date: date,
        payment_method: method,
        receipt_url,
      });
      if (error) throw error;
      setOpen(false);
      onDone();
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "No se pudo registrar el reembolso",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-red-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-3 bg-red-50">
        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">
          Reembolso
        </span>
        <div className="flex-1">
          <div className="font-semibold text-sm text-gray-900">
            {clp(refund.amount)}
            {registered && refund.refund_date
              ? ` · ${fmtDate(refund.refund_date)}`
              : ""}
          </div>
          <div className="text-xs text-gray-500">
            {registered
              ? refund.payment_method || "—"
              : "Pendiente de registrar"}
          </div>
        </div>
        {registered && refund.receipt_url && (
          <FileViewLink
            url={refund.receipt_url}
            title={`Comprobante de reembolso · ${clp(refund.amount)}`}
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
            registered
              ? "text-red-600 hover:bg-red-100"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          {registered ? "Editar" : "Registrar"}
        </button>
      </div>
      {open && (
        <div className="p-3 border-t border-red-200 bg-white space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Fecha
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Medio de pago
              </label>
              <SelectWithSearch
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                value={method}
                onChange={setMethod}
                placeholder="Medio de pago"
                searchPlaceholder="Buscar medio…"
                noResultsText="Sin resultados"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Monto
              </label>
              <NumberInput
                value={amount || undefined}
                onChange={(v) => setAmount(v || 0)}
                min={0}
                formatThousands
                placeholder="0"
                className="text-right"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Comprobante{" "}
                <span className="font-normal text-gray-400">
                  (imagen o PDF · máx. 5 MB)
                </span>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-semibold hover:file:bg-gray-200"
              />
              {file && (
                <p className="text-xs text-gray-600 truncate mt-1">
                  Listo para subir: <b className="text-gray-800">{file.name}</b>
                </p>
              )}
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm text-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar reembolso"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Documentos del evento (Etapa 2 del rediseño, 03-08): UN botón
// de subida que pregunta la categoría al elegir el archivo, lista
// agrupada a la izquierda (categorías vacías ocultas) y VISOR embebido
// al lado — se acabó abrir una ventanita por cada documento. ----
// Receta compartida con el precalentado del evento (03-08).
const docsQueryOpts = (quotationId: string) => ({
  queryKey: ["postventa", "docs", quotationId],
  staleTime: 0,
  queryFn: () => getDocumentsByQuotation(quotationId),
});

function DocumentosTab({ quotationId }: { readonly quotationId: string }) {
  const queryClient = useQueryClient();
  const docsQuery = useQuery(docsQueryOpts(quotationId));
  // Los respaldos COMERCIALES no viven acá: son de la conversación y
  // solo tienen sentido pegados a la nota que los explica, en la
  // pestaña Seguimiento (07-08, pillada de Felipe). Documentos es el
  // archivador de lo contractual: contratos, órdenes y facturas.
  const docs = (docsQuery.data ?? []).filter((d) => d.category !== "comercial");
  const loading = docsQuery.isPending;
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Tarjeta única de subida, calcada del panel "Registrar pago"
  // (pedido de Felipe 03-08: sin proceso de pasos — todo junto).
  const [upOpen, setUpOpen] = useState(false);
  const [upCat, setUpCat] = useState<string>("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upArrastrando, setUpArrastrando] = useState(false);
  const profundidadDragDoc = useRef(0);
  // Recibidor único (revisión 10-08): valida al llegar; ocupado = no recibe.
  const recibirDocumento = (f: File | null | undefined) => {
    if (!f || subiendo) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) {
      toast.error("El documento debe ser imagen o PDF.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("El documento no puede superar los 5 MB.");
      return;
    }
    setUpFile(f);
  };
  // Red de seguridad (revisión 10-08): un archivo soltado FUERA del
  // panel no debe navegar la pestaña al archivo (perdería el formulario).
  useEffect(() => {
    const frenar = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", frenar);
    window.addEventListener("drop", frenar);
    return () => {
      window.removeEventListener("dragover", frenar);
      window.removeEventListener("drop", frenar);
    };
  }, []);

  const [upComment, setUpComment] = useState("");
  // Documento seleccionado para el visor.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // El visor NO carga nada solo (regla de Felipe: mirar es opcional,
  // no un peaje de navegación). Solo "Ver" lo alimenta.
  const selected = docs.find((d) => d.id === selectedId) || null;
  // ¿La etiqueta guardada es un comentario humano o un nombre crudo de
  // archivo? Los crudos (con extensión) no se muestran en la fila.
  const esComentario = (nombre: string) =>
    !/\.(pdf|jpe?g|png|webp|gif|heic)$/i.test(nombre.trim());

  const load = () => {
    queryClient.invalidateQueries({
      queryKey: ["postventa", "docs", quotationId],
    });
  };

  const onUpload = async (category: string, file?: File) => {
    if (!file) return;
    setSubiendo(true);
    setErr(null);
    try {
      const up = await uploadEventDocument(file, quotationId, category);
      if (!up.success) throw new Error(up.error || "No se pudo subir");
      const { error } = await addDocument({
        quotation_id: quotationId,
        category,
        // El comentario ES la etiqueta (el archivo real vive en la URL).
        file_name: upComment.trim() || file.name,
        file_url: up.url || "",
      });
      if (error) throw error;
      toast.success("Documento subido.");
      setUpOpen(false);
      setUpCat("");
      setUpFile(null);
      setUpArrastrando(false);
      profundidadDragDoc.current = 0;
      setUpComment("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir el documento");
    } finally {
      setSubiendo(false);
    }
  };

  const [confirmDocId, setConfirmDocId] = useState<number | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const onDelete = async (doc: EventDocument) => {
    setDeletingDoc(true);
    try {
      await deleteStorageFileByUrl(doc.file_url);
      await deleteDocument(doc.id);
      setConfirmDocId(null);
      if (selectedId === doc.id) setSelectedId(null);
      load();
    } finally {
      setDeletingDoc(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tarjeta única de subida (calco del panel Registrar pago) */}
      {upOpen ? (
        <div
          className={`border rounded-xl p-4 space-y-3 max-w-2xl transition-colors ${
            upArrastrando
              ? "border-blue-400 border-dashed bg-blue-50/60"
              : "border-blue-200 bg-blue-50"
          }`}
          onDragEnter={(e) => {
            // Contador de profundidad (Safari incluido); solo ARCHIVOS y
            // solo si no hay una subida en vuelo.
            e.preventDefault();
            if (!e.dataTransfer.types?.includes("Files") || subiendo) return;
            profundidadDragDoc.current += 1;
            setUpArrastrando(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            profundidadDragDoc.current = Math.max(
              0,
              profundidadDragDoc.current - 1,
            );
            if (profundidadDragDoc.current === 0) setUpArrastrando(false);
          }}
          onDrop={(e) => {
            // Soltar el archivo en cualquier parte de la tarjeta
            // (mismo gesto de los respaldos comerciales).
            e.preventDefault();
            profundidadDragDoc.current = 0;
            setUpArrastrando(false);
            const sueltos = Array.from(e.dataTransfer.files || []);
            recibirDocumento(sueltos[0]);
            if (sueltos.length > 1)
              toast.warn(
                `Se tomó "${sueltos[0].name}". Los documentos van de a uno.`,
              );
          }}
        >
          <p className="text-sm font-bold text-gray-900">Subir documento</p>
          <div>
            <label className="text-xs font-semibold text-gray-600">
              Categoría
            </label>
            <SelectWithSearch
              options={DOCUMENT_CATEGORIES.map((c) => ({
                value: c.key,
                label: c.label,
              }))}
              value={upCat}
              onChange={setUpCat}
              placeholder="Elegir categoría…"
              searchPlaceholder="Buscar…"
              noResultsText="Sin resultados"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">
              Archivo{" "}
              <span className="font-normal text-gray-400">
                (imagen o PDF · máx. 5 MB)
              </span>
            </label>
            <div className="mt-1.5 flex items-center gap-2.5">
              <label className="cursor-pointer shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
                Seleccionar archivo
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    recibirDocumento(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <span
                className={
                  upArrastrando
                    ? "text-xs font-bold text-blue-600"
                    : "text-xs text-gray-400"
                }
              >
                {upArrastrando ? "¡Suéltalo aquí! ↓" : "o arrastra aquí"}
              </span>
            </div>
            {upFile && (
              <p className="text-xs text-gray-600 truncate mt-1">
                Listo para subir: <b className="text-gray-800">{upFile.name}</b>
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">
              Comentario{" "}
              <span className="font-normal text-gray-400">
                (opcional — es lo que se mostrará en la lista)
              </span>
            </label>
            <input
              type="text"
              value={upComment}
              maxLength={80}
              onChange={(e) => setUpComment(e.target.value)}
              placeholder="Ej: Contrato firmado por el cliente"
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setUpOpen(false);
                setUpCat("");
                setUpFile(null);
                setUpComment("");
                setUpArrastrando(false);
                profundidadDragDoc.current = 0;
              }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!upCat || !upFile || subiendo}
              onClick={() => void onUpload(upCat, upFile || undefined)}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {subiendo ? "Subiendo…" : "Subir"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setUpOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          <Upload size={15} /> Subir documento
        </button>
      )}
      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {err}
        </p>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 py-6">
          Aún no hay documentos en este evento.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[400px_1fr] items-start">
          {/* Lista agrupada (solo categorías con documentos) */}
          <div className="space-y-3">
            {DOCUMENT_CATEGORIES.filter((cat) =>
              docs.some((d) => d.category === cat.key),
            ).map((cat) => {
              const list = docs.filter((d) => d.category === cat.key);
              return (
                <div
                  key={cat.key}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <FileText size={13} className="text-gray-500" />
                    {cat.label}
                    <span className="font-normal text-gray-400">
                      ({list.length})
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {list.map((d) => (
                      <div
                        key={d.id}
                        className={`flex items-center gap-2 px-3 py-2 ${
                          selected?.id === d.id ? "bg-blue-50" : ""
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          {esComentario(d.file_name) && (
                            <div className="text-sm text-gray-900 truncate">
                              {d.file_name}
                            </div>
                          )}
                          <div className="text-[11px] text-gray-400">
                            {fmtDate(d.uploaded_at)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedId(d.id)}
                          className="text-sm font-semibold text-blue-600 hover:underline shrink-0"
                        >
                          Ver
                        </button>
                        {confirmDocId === d.id ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <ConfirmInline
                              question="¿Eliminar?"
                              onYes={() => onDelete(d)}
                              onNo={() => setConfirmDocId(null)}
                              busy={deletingDoc}
                            />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDocId(d.id);
                            }}
                            className="text-gray-300 hover:text-red-500 shrink-0"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visor embebido */}
          <DocViewerPanel doc={selected} />
        </div>
      )}
    </div>
  );
}

// Visor de documento embebido (Etapa 2): enlace firmado del bucket
// privado + iframe (PDF) o imagen, con Descargar. Sin ventanitas.
function DocViewerPanel({
  doc,
  emptyText = "Elige un documento de la lista para verlo aquí.",
}: {
  readonly doc: { file_url: string; file_name: string } | null;
  readonly emptyText?: string;
}) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!doc) return;
    let vivo = true;
    setViewUrl(null);
    resolveStorageUrl(doc.file_url)
      .then((firmada) => vivo && setViewUrl(firmada))
      .catch(() => vivo && setViewUrl(null));
    return () => {
      vivo = false;
    };
  }, [doc?.file_url]);

  if (!doc) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl min-h-[420px] flex items-center justify-center text-sm text-gray-400 px-6 text-center">
        {emptyText}
      </div>
    );
  }
  const isPdf = doc.file_url.split("?")[0].toLowerCase().endsWith(".pdf");
  const downloadUrl = viewUrl
    ? viewUrl.includes("?")
      ? `${viewUrl}&download=`
      : `${viewUrl}?download=`
    : null;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-800 truncate pr-3">
          {/\.(pdf|jpe?g|png|webp|gif|heic)$/i.test(doc.file_name.trim())
            ? "Documento"
            : doc.file_name}
        </span>
        {downloadUrl && (
          <a
            href={downloadUrl}
            className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
          >
            Descargar
          </a>
        )}
      </div>
      {!viewUrl ? (
        <div className="min-h-[420px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : isPdf ? (
        <iframe
          src={viewUrl}
          title={doc.file_name}
          className="w-full min-h-[560px]"
        />
      ) : (
        <div className="p-4 flex justify-center bg-gray-50">
          <img
            src={viewUrl}
            alt={doc.file_name}
            className="max-w-full max-h-[560px] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
