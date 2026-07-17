import { useState, useEffect, useMemo } from "react";
import {
  Search,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  getPaymentsWithTransactions,
  PaymentWithTransactions,
} from "../../services/paymentTransactions.service";
import { getClients } from "../../services/clients.service";
import {
  getQuotationById,
  updateQuotation,
} from "../../services/quotations.service";
import { Quotation } from "../../types/quotations.types";
import { NumberInput } from "../../components/inputs";

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
  paid: number;
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

  const loadEvents = async () => {
    try {
      setLoading(true);
      const [{ data: payments }, { data: clients }] = await Promise.all([
        getPaymentsWithTransactions(),
        getClients(),
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
        const client = q?.clients?.name
          ? clientByName.get(q.clients.name)
          : undefined;

        const saldo = total - paid;
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
          cuotas: ps.length,
          status,
          payments: ps
            .slice()
            .sort((a, b) => a.payment_number - b.payment_number),
        });
      });

      events.sort((a, b) => b.quotationNumber - a.quotationNumber);
      setRows(events);
    } catch (error) {
      console.error("Error cargando eventos de post-venta", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    let pend = 0;
    let venc = 0;
    let pag = 0;
    rows.forEach((r) => {
      pag += r.paid;
      const saldo = r.total - r.paid;
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
                  const p = pct(r.paid, r.total);
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
                          {p}% pagado · {clp(r.paid)}
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
          onDataChanged={loadEvents}
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
  const saldo = event.total - event.paid;
  const p = event.total ? Math.round((event.paid / event.total) * 100) : 0;
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
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-6 z-50 overflow-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
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
        <div className="flex gap-4 px-6 pt-5">
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
        <div className="px-6 pt-2 pb-4">
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
        <div className="flex gap-1 px-6 border-b border-gray-200">
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
        <div className="p-6">
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
            <div className="space-y-3">
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                Cada pago registrado con su comprobante bancario.
              </p>
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
                      className={`w-12 h-12 rounded-lg flex items-center justify-center text-xs ${
                        t.receipt_photo_url
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {t.receipt_photo_url ? "✓ IMG" : "sin\narchivo"}
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
          )}

          {tab === "documentos" && (
            <div className="text-center py-10 text-gray-500">
              <p className="font-medium">Documentos — próxima fase</p>
              <p className="text-sm mt-1">
                Contratos, órdenes de compra, facturas y otros (con Supabase
                Storage).
              </p>
            </div>
          )}

          {tab === "servicios" &&
            (qLoading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : quote ? (
              <ServiciosTab quote={quote} onSaved={onDataChanged} />
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

// ---- Servicios tab (editable: personas, descuento % / $, comentarios) ----
const GRID = "1fr 70px 110px 120px";
function ServiciosTab({
  quote,
  onSaved,
}: {
  readonly quote: Quotation;
  readonly onSaved: () => void;
}) {
  const items: any = quote.items || {
    variable_services: [],
    fixed_services: [],
  };
  const varGroups: any[] = items.variable_services || [];
  const fixed: any[] = items.fixed_services || [];

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

  // value_per_person = suma de precios variables (por persona); fixed_value =
  // suma de fijos × cantidad. Igual que en la cotización.
  const valuePerPerson = varGroups.reduce(
    (t, g) =>
      t + (g.items || []).reduce((tt: number, it: any) => tt + (it.precio || 0), 0),
    0,
  );
  const fixedValue = fixed.reduce(
    (t, f) => t + (f.precio || 0) * (f.quantity || 1),
    0,
  );
  const subtotal = valuePerPerson * personas + fixedValue;
  const descAmount =
    discType === "%"
      ? Math.round((subtotal * (discVal || 0)) / 100)
      : Math.min(subtotal, discVal || 0);
  const total = subtotal - descAmount;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { error } = await updateQuotation(
        {
          people_count: personas,
          discount_percentage: discType === "%" ? discVal || 0 : 0,
          discount_amount: discType === "$" ? discVal || 0 : 0,
          subtotal_amount: Math.round(subtotal),
          total_amount: Math.round(total),
          observations: obs,
        } as any,
        quote.id,
      );
      if (error) throw error;
      setMsg("Cambios guardados ✓");
      onSaved();
    } catch {
      setMsg("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const row = (nombre: string, cant: number, precio: number, key: string) => (
    <div
      key={key}
      style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px" }}
      className="items-center py-2 border-t border-gray-100 text-sm"
    >
      <div className="text-gray-900">{nombre}</div>
      <div className="text-right text-gray-500">{cant}</div>
      <div className="text-right text-gray-500">{clp(precio)}</div>
      <div className="text-right font-medium">{clp(precio * cant)}</div>
    </div>
  );

  return (
    <div>
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
        style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px" }}
        className="text-xs uppercase text-gray-500 px-1 pb-1"
      >
        <div>Servicio</div>
        <div className="text-right">Cant.</div>
        <div className="text-right">Precio unit.</div>
        <div className="text-right">Subtotal</div>
      </div>

      {varGroups.map((g, gi) => (
        <div key={g.category || gi}>
          <div className="text-xs font-bold uppercase text-gray-600 bg-gray-100 rounded px-2 py-1.5 mt-3">
            {g.category}
          </div>
          {(g.items || []).map((it: any, i: number) =>
            row(it.nombre, personas, it.precio || 0, `v-${gi}-${i}`),
          )}
        </div>
      ))}

      {fixed.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase text-green-700 bg-green-100 rounded px-2 py-1.5 mt-3">
            Servicios fijos
          </div>
          {fixed.map((f, i) =>
            row(f.nombre, f.quantity || 1, f.precio || 0, `f-${i}`),
          )}
        </div>
      )}

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
        Editable: personas, descuento (% o $ — se guarda exacto) y comentarios.
        Agregar/quitar servicios viene en el siguiente paso.
      </p>
    </div>
  );
}
