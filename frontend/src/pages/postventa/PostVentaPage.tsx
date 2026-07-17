import { useState, useEffect, useMemo } from "react";
import {
  Search,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  ChevronRight,
  Upload,
  Trash2,
  FileText,
  Undo2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  getPaymentsWithTransactions,
  PaymentWithTransactions,
  PaymentTransaction,
} from "../../services/paymentTransactions.service";
import { getClients } from "../../services/clients.service";
import {
  getQuotationById,
  updateQuotation,
} from "../../services/quotations.service";
import { Quotation } from "../../types/quotations.types";
import { Refund } from "../../types/refunds.types";
import { NumberInput } from "../../components/inputs";
import { findAllServices } from "../../services/services.service";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
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
  payments: PaymentWithTransactions[];
}

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy", { locale: es });
  } catch {
    return "—";
  }
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
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [tab, setTab] = useState<
    "pagos" | "comprobantes" | "documentos" | "servicios"
  >("pagos");

  useEffect(() => {
    loadEvents();
  }, []);

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
        else if (ps.some((p) => p.status === "vencido")) status = "vencido";

        events.push({
          quotationId,
          quotationNumber: q?.quotation_number ?? 0,
          clientName: q?.clients?.name || "—",
          clientType: client?.client_type,
          contactPerson: client?.contact_person,
          phone: client?.phone,
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

  const loadEvents = async () => {
    setLoading(true);
    try {
      setRows(await fetchEvents());
    } catch (error) {
      console.error("Error cargando eventos de post-venta", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Refresca tras guardar sin el spinner de pantalla completa, y actualiza el
  // evento abierto en el modal (saldo, progreso, cuotas).
  const refreshAfterSave = async () => {
    try {
      const events = await fetchEvents();
      setRows(events);
      setSelected((cur) =>
        cur
          ? events.find((e) => e.quotationId === cur.quotationId) || cur
          : cur,
      );
    } catch (error) {
      console.error("Error refrescando post-venta", error);
    }
  };

  const totals = useMemo(() => {
    let pend = 0;
    let venc = 0;
    let pag = 0;
    rows.forEach((r) => {
      const net = r.paid - r.refunded;
      pag += net;
      const saldo = r.total - net;
      if (r.status === "vencido") venc += saldo;
      else if (r.status === "pendiente") pend += saldo;
    });
    return { pend, venc, pag, total: pend + venc + pag };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchSearch =
        !q ||
        String(r.quotationNumber) === q ||
        r.clientName.toLowerCase().includes(q) ||
        (r.contactPerson || "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [rows, search, statusFilter]);

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
    { l: "Total general", v: totals.total, c: "text-blue-600", Icon: DollarSign },
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="pagado">✅ Pagados</option>
            <option value="vencido">⚠️ Vencidos</option>
          </select>
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
          <h2 className="text-lg font-medium text-gray-900">Eventos cerrados</h2>
          <span className="text-sm text-gray-500">
            {filtered.length} de {rows.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["N° Cot.", "Cliente", "Contacto", "Monto", "Estado de pago", ""].map(
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
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Sin eventos que coincidan.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
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
                          {r.phone || ""}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {clp(r.total)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-36 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${barColor(p)}`}
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {p}% pagado · {clp(net)}
                          {r.refunded > 0
                            ? ` · reemb. ${clp(r.refunded)}`
                            : ""}
                        </div>
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
  readonly tab: "pagos" | "comprobantes" | "documentos" | "servicios";
  readonly setTab: (
    t: "pagos" | "comprobantes" | "documentos" | "servicios",
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
  const transactions = event.payments.flatMap((pay) => pay.transactions || []);

  // Load the full quotation (items, personas, discount, comments) for the
  // Servicios tab.
  const [quote, setQuote] = useState<Quotation | null>(null);
  const [qLoading, setQLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setQLoading(true);
    getQuotationById(event.quotationId)
      .then(({ data }) => {
        if (alive) setQuote(data || null);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setQLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [event.quotationId]);

  const tabs: { key: EventModalProps["tab"]; label: string }[] = [
    { key: "pagos", label: "Pagos" },
    { key: "documentos", label: "Documentos" },
    { key: "comprobantes", label: "Comprobantes" },
    { key: "servicios", label: "Servicios" },
  ];

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
              {event.phone ? ` · ${event.phone}` : ""}
              {event.hasContract ? " · 📄 con contrato" : ""}
              {event.requiresInvoice ? " · 🧾 requiere factura" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

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
              style={{ width: `${p}%` }}
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
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-800">
                Calendario de pagos
              </h4>
              {event.payments.map((pay) => {
                const cp = pay.amount
                  ? Math.round(((pay.paid_amount || 0) / pay.amount) * 100)
                  : 0;
                return (
                  <div
                    key={pay.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center font-bold text-sm">
                        {pay.payment_number}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">
                          {clp(pay.amount)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {pay.status === "pagado"
                            ? `Pagado · ${fmtDate(pay.last_payment_date)}`
                            : `Vence ${fmtDate(pay.due_date)}`}
                          {cp > 0 && cp < 100
                            ? ` · abonado ${clp(pay.paid_amount)} de ${clp(pay.amount)}`
                            : ""}
                        </div>
                      </div>
                      {statusBadge(pay.status)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "comprobantes" && (
            <ComprobantesTab
              quotationId={event.quotationId}
              transactions={transactions}
              onChanged={onDataChanged}
            />
          )}

          {tab === "documentos" && (
            <DocumentosTab quotationId={event.quotationId} />
          )}

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
  const [varGroups, setVarGroups] = useState<any[]>(() =>
    deep(quote.items?.variable_services),
  );
  const [fixed, setFixed] = useState<any[]>(() =>
    deep(quote.items?.fixed_services),
  );
  const [personas, setPersonas] = useState<number>(quote.people_count || 0);
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
  const [addCat, setAddCat] = useState("");
  const [addSvc, setAddSvc] = useState("");

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
  // cotización). value_per_person = suma de esos; fixed_value = fijos × cant.
  const ppp = (it: any) => (it.precio || 0) * (it.quantity || 1);
  const valuePerPerson = varGroups.reduce(
    (t, g) => t + (g.items || []).reduce((tt: number, it: any) => tt + ppp(it), 0),
    0,
  );
  const fixedValue = fixed.reduce(
    (t, f) => t + (f.precio || 0) * (f.quantity || 1),
    0,
  );
  const subtotal = valuePerPerson * personas + fixedValue;
  const descAmount =
    discType === "%"
      ? Math.round((subtotal * Math.min(discVal || 0, 100)) / 100)
      : Math.min(subtotal, discVal || 0);
  const total = subtotal - descAmount;

  const removeVar = (gi: number, ii: number) => {
    setVarGroups((prev) => {
      const copy = prev.map((g) => ({ ...g, items: [...(g.items || [])] }));
      copy[gi].items.splice(ii, 1);
      return copy.filter((g) => (g.items || []).length > 0);
    });
  };
  const removeFixed = (i: number) =>
    setFixed((prev) => prev.filter((_, idx) => idx !== i));

  const onAdd = () => {
    if (!addCat || addSvc === "") return;
    if (addCat === "Servicios fijos") {
      const s = catalog.fixed[+addSvc];
      if (s) setFixed((prev) => [...prev, { ...s, quantity: 1 }]);
    } else {
      const s = catalog.byCat[addCat]?.[+addSvc];
      if (s) {
        const item = {
          codigo: s.codigo,
          nombre: s.nombre,
          precio: s.precio,
          categoria: addCat,
          quantity: 1,
        };
        setVarGroups((prev) => {
          const copy = prev.map((g) => ({ ...g, items: [...(g.items || [])] }));
          const grp = copy.find((g) => g.category === addCat);
          if (grp) grp.items.push(item);
          else copy.push({ category: addCat, items: [item] });
          return copy;
        });
      }
    }
    setAddSvc("");
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    setNotice(null);
    const prevTotal = quote.total_amount || 0;
    const newTotal = Math.round(total);
    try {
      const itemsPayload = {
        variable_services: varGroups
          .filter((g) => (g.items || []).length > 0)
          .map((g) => ({
            category: g.category,
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
      };
      const { error } = await updateQuotation(
        {
          people_count: personas,
          discount_percentage: discType === "%" ? discVal || 0 : 0,
          discount_amount: discType === "$" ? discVal || 0 : 0,
          value_per_person: Math.round(valuePerPerson),
          fixed_value: Math.round(fixedValue),
          subtotal_amount: Math.round(subtotal),
          total_amount: Math.round(total),
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

  const row = (
    nombre: string,
    cant: number,
    precio: number,
    key: string,
    onRemove: () => void,
  ) => (
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
        onClick={onRemove}
        className="text-red-500 hover:text-red-700 text-right"
        title="Quitar"
      >
        ✕
      </button>
    </div>
  );

  const svcOptions =
    addCat === "Servicios fijos"
      ? catalog.fixed
      : addCat
        ? catalog.byCat[addCat] || []
        : [];

  return (
    <div>
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
            {notice.tone === "refund" ? "↩️" : notice.tone === "down" ? "📉" : "📈"}
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

      {/* Personas (editable) */}
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm font-semibold text-blue-900">
        <span>
          👥 Personas del evento{" "}
          <span className="text-[10px] font-semibold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded ml-1">
            de la cotización
          </span>
        </span>
        <div className="w-28">
          <NumberInput
            value={personas || undefined}
            onChange={(v) => setPersonas(v || 0)}
            min={0}
            formatThousands
            placeholder="0"
            className="text-right"
          />
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
        <div key={g.category || gi}>
          <div className="text-xs font-bold uppercase text-gray-600 bg-gray-100 rounded px-2 py-1.5 mt-3">
            {g.category}
          </div>
          {(g.items || []).map((it: any, i: number) =>
            row(it.nombre, personas, ppp(it), `v-${gi}-${i}`, () =>
              removeVar(gi, i),
            ),
          )}
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

      {/* Agregar servicio: categoría -> servicio del catálogo */}
      <div className="flex gap-2 mt-4">
        <select
          value={addCat}
          onChange={(e) => {
            setAddCat(e.target.value);
            setAddSvc("");
          }}
          className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
        >
          <option value="">Categoría…</option>
          {catalog.cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>Servicios fijos</option>
        </select>
        <div className="flex-1">
          <SelectWithSearch
            options={svcOptions.map((s, i) => ({
              value: String(i),
              label: `${s.nombre} — ${clp(s.precio)}`,
            }))}
            value={addSvc}
            onChange={setAddSvc}
            disabled={!addCat}
            placeholder={addCat ? "Servicio…" : "Elige categoría primero…"}
            searchPlaceholder="Buscar servicio…"
            noResultsText="Sin resultados"
          />
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!addCat || addSvc === ""}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          Agregar
        </button>
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
                placeholder="0"
                className="text-right"
              />
            </div>
          </span>
          <span className="text-red-600">− {clp(descAmount)}</span>
        </div>
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
        Editable: personas, servicios (agregar por categoría / quitar con ✕),
        descuento (% o $) y comentarios. Al guardar, si cambia el total, el plan
        de pagos se ajusta automáticamente.
      </p>
    </div>
  );
}

// ---- Comprobantes: pagos + reembolsos ----
function ComprobantesTab({
  quotationId,
  transactions,
  onChanged,
}: {
  readonly quotationId: string;
  readonly transactions: PaymentTransaction[];
  readonly onChanged: () => void;
}) {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getRefundsByQuotation(quotationId)
      .then(setRefunds)
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [quotationId]);

  // Tras registrar un reembolso: recarga la lista local y refresca el evento
  // (saldo / KPIs) en el modal.
  const afterRefund = () => {
    load();
    onChanged();
  };

  return (
    <div className="space-y-6">
      {/* Comprobantes de pago */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-gray-800">
          Comprobantes de pago
        </h4>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aún no hay pagos registrados.
          </p>
        ) : (
          transactions.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-4 p-3 border border-gray-200 rounded-xl"
            >
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center text-[10px] text-center leading-tight ${
                  t.receipt_photo_url
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {t.receipt_photo_url ? "✓ IMG" : "sin archivo"}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-900">
                  {clp(t.amount)} · {fmtDate(t.transaction_date)}
                </div>
                <div className="text-xs text-gray-500">
                  {t.payment_method || "—"}
                </div>
              </div>
              {t.receipt_photo_url && (
                <a
                  href={t.receipt_photo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                >
                  Ver
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* Reembolsos */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Undo2 size={15} className="text-red-500" /> Reembolsos
        </h4>
        {loading ? (
          <div className="py-4 flex justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500" />
          </div>
        ) : refunds.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin reembolsos. Se generan automáticamente si el total baja por
            debajo de lo ya pagado.
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
          <a
            href={refund.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            Ver
          </a>
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
                Comprobante
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
  const [docs, setDocs] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCat, setBusyCat] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getDocumentsByQuotation(quotationId)
      .then(setDocs)
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [quotationId]);

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

  const onDelete = async (doc: EventDocument) => {
    await deleteStorageFileByUrl(doc.file_url);
    await deleteDocument(doc.id);
    load();
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
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Ver
                    </a>
                    <button
                      type="button"
                      onClick={() => onDelete(d)}
                      className="text-gray-300 hover:text-red-500"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
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
