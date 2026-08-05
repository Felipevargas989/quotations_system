// FICHA DEL NEGOCIO (04-08-2026, "el descreme, no el CRM") — la página
// propia de cada cotización en juego, al estilo de la ficha de
// Post-Venta: se llega pinchando la tarjeta del tablero, "← Volver"
// conserva el tablero tal como estaba. Dos pestañas: Seguimiento (el
// hilo comercial + respaldos + compartir por WhatsApp/correo) y
// Cotización (resumen + PDF + editar).
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../components/toast/Toast";
import ConfirmInline from "../../components/ConfirmInline";
import QuotationViewer from "../../components/QuotationViewer";
import {
  Quotation,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../../types/quotations.types";
import {
  getQuotationById,
  getQuotations,
  updateQuotation,
} from "../../services/quotations.service";
import {
  createPaymentPlan,
  getPaymentsByQuotationId,
} from "../../services/payments.service";
import { CreatePayment } from "../../types/payments.types";
import PaymentPlanEditor from "../../components/PaymentPlanEditor";
import EventoCajitas from "../../components/EventoCajitas";
import ServiciosTab from "../postventa/ServiciosTab";
import {
  createFollowup,
  deleteFollowup,
  Followup,
  FollowupTipo,
  getFollowupsByQuotation,
  updateFollowup,
} from "../../services/quotationFollowups.service";
import {
  addDocument,
  deleteDocument,
  EventDocument,
  getDocumentsByQuotation,
} from "../../services/documents.service";
import {
  resolveStorageUrl,
  uploadEventDocument,
} from "../../services/storage.service";
import { formatPhone } from "../../utils/phone";
import { normalizeText } from "../../utils/searchMatch";

// Tipos de gestión con los iconos de línea de la casa (pedido de
// Felipe 04-08: los emojis desentonaban).
const TIPOS_GESTION: { v: string; l: string }[] = [
  { v: "llamada", l: "Llamada" },
  { v: "correo", l: "Correo" },
  { v: "reunion", l: "Reunión" },
  { v: "whatsapp", l: "WhatsApp" },
  { v: "otro", l: "Otro" },
];
const nombreTipo = (v: string) =>
  TIPOS_GESTION.find((t) => t.v === v)?.l || v;

const IconoTipo = ({ tipo, size = 14 }: { readonly tipo: string; readonly size?: number }) => {
  if (tipo === "llamada") return <Phone size={size} />;
  if (tipo === "correo") return <Mail size={size} />;
  if (tipo === "reunion") return <Users size={size} />;
  if (tipo === "whatsapp") return <IconoWhatsApp size={size} />;
  return <Tag size={size} />;
};

const COLOR_ESTADO: Record<string, string> = {
  solicitada: "bg-yellow-100 text-yellow-800",
  enviada: "bg-blue-100 text-blue-800",
  en_negociacion: "bg-purple-100 text-purple-800",
  aceptada: "bg-green-100 text-green-800",
  rechazada: "bg-red-100 text-red-800",
  cancelada: "bg-gray-200 text-gray-600",
  realizada: "bg-emerald-100 text-emerald-800",
};

const ESTADO_ETIQUETA: Record<string, string> = {
  solicitada: "📋 Solicitada",
  enviada: "📤 Enviada",
  en_negociacion: "💬 En Negociación",
  aceptada: "✅ Aceptada",
  rechazada: "❌ Rechazada",
  cancelada: "🚫 Cancelada",
  realizada: "🎉 Realizada",
};

// Mandante con su teléfono/correo (misma regla que el tablero).
const contactoDe = (q: QuotationWithClient) => {
  const c = q.clients as unknown as {
    contact_person?: string;
    phone?: string;
    email?: string;
    client_contacts?: { name: string; phone?: string; email?: string }[];
  };
  const mandante = (
    q as unknown as { contact_name?: string | null }
  ).contact_name?.trim();
  if (mandante) {
    const match = (c?.client_contacts || []).find(
      (ct) => normalizeText(ct.name) === normalizeText(mandante),
    );
    return {
      name: mandante,
      phone: match?.phone || "",
      email: match?.email || "",
    };
  }
  return {
    name: c?.contact_person || "",
    phone: c?.phone || "",
    email: c?.email || "",
  };
};

// El logo clásico de WhatsApp (pedido de Felipe: íconos tradicionales).
const IconoWhatsApp = ({ size = 16 }: { readonly size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// Estados cuyo cambio vive en esta ficha: los vivos Y la rechazada
// (revivirla ES gestión comercial — pillada de Felipe 04-08: quedó
// atrapada sin vuelta). Aceptada/realizada/cancelada quedan como chip
// fijo: sus vueltas llevan ritual de plan de pagos (Post-Venta).
const ESTADOS_VIVOS_FICHA = [
  "solicitada",
  "enviada",
  "en_negociacion",
  "rechazada",
];

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const hoyLocal = () => {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};

// ---- Rediseño del hilo (04-08, regla de Close de Felipe): "un negocio
// vivo siempre tiene próximo paso; en rechazadas y cerradas muere el
// deal y mata todo seguimiento". ----
// Estados donde el negocio sigue VIVO para el seguimiento (exactos).
const ESTADOS_VIVOS_SEGUIMIENTO = ["solicitada", "enviada", "en_negociacion"];

// Color suave por tipo de gestión (chips del hilo y botoncitos del
// formulario): llamada verde, correo azul, reunión morado, whatsapp
// verde WhatsApp, otro gris.
const COLOR_TIPO: Record<string, string> = {
  llamada: "bg-green-50 text-green-700 border-green-300",
  correo: "bg-blue-50 text-blue-700 border-blue-300",
  reunion: "bg-purple-50 text-purple-700 border-purple-300",
  whatsapp: "bg-emerald-50 text-emerald-700 border-emerald-300",
  otro: "bg-gray-100 text-gray-600 border-gray-300",
};

// Autor legible: si author_name es un correo, la parte antes del @ con
// la primera letra en mayúscula.
const nombreAutor = (raw?: string | null) => {
  const s = (raw || "").trim();
  if (!s) return "—";
  const base = s.includes("@") ? s.split("@")[0] : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
};

// Color ESTABLE por autor para el circulito de la línea de tiempo (el
// mismo nombre pinta siempre igual).
const PALETA_AVATAR = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#4f46e5",
];
const colorAutor = (nombre: string) => {
  let h = 0;
  for (let i = 0; i < nombre.length; i++)
    h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return PALETA_AVATAR[h % PALETA_AVATAR.length];
};

// Fecha local YYYY-MM-DD de un Date (mismo patrón de hoyLocal).
const fechaLocalDe = (f: Date) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;

// Fecha humana: "hoy 09:30", "ayer 15:12", "hace 3 días" y, más viejo,
// la fecha corta. El title SIEMPRE lleva la fecha exacta completa.
const fechaHumana = (iso: string) => {
  const d = new Date(iso);
  const dia = fechaLocalDe(d);
  const hora = d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dia === hoyLocal()) return `hoy ${hora}`;
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (dia === fechaLocalDe(ayer)) return `ayer ${hora}`;
  const dias = Math.round(
    (new Date(`${hoyLocal()}T00:00:00`).getTime() -
      new Date(`${dia}T00:00:00`).getTime()) /
      86400000,
  );
  if (dias >= 2 && dias <= 7) return `hace ${dias} días`;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
};

// "DD-MM" de una fecha ISO (para los compromisos y la franja).
const ddmm = (isoDate: string) =>
  `${isoDate.slice(8, 10)}-${isoDate.slice(5, 7)}`;

export default function NegocioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, company } = useAuth();
  const [tab, setTab] = useState<"seguimiento" | "cotizacion">("seguimiento");
  // Cambio de estado desde la ficha (pedido de Felipe 04-08), con el
  // MISMO ritual del tablero: aceptar revisa si ya hay plan de pagos
  // y, si no, abre el editor antes de coronar.
  const [estadoMenu, setEstadoMenu] = useState(false);
  const [planAbierto, setPlanAbierto] = useState(false);

  // La lista liviana trae cliente + mandante con teléfono/correo (la
  // misma fuente probada del tablero); el detalle por id trae el resto.
  const listaQuery = useQuery({
    queryKey: ["quotations", "ficha-lista"],
    enabled: !!user,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION, [
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
        QuotationStatus.ACEPTADA,
        QuotationStatus.RECHAZADA,
        QuotationStatus.CANCELADA,
        QuotationStatus.REALIZADA,
      ]);
      return data;
    },
  });
  const fila = (listaQuery.data ?? []).find((q) => q.id === id) || null;

  const detalleQuery = useQuery({
    queryKey: ["quotation", id],
    enabled: !!id,
    staleTime: 0,
    queryFn: async (): Promise<Quotation | null> => {
      const { data } = await getQuotationById(id!);
      return data || null;
    },
  });
  const detalle = detalleQuery.data ?? null;

  const contacto = fila ? contactoDe(fila) : { name: "", phone: "", email: "" };
  const [verPdf, setVerPdf] = useState(false);

  // Compartir: WhatsApp abre la conversación con el mandante con el
  // mensaje listo; correo abre el borrador en su aplicación.
  const telefonoWsp = contacto.phone.replace(/\D/g, "");
  const wspHref = telefonoWsp
    ? `https://wa.me/${telefonoWsp.length === 9 ? "56" + telefonoWsp : telefonoWsp}?text=${encodeURIComponent(
        `Hola ${contacto.name.split(" ")[0] || ""}, te escribo de ${company?.name || "Eventia"} por la cotización N°${fila?.quotation_number ?? ""}. ¿Conversamos?`,
      )}`
    : null;
  const correoHref = contacto.email
    ? `mailto:${contacto.email}?subject=${encodeURIComponent(
        `Cotización N°${fila?.quotation_number ?? ""} — ${company?.name || ""}`,
      )}`
    : null;

  const refrescarEstado = async () => {
    await queryClient.invalidateQueries({ queryKey: ["quotations"] });
    await queryClient.invalidateQueries({ queryKey: ["quotation", id] });
  };

  const cambiarEstado = async (nuevo: string) => {
    if (!fila || nuevo === fila.quotation_status) return;
    try {
      if (nuevo === QuotationStatus.ACEPTADA) {
        const { data: pagosExistentes } = await getPaymentsByQuotationId(
          fila.id,
        );
        if (pagosExistentes && pagosExistentes.length > 0) {
          const { error } = await updateQuotation(
            { quotation_status: QuotationStatus.ACEPTADA },
            fila.id,
          );
          if (error) throw new Error(error.message);
          toast.success("Cotización aceptada (el plan de pagos ya existía).");
          await refrescarEstado();
          return;
        }
        setPlanAbierto(true);
        return;
      }
      const { error } = await updateQuotation(
        { quotation_status: nuevo as QuotationStatus },
        fila.id,
      );
      if (error) throw new Error(error.message);
      toast.success("Estado actualizado.");
      await refrescarEstado();
    } catch (error) {
      const backendMsg = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;
      toast.error(
        `No se pudo actualizar el estado: ${
          backendMsg ||
          (error instanceof Error ? error.message : "error desconocido")
        }`,
      );
      await refrescarEstado();
    }
  };

  const guardarPlan = async (customPlan: any[]) => {
    if (!fila) return;
    try {
      const pagos = customPlan.map((payment, index) => {
        if (!payment.due_date) {
          throw new Error(
            `La fecha de vencimiento es requerida para el pago ${index + 1}`,
          );
        }
        const pago: CreatePayment = {
          quotation_id: fila.id,
          payment_number: index + 1,
          amount: Math.round(payment.amount),
          due_date: new Date(payment.due_date),
          status: "pendiente",
          payment_type: payment.payment_type,
          notes: payment.notes || "",
        };
        return pago;
      });
      await createPaymentPlan(fila.id, pagos);
      toast.success(
        "Plan de pagos creado y cotización aceptada. Se envió el correo de confirmación al cliente.",
      );
      setPlanAbierto(false);
      await refrescarEstado();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear el plan",
      );
    }
  };

  // Estados honestos (pillada 04-08: durante una racha de red la ficha
  // mostraba un esqueleto mudo con "#" y "—" — mismo pecado que tuvo
  // el tablero): cargando = rueda; error = mensaje con reintento.
  if (listaQuery.isPending) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (listaQuery.isError || !fila) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/quotations")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold"
        >
          ← Volver a Cotizaciones
        </button>
        <p className="text-sm text-gray-500">
          {listaQuery.isError
            ? "No se pudo cargar la ficha (¿problema de conexión?)."
            : "No se encontró esta cotización."}
        </p>
        {listaQuery.isError && (
          <button
            type="button"
            onClick={() => void listaQuery.refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate("/quotations")}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold"
      >
        ← Volver a Cotizaciones
      </button>

      <div className="bg-white rounded-2xl shadow flex flex-col">
        {/* Encabezado: todo el contexto del negocio a la vista. */}
        <div className="shrink-0 flex flex-wrap items-start justify-between gap-3 p-6 border-b border-gray-200">
          <div>
            {/* La identidad manda: el cliente en grande, el número en
                gris discreto (pedido de Felipe 04-08). */}
            <h1 className="text-xl font-bold text-gray-900">
              {fila?.clients?.name}{" "}
              <span className="text-base font-semibold text-gray-400">
                #{fila?.quotation_number}
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {contacto.name || "—"}
              {contacto.phone ? ` · 📞 ${formatPhone(contacto.phone)}` : ""}
              {contacto.email ? ` · ✉️ ${contacto.email}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ESTADOS_VIVOS_FICHA.includes(fila?.quotation_status || "") ? (
              <span className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setEstadoMenu((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-full ${COLOR_ESTADO[fila?.quotation_status || ""] || "bg-gray-100 text-gray-700"}`}
                  title="Cambiar estado"
                >
                  {ESTADO_ETIQUETA[fila?.quotation_status || ""] ||
                    fila?.quotation_status}
                  <ChevronDown size={12} className="shrink-0" />
                </button>
                {estadoMenu && (
                  <>
                    <span
                      className="fixed inset-0 z-10 block"
                      onClick={() => setEstadoMenu(false)}
                    />
                    <span className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block">
                      {/* Cancelada NO va: es destino exclusivo de lo
                          aceptado (regla de Felipe 04-08), y las
                          aceptadas llevan chip fijo en esta ficha. */}
                      {[
                        "solicitada",
                        "enviada",
                        "en_negociacion",
                        "aceptada",
                        "rechazada",
                      ].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setEstadoMenu(false);
                            void cambiarEstado(st);
                          }}
                          className="block w-full text-left px-2.5 py-1.5 hover:bg-gray-50"
                        >
                          <span
                            className={`block w-full px-2.5 py-1 text-xs font-semibold rounded-full ${COLOR_ESTADO[st]}`}
                          >
                            {ESTADO_ETIQUETA[st]}
                          </span>
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded-full ${COLOR_ESTADO[fila?.quotation_status || ""] || "bg-gray-100 text-gray-700"}`}
                title="Las cerradas se gestionan en Post-Venta"
              >
                {ESTADO_ETIQUETA[fila?.quotation_status || ""] ||
                  fila?.quotation_status}
              </span>
            )}
            {wspHref && (
              <a
                href={wspHref}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:brightness-95"
                title="Abrir WhatsApp con el mandante"
              >
                <IconoWhatsApp /> WhatsApp
              </a>
            )}
            {correoHref && (
              <a
                href={correoHref}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
                title="Escribir correo al mandante"
              >
                <Mail size={15} /> Correo
              </a>
            )}
            <button
              type="button"
              onClick={() => setVerPdf(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
              title="Ver el documento de la cotización"
            >
              <FileText size={15} /> PDF
            </button>
          </div>
        </div>

        {/* Las cajitas del evento: pieza única compartida con
            Post-Venta (diseño de Felipe 04-08). */}
        <EventoCajitas
          quotationId={fila.id}
          tipo={String(fila.event_type || "")}
          fechaInicio={fila.event_date}
          fechaFin={fila.event_end_date}
          adultos={Math.max(
            0,
            (detalle?.people_count ?? fila.people_count ?? 0) -
              (detalle?.children_count ?? fila.children_count ?? 0),
          )}
          ninos={detalle?.children_count ?? fila.children_count ?? 0}
          monto={fila.total_amount}
          onFechaGuardada={() => {
            void queryClient.invalidateQueries({ queryKey: ["quotations"] });
            void queryClient.invalidateQueries({ queryKey: ["quotation", id] });
          }}
        />

        {/* Pestañas — misma estética que Post-Venta (subrayado azul),
            coherencia del sistema (pedido de Felipe 04-08). */}
        <div className="shrink-0 flex gap-1 px-6 border-b border-gray-200 items-center">
          {(
            [
              ["seguimiento", "Seguimiento"],
              // Mismo nombre que en Post-Venta: ES la misma pieza.
              ["cotizacion", "Servicios"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 ${
                tab === k
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "seguimiento" && fila && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <HiloSeguimiento quotation={fila} />
              <AdjuntosComerciales quotationId={fila.id} />
            </div>
          )}
          {tab === "cotizacion" &&
            fila &&
            (detalle ? (
              /* La MISMA fábrica de servicios de Post-Venta (pedido de
                 Felipe 04-08): se edita y trabaja desde aquí — una sola
                 fábrica, cero duplicación de reglas. En pre-venta no
                 hay pagos aún (paidAmount 0). */
              <ServiciosTab
                quote={detalle}
                paidAmount={0}
                onSaved={() => {
                  void queryClient.invalidateQueries({
                    queryKey: ["quotation", id],
                  });
                  void queryClient.invalidateQueries({
                    queryKey: ["quotations"],
                  });
                }}
              />
            ) : (
              <p className="text-sm text-gray-500">Cargando…</p>
            ))}
        </div>
      </div>

      {/* El visor necesita la cotización COMPLETA (detalle): la fila
          de la lista viaja a dieta, SIN items — con ella el PDF salía
          sin servicios (quemadura 05-08, cotización 436). */}
      {verPdf && fila && detalle && (
        <QuotationViewer
          quotation={{ ...fila, ...detalle, items: detalle.items || [] }}
          onClose={() => setVerPdf(false)}
        />
      )}

      {planAbierto && fila && (
        <PaymentPlanEditor
          quotation={{
            id: fila.id,
            quotation_number: fila.quotation_number.toString(),
            client_name: fila.clients?.name,
            total_amount: fila.total_amount,
            event_date: fila.event_date,
          }}
          onSave={guardarPlan}
          onCancel={() => setPlanAbierto(false)}
        />
      )}
    </div>
  );
}

// ---- El hilo comercial (mudado desde la ventanita del tablero) ----
function HiloSeguimiento({
  quotation,
}: {
  readonly quotation: QuotationWithClient;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hiloQuery = useQuery({
    queryKey: ["seguimientos", quotation.id],
    staleTime: 0,
    queryFn: () => getFollowupsByQuotation(quotation.id),
  });
  const notas = hiloQuery.data ?? [];

  // Negocio vivo = próximo paso OBLIGATORIO al anotar; muerto
  // (rechazada/aceptada/realizada/cancelada) = solo notas de archivo y
  // compromisos inertes en gris.
  const negocioVivo = ESTADOS_VIVOS_SEGUIMIENTO.includes(
    quotation.quotation_status || "",
  );

  const [nota, setNota] = useState("");
  const [tipo, setTipo] = useState("");
  const [proxima, setProxima] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNota, setEditNota] = useState("");
  const [editTipo, setEditTipo] = useState("");
  const [editFecha, setEditFecha] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);
  // Focos de la franja de empujón: Registrar gestión → cuadro de nota;
  // Reprogramar → casilla de fecha.
  const notaRef = useRef<HTMLTextAreaElement>(null);
  const fechaRef = useRef<HTMLInputElement>(null);

  const refrescar = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["seguimientos", quotation.id],
    });
    await queryClient.invalidateQueries({ queryKey: ["seguimientos", "map"] });
  };

  // Regla de Close al escribir: en vivos faltan cosas hasta que haya
  // texto + tipo + fecha; en muertos basta el texto (nota de archivo).
  const faltan = [
    !nota.trim() && "la nota",
    negocioVivo && !tipo && "el tipo de gestión",
    negocioVivo && !proxima && "el próximo contacto",
  ].filter(Boolean) as string[];
  const puedeGuardar = faltan.length === 0 && !guardando;

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErr(null);
    try {
      await createFollowup({
        quotation_id: quotation.id,
        note: nota.trim(),
        // En negocios muertos la nota es de archivo: sin tipo ni fecha.
        ...(negocioVivo && tipo ? { tipo: tipo as FollowupTipo } : {}),
        ...(negocioVivo && proxima ? { next_contact_date: proxima } : {}),
      });
      setNota("");
      setTipo("");
      setProxima("");
      toast.success("Nota guardada");
      await refrescar();
    } catch {
      setErr("No se pudo guardar la nota");
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdicion = async (nid: number) => {
    const texto = editNota.trim();
    if (!texto) return;
    // La obligación de tipo + fecha aplica también al editar en vivos.
    if (negocioVivo && (!editTipo || !editFecha)) return;
    try {
      await updateFollowup(nid, {
        note: texto,
        ...(negocioVivo && editTipo
          ? { tipo: editTipo as FollowupTipo }
          : {}),
        ...(negocioVivo && editFecha
          ? { next_contact_date: editFecha }
          : {}),
      });
      setEditId(null);
      await refrescar();
    } catch {
      setErr("No se pudo editar la nota");
    }
  };

  const borrar = async (nid: number) => {
    setConfirmDelId(null);
    try {
      await deleteFollowup(nid);
      toast.success("Nota eliminada");
      await refrescar();
    } catch {
      setErr("No se pudo eliminar la nota");
    }
  };

  type Entrada =
    | { kind: "nota"; at: string; nota: Followup }
    | { kind: "sistema"; at: string; texto: string };
  const entradas: Entrada[] = useMemo(
    () =>
      [
        ...notas.map((n) => ({
          kind: "nota" as const,
          at: n.created_at,
          nota: n,
        })),
        ...(quotation.sent_at
          ? [
              {
                kind: "sistema" as const,
                at: quotation.sent_at,
                texto: "Cotización enviada al cliente",
              },
            ]
          : []),
      ].sort((a, b) => (a.at < b.at ? 1 : -1)),
    [notas, quotation.sent_at],
  );

  // DERIVADO, sin estado nuevo en la base: solo el compromiso de la
  // nota MÁS RECIENTE con fecha está "vivo"; los anteriores quedaron
  // resueltos por la gestión que los siguió.
  const notaCompromiso = useMemo(() => {
    let top: Followup | null = null;
    for (const n of notas) {
      if (!n.next_contact_date) continue;
      if (!top || n.created_at > top.created_at) top = n;
    }
    return top;
  }, [notas]);
  const compromisoFecha =
    notaCompromiso?.next_contact_date?.slice(0, 10) || "";
  // Cara del compromiso vivo por fecha LOCAL (patrón hoyLocal), nunca
  // por timestamps: futuro azul, hoy ámbar, pasado rojo.
  const compromisoCara = (() => {
    if (!compromisoFecha) return null;
    const hoy = hoyLocal();
    if (compromisoFecha < hoy) return "vencido" as const;
    if (compromisoFecha === hoy) return "hoy" as const;
    return "futuro" as const;
  })();

  // Chip de compromiso de UNA nota: gris inerte en negocios muertos;
  // en vivos, el más reciente con sus 3 caras y los viejos ✓ cumplidos.
  const chipCompromiso = (n: Followup) => {
    if (!n.next_contact_date) return null;
    const dm = ddmm(n.next_contact_date);
    if (!negocioVivo)
      return (
        <p className="mt-1.5 text-xs text-gray-400">
          📅 Próximo contacto: {dm}
        </p>
      );
    if (notaCompromiso && n.id === notaCompromiso.id) {
      if (compromisoCara === "vencido")
        return (
          <p className="mt-1.5 text-xs font-semibold text-red-600">
            📅 Próximo contacto: {dm} — vencido
          </p>
        );
      if (compromisoCara === "hoy")
        return (
          <p className="mt-1.5 text-xs font-semibold text-amber-600">
            📅 Próximo contacto: {dm} — es hoy
          </p>
        );
      return (
        <p className="mt-1.5 text-xs text-blue-700">
          📅 Próximo contacto: {dm}
        </p>
      );
    }
    return (
      <p className="mt-1.5 text-xs text-gray-400">
        ✓ Próximo contacto: {dm} — cumplido
      </p>
    );
  };

  // Fila de botoncitos de tipo (reemplaza el menucito): los mismos 5
  // tipos e íconos de siempre, con borde y color al elegir.
  // estirado: los 5 botones se reparten el ancho completo de la caja
  // de comentarios (pedido de Felipe 05-08 — "más armónico").
  const chipsTipo = (
    val: string,
    onPick: (v: string) => void,
    estirado = false,
  ) => (
    <div
      className={
        estirado
          ? "grid grid-cols-5 gap-2"
          : "flex flex-wrap items-center gap-1.5"
      }
    >
      {TIPOS_GESTION.map((t) => (
        <button
          key={t.v}
          type="button"
          onClick={() => onPick(val === t.v ? "" : t.v)}
          title={t.l}
          className={`flex items-center ${estirado ? "justify-center" : ""} gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg border ${
            val === t.v
              ? COLOR_TIPO[t.v]
              : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          <IconoTipo tipo={t.v} size={13} /> {t.l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="border border-gray-200 rounded-xl flex flex-col">
      <h3 className="text-sm font-bold text-gray-700 px-4 pt-3 pb-2 flex items-center gap-1.5">
        <MessageSquare size={15} /> Hilo de seguimiento
      </h3>
      {/* Franja de empujón (solo negocios vivos): el compromiso vivo es
          hoy o venció — a registrar la gestión o a reprogramar. */}
      {negocioVivo &&
        (compromisoCara === "hoy" || compromisoCara === "vencido") && (
          <div
            className={`mx-4 mb-2 rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1 ${
              compromisoCara === "vencido"
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            <span className="font-semibold">
              Contacto comprometido: {ddmm(compromisoFecha)}
            </span>
            <button
              type="button"
              onClick={() => notaRef.current?.focus()}
              className="font-semibold underline hover:no-underline"
            >
              Registrar gestión
            </button>
            <button
              type="button"
              onClick={() => fechaRef.current?.focus()}
              className="font-semibold underline hover:no-underline"
            >
              Reprogramar
            </button>
          </div>
        )}
      <div className="flex-1 overflow-y-auto max-h-[420px] px-4">
        {(() => {
          if (hiloQuery.isPending)
            return <p className="text-sm text-gray-500">Cargando…</p>;
          if (entradas.length === 0)
            return (
              <p className="text-sm text-gray-500">
                Sin notas todavía. La primera gestión parte abajo. 👇
              </p>
            );
          return (
            /* Línea de tiempo vertical estilo Clientify: raya sutil y un
               punto por entrada — inicial del autor con color estable;
               lo de sistema, punto chico gris en la misma línea. */
            <div className="relative">
              <div className="absolute left-[13px] top-1 bottom-1 w-px bg-gray-200" />
              {entradas.map((e) => {
                if (e.kind === "sistema")
                  return (
                    <div key={`sys-${e.at}`} className="relative pl-9 pb-3">
                      <span className="absolute left-[9px] top-1 w-2.5 h-2.5 rounded-full bg-gray-300 border-2 border-white" />
                      <span
                        className="text-xs text-gray-400"
                        title={fechaCorta(e.at)}
                      >
                        {e.texto} — {fechaHumana(e.at)}
                      </span>
                    </div>
                  );
                const autor = nombreAutor(e.nota.author_name);
                return (
                  <div key={e.nota.id} className="relative pl-9 pb-3">
                    <span
                      className="absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white"
                      style={{ backgroundColor: colorAutor(autor) }}
                      title={autor}
                    >
                      {autor === "—" ? "?" : autor.charAt(0).toUpperCase()}
                    </span>
                    <div className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">
                            {autor}
                          </span>{" "}
                          ·{" "}
                          <span title={fechaCorta(e.nota.created_at)}>
                            {fechaHumana(e.nota.created_at)}
                          </span>
                          {e.nota.updated_at ? " · editada" : ""}
                          {e.nota.tipo ? (
                            <span
                              className={`ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full align-middle ${
                                COLOR_TIPO[e.nota.tipo] || COLOR_TIPO.otro
                              }`}
                            >
                              <IconoTipo tipo={e.nota.tipo} size={11} />
                              {nombreTipo(e.nota.tipo)}
                            </span>
                          ) : null}
                        </div>
                        {e.nota.author_user_id === user?.id &&
                          editId !== e.nota.id && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {confirmDelId === e.nota.id ? (
                                <ConfirmInline
                                  question="¿Eliminar?"
                                  onYes={() => void borrar(e.nota.id)}
                                  onNo={() => setConfirmDelId(null)}
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditId(e.nota.id);
                                      setEditNota(e.nota.note);
                                      setEditTipo(e.nota.tipo || "");
                                      setEditFecha(
                                        e.nota.next_contact_date?.slice(
                                          0,
                                          10,
                                        ) || "",
                                      );
                                    }}
                                    className="text-gray-300 hover:text-gray-500"
                                    title="Editar mi nota"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmDelId(e.nota.id)
                                    }
                                    className="text-gray-300 hover:text-red-500"
                                    title="Eliminar mi nota"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                      </div>
                      {editId === e.nota.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editNota}
                            onChange={(ev) => setEditNota(ev.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          {/* En vivos, editar también exige tipo y fecha
                              (misma regla de Close); en muertos la nota
                              es de archivo y solo se toca el texto. */}
                          {negocioVivo && (
                            <div className="flex flex-wrap items-center gap-2.5">
                              {chipsTipo(editTipo, setEditTipo)}
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                Próx. contacto
                                <input
                                  type="date"
                                  value={editFecha}
                                  onChange={(ev) =>
                                    setEditFecha(ev.target.value)
                                  }
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                                />
                              </label>
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                              Cancelar
                            </button>
                            {(() => {
                              const faltanEd = [
                                !editNota.trim() && "la nota",
                                negocioVivo &&
                                  !editTipo &&
                                  "el tipo de gestión",
                                negocioVivo &&
                                  !editFecha &&
                                  "el próximo contacto",
                              ].filter(Boolean) as string[];
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void guardarEdicion(e.nota.id)
                                  }
                                  disabled={faltanEd.length > 0}
                                  title={
                                    faltanEd.length > 0
                                      ? `Falta ${faltanEd.join(", ")}`
                                      : undefined
                                  }
                                  className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Guardar
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-sm text-gray-800 whitespace-pre-wrap">
                          {e.nota.note}
                        </p>
                      )}
                      {chipCompromiso(e.nota)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div className="shrink-0 border-t border-gray-200 p-4 space-y-2.5 mt-3">
        {err && <p className="text-xs text-red-600">{err}</p>}
        <textarea
          ref={notaRef}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder={
            negocioVivo
              ? "¿Qué pasó con esta negociación? (llamada, respuesta, espera de aprobación…)"
              : "Nota de archivo (negocio cerrado: sin próximo paso)"
          }
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {negocioVivo ? (
          /* Negocio vivo: tipo y próximo contacto OBLIGATORIOS — un
             negocio vivo siempre tiene próximo paso. */
          /* Dos filas armónicas (pedido de Felipe 05-08): los chips se
             reparten el ancho completo de la caja de comentarios, y
             abajo el calendario PEGADO al Guardar, a la derecha. */
          <>
            {chipsTipo(tipo, setTipo, true)}
            <div className="flex items-center justify-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Próx. contacto
                <input
                  ref={fechaRef}
                  type="date"
                  value={proxima}
                  min={hoyLocal()}
                  onChange={(e) => setProxima(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </label>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={!puedeGuardar}
                title={
                  faltan.length > 0 ? `Falta ${faltan.join(", ")}` : undefined
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        ) : (
          /* Negocio muerto: solo la nota de archivo — sin tipo, sin
             fecha, sin empujones. */
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!puedeGuardar}
              className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Respaldos comerciales: pantallazos de WhatsApp, correos… ----
// Mismo lenguaje que Documentos de Post-Venta (comentario como
// etiqueta, "Ver" sin descargas forzadas, visor al lado) pero SOLO la
// categoría "comercial": cuando el evento pase a Post-Venta, la
// historia viaja con él sin mezclarse con contratos y comprobantes.
function AdjuntosComerciales({ quotationId }: { readonly quotationId: string }) {
  const queryClient = useQueryClient();
  const docsQuery = useQuery({
    queryKey: ["postventa", "docs", quotationId],
    staleTime: 0,
    queryFn: () => getDocumentsByQuotation(quotationId),
  });
  const comerciales = (docsQuery.data ?? []).filter(
    (d) => d.category === "comercial",
  );

  const [archivo, setArchivo] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);
  const [visor, setVisor] = useState<EventDocument | null>(null);
  const [visorUrl, setVisorUrl] = useState<string | null>(null);

  const load = () =>
    queryClient.invalidateQueries({
      queryKey: ["postventa", "docs", quotationId],
    });

  const subir = async () => {
    if (!archivo || subiendo) return;
    setSubiendo(true);
    setErr(null);
    try {
      const up = await uploadEventDocument(archivo, quotationId, "comercial");
      if (!up.success) throw new Error(up.error || "No se pudo subir");
      const { error } = await addDocument({
        quotation_id: quotationId,
        category: "comercial",
        // El comentario ES la etiqueta (el archivo real vive en la URL).
        file_name: comentario.trim() || archivo.name,
        file_url: up.url || "",
      });
      if (error) throw error;
      toast.success("Respaldo subido.");
      setArchivo(null);
      setComentario("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir el respaldo");
    } finally {
      setSubiendo(false);
    }
  };

  const borrar = async (doc: EventDocument) => {
    setConfirmDelId(null);
    const { error } = await deleteDocument(doc.id);
    if (error) toast.error("No se pudo eliminar el respaldo");
    else {
      toast.success("Respaldo eliminado.");
      if (visor?.id === doc.id) {
        setVisor(null);
        setVisorUrl(null);
      }
      load();
    }
  };

  // El visor solo trabaja cuando pinchas "Ver" (regla de Felipe:
  // no exigir al sistema si no lo quiero ver).
  const abrirVisor = async (doc: EventDocument) => {
    setVisor(doc);
    setVisorUrl(null);
    const url = await resolveStorageUrl(doc.file_url);
    setVisorUrl(url);
  };

  const esImagen = (url: string) => /\.(jpe?g|png|webp|gif|heic)/i.test(url);

  return (
    <div className="border border-gray-200 rounded-xl flex flex-col">
      <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5 px-4 pt-3">
        <Upload size={15} /> Respaldos comerciales
      </h3>
      <p className="text-xs text-gray-500 px-4 pb-2">
        Pantallazos de WhatsApp, correos — la evidencia del último estado.
      </p>

      <div className="flex-1 overflow-y-auto max-h-[420px] px-4 divide-y divide-gray-100">
        {(() => {
          if (docsQuery.isPending)
            return <p className="py-2 text-sm text-gray-500">Cargando…</p>;
          if (comerciales.length === 0)
            return (
              <p className="py-2 text-sm text-gray-500">
                Sin respaldos todavía.
              </p>
            );
          return comerciales.map((d) => (
            <div
              key={d.id}
              className="py-2 flex items-center gap-3 justify-between"
            >
              <span className="text-sm text-gray-800 truncate flex-1">
                {d.file_name}
                <span className="text-xs text-gray-400">
                  {" "}
                  · {fechaCorta(d.uploaded_at)}
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void abrirVisor(d)}
                  className="text-sm font-semibold text-blue-600 hover:underline"
                >
                  Ver
                </button>
                {confirmDelId === d.id ? (
                  <ConfirmInline
                    question="¿Eliminar?"
                    onYes={() => void borrar(d)}
                    onNo={() => setConfirmDelId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelId(d.id)}
                    className="text-gray-300 hover:text-red-500"
                    title="Eliminar respaldo"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Acción abajo, como el cajón del hilo: los dos botones azules
          quedan anclados a la misma altura (pedido de Felipe 04-08). */}
      <div className="shrink-0 border-t border-gray-200 p-4 space-y-2.5 mt-3">
        {err && <p className="text-xs text-red-600">{err}</p>}
        <input
          type="file"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-semibold hover:file:bg-gray-200"
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentario (será la etiqueta del respaldo)"
            className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => void subir()}
            disabled={!archivo || subiendo}
            className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {subiendo ? "Subiendo…" : "Subir respaldo"}
          </button>
        </div>
      </div>

      {/* Visor en MODAL (pedido de Felipe 04-08): el respaldo se mira
          en grande y se cierra, sin empujar la página. */}
      {visor && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setVisor(null);
            setVisorUrl(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {visor.file_name}
              </p>
              <button
                type="button"
                onClick={() => {
                  setVisor(null);
                  setVisorUrl(null);
                }}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            {(() => {
              if (!visorUrl)
                return <p className="p-6 text-sm text-gray-500">Cargando…</p>;
              if (esImagen(visor.file_url) || esImagen(visorUrl))
                return (
                  <img
                    src={visorUrl}
                    alt={visor.file_name}
                    className="max-h-[75vh] w-full object-contain bg-gray-50"
                  />
                );
              return (
                <iframe
                  src={visorUrl}
                  title={visor.file_name}
                  className="w-full h-[75vh]"
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
