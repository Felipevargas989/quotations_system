import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { getFollowupsMap } from "../../services/quotationFollowups.service";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../components/toast/Toast";
import QuotationViewer from "../../components/QuotationViewer";
import { ROLE_GROUPS } from "../../constants/permissions";
import PaymentPlanEditor from "../../components/PaymentPlanEditor";
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
import { formatISOUTCDateToString } from "../../utils/dates";
import { matchesSearch, normalizeText } from "../../utils/searchMatch";
import { filtrosGuardados, guardarFiltros } from "./filtrosTablero";

// La Lista se jubiló (04-08, decisión de Felipe): el tablero es la
// única vista — cerradas en Post-Venta, rechazadas en su franja, la
// búsqueda encuentra todo. El orden de las tarjetas se recuerda.
const ORDEN_TABLERO_KEY = (userId: string | number) =>
  `eventia_quotations_orden_tablero_${userId}`;

// ---- Bitácora comercial (migración 59): semáforo de seguimiento ----
// El reloj corre desde la última gestión REAL (nota escrita o
// cotización enviada; editar campos no cuenta). Umbrales del estudio
// de mercado: verde < 3 días, ámbar 3-7, rojo > 7. Y la regla fina de
// Close: próximo contacto vigente = tranquila; vencido = rojo fuerte.
const DIA_MS = 86_400_000;
const hoyLocal = () => {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};
const diasDesde = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DIA_MS));
const diasEntreFechas = (desdeYmd: string, hastaYmd: string) =>
  Math.round(
    (new Date(hastaYmd + "T12:00:00").getTime() -
      new Date(desdeYmd + "T12:00:00").getTime()) /
      DIA_MS,
  );
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}`;

const ESTADOS_VIVOS = new Set<QuotationStatus>([
  QuotationStatus.SOLICITADA,
  QuotationStatus.ENVIADA,
  QuotationStatus.EN_NEGOCIACION,
]);

// Contacto de la fila/tarjeta/hilo: el MANDANTE de la cotización con
// su propio teléfono (misma regla que Post-Venta); sin mandante
// guardado → el contacto principal del cliente. A nivel de módulo
// para que el hilo de la bitácora también lo use.
const contactOf = (q: QuotationWithClient) => {
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
      // Correo en la columna (pedido de Felipe 30-07): gestión más
      // rápida sin abrir la ficha.
      email: match?.email || "",
    };
  }
  return {
    name: c?.contact_person || "",
    phone: c?.phone || "",
    email: c?.email || "",
  };
};

const ORDEN_ETIQUETA: Record<string, string> = {
  urgencia: "Urgencia",
  fecha: "Fecha evento",
  numero: "N°",
  monto: "Monto",
};


export default function QuotationsPage() {
  const { user, userRole, company } = useAuth();
  // Umbral de alto valor (migración 60): 💎 en las tarjetas.
  const umbralAltoValor = Number(company?.high_value_threshold || 0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Menú de estado de la casa (Tanda 3b): reemplaza al <select> nativo.
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const STATUS_EMOJI: Record<string, string> = {
    solicitada: "📋",
    enviada: "📤",
    en_negociacion: "💬",
    aceptada: "✅",
    rechazada: "❌",
    cancelada: "🚫",
    realizada: "🎉",
  };
  const STATUS_LABEL: Record<string, string> = {
    solicitada: "Solicitada",
    enviada: "Enviada",
    en_negociacion: "En Negociación",
    aceptada: "Aceptada",
    rechazada: "Rechazada",
    cancelada: "Cancelada",
    realizada: "Realizada",
  };
  // Reglas del ciclo de vida (afinadas por Felipe 04-08): Cancelada y
  // Realizada son destinos EXCLUSIVOS de lo aceptado — lo que nunca se
  // ganó se rechaza, no se cancela. Cancelada: solo administradores y
  // solo desde Aceptada (o si ya lo está). Realizada no se elige desde
  // aquí — solo se muestra (y permite revertir a Aceptada si fue error).
  const statusOptionsFor = (q: QuotationWithClient) => {
    const base = [
      "solicitada",
      "enviada",
      "en_negociacion",
      "aceptada",
      "rechazada",
    ];
    if (
      (q.quotation_status === "aceptada" &&
        ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any)) ||
      q.quotation_status === "cancelada"
    )
      base.push("cancelada");
    if (q.quotation_status === "realizada") base.push("realizada");
    return base;
  };

  // Cambio post-venta → pre-venta pendiente de confirmación (Tanda 3a).
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    quotationId: string;
    newStatus: string;
  } | null>(null);
  // Una sola foto del storage por montaje: los tres filtros parten
  // de la misma lectura.
  const [filtrosIniciales] = useState(() => filtrosGuardados(user?.id));
  const [searchTerm, setSearchTerm] = useState(filtrosIniciales.busqueda ?? "");
  const [showViewer, setShowViewer] = useState(false);
  const [viewingQuotation, setViewingQuotation] =
    useState<QuotationWithClient | null>(null);
  const [showPaymentPlanEditor, setShowPaymentPlanEditor] = useState(false);
  const [quotationForPaymentPlan, setQuotationForPaymentPlan] =
    useState<Quotation | null>(null);

  // Orden dentro de las columnas: Urgencia por defecto (lo más frío
  // arriba — la filosofía de la cola).
  const [ordenTablero, setOrdenTablero] = useState<
    "urgencia" | "fecha" | "numero" | "monto"
  >(() => {
    try {
      const v = user ? localStorage.getItem(ORDEN_TABLERO_KEY(user.id)) : null;
      return v === "fecha" || v === "numero" || v === "monto" ? v : "urgencia";
    } catch {
      return "urgencia";
    }
  });
  const [ordenMenuAbierto, setOrdenMenuAbierto] = useState(false);
  // Arrastre nativo entre columnas (Tanda A, pedido de Felipe): soltar
  // = el mismo cambio de estado de la píldora. El orden dentro de la
  // columna es automático, así que el destino es la COLUMNA entera
  // (que se ilumina) — sin posiciones manuales que mantener.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<QuotationStatus | null>(null);
  const cambiarOrdenTablero = (
    v: "urgencia" | "fecha" | "numero" | "monto",
  ) => {
    setOrdenTablero(v);
    try {
      if (user) localStorage.setItem(ORDEN_TABLERO_KEY(user.id), v);
    } catch {
      /* sin persistencia no pasa nada */
    }
  };

  // ---- Cotizaciones y requerimientos vía React Query (Etapa 2) ----
  // El tablero es la única vista: el embudo vivo, siempre. Volver a
  // esta pantalla pinta al instante desde caché y revalida detrás.
  const quotationsQuery = useQuery({
    queryKey: ["quotations", "embudo"],
    enabled: !!user,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION, [
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
      ]);
      return data;
    },
  });
  const quotations = quotationsQuery.data ?? [];
  const loading = quotationsQuery.isPending;

  const { data: requirements = [] } = useQuery({
    queryKey: ["requirements"],
    enabled: !!user,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      // Requirements don't need status filtering, they are always "solicitada"
      const { data } = await getQuotations(QuotationRequestType.REQUERIMIENTO, [
        QuotationStatus.SOLICITADA,
      ]);
      return data;
    },
  });

  // Los antiguos "fetch" ahora son invalidaciones: todos los puntos que
  // llaman tras guardar/cambiar estado siguen funcionando igual.
  const fetchQuotations = async () => {
    await queryClient.invalidateQueries({ queryKey: ["quotations"] });
  };
  const fetchRequirements = async () => {
    await queryClient.invalidateQueries({ queryKey: ["requirements"] });
  };

  // Semáforo de seguimiento: última gestión por cotización (frescura
  // inmediata, patrón de la casa).
  const seguimientosQuery = useQuery({
    queryKey: ["seguimientos", "map"],
    enabled: !!user,
    staleTime: 0,
    queryFn: getFollowupsMap,
  });
  const seguimientosMap = seguimientosQuery.data ?? {};
  const [soloSeguimiento, setSoloSeguimiento] = useState(
    filtrosIniciales.soloSeguimiento ?? false,
  );

  type Semaforo = { texto: string; clase: string; urgencia: number };
  const semaforoDe = (q: QuotationWithClient): Semaforo | null => {
    if (!ESTADOS_VIVOS.has(q.quotation_status)) return null;
    const info = seguimientosMap[q.id];
    const hoy = hoyLocal();
    const next = info?.next_contact_date || null;
    if (next && next >= hoy) {
      return {
        texto: `Próx: ${ddmm(next)}`,
        clase: "bg-emerald-100 text-emerald-800",
        urgencia: 0,
      };
    }
    if (next && next < hoy) {
      const d = diasEntreFechas(next, hoy);
      return {
        texto: `Vencido hace ${d} d`,
        clase: "bg-red-100 text-red-800",
        urgencia: 1000 + d,
      };
    }
    // Sin próximo contacto: escala por días desde la última gestión
    // (nota, envío al cliente o — como piso — la creación).
    const candidatas = [
      info?.last_at,
      q.sent_at || null,
      String(q.created_at),
    ].filter(Boolean) as string[];
    const ordenadas = [...candidatas].sort();
    const ultima = ordenadas[ordenadas.length - 1];
    const d = diasDesde(ultima);
    let clase = "bg-emerald-100 text-emerald-800";
    if (d >= 3) clase = "bg-amber-100 text-amber-800";
    if (d > 7) clase = "bg-red-100 text-red-800";
    return {
      texto: d === 0 ? "Gestionada hoy" : `Sin gestión ${d} d`,
      clase,
      urgencia: 100 + d,
    };
  };
  // "Requiere seguimiento": vencida, o 3+ días sin gestión.
  const requiereSeguimiento = (q: QuotationWithClient) => {
    const s = semaforoDe(q);
    return !!s && s.urgencia >= 103;
  };





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

  const handleStatusChange = async (quotationId: string, newStatus: string) => {
    // Guardia de estados: volver de post-venta (aceptada/realizada/
    // cancelada) a pre-venta elimina el plan de pagos — se pregunta
    // antes con la ventanita de la casa (Tanda 3a: adiós al confirm()
    // del navegador). Si hay pagos registrados, el backend rechaza.
    const POST_SALE = ["aceptada", "realizada", "cancelada"];
    const PRE_SALE = ["solicitada", "enviada", "en_negociacion", "rechazada"];
    const current = quotations.find((q) => q.id === quotationId);
    if (
      current &&
      POST_SALE.includes(current.quotation_status) &&
      PRE_SALE.includes(newStatus)
    ) {
      setPendingStatusChange({ quotationId, newStatus });
      return;
    }
    await applyStatusChange(quotationId, newStatus);
  };

  const applyStatusChange = async (quotationId: string, newStatus: string) => {
    try {
      if (newStatus === QuotationStatus.ACEPTADA) {
        const quotation = quotations.find((q) => q.id === quotationId);
        if (quotation) {
          // Check if payment plan already exists
          const { data: existingPayments } =
            await getPaymentsByQuotationId(quotationId);

          if (existingPayments && existingPayments.length > 0) {
            //
            // Payment plan already exists, just update the status
            const { error } = await updateQuotation(
              { quotation_status: newStatus as QuotationStatus },
              quotationId,
            );

            if (error) {
              throw new Error(
                `Error actualizando cotización: ${error.message}`,
              );
            }

            toast.success(
              "Cotización aceptada (el plan de pagos ya existía).",
            );
            await fetchQuotations();
            await fetchRequirements();
            return;
          }

          // Show payment plan editor first
          setQuotationForPaymentPlan(quotation);
          setShowPaymentPlanEditor(true);
          return; // Don't update status yet
        }
      }

      // For other statuses or after payment plan is accepted, update the status
      const { error } = await updateQuotation(
        { quotation_status: newStatus as QuotationStatus },
        quotationId,
      );

      if (error) {
        throw new Error(`Error actualizando cotización: ${error.message}`);
      }

      toast.success(
        `Estado actualizado a ${newStatus}${newStatus === QuotationStatus.ENVIADA ? ". Se envió el correo de confirmación al cliente." : "."}`,
      );
      await fetchQuotations();
      await fetchRequirements();
    } catch (error) {
      // El backend puede rechazar con un motivo claro (ej: la guardia de
      // estados cuando hay pagos registrados) — mostrarlo tal cual.
      const backendMsg = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;
      toast.error(
        `No se pudo actualizar el estado: ${
          backendMsg ||
          (error instanceof Error ? error.message : "error desconocido")
        }`,
      );
      await fetchQuotations();
    }
  };

  const handlePaymentPlanSave = async (customPlan: any[]) => {
    if (!quotationForPaymentPlan) return;

    try {
      // Create payments array (el editor entrega montos en pesos directos)
      const paymentsToCreate = customPlan.map((payment, index) => {
        if (!payment.due_date) {
          throw new Error(
            `La fecha de vencimiento es requerida para el pago ${index + 1}`,
          );
        }

        const paymentToCreate: CreatePayment = {
          quotation_id: quotationForPaymentPlan.id,
          payment_number: index + 1,
          amount: Math.round(payment.amount),
          due_date: new Date(payment.due_date),
          status: "pendiente",
          payment_type: payment.payment_type,
          notes: payment.notes || "",
        };
        return paymentToCreate;
      });

      // call API reques to create paymet plan
      await createPaymentPlan(quotationForPaymentPlan.id, paymentsToCreate);

      toast.success(
        "Plan de pagos creado y cotización aceptada. Se envió el correo de confirmación al cliente.",
      );
      setShowPaymentPlanEditor(false);
      setQuotationForPaymentPlan(null);
      await fetchQuotations();
      await fetchRequirements();
    } catch (error) {
      toast.error(
        `No se pudo crear el plan de pagos: ${error instanceof Error ? error.message : "error desconocido"}`,
      );
    }
  };

  const handlePaymentPlanCancel = () => {
    setShowPaymentPlanEditor(false);
    setQuotationForPaymentPlan(null);
  };

  const handleViewQuotation = async (quotation: QuotationWithClient) => {
    try {
      // FASE VELOCIDAD Etapa 3 (28-07): la lista ya no viaja con los
      // items (dieta de 93→15 KB) — el visor pide la cotización
      // completa recién cuando alguien la abre.
      const { data } = await getQuotationById(String(quotation.id));
      const quotationWithItems = {
        ...quotation,
        ...(data || {}),
        items: data?.items || [],
      };
      setViewingQuotation(quotationWithItems);
      setShowViewer(true);
    } catch (error) {
      console.error("Error loading quotation details:", error);
      toast.error("No se pudieron cargar los detalles de la cotización.");
    }
  };

  // Fila clickeable (patrón Post-Venta): con permiso → edición; sin
  // permiso (aceptadas para roles no operativos) → visor de solo lectura.
  // El click siempre hace algo útil, sin avisos de permiso.


  // Número: exacto (decisión 21-07). Nombre: búsqueda inteligente (sin
  // tildes, palabras en cualquier orden).
  // Píldora de estado con su menú de la casa — compartida por la fila
  // de la Lista y la tarjeta del Tablero (mismo estado, mismo menú).
  // modo "pill": la píldora completa (Lista). modo "icono": solo el ⌄
  // discreto (Tablero — la columna YA dice el estado; repetirlo en cada
  // tarjeta era el desorden que acusó Felipe).
  const estadoPill = (
    quotation: QuotationWithClient,
    modo: "pill" | "icono" = "pill",
  ) => (
    <span className="relative inline-block">
      {modo === "icono" ? (
        <button
          type="button"
          onClick={() =>
            setStatusMenuId((v) => (v === quotation.id ? null : quotation.id))
          }
          className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
          title="Cambiar estado"
        >
          <ChevronDown size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() =>
            setStatusMenuId((v) => (v === quotation.id ? null : quotation.id))
          }
          className={`flex items-center justify-between gap-1 w-40 px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusColor(quotation.quotation_status)}`}
          title="Cambiar estado"
        >
          <span className="truncate">
            {STATUS_EMOJI[quotation.quotation_status] || ""}{" "}
            {STATUS_LABEL[quotation.quotation_status] ||
              quotation.quotation_status}
          </span>
          <ChevronDown size={12} className="shrink-0" />
        </button>
      )}
      {statusMenuId === quotation.id && (
        <>
          <span
            className="fixed inset-0 z-10 block"
            onClick={() => setStatusMenuId(null)}
          />
          {/* whitespace-normal: la celda es nowrap y sin esto las
              opciones se forman en una línea horizontal. */}
          <span className="absolute left-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block whitespace-normal">
            {statusOptionsFor(quotation).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusMenuId(null);
                  if (st !== quotation.quotation_status)
                    void handleStatusChange(quotation.id, st);
                }}
                className="block w-full text-left px-2.5 py-1.5 hover:bg-gray-50"
              >
                <span
                  className={`block w-full px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusColor(st)}`}
                >
                  {STATUS_EMOJI[st]} {STATUS_LABEL[st]}
                </span>
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );

  // Predicado de búsqueda compartido por las vivas y el archivo.
  const coincideBusqueda = (quotation: QuotationWithClient) =>
    !searchTerm ||
    quotation.quotation_number?.toString() === searchTerm.trim() ||
    matchesSearch(searchTerm, quotation.clients?.name) ||
    // También por MANDANTE (pedido de Felipe 30-07): buscar "Roxana"
    // encuentra sus cotizaciones aunque el cliente sea la UdeC —
    // tanto por el texto escrito como por la persona vinculada.
    matchesSearch(searchTerm, quotation.contact_name) ||
    matchesSearch(searchTerm, quotation.mandante?.name);

  const filtradasBase = quotations.filter(coincideBusqueda);

  // Camino a tablero-único: las rechazadas viven plegadas bajo el
  // tablero, y la búsqueda también revisa el archivo completo para que
  // NADA sea inencontrable (aceptadas/realizadas enlazan a Post-Venta).
  const rechazadasQuery = useQuery({
    queryKey: ["quotations", "rechazadas"],
    enabled: !!user,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION, [
        QuotationStatus.RECHAZADA,
      ]);
      return data;
    },
  });
  const rechazadas = (rechazadasQuery.data ?? []).filter(coincideBusqueda);
  const [verRechazadas, setVerRechazadas] = useState(
    filtrosIniciales.verRechazadas ?? false,
  );

  const userId = user?.id;
  useEffect(() => {
    guardarFiltros(userId, {
      busqueda: searchTerm,
      soloSeguimiento,
      verRechazadas,
    });
  }, [userId, searchTerm, soloSeguimiento, verRechazadas]);

  const busquedaActiva = searchTerm.trim() !== "";
  const cerradasQuery = useQuery({
    queryKey: ["quotations", "cerradas-busqueda"],
    enabled: !!user && busquedaActiva,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION, [
        QuotationStatus.ACEPTADA,
        QuotationStatus.CANCELADA,
        QuotationStatus.REALIZADA,
      ]);
      return data;
    },
  });
  const cerradasCoinciden = busquedaActiva
    ? (cerradasQuery.data ?? []).filter(coincideBusqueda)
    : [];

  // Orden de las tarjetas dentro de cada columna.
  const compararTarjetas = (a: QuotationWithClient, b: QuotationWithClient) => {
    if (ordenTablero === "fecha")
      return String(a.event_date).localeCompare(String(b.event_date));
    if (ordenTablero === "numero")
      return (b.quotation_number || 0) - (a.quotation_number || 0);
    // Monto de mayor a menor (05-08, pedido de Felipe: "quizás es
    // incluso más relevante"): la plata grande primero.
    if (ordenTablero === "monto")
      return (b.total_amount || 0) - (a.total_amount || 0);
    return (semaforoDe(b)?.urgencia || 0) - (semaforoDe(a)?.urgencia || 0);
  };
  // Cola de trabajo (lección Vambe): lo más abandonado arriba.
  const nRequieren = filtradasBase.filter(requiereSeguimiento).length;
  const filteredQuotations = soloSeguimiento
    ? [...filtradasBase]
        .filter(requiereSeguimiento)
        .sort(
          (a, b) =>
            (semaforoDe(b)?.urgencia || 0) - (semaforoDe(a)?.urgencia || 0),
        )
    : filtradasBase;

  return (
    <div className="space-y-6">
      {showViewer && viewingQuotation && (
        <QuotationViewer
          quotation={viewingQuotation}
          onClose={() => {
            setShowViewer(false);
            setViewingQuotation(null);
          }}
        />
      )}

      {showPaymentPlanEditor && quotationForPaymentPlan && (
        <PaymentPlanEditor
          quotation={{
            id: quotationForPaymentPlan.id,
            quotation_number:
              quotationForPaymentPlan.quotation_number.toString(),
            client_name: (
              quotationForPaymentPlan as unknown as {
                clients?: { name?: string };
              }
            ).clients?.name,
            total_amount: quotationForPaymentPlan.total_amount,
            event_date: quotationForPaymentPlan.event_date,
          }}
          onSave={handlePaymentPlanSave}
          onCancel={handlePaymentPlanCancel}
        />
      )}

      {/* UNA sola línea (pedido de Felipe 03-08): título, buscador
          elástico, controles y acciones — envuelve con gracia si la
          pantalla no alcanza. */}
      <div className="bg-white rounded-lg shadow px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 shrink-0">
            Cotizaciones
          </h1>
          <div className="flex-1 min-w-[240px] relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Buscar por N°, cliente o mandante…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {/* Un solo chip de orden con menú de la casa: tres botones
              eran bulla. */}
          <span className="relative inline-block shrink-0">
              <button
                type="button"
                onClick={() => setOrdenMenuAbierto((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50"
                title="Ordenar tarjetas dentro de cada columna"
              >
                <ArrowUpDown size={14} />
                {ORDEN_ETIQUETA[ordenTablero]}
                <ChevronDown size={12} />
              </button>
              {ordenMenuAbierto && (
                <>
                  <span
                    className="fixed inset-0 z-10 block"
                    onClick={() => setOrdenMenuAbierto(false)}
                  />
                  <span className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block">
                    {(
                      [
                        ["urgencia", "Urgencia"],
                        ["fecha", "Fecha evento"],
                        ["numero", "N°"],
                        ["monto", "Monto"],
                      ] as const
                    ).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setOrdenMenuAbierto(false);
                          cambiarOrdenTablero(v);
                        }}
                        className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${
                          ordenTablero === v
                            ? "font-semibold text-blue-600"
                            : "text-gray-700"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </span>
                </>
              )}
            </span>
          {/* La cola del martes a las 11: vencidas y frías arriba. */}
          <button
            type="button"
            onClick={() => setSoloSeguimiento((v) => !v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border whitespace-nowrap ${
              soloSeguimiento
                ? "bg-amber-600 border-amber-600 text-white"
                : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
            }`}
            title="Cotizaciones vivas con contacto vencido o 3+ días sin gestión, las más urgentes arriba"
          >
            Requieren seguimiento ({nRequieren})
          </button>
          <div className="flex items-center gap-3 ml-auto">
            {/* Requerimientos pendientes: aviso junto al botón (la
                conversión vive en su módulo). */}
            {requirements.length > 0 && (
              <button
                onClick={() => navigate("/requests")}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-100"
                title="Ir al módulo de Requerimientos"
              >
                <AlertTriangle size={16} className="text-amber-500" />
                {requirements.length}
              </button>
            )}
            <button
              onClick={() => navigate("/quotation-form")}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2 whitespace-nowrap"
            >
              <Plus size={20} />
              <span>Nueva Cotización</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tablero (Etapa 2): el embudo vivo en 3 columnas. Sin arrastre
          por ahora — el estado se cambia con la píldora de siempre. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {[
            QuotationStatus.SOLICITADA,
            QuotationStatus.ENVIADA,
            QuotationStatus.EN_NEGOCIACION,
          ].map((col) => {
            const tarjetas = filteredQuotations
              .filter((q) => q.quotation_status === col)
              .sort(compararTarjetas);
            const suma = tarjetas.reduce(
              (s, q) => s + (q.total_amount || 0),
              0,
            );
            return (
              <div
                key={col}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId) setDropCol(col);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDropCol((v) => (v === col ? null : v));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = dragId;
                  setDragId(null);
                  setDropCol(null);
                  if (!id) return;
                  const q = quotations.find((x) => x.id === id);
                  if (q && q.quotation_status !== col)
                    void handleStatusChange(id, col);
                }}
                // Borde superior con el color del estado (pedido de
                // Felipe 04-08: mataba el "mucho gris" — gesto Clientify).
                className={`rounded-xl p-3 border-t-4 transition-colors ${
                  (
                    {
                      solicitada: "border-yellow-200",
                      enviada: "border-blue-400",
                      en_negociacion: "border-purple-400",
                    } as Record<string, string>
                  )[col] || "border-gray-300"
                } ${
                  dropCol === col && dragId
                    ? "bg-blue-50 ring-2 ring-blue-300"
                    : "bg-gray-100"
                }`}
              >
                <div className="flex items-baseline justify-between px-1 pb-2">
                  <h3 className="text-sm font-bold text-gray-700">
                    {STATUS_EMOJI[col]} {STATUS_LABEL[col]} ({tarjetas.length})
                  </h3>
                  <span className="text-xs font-semibold text-gray-500">
                    ${suma.toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {/* La marca de aterrizaje: sabes dónde caerá. */}
                  {dropCol === col && dragId && (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg h-14 bg-blue-50/60 flex items-center justify-center text-xs font-semibold text-blue-500">
                      Soltar aquí → {STATUS_LABEL[col]}
                    </div>
                  )}
                  {/* Sin esto, la columna decía "sin cotizaciones"
                      MIENTRAS cargaba — mentira de 1 segundo que
                      asustó a Felipe (04-08). Con "Requieren"
                      restaurado, el semáforo también necesita su mapa
                      antes de filtrar (si no, clasifica a ciegas). */}
                  {loading ||
                  (soloSeguimiento && seguimientosQuery.isPending) ? (
                    <p className="text-xs text-gray-400 px-1 py-3">Cargando…</p>
                  ) : tarjetas.length === 0 ? (
                    <p className="text-xs text-gray-400 px-1 py-3">
                      Sin cotizaciones aquí.
                    </p>
                  ) : (
                    tarjetas.map((quotation) => {
                      const sem = semaforoDe(quotation);
                      const contact = contactOf(quotation);
                      // Alto valor (opción 6 de Felipe): borde dorado
                      // de lejos + estrella ámbar de cerca.
                      const altoValor =
                        umbralAltoValor > 0 &&
                        quotation.total_amount >= umbralAltoValor;
                      return (
                        <div
                          key={quotation.id}
                          draggable
                          onDragStart={(e) => {
                            setDragId(quotation.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setDropCol(null);
                          }}
                          onClick={() => navigate(`/negocio/${quotation.id}`)}
                          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-pointer hover:shadow ${
                            altoValor
                              ? "border-l-4 border-l-amber-400"
                              : ""
                          } ${dragId === quotation.id ? "opacity-40" : ""}`}
                        >
                          {/* Orden de Felipe (03-08): estado arriba
                              (control para mover, compacto — la columna
                              ya dice el estado); abajo el semáforo junto
                              al Ver — la gestión y la acción, juntas. */}
                          {/* Protección de click SOLO en los botones:
                              el resto de la tarjeta navega a la ficha
                              (pedido de Felipe 04-08). */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-gray-700">
                              #{quotation.quotation_number}
                            </span>
                            <span className="flex items-center gap-1">
                              {altoValor && (
                                <Star
                                  size={14}
                                  className="text-amber-400 fill-amber-400"
                                  aria-label="Cotización de alto valor"
                                />
                              )}
                              <span onClick={(e) => e.stopPropagation()}>
                                {estadoPill(quotation, "icono")}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-900 truncate">
                            {quotation.clients?.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {/* El mandante solo si aporta algo distinto
                                del cliente (nada de "Jose · Jose"). */}
                            {contact.name &&
                            contact.name !== quotation.clients?.name
                              ? `${contact.name} · `
                              : ""}
                            {formatISOUTCDateToString(quotation.event_date)}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              ${quotation.total_amount.toLocaleString("es-CL")}
                            </span>
                            <div className="flex items-center gap-2">
                              {sem && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/negocio/${quotation.id}`);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${sem.clase}`}
                                  title="Abrir bitácora de seguimiento"
                                >
                                  <MessageSquare size={12} className="shrink-0" />
                                  {sem.texto}
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewQuotation(quotation);
                                }}
                                className="text-sm font-semibold text-blue-600 hover:underline"
                                title="Ver el documento de la cotización"
                              >
                                PDF
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

      {/* Búsqueda global (camino a tablero-único): lo cerrado también
          aparece — con puente a Post-Venta donde corresponde. */}
      {busquedaActiva &&
        (cerradasCoinciden.length > 0 || rechazadas.length > 0) && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-bold text-gray-700 pb-2">
              Cerradas que coinciden (
              {cerradasCoinciden.length + rechazadas.length})
            </h3>
            <div className="divide-y divide-gray-100">
              {[...cerradasCoinciden, ...rechazadas].map((q) => (
                <div
                  key={q.id}
                  className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
                >
                  <span className="text-sm font-bold text-gray-700 w-14">
                    #{q.quotation_number}
                  </span>
                  <span className="text-sm text-gray-900 flex-1 min-w-[160px] truncate">
                    {q.clients?.name}
                    <span className="text-xs text-gray-500">
                      {" "}
                      · {formatISOUTCDateToString(q.event_date)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${q.total_amount.toLocaleString("es-CL")}
                  </span>
                  {estadoPill(q)}
                  {(q.quotation_status === QuotationStatus.ACEPTADA ||
                    q.quotation_status === QuotationStatus.REALIZADA) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/post-venta/${q.id}`)}
                      className="text-sm font-semibold text-blue-600 hover:underline"
                    >
                      → Post-Venta
                    </button>
                  )}
                  <button
                    onClick={() => handleViewQuotation(q)}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                    title="Ver el documento de la cotización"
                  >
                    PDF
                  </button>
                  {q.quotation_status === QuotationStatus.RECHAZADA && (
                    <button
                      type="button"
                      onClick={() => navigate(`/negocio/${q.id}`)}
                      className="text-gray-300 hover:text-gray-500"
                      title="Abrir la ficha del negocio"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Rechazadas: plegadas bajo el tablero — mirar por qué se pierde
          es oro; tenerlo a la vista todos los días, no. */}
      {!busquedaActiva && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg">
          <button
            type="button"
            onClick={() => setVerRechazadas((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <span>❌ Rechazadas ({rechazadas.length})</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${verRechazadas ? "rotate-180" : ""}`}
            />
          </button>
          {verRechazadas && (
            <div className="px-4 pb-3 divide-y divide-gray-200">
              {rechazadas.length === 0 ? (
                <p className="py-2 text-xs text-gray-400">
                  {rechazadasQuery.isPending
                    ? "Cargando…"
                    : "Ninguna cotización rechazada."}
                </p>
              ) : (
                rechazadas.map((q) => (
                  <div
                    key={q.id}
                    className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
                  >
                    <span className="text-sm font-bold text-gray-700 w-14">
                      #{q.quotation_number}
                    </span>
                    <span className="text-sm text-gray-900 flex-1 min-w-[160px] truncate">
                      {q.clients?.name}
                      <span className="text-xs text-gray-500">
                        {" "}
                        · {formatISOUTCDateToString(q.event_date)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      ${q.total_amount.toLocaleString("es-CL")}
                    </span>
                    {/* Píldora completa: revivir una rechazada a
                        Enviada cuando el cliente vuelve. */}
                    {estadoPill(q)}
                    <button
                      onClick={() => handleViewQuotation(q)}
                      className="text-sm font-semibold text-blue-600 hover:underline"
                      title="Ver el documento de la cotización"
                    >
                      PDF
                    </button>
                    {/* Revisar la rechazada en su ficha (pedido Felipe
                        04-08: "le haré casi la misma a Abastible"). */}
                    <button
                      type="button"
                      onClick={() => navigate(`/negocio/${q.id}`)}
                      className="text-gray-300 hover:text-gray-500"
                      title="Abrir la ficha del negocio"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}


      {/* Ventanita de la casa (Tanda 3a): confirmar la vuelta de
          post-venta a pre-venta (reemplaza al confirm() del navegador). */}
      {pendingStatusChange && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5 space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Volver a pre-venta
            </h3>
            <p className="text-sm text-gray-600">
              Esta cotización ya pasó a Post-Venta con su plan de pagos. Si no
              hay pagos registrados, el plan se eliminará y la cotización
              volverá a pre-venta. Si ya hay pagos registrados, el sistema no
              permitirá el cambio (para eso está Anular en Post-Venta).
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPendingStatusChange(null);
                  void fetchQuotations();
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = pendingStatusChange;
                  setPendingStatusChange(null);
                  void applyStatusChange(p.quotationId, p.newStatus);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
