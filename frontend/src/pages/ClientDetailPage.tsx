import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building,
  Mail,
  Phone,
  Star,
  MapPin,
  FileText,
} from "lucide-react";
import { getClientSummary, updateClient } from "../services/clients.service";
import { getClientTypeColor } from "../utils/clientTypeColor";
import { ClientFormData } from "../types/clients.types";

// Ficha 360° del cliente (Clientes 2.0, definida con Felipe el
// 21-07-2026): resumen comercial para hacer gestión — cotizaciones
// enviadas con su estado, indicadores de venta, saldo pendiente,
// recencia y satisfacción. Se llega haciendo clic en la fila del
// cliente; "Volver" regresa a la lista (los filtros se conservan
// porque quedan guardados por usuario).

interface SummaryContact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
}

interface SummaryClient {
  id: string;
  name: string;
  client_type: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contact_person?: string | null;
  notes?: string | null;
  created_at: string;
  client_contacts: SummaryContact[];
}

interface SummaryQuotation {
  id: string;
  quotation_number: number;
  quotation_status: string;
  event_type?: string | null;
  event_date?: string | null;
  total_amount: number;
  people_count?: number | null;
  children_count?: number | null;
  contact_name?: string | null;
  created_at: string;
}

interface SummaryData {
  client: SummaryClient;
  quotations: SummaryQuotation[];
  pendingPayments: { quotation_id: string; amount: number; status: string }[];
  surveys: {
    quotation_id: string;
    answers: { id: number; answer: string }[];
  }[];
}

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL");
};

