import { useState, useEffect, useMemo } from "react";
import { computeMoney, resolveFixedServicePrice } from "@dinero";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Search,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  ChevronRight,
  Upload,
  Pencil,
  Trash2,
  FileText,
  Undo2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
  getQuotationById,
  markEventDone,
  updateQuotation,
} from "../../services/quotations.service";
import { Quotation, QuotationStatus } from "../../types/quotations.types";
import { Refund } from "../../types/refunds.types";
import { NumberInput } from "../../components/inputs";
import { findAllServices } from "../../services/services.service";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { matchesSearch, normalizeText } from "../../utils/searchMatch";
import { formatPhone } from "../../utils/phone";
import GestionTab from "./GestionTab";
import CocinaTab from "./CocinaTab";
import { getQuotationProvisioning } from "../../services/logistics.service";
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
  requiresInvoice?: boolean;
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

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy", { locale: es });
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
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [moneyFilter, setMoneyFilter] = useState<string[]>([]);
  const [filterRestored, setFilterRestored] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [tab, setTab] = useState<
    "pagos" | "documentos" | "servicios" | "gestion" | "cocina"
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
        setEventFilter((ev || []).filter((v) => EVENT_FILTER_VALUES.includes(v)));
        setMoneyFilter((mo || []).filter((v) => MONEY_FILTER_VALUES.includes(v)));
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
        clients?: { client_contacts?: { name: string; phone?: string }[] };
      };
      const mandante = qExtra?.contact_name?.trim();
      let contactPerson = client?.contact_person;
      let phone = client?.phone;
      if (mandante) {
        contactPerson = mandante;
        const match = (qExtra?.clients?.client_contacts || []).find(
          (c) => normalizeText(c.name) === normalizeText(mandante),
        );
        phone = match?.phone || undefined;
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
        requiresInvoice: q?.requires_invoice,
        hasContract: q?.has_contract,
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

  // El evento abierto en el modal se re-sincroniza con CADA versión
  // fresca de la lista (saldo, progreso, cuotas al día).
  useEffect(() => {
    setSelected((cur) =>
      cur ? rows.find((e) => e.quotationId === cur.quotationId) || cur : cur,
    );
  }, [rows]);

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
  const [orden, setOrden] = useState<"proximo" | "numero">("proximo");
  const [ordenOpen, setOrdenOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      // Dos filtros que se CRUZAN: el del evento (vigente/realizado/
      // anulado) y el de la plata (pendiente/vencido/pagado). Así un
      // realizado con cuotas vencidas SÍ aparece al filtrar "Vencidos".
      // Evento sin marcar = vigentes + realizados (anulados solo con su
      // opción). Plata sin marcar = todos.
      const kind = r.cancelled
        ? "cancelado"
        : r.done
          ? "realizado"
          : "vigente";
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
    if (orden === "numero") return filtered;
    const hoy = new Date().toISOString().slice(0, 10);
    const valor = (r: (typeof filtered)[number]) =>
      (r.eventDate ?? "").slice(0, 10);
    const futuros = filtered
      .filter((r) => valor(r) >= hoy)
      .sort((a, b) => valor(a).localeCompare(valor(b)));
    const pasados = filtered
      .filter((r) => valor(r) !== "" && valor(r) < hoy)
      .sort((a, b) => valor(b).localeCompare(valor(a)));
    const sinFecha = filtered.filter((r) => valor(r) === "");
    return [...futuros, ...pasados, ...sinFecha];
  }, [filtered, orden]);

  const pct = (paid: number, total: number) =>
    total ? Math.round((paid / total) * 100) : 0;
  const barColor = (p: number) =>
    p >= 100 ? "bg-green-500" : p > 0 ? "bg-blue-500" : "bg-gray-300";

  const openEvent = (r: EventRow) => {
    setSelected(r);
    setTab("pagos");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Post‑Venta</h1>
          <p className="text-sm text-gray-500">
            Eventos cerrados · seguimiento de pagos
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N°, cliente o contacto…"
              className="w-72 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          {/* Desplegable custom (no nativo), estilo de la casa. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOrdenOpen((v) => !v)}
              className="w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white flex items-center justify-between gap-2 hover:border-gray-400"
              title="Orden de la lista"
            >
              <span>
                {orden === "proximo"
                  ? "Orden: próximo evento"
                  : "Orden: número de cotización"}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {ordenOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setOrdenOpen(false)}
                  tabIndex={-1}
                ></button>
                <div className="absolute right-0 z-20 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
                  {(
                    [
                      ["proximo", "Orden: próximo evento"],
                      ["numero", "Orden: número de cotización"],
                    ] as const
                  ).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => {
                        setOrden(valor);
                        setOrdenOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-blue-50 ${
                        orden === valor
                          ? "font-semibold text-blue-700"
                          : "text-gray-700"
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
                {[
                  "N° Cot.",
                  "Fecha evento",
                  "Cliente",
                  "Contacto",
                  "Monto",
                  "Estado de pago",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
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
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                        #{r.quotationNumber}
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

      {/* Event detail modal */}
      {selected && (
        <EventModal
          event={selected}
          tab={tab}
          setTab={setTab}
          onClose={() => setSelected(null)}
          onDataChanged={refreshAfterSave}
        />
      )}
    </div>
  );
}

// ---- Event detail modal ----
interface EventModalProps {
  readonly event: EventRow;
  readonly tab: "pagos" | "documentos" | "servicios" | "gestion" | "cocina";
  readonly setTab: (
    t: "pagos" | "documentos" | "servicios" | "gestion" | "cocina",
  ) => void;
  readonly onClose: () => void;
  readonly onDataChanged: () => void;
}

function EventModal({
  event,
  tab,
  setTab,
  onClose,
  onDataChanged,
}: EventModalProps) {
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

  const tabs: { key: EventModalProps["tab"]; label: string }[] = [
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
      const msg =
        (error as { response?: { data?: { message?: string | string[] } } })
          .response?.data?.message;
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
      alert("No se pudo eliminar el registro. Intenta de nuevo.");
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
  const doCancelEvent = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await updateQuotation(
        { quotation_status: QuotationStatus.CANCELADA },
        event.quotationId,
      );
      onDataChanged();
      onClose();
    } catch {
      setCancelError("No se pudo anular el evento. Intenta de nuevo.");
    } finally {
      setCancelling(false);
    }
  };

  // Marcar realizado: cualquier rol operativo. El backend cambia el estado y
  // envía la encuesta de satisfacción al cliente (una sola vez).
  const [confirmDone, setConfirmDone] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [doneNotice, setDoneNotice] = useState<string | null>(null);
  const [doneError, setDoneError] = useState<string | null>(null);
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
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-5 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-6xl h-[94vh] shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
              {event.contactPerson ? ` · Contacto ${event.contactPerson}` : ""}
              {event.phone ? ` · ${formatPhone(event.phone)}` : ""}
              {event.hasContract ? " · 📄 con contrato" : ""}
              {event.requiresInvoice ? " · 🧾 requiere factura" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!event.cancelled &&
              (event.done ? (
                <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">
                  ✓ REALIZADO
                </span>
              ) : confirmDone ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">
                    ¿Marcar como realizado? Se enviará la encuesta al contacto
                    de la cotización.
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
            ) : !canCancel || confirmDone ? null : confirmCancel ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  ¿Anular este evento?
                </span>
                <button
                  disabled={cancelling}
                  onClick={doCancelEvent}
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
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
            >
              <X size={18} />
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

        {/* KPIs */}
        <div className="shrink-0 flex gap-4 px-6 pt-5">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xs uppercase text-gray-500">Monto total</p>
            <p className="text-lg font-bold">{clp(event.total)}</p>
          </div>
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xs uppercase text-gray-500">Pagado</p>
            <p className="text-lg font-bold text-green-600">
              {clp(event.paid)}
            </p>
          </div>
          {event.refunded > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs uppercase text-gray-500">Reembolsado</p>
              <p className="text-lg font-bold text-red-600">
                − {clp(event.refunded)}
              </p>
            </div>
          )}
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xs uppercase text-gray-500">Saldo</p>
            <p
              className={`text-lg font-bold ${saldo > 0 ? "text-yellow-600" : "text-green-600"}`}
            >
              {clp(saldo)}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="shrink-0 px-6 pt-2 pb-4">
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

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 px-6 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 ${
                tab === t.key
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="p-6 flex-1 overflow-y-auto min-h-0">
          {tab === "pagos" && (
            <div className="space-y-6">
              <RegistrarPagoPanel event={event} onChanged={onDataChanged} />
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-800">
                  Calendario de pagos
                </h4>
                {event.payments.map((pay) => {
                  const cp = pay.amount
                    ? Math.round(((pay.paid_amount || 0) / pay.amount) * 100)
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
                          <FileViewLink
                            url={t.receipt_photo_url}
                            title={`Comprobante · ${clp(t.amount)} · ${fmtDate(t.transaction_date)}`}
                          />
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
                                        due_date: (pay.due_date || "").slice(
                                          0,
                                          10,
                                        ),
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
                                (p) => p && { ...p, due_date: e.target.value },
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

// ---- Servicios tab (editable: personas, servicios, descuento % / $, comentarios) ----
const GRID = "1fr 62px 110px 118px 28px";
const deep = (x: any) => JSON.parse(JSON.stringify(x || []));
function ServiciosTab({
  quote,
  paidAmount,
  onSaved,
}: {
  readonly quote: Quotation;
  readonly paidAmount: number;
  readonly onSaved: () => void;
}) {
  // Contadores de la cotización: total = adultos + niños (Cotizador 2.0).
  const initKids = Number(quote.children_count || 0);
  const initAdults = Math.max(0, Number(quote.people_count || 0) - initKids);
  const multiDia = Boolean(
    quote.event_end_date &&
      String(quote.event_end_date).slice(0, 10) !==
        String(quote.event_date).slice(0, 10),
  );
  const [varGroups, setVarGroups] = useState<any[]>(() =>
    deep(quote.items?.variable_services).map((g: any) => ({
      ...g,
      // people igual a su audiencia al cargar = "automático": sigue al
      // contador si este cambia. Distinto = ajuste manual, se respeta.
      people:
        typeof g.people === "number" &&
        g.people !== (g.audience === "ninos" ? initKids : initAdults)
          ? g.people
          : undefined,
    })),
  );
  const [fixed, setFixed] = useState<any[]>(() =>
    deep(quote.items?.fixed_services),
  );
  const [adultsN, setAdultsN] = useState<number>(initAdults);
  const [kidsN, setKidsN] = useState<number>(initKids);
  const personas = adultsN + kidsN;
  // Provisión: si el evento ya se compró, advertir cambios y restringir
  // la baja de personas a administradores.
  const { userRole } = useAuth();
  const [provInfo, setProvInfo] = useState<{
    provisioned_at: string | null;
    provisioned_people: number | null;
  }>({ provisioned_at: null, provisioned_people: null });
  useEffect(() => {
    getQuotationProvisioning(String(quote.id))
      .then((p) =>
        setProvInfo({
          provisioned_at: p.provisioned_at,
          provisioned_people: p.provisioned_people,
        }),
      )
      .catch(() => {});
  }, [quote.id]);
  const initDiscAmount = quote.discount_amount || 0;
  const [discType, setDiscType] = useState<"%" | "$">(
    initDiscAmount > 0 ? "$" : "%",
  );
  const [discVal, setDiscVal] = useState<number>(
    initDiscAmount > 0 ? initDiscAmount : quote.discount_percentage || 0,
  );
  const [obs, setObs] = useState<string>(quote.observations || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Aviso transparente del reajuste del plan de pagos tras guardar.
  const [notice, setNotice] = useState<{
    tone: "up" | "down" | "refund";
    title: string;
    text: string;
  } | null>(null);

  // Catálogo del sistema para agregar (categoría -> servicios, y fijos).
  const [catalog, setCatalog] = useState<{
    byCat: Record<string, any[]>;
    fixed: any[];
    cats: string[];
  }>({ byCat: {}, fixed: [], cats: [] });
  // Agregar POR GRUPO (acordado 22-07): cada grupo tiene su propio
  // "+ Agregar servicio" — así dos categorías gemelas nunca se mezclan.
  const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
  const [addingFixed, setAddingFixed] = useState(false);
  // Categoría nueva: día explícito (multi-día) y audiencia (si hay niños).
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDay, setNewCatDay] = useState(1);
  const [newCatAud, setNewCatAud] = useState<"adultos" | "ninos">("adultos");
  const daysCount = (() => {
    if (!multiDia) return 1;
    const d0 = new Date(
      String(quote.event_date).slice(0, 10) + "T00:00:00Z",
    ).getTime();
    const d1 = new Date(
      String(quote.event_end_date).slice(0, 10) + "T00:00:00Z",
    ).getTime();
    return Math.max(1, Math.round((d1 - d0) / 86400000) + 1);
  })();

  useEffect(() => {
    findAllServices()
      .then((data: any) => {
        const cats = (data.categories || []).filter(
          (c: any) => c.is_active !== false,
        );
        const svcById = new Map(
          (data.variableServices || []).map((s: any) => [s.id, s]),
        );
        const links = data.categoryLinks || [];
        const byCat: Record<string, any[]> = {};
        const push = (name: string, s: any) => {
          if (!byCat[name]) byCat[name] = [];
          byCat[name].push({
            codigo: String(s.id),
            nombre: s.name,
            precio: s.price || 0,
          });
        };
        if (links.length) {
          links.forEach((l: any) => {
            const cat = cats.find((c: any) => c.id === l.category_id);
            const s = svcById.get(l.variable_service_id);
            if (cat && s) push(cat.name, s);
          });
        } else {
          (data.variableServices || []).forEach((s: any) =>
            push(s.category || "Sin categoría", s),
          );
        }
        const fixedCat = (data.fixedServices || []).map((f: any) => ({
          codigo: String(f.id),
          nombre: f.name,
          precio: f.price || 0,
          categoria: "General",
          tipo_calculo: f.calculation_type || "fijo",
          min_precio: f.min_price || 0,
          max_precio: f.max_price || 0,
          precio_por_persona: f.price_per_person || 0,
        }));
        setCatalog({ byCat, fixed: fixedCat, cats: Object.keys(byCat) });
      })
      .catch(() => {});
  }, []);

  // Precio por persona de un ítem variable = precio × cantidad (igual que la
  // cotización). Se usa para las filas en pantalla.
  const ppp = (it: any) => (it.precio || 0) * (it.quantity || 1);
  // Audiencia y personas de cada grupo (Cotizador 2.0).
  const audOf = (g: any) => (g.audience === "ninos" ? "ninos" : "adultos");
  const audCount = (g: any) => (audOf(g) === "ninos" ? kidsN : adultsN);
  const gPeople = (g: any) =>
    typeof g.people === "number" ? g.people : audCount(g);

  // FASE 1.2 (27-07-2026): la foto de los ítems se arma UNA vez y de ahí
  // salen la pantalla, lo guardado y lo que el backend verifica — misma
  // fórmula compartida (@dinero = api-rest/src/quotations/utils/money.ts).
  const buildItemsSnapshot = () => ({
    variable_services: varGroups
      .filter((g) => (g.items || []).length > 0)
      .map((g) => ({
        category: g.category,
        day: g.day || 1,
        audience: audOf(g),
        people: gPeople(g),
        items: (g.items || []).map((it: any) => ({
          codigo: it.codigo,
          nombre: it.nombre,
          precio: it.precio,
          categoria: it.categoria || g.category,
          quantity: it.quantity || 1,
        })),
      })),
    fixed_services: fixed.map((f) => ({
      codigo: f.codigo,
      nombre: f.nombre,
      precio: f.precio,
      categoria: f.categoria || "General",
      quantity: f.quantity || 1,
      tipo_calculo: f.tipo_calculo || "fijo",
      min_precio: f.min_precio || 0,
      max_precio: f.max_precio || 0,
      precio_por_persona: f.precio_por_persona || 0,
    })),
  });

  const money = computeMoney({
    items: buildItemsSnapshot(),
    people_count: personas,
    children_count: kidsN,
    // Solo el modo activo del descuento entra a la cuenta.
    discount_percentage: discType === "%" ? discVal || 0 : 0,
    discount_amount: discType === "$" ? discVal || 0 : 0,
    // La propina no se edita acá: viaja el % de la cotización.
    tip_percentage: quote.tip_percentage ?? null,
  });
  const variableTotal = money.variableGrandTotal;
  // El % de la propina se sigue leyendo para la línea en pantalla.
  const tipPct = quote.tip_percentage;
  const valuePerPerson = money.valuePerPerson;
  const fixedValue = money.fixedTotal;
  const subtotal = money.subtotalAmount;
  const descAmount = money.discountAmount;
  const tipAmount = money.tipAmount;
  const total = money.totalAmount;

  const removeVar = (gi: number, ii: number) => {
    setVarGroups((prev) => {
      const copy = prev.map((g) => ({ ...g, items: [...(g.items || [])] }));
      copy[gi].items.splice(ii, 1);
      return copy.filter((g) => (g.items || []).length > 0);
    });
  };
  const removeFixed = (i: number) =>
    setFixed((prev) => prev.filter((_, idx) => idx !== i));

  // Agrega un servicio del catálogo AL GRUPO gi (nunca adivina el grupo).
  const addToGroup = (gi: number, idx: string) => {
    const g = varGroups[gi];
    const s = g ? catalog.byCat[g.category]?.[+idx] : undefined;
    if (!s) return;
    const item = {
      codigo: s.codigo,
      nombre: s.nombre,
      precio: s.precio,
      categoria: g.category,
      quantity: 1,
    };
    setVarGroups((prev) => {
      const copy = prev.map((x) => ({ ...x, items: [...(x.items || [])] }));
      copy[gi]?.items.push(item);
      return copy;
    });
    setAddingToGroup(null);
  };

  const addFixedSvc = (idx: string) => {
    const s = catalog.fixed[+idx];
    // El precio queda RESUELTO al agregarlo (regla del catálogo en
    // @dinero): un fijo "por persona" ya no entra con precio 0.
    if (s)
      setFixed((prev) => [
        ...prev,
        { ...s, precio: resolveFixedServicePrice(s, personas), quantity: 1 },
      ]);
    setAddingFixed(false);
  };

  // Crea el grupo con día y audiencia EXPLÍCITOS y abre su agregador
  // (un grupo sin items se descarta solo al guardar).
  const createGroup = () => {
    if (!newCatName) return;
    const newIndex = varGroups.length;
    setVarGroups((prev) => [
      ...prev,
      {
        category: newCatName,
        audience: newCatAud,
        day: multiDia ? newCatDay : 1,
        items: [],
      },
    ]);
    setNewCatOpen(false);
    setNewCatName("");
    setNewCatDay(1);
    setNewCatAud("adultos");
    setAddingToGroup(newIndex);
  };

  // Personas del grupo: igual al cotizador — escribir el número de su
  // audiencia vuelve a modo automático; otro número = ajuste manual.
  const setGroupPeople = (gi: number, v?: number) => {
    setVarGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? { ...g, people: !v || v === audCount(g) ? undefined : v }
          : g,
      ),
    );
  };

  const save = async () => {
    // Evento provisionado: bajar personas es solo para administradores.
    if (
      provInfo.provisioned_at &&
      provInfo.provisioned_people !== null &&
      personas < provInfo.provisioned_people &&
      userRole !== "administrador"
    ) {
      setMsg(
        "Evento provisionado: solo un administrador puede disminuir el número de personas.",
      );
      return;
    }
    setSaving(true);
    setMsg(null);
    setNotice(null);
    const prevTotal = quote.total_amount || 0;
    const newTotal = Math.round(total);
    try {
      // La MISMA foto que alimentó la cuenta de pantalla (Fase 1.2).
      const itemsPayload = buildItemsSnapshot();
      const { error } = await updateQuotation(
        {
          people_count: personas,
          children_count: kidsN,
          discount_percentage: discType === "%" ? discVal || 0 : 0,
          // El MONTO sale de la cuenta compartida porque ahí viene topado
          // al subtotal: subtotal − descuento siempre da el total guardado.
          discount_amount: discType === "$" ? Math.round(descAmount) : 0,
          value_per_person: Math.round(valuePerPerson),
          fixed_value: Math.round(fixedValue),
          subtotal_amount: Math.round(subtotal),
          total_amount: Math.round(total),
          // El monto de la propina se guarda junto al total (migración 37).
          // Acá sí se recalcula, y corresponde: al editar los servicios
          // cambia la base variable, así que la propina que efectivamente
          // se le cobra al cliente cambia con ella. Va el MISMO tipAmount
          // que ya está sumado dentro de total, para que no discrepen.
          tip_amount: Math.round(tipAmount),
          observations: obs,
          items: itemsPayload,
        } as any,
        quote.id,
      );
      if (error) throw error;
      setMsg("Cambios guardados ✓");
      // Aviso: describe cómo se reajustó el plan de pagos.
      const diff = newTotal - prevTotal;
      if (diff > 0) {
        setNotice({
          tone: "up",
          title: `El total subió ${clp(diff)}`,
          text: "Se ajustó el plan de pagos automáticamente: la diferencia se sumó a la última cuota pendiente (o se creó una nueva cuota si no quedaban pendientes).",
        });
      } else if (diff < 0) {
        const refund = Math.max(0, Math.round(paidAmount) - newTotal);
        if (refund > 0) {
          setNotice({
            tone: "refund",
            title: `Se generó un reembolso de ${clp(refund)}`,
            text: `El total bajó ${clp(-diff)} y quedó por debajo de lo ya pagado (${clp(paidAmount)}). Regístralo en la pestaña Comprobantes con su fecha, medio de pago y comprobante.`,
          });
        } else {
          setNotice({
            tone: "down",
            title: `El total bajó ${clp(-diff)}`,
            text: "Se ajustó el plan de pagos automáticamente: la diferencia se descontó de las cuotas pendientes.",
          });
        }
      }
      onSaved();
    } catch {
      setMsg("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  // Quitar un servicio pasa por confirmacion inline (es delicado aunque
  // el cambio recien se aplique al Guardar).
  const [confirmRowKey, setConfirmRowKey] = useState<string | null>(null);
  const row = (
    nombre: string,
    cant: number,
    precio: number,
    key: string,
    onRemove: () => void,
  ) =>
    confirmRowKey === key ? (
      <div
        key={key}
        className="flex items-center justify-between py-2 border-t border-gray-100 text-sm"
      >
        <span className="text-gray-900 truncate mr-3">{nombre}</span>
        <ConfirmInline
          question="¿Quitar del evento?"
          yesLabel="Sí, quitar"
          onYes={() => {
            onRemove();
            setConfirmRowKey(null);
          }}
          onNo={() => setConfirmRowKey(null)}
        />
      </div>
    ) : (
      <div
        key={key}
        style={{ display: "grid", gridTemplateColumns: GRID, gap: "10px" }}
        className="items-center py-2 border-t border-gray-100 text-sm"
      >
        <div className="text-gray-900">{nombre}</div>
        <div className="text-right text-gray-500">{cant}</div>
        <div className="text-right text-gray-500">{clp(precio)}</div>
        <div className="text-right font-medium">{clp(precio * cant)}</div>
        <button
          type="button"
          onClick={() => setConfirmRowKey(key)}
          className="text-red-500 hover:text-red-700 text-right"
          title="Quitar"
        >
          ✕
        </button>
      </div>
    );

  return (
    <div>
      {/* Aviso: evento ya provisionado */}
      {provInfo.provisioned_at && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span className="font-bold">Evento provisionado</span> el{" "}
          {new Date(provInfo.provisioned_at).toLocaleDateString("es-CL")}
          {provInfo.provisioned_people !== null &&
            ` con ${provInfo.provisioned_people} personas`}
          . Si cambias personas o servicios, revisa las compras en Logística →
          Compras (puedes re-provisionar para actualizar la foto).
        </div>
      )}
      {/* Aviso de reajuste del plan de pagos */}
      {notice && (
        <div
          className={`mb-4 rounded-lg border p-3 flex items-start gap-3 ${
            notice.tone === "refund"
              ? "bg-red-50 border-red-200"
              : notice.tone === "down"
                ? "bg-amber-50 border-amber-200"
                : "bg-blue-50 border-blue-200"
          }`}
        >
          <span className="text-lg leading-none mt-0.5">
            {notice.tone === "refund"
              ? "↩️"
              : notice.tone === "down"
                ? "📉"
                : "📈"}
          </span>
          <div className="flex-1">
            <p
              className={`text-sm font-bold ${
                notice.tone === "refund"
                  ? "text-red-800"
                  : notice.tone === "down"
                    ? "text-amber-800"
                    : "text-blue-800"
              }`}
            >
              {notice.title}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{notice.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-gray-400 hover:text-gray-600"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Asistentes (editable): adultos + niños, como el cotizador */}
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm font-semibold text-blue-900">
        <span>
          👥 Asistentes del evento{" "}
          <span className="text-[10px] font-semibold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded ml-1">
            de la cotización
          </span>
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            Adultos
            <div className="w-24">
              <NumberInput
                value={adultsN || undefined}
                onChange={(v) => setAdultsN(v || 0)}
                min={0}
                formatThousands
                placeholder="0"
                className="text-right"
              />
            </div>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            Niños
            <div className="w-24">
              <NumberInput
                value={kidsN || undefined}
                onChange={(v) => setKidsN(v || 0)}
                min={0}
                formatThousands
                placeholder="0"
                className="text-right"
              />
            </div>
          </label>
          <span className="text-gray-500">
            = {personas.toLocaleString("es-CL")}
          </span>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: GRID, gap: "10px" }}
        className="text-xs uppercase text-gray-500 px-1 pb-1"
      >
        <div>Servicio</div>
        <div className="text-right">Cant.</div>
        <div className="text-right">Precio unit.</div>
        <div className="text-right">Subtotal</div>
        <div></div>
      </div>

      {varGroups.map((g, gi) => (
        <div key={`${g.category || "cat"}-${gi}`}>
          <div className="text-xs font-bold uppercase text-gray-600 bg-gray-100 rounded px-2 py-1.5 mt-3 flex items-center justify-between">
            <span>{g.category}</span>
            <span className="normal-case font-semibold flex items-center gap-1.5">
              <span
                className={
                  audOf(g) === "ninos" ? "text-amber-700" : "text-blue-700"
                }
              >
                {audOf(g) === "ninos" ? "NIÑOS" : "ADULTOS"}
              </span>
              <span className="text-gray-500">·</span>
              {/* Personas del grupo, editable como en el cotizador. Sin
                  el "de N" (pedido de Felipe 22-07: solo en el cotizador);
                  el ajuste manual se distingue por la casilla ámbar. */}
              <span className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={gPeople(g) ? gPeople(g).toLocaleString("es-CL") : ""}
                  onChange={(e) => {
                    const v =
                      parseInt(e.target.value.replace(/\./g, ""), 10) || 0;
                    setGroupPeople(gi, v);
                  }}
                  className={`w-16 border rounded-md px-1.5 py-0.5 text-xs text-right font-semibold ${
                    typeof g.people === "number"
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-gray-300 bg-white text-gray-700"
                  }`}
                  aria-label={`Personas de ${g.category}`}
                />
              </span>
              <span className="text-gray-500">
                personas
                {multiDia ? ` · Día ${g.day || 1}` : ""}
              </span>
            </span>
          </div>
          {(g.items || []).map((it: any, i: number) =>
            row(it.nombre, gPeople(g), ppp(it), `v-${gi}-${i}`, () =>
              removeVar(gi, i),
            ),
          )}
          {/* Agregador DEL grupo: el servicio cae aquí, sin ambigüedad */}
          <div className="py-1.5 border-t border-gray-100">
            {addingToGroup === gi ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SelectWithSearch
                    options={(catalog.byCat[g.category] || []).map((sv, i) => ({
                      value: String(i),
                      label: `${sv.nombre} — ${clp(sv.precio)}`,
                    }))}
                    value=""
                    onChange={(v) => addToGroup(gi, v)}
                    placeholder={`Buscar servicio de ${g.category}…`}
                    searchPlaceholder="Buscar…"
                    noResultsText="Sin resultados"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAddingToGroup(null)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingToGroup(gi)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                + Agregar servicio
              </button>
            )}
          </div>
        </div>
      ))}

      {fixed.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase text-green-700 bg-green-100 rounded px-2 py-1.5 mt-3">
            Servicios fijos
          </div>
          {fixed.map((f, i) =>
            row(f.nombre, f.quantity || 1, f.precio || 0, `f-${i}`, () =>
              removeFixed(i),
            ),
          )}
        </div>
      )}

      {/* Agregadores GLOBALES: solo lo que no pertenece a un grupo —
          categoría nueva (día y audiencia explícitos) y servicios fijos. */}
      <div className="mt-4">
        {newCatOpen ? (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                Categoría
              </label>
              <select
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              >
                <option value="">Elegir…</option>
                {catalog.cats.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            {multiDia && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                  Día
                </label>
                <select
                  value={newCatDay}
                  onChange={(e) => setNewCatDay(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                >
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        Día {n}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}
            {kidsN > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                  Audiencia
                </label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  {(["adultos", "ninos"] as const).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setNewCatAud(aud)}
                      className={`px-3 py-2 text-xs font-bold ${
                        newCatAud === aud
                          ? aud === "ninos"
                            ? "bg-amber-600 text-white"
                            : "bg-blue-900 text-white"
                          : "bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {aud === "ninos" ? "Niños" : "Adultos"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={createGroup}
              disabled={!newCatName}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => setNewCatOpen(false)}
              className="px-3 py-2 text-sm text-gray-600"
            >
              Cancelar
            </button>
          </div>
        ) : addingFixed ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SelectWithSearch
                options={catalog.fixed.map((sv, i) => ({
                  value: String(i),
                  label: `${sv.nombre} — ${clp(sv.precio)}`,
                }))}
                value=""
                onChange={addFixedSvc}
                placeholder="Buscar servicio fijo…"
                searchPlaceholder="Buscar…"
                noResultsText="Sin resultados"
              />
            </div>
            <button
              type="button"
              onClick={() => setAddingFixed(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setNewCatOpen(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              + Agregar categoría nueva
            </button>
            <button
              type="button"
              onClick={() => setAddingFixed(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              + Agregar servicio fijo
            </button>
          </div>
        )}
      </div>

      {/* Totales + descuento editable */}
      <div className="mt-5 border-t-2 border-gray-900 pt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Total servicios</span>
          <span className="font-medium">{clp(subtotal)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2">
            Descuento
            <span className="inline-flex border border-gray-300 rounded-md overflow-hidden">
              {(["%", "$"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (t === discType) return;
                    // Convertir el valor para que el descuento en $ se mantenga
                    // al cambiar de modo (evita reinterpretar el número).
                    if (t === "$") {
                      setDiscVal(descAmount);
                    } else {
                      setDiscVal(
                        subtotal > 0
                          ? Math.round((descAmount / subtotal) * 10000) / 100
                          : 0,
                      );
                    }
                    setDiscType(t);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold ${
                    discType === t
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </span>
            <div className="w-32">
              <NumberInput
                value={discVal || undefined}
                onChange={(v) => setDiscVal(v || 0)}
                min={0}
                max={discType === "%" ? 100 : undefined}
                formatThousands
                currency={discType === "$"}
                placeholder="0"
                className="text-right"
              />
            </div>
          </span>
          <span className="text-red-600">− {clp(descAmount)}</span>
        </div>
        {tipAmount > 0 && (
          <div className="flex justify-between">
            <span>Propina sugerida ({tipPct}%)</span>
            <span className="font-medium">{clp(tipAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
          <span>Total a pagar</span>
          <span>{clp(total)}</span>
        </div>
      </div>

      {/* Comentarios editable */}
      <div className="mt-5">
        <p className="text-xs font-semibold text-gray-700 mb-1">
          Comentarios / observaciones
        </p>
        <textarea
          rows={3}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-lg p-3"
        />
      </div>

      <div className="flex items-center justify-end gap-3 mt-4">
        {msg && <span className="text-sm text-gray-500">{msg}</span>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Editable: adultos y niños, servicios (agregar por categoría / quitar con
        ✕), descuento (% o $) y comentarios. Cada servicio multiplica por las
        personas de SU audiencia; la propina de la cotización se mantiene. Al
        guardar, si cambia el total, el plan de pagos se ajusta automáticamente.
      </p>
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
  const [ok, setOk] = useState<string | null>(null);

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
  };

  // Monto válido: mayor que cero y hasta el saldo pendiente. Mientras
  // no lo sea, el botón queda bloqueado (el campo vibra y avisa).
  const amountValid = !!amount && amount > 0 && amount <= maxAmount;

  const submit = async () => {
    if (!amountValid) return;
    setSaving(true);
    setErr(null);
    setOk(null);
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
      setOk(
        `Pago de ${clp(amount)} registrado ✓${
          preview.length > 1 ? ` (repartido en ${preview.length} cuotas)` : ""
        }`,
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
      {ok && !open && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-green-800">{ok}</p>
          <button
            type="button"
            onClick={() => setOk(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setOk(null);
          }}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
        >
          + Registrar pago
        </button>
      ) : (
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-800">Registrar pago</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
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
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Medio de pago
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
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
                className="w-full text-xs mt-1.5"
              />
            </div>
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

// ---- Comprobantes: ledger unificado (pagos + reembolsos registrados) ----
interface LedgerEntry {
  key: string;
  kind: "pago" | "reembolso";
  amount: number;
  date: string | null;
  method: string | null;
  url: string | null;
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
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
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
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
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
                className="w-full text-xs"
              />
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

// ---- Documentos del evento por categoría (con Supabase Storage) ----
function DocumentosTab({ quotationId }: { readonly quotationId: string }) {
  // Documentos del evento vía React Query (frescura inmediata: son
  // archivos que sube/borra el equipo).
  const queryClient = useQueryClient();
  const docsQuery = useQuery({
    queryKey: ["postventa", "docs", quotationId],
    staleTime: 0,
    queryFn: () => getDocumentsByQuotation(quotationId),
  });
  const docs = docsQuery.data ?? [];
  const loading = docsQuery.isPending;
  const [busyCat, setBusyCat] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    queryClient.invalidateQueries({
      queryKey: ["postventa", "docs", quotationId],
    });
  };

  const onUpload = async (category: string, file?: File) => {
    if (!file) return;
    setBusyCat(category);
    setErr(null);
    try {
      const up = await uploadEventDocument(file, quotationId, category);
      if (!up.success) throw new Error(up.error || "No se pudo subir");
      const { error } = await addDocument({
        quotation_id: quotationId,
        category,
        file_name: file.name,
        file_url: up.url || "",
      });
      if (error) throw error;
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir el documento");
    } finally {
      setBusyCat(null);
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
      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {err}
        </p>
      )}
      {DOCUMENT_CATEGORIES.map((cat) => {
        const list = docs.filter((d) => d.category === cat.key);
        const busy = busyCat === cat.key;
        return (
          <div
            key={cat.key}
            className="border border-gray-200 rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <FileText size={15} className="text-gray-500" /> {cat.label}
                <span className="text-xs font-normal text-gray-400">
                  ({list.length})
                </span>
              </span>
              <label
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 ${
                  busy
                    ? "bg-gray-200 text-gray-500"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Upload size={13} /> {busy ? "Subiendo…" : "Subir"}
                <span className="font-normal opacity-70 text-[10px]">
                  máx. 5 MB
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    onUpload(cat.key, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {list.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-3">Sin documentos.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {list.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <FileText size={16} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">
                        {d.file_name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {fmtDate(d.uploaded_at)}
                      </div>
                    </div>
                    {confirmDocId === d.id ? (
                      <ConfirmInline
                        question="¿Eliminar este documento?"
                        onYes={() => onDelete(d)}
                        onNo={() => setConfirmDocId(null)}
                        busy={deletingDoc}
                      />
                    ) : (
                      <>
                        <FileViewLink url={d.file_url} title={d.file_name} />
                        <button
                          type="button"
                          onClick={() => setConfirmDocId(d.id)}
                          className="text-gray-300 hover:text-red-500"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-gray-400">
        Formatos: imágenes (JPG, PNG, WebP) y PDF · máx. 5MB.
      </p>
    </div>
  );
}
