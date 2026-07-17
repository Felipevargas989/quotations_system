import { useState, useEffect, useMemo } from "react";
import {
  Search,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import {
  getPaymentsWithTransactions,
  PaymentWithTransactions,
} from "../../services/paymentTransactions.service";
import { getClients } from "../../services/clients.service";

// One row per closed event (quotation), aggregated from its payment plan.
interface EventRow {
  quotationId: string;
  quotationNumber: number;
  clientName: string;
  clientType?: string;
  contactPerson?: string;
  phone?: string;
  total: number;
  paid: number;
  cuotas: number;
  status: "pagado" | "vencido" | "pendiente";
}

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");

export default function PostVentaPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

      // Group payments by quotation (event).
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
          total,
          paid,
          cuotas: ps.length,
          status,
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

  const pct = (r: EventRow) =>
    r.total ? Math.round((r.paid / r.total) * 100) : 0;
  const barColor = (p: number) =>
    p >= 100 ? "bg-green-500" : p > 0 ? "bg-blue-500" : "bg-gray-300";

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
                {["N° Cot.", "Cliente", "Contacto", "Monto", "Estado de pago"].map(
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
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Sin eventos que coincidan.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.quotationId} className="hover:bg-gray-50">
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
                          className={`h-2 rounded-full ${barColor(pct(r))}`}
                          style={{ width: `${pct(r)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {pct(r)}% pagado · {clp(r.paid)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