// Mismos colores de estado que la lista de cotizaciones.
const getStatusColor = (status: string) => {
  switch (status) {
    case "solicitada":
      return "bg-yellow-100 text-yellow-800";
    case "enviada":
      return "bg-blue-100 text-blue-800";
    case "en_negociacion":
      return "bg-purple-100 text-purple-800";
    case "aceptada":
      return "bg-green-100 text-green-800";
    case "rechazada":
      return "bg-red-100 text-red-800";
    case "cancelada":
      return "bg-gray-200 text-gray-600";
    case "realizada":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const STATUS_LABELS: Record<string, string> = {
  solicitada: "Solicitada",
  enviada: "Enviada",
  en_negociacion: "En Negociación",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  realizada: "Realizada",
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Notas editables directamente en la ficha
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setLoadError(false);
      try {
        const summary = (await getClientSummary(id)) as SummaryData;
        setData(summary);
        setNotesDraft(summary.client.notes || "");
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const saveNotes = async () => {
    if (!data) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      await updateClient({ notes: notesDraft } as ClientFormData, data.client.id);
      setData((prev) =>
        prev
          ? { ...prev, client: { ...prev.client, notes: notesDraft } }
          : prev,
      );
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch {
      /* la ficha sigue; el usuario puede reintentar */
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/clients")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold"
        >
          <ArrowLeft size={18} /> Volver a clientes
        </button>
        <p className="text-gray-600">No se pudo cargar la ficha del cliente.</p>
      </div>
    );
  }

  const { client, quotations, pendingPayments, surveys } = data;

  // ---- Indicadores comerciales ----
  const vendidas = quotations.filter((q) =>
    ["aceptada", "realizada"].includes(q.quotation_status),
  );
  const consideradas = quotations.filter(
    (q) => q.quotation_status !== "solicitada",
  );
  const totalCotizado = quotations.reduce(
    (s, q) => s + Number(q.total_amount || 0),
    0,
  );
  const totalVendido = vendidas.reduce(
    (s, q) => s + Number(q.total_amount || 0),
    0,
  );
  const conversion =
    consideradas.length > 0
      ? Math.round((vendidas.length / consideradas.length) * 100)
      : null;
  const ticketPromedio =
    vendidas.length > 0 ? totalVendido / vendidas.length : null;

  // Saldo pendiente total y por cotización (cuotas pendiente/vencido)
  const pendingByQuotation = new Map<string, number>();
  pendingPayments.forEach((p) => {
    pendingByQuotation.set(
      p.quotation_id,
      (pendingByQuotation.get(p.quotation_id) || 0) + Number(p.amount || 0),
    );
  });
  const saldoPendiente = [...pendingByQuotation.values()].reduce(
    (s, n) => s + n,
    0,
  );

  // Recencia: última cotización creada
  const lastCreated = quotations.reduce<Date | null>((acc, q) => {
    const d = new Date(q.created_at);
    if (isNaN(d.getTime())) return acc;
    return !acc || d > acc ? d : acc;
  }, null);
  const daysSince = lastCreated
    ? Math.floor((Date.now() - lastCreated.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const recencyLabel =
    daysSince === null
      ? "Sin cotizaciones"
      : daysSince < 31
        ? `hace ${daysSince} día${daysSince === 1 ? "" : "s"}`
        : `hace ${Math.floor(daysSince / 30)} mes${Math.floor(daysSince / 30) === 1 ? "" : "es"}`;
  const dormido = daysSince !== null && daysSince > 180;

  // Satisfacción: promedio de las respuestas numéricas de las encuestas
  const surveyAverages = surveys
    .map((s) => {
      const nums = (s.answers || [])
        .map((a) => parseFloat(a.answer))
        .filter((n) => !isNaN(n) && n >= 1 && n <= 5);
      if (!nums.length) return null;
      return nums.reduce((x, y) => x + y, 0) / nums.length;
    })
    .filter((n): n is number => n !== null);
  const satisfaccion = surveyAverages.length
    ? surveyAverages.reduce((x, y) => x + y, 0) / surveyAverages.length
    : null;

  const contacts = [...(client.client_contacts || [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/clients")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold mb-3"
        >
          <ArrowLeft size={18} /> Volver a clientes
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <Building className="h-9 w-9 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${getClientTypeColor(client.client_type)}`}
          >
            {client.client_type}
          </span>
          <span
            className={`text-sm ${dormido ? "text-amber-600 font-semibold" : "text-gray-500"}`}
          >
            Última cotización: {recencyLabel}
            {lastCreated ? ` (${fmtDate(lastCreated.toISOString())})` : ""}
            {dormido ? " · cliente dormido" : ""}
          </span>
        </div>
      </div>

      {/* Indicadores comerciales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-xs font-medium text-gray-600">Total cotizado</p>
          <p className="text-xl font-bold text-blue-600">
            {clp(totalCotizado)}
          </p>
          <p className="text-xs text-gray-400">
            {quotations.length} cotización{quotations.length === 1 ? "" : "es"}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-xs font-medium text-gray-600">Total vendido</p>
          <p className="text-xl font-bold text-green-600">
            {clp(totalVendido)}
          </p>
          <p className="text-xs text-gray-400">
            {vendidas.length} venta{vendidas.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-xs font-medium text-gray-600">Conversión</p>
          <p className="text-xl font-bold text-purple-600">
            {conversion === null ? "—" : `${conversion}%`}
          </p>
          <p className="text-xs text-gray-400">
            {vendidas.length} de {consideradas.length} enviadas
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-xs font-medium text-gray-600">Ticket promedio</p>
          <p className="text-xl font-bold text-teal-600">
            {ticketPromedio === null ? "—" : clp(ticketPromedio)}
          </p>
          <p className="text-xs text-gray-400">por venta</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-xs font-medium text-gray-600">Saldo pendiente</p>
          <p
            className={`text-xl font-bold ${saldoPendiente > 0 ? "text-red-600" : "text-gray-400"}`}
          >
            {clp(saldoPendiente)}
          </p>
          <p className="text-xs text-gray-400">
            {saldoPendiente > 0
              ? `en ${pendingByQuotation.size} evento${pendingByQuotation.size === 1 ? "" : "s"}`
              : "sin deuda"}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-xs font-medium text-gray-600">Satisfacción</p>
          <p className="text-xl font-bold text-amber-500">
            {satisfaccion === null
              ? "—"
              : `${satisfaccion.toLocaleString("es-CL", { maximumFractionDigits: 1 })}/5`}
          </p>
          <p className="text-xs text-gray-400">
            {surveys.length
              ? `${surveys.length} encuesta${surveys.length === 1 ? "" : "s"}`
              : "sin encuestas"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contactos y datos de la ficha */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Contactos</h2>
          {contacts.length === 0 && !client.contact_person && (
            <p className="text-sm text-gray-500">Sin contactos registrados.</p>
          )}
          {contacts.map((c) => (
            <div key={c.id} className="text-sm">
              <p className="font-medium text-gray-900 flex items-center gap-1">
                {c.is_primary && (
                  <Star size={14} className="text-amber-500 fill-amber-400" />
                )}
                {c.name}
              </p>
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Mail size={13} /> {c.email}
                </a>
              )}
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Phone size={13} /> {c.phone}
                </a>
              )}
            </div>
          ))}
          {/* Datos de la ficha (particulares suelen tenerlos aquí) */}
          {(client.email || client.phone || client.address) && (
            <div className="pt-3 border-t border-gray-100 text-sm space-y-1">
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Mail size={13} /> {client.email}
                </a>
              )}
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Phone size={13} /> {client.phone}
                </a>
              )}
              {client.address && (
                <p className="flex items-center gap-1 text-gray-600">
                  <MapPin size={13} /> {client.address}
                </p>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1">
              <FileText size={14} /> Notas
            </h3>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Notas de gestión comercial del cliente…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                disabled={savingNotes || notesDraft === (client.notes || "")}
                onClick={saveNotes}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-40"
              >
                {savingNotes ? "Guardando…" : "Guardar notas"}
              </button>
              {notesSaved && (
                <span className="text-xs text-green-600 font-semibold">
                  Guardado ✓
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Historial de cotizaciones */}
        <div className="bg-white rounded-lg shadow lg:col-span-2">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Cotizaciones
            </h2>
          </div>
          {quotations.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Este cliente aún no tiene cotizaciones.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      N°
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Evento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Solicitante
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {quotations.map((q) => {
                    const saldo = pendingByQuotation.get(q.id) || 0;
                    const people =
                      (q.people_count || 0) + (q.children_count || 0);
                    return (
                      <tr
                        key={q.id}
                        onClick={() => navigate(`/quotation-form/${q.id}`)}
                        title="Abrir cotización"
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                          #{q.quotation_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {q.event_type || "—"}
                          {people > 0 && (
                            <span className="text-xs text-gray-400 ml-1">
                              · {people} pers.
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {fmtDate(q.event_date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {q.contact_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                          <span className="font-medium text-gray-900">
                            {clp(Number(q.total_amount || 0))}
                          </span>
                          {saldo > 0 && (
                            <span
                              className="block text-xs text-red-600 font-semibold"
                              title="Cuotas pendientes o vencidas"
                            >
                              debe {clp(saldo)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(q.quotation_status)}`}
                          >
                            {STATUS_LABELS[q.quotation_status] ||
                              q.quotation_status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
