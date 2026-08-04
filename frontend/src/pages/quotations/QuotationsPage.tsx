import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  createFollowup,
  deleteFollowup,
  Followup,
  FollowupTipo,
  getFollowupsByQuotation,
  getFollowupsMap,
  updateFollowup,
} from "../../services/quotationFollowups.service";
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
import MultiSelect, { MultiSelectOption } from "../../components/MultiSelect";
import { matchesSearch, normalizeText } from "../../utils/searchMatch";
import { formatPhone } from "../../utils/phone";

// Persist the quotations status filter per user, so the selection survives
// reloads / navigation instead of resetting to the default each time.
const STATUS_FILTER_KEY = (userId: string | number) =>
  `eventia_quotations_status_filter_${userId}`;
// El orden elegido también se recuerda por usuario (pedido de Felipe
// 30-07: "si ordeno por fecha de evento, que se acuerde" — igual que
// Post-Venta).
const SORT_KEY = (userId: string | number) =>
  `eventia_quotations_sort_${userId}`;
// Etapa 2 del pipeline: la vista elegida (tablero | lista) se recuerda.
const VISTA_KEY = (userId: string | number) =>
  `eventia_quotations_vista_${userId}`;
// Y el orden de las tarjetas dentro de las columnas también.
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

const TIPO_ETIQUETA: Record<string, string> = {
  llamada: "📞 Llamada",
  correo: "✉️ Correo",
  reunion: "🤝 Reunión",
  whatsapp: "💬 WhatsApp",
  otro: "📌 Otro",
};

const ALL_STATUSES: QuotationStatus[] = [
  QuotationStatus.SOLICITADA,
  QuotationStatus.ENVIADA,
  QuotationStatus.EN_NEGOCIACION,
  QuotationStatus.ACEPTADA,
  QuotationStatus.RECHAZADA,
  QuotationStatus.CANCELADA,
  QuotationStatus.REALIZADA,
];

export default function QuotationsPage() {
  const { user, userRole } = useAuth();
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
  // Mismas reglas que el select viejo: Cancelada solo administradores
  // (o si ya lo está); Realizada no se elige desde aquí — solo se
  // muestra (y permite revertir a Aceptada si fue un error).
  const statusOptionsFor = (q: QuotationWithClient) => {
    const base = [
      "solicitada",
      "enviada",
      "en_negociacion",
      "aceptada",
      "rechazada",
    ];
    if (
      ROLE_GROUPS.ADMIN_ONLY.includes(userRole as any) ||
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
  const [searchTerm, setSearchTerm] = useState("");
  const initialStatusFilter = [
    QuotationStatus.SOLICITADA,
    QuotationStatus.ENVIADA,
    QuotationStatus.EN_NEGOCIACION,
  ];
  const [statusFilter, setStatusFilter] =
    useState<string[]>(initialStatusFilter);
  // Guards the persisted-filter restore so we don't fetch (or overwrite
  // storage) before we've loaded the user's saved selection.
  const [filterRestored, setFilterRestored] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewingQuotation, setViewingQuotation] =
    useState<QuotationWithClient | null>(null);
  const [showPaymentPlanEditor, setShowPaymentPlanEditor] = useState(false);
  const [quotationForPaymentPlan, setQuotationForPaymentPlan] =
    useState<Quotation | null>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<"quotation_number" | "event_date">(
    "quotation_number",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Tablero (Etapa 2): el embudo vivo en 3 columnas. La Lista queda
  // como archivo completo (todos los estados, filtros de siempre).
  // Declarada ANTES de statusesToFetch, que depende de la vista.
  const [vista, setVista] = useState<"tablero" | "lista">(() => {
    try {
      const v = user ? localStorage.getItem(VISTA_KEY(user.id)) : null;
      return v === "lista" ? "lista" : "tablero";
    } catch {
      return "tablero";
    }
  });
  const cambiarVista = (v: "tablero" | "lista") => {
    setVista(v);
    try {
      if (user) localStorage.setItem(VISTA_KEY(user.id), v);
    } catch {
      /* sin persistencia no pasa nada */
    }
  };
  // Orden dentro de las columnas: Urgencia por defecto (lo más frío
  // arriba — la filosofía de la cola).
  const [ordenTablero, setOrdenTablero] = useState<
    "urgencia" | "fecha" | "numero"
  >(() => {
    try {
      const v = user ? localStorage.getItem(ORDEN_TABLERO_KEY(user.id)) : null;
      return v === "fecha" || v === "numero" ? v : "urgencia";
    } catch {
      return "urgencia";
    }
  });
  const cambiarOrdenTablero = (v: "urgencia" | "fecha" | "numero") => {
    setOrdenTablero(v);
    try {
      if (user) localStorage.setItem(ORDEN_TABLERO_KEY(user.id), v);
    } catch {
      /* sin persistencia no pasa nada */
    }
  };

  // Status options for multiselect
  const statusOptions: MultiSelectOption[] = [
    { value: QuotationStatus.SOLICITADA, label: "📋 Solicitada" },
    { value: QuotationStatus.ENVIADA, label: "📤 Enviada" },
    { value: QuotationStatus.EN_NEGOCIACION, label: "💬 En Negociación" },
    { value: QuotationStatus.ACEPTADA, label: "✅ Aceptada" },
    { value: QuotationStatus.RECHAZADA, label: "❌ Rechazada" },
    { value: QuotationStatus.CANCELADA, label: "🚫 Cancelada" },
    { value: QuotationStatus.REALIZADA, label: "🎉 Realizada" },
  ];

  // Restore the persisted status filter (per user) before the first fetch.
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(STATUS_FILTER_KEY(user.id));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setStatusFilter(parsed);
        }
      }
      const savedSort = localStorage.getItem(SORT_KEY(user.id));
      if (savedSort) {
        const s = JSON.parse(savedSort) as {
          by?: string;
          order?: string;
        };
        if (s.by === "quotation_number" || s.by === "event_date") {
          setSortBy(s.by);
        }
        if (s.order === "asc" || s.order === "desc") {
          setSortOrder(s.order);
        }
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
    setFilterRestored(true);
  }, [user]);

  // Persist the chosen sort (after restore, like the filter).
  useEffect(() => {
    if (!user || !filterRestored) return;
    try {
      localStorage.setItem(
        SORT_KEY(user.id),
        JSON.stringify({ by: sortBy, order: sortOrder }),
      );
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [sortBy, sortOrder, user, filterRestored]);

  // Persist the status filter whenever it changes (after restore).
  useEffect(() => {
    if (!user || !filterRestored) return;
    try {
      localStorage.setItem(
        STATUS_FILTER_KEY(user.id),
        JSON.stringify(statusFilter),
      );
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [statusFilter, user, filterRestored]);

  // ---- Cotizaciones y requerimientos vía React Query (Etapa 2) ----
  // La consulta reacciona sola al filtro y al orden; al cambiar de
  // combinación se sigue mostrando la lista anterior mientras llega la
  // nueva (sin parpadeo a blanco). Volver a esta pantalla pinta al
  // instante desde caché y revalida en segundo plano.
  // El tablero muestra SOLO el embudo vivo; la Lista respeta el filtro
  // de estados de siempre.
  const statusesToFetch: QuotationStatus[] =
    vista === "tablero"
      ? [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
        ]
      : statusFilter.length === 0
        ? ALL_STATUSES
        : (statusFilter as QuotationStatus[]);

  const quotationsQuery = useQuery({
    queryKey: [
      "quotations",
      [...statusesToFetch].sort().join(","),
      sortBy,
      sortOrder,
    ],
    enabled: !!user && filterRestored,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(
        QuotationRequestType.COTIZACION,
        statusesToFetch,
        sortBy,
        sortOrder,
      );
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
  const [bitacoraFor, setBitacoraFor] = useState<QuotationWithClient | null>(
    null,
  );
  const [soloSeguimiento, setSoloSeguimiento] = useState(false);

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

  // Handle column sorting
  const handleSort = (column: "quotation_number" | "event_date") => {
    if (sortBy === column) {
      // If clicking the same column, toggle the order
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // If clicking a different column, set it as the new sort column with default desc order
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  // Check if user can edit a quotation based on status and role
  const canEditQuotation = (quotation: Quotation): boolean => {
    if (!userRole) return false;

    // If quotation is in "Aceptada" state, only operaciones and administrador can edit
    if (quotation.quotation_status === "aceptada") {
      return ROLE_GROUPS.OPERATIONS_AND_UP.includes(userRole);
    }

    // For other states, all roles can edit (assuming they have access to quotations)
    return true;
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
  const handleRowClick = (quotation: QuotationWithClient) => {
    if (canEditQuotation(quotation)) {
      navigate(`/quotation-form/${quotation.id}`);
    } else {
      handleViewQuotation(quotation);
    }
  };

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
    enabled: !!user && vista === "tablero",
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const { data } = await getQuotations(QuotationRequestType.COTIZACION, [
        QuotationStatus.RECHAZADA,
      ]);
      return data;
    },
  });
  const rechazadas = (rechazadasQuery.data ?? []).filter(coincideBusqueda);
  const [verRechazadas, setVerRechazadas] = useState(false);

  const busquedaActiva = vista === "tablero" && searchTerm.trim() !== "";
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
        <div className="flex items-center gap-3">
          {/* Requerimientos pendientes: aviso junto al botón (la tabla de
              abajo se eliminó; la conversión vive en su módulo). */}
          {requirements.length > 0 && (
            <button
              onClick={() => navigate("/requests")}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-100"
              title="Ir al módulo de Requerimientos"
            >
              <AlertTriangle size={16} className="text-amber-500" />
              {requirements.length} requerimiento
              {requirements.length === 1 ? "" : "s"} pendiente
              {requirements.length === 1 ? "" : "s"}
            </button>
          )}
          <button
            onClick={() => navigate("/quotation-form")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Nueva Cotización</span>
          </button>
        </div>
      </div>

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

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
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
          {/* Tablero = embudo vivo (las 3 columnas SON el filtro);
              Lista = archivo completo con el filtro de estados. */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => cambiarVista("tablero")}
              className={`px-3.5 py-2 text-sm font-semibold ${
                vista === "tablero"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Tablero
            </button>
            <button
              type="button"
              onClick={() => cambiarVista("lista")}
              className={`px-3.5 py-2 text-sm font-semibold border-l border-gray-300 ${
                vista === "lista"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Lista
            </button>
          </div>
          {vista === "lista" && (
            <div className="min-w-[200px]">
              <MultiSelect
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Filtrar por estado"
                className="w-full"
              />
            </div>
          )}
          {vista === "tablero" && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              Ordenar:
              {(
                [
                  ["urgencia", "Urgencia"],
                  ["fecha", "Fecha evento"],
                  ["numero", "N°"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => cambiarOrdenTablero(v)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                    ordenTablero === v
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
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
        </div>
      </div>

      {/* Tablero (Etapa 2): el embudo vivo en 3 columnas. Sin arrastre
          por ahora — el estado se cambia con la píldora de siempre. */}
      {vista === "tablero" && (
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
              <div key={col} className="bg-gray-100 rounded-xl p-3">
                <div className="flex items-baseline justify-between px-1 pb-2">
                  <h3 className="text-sm font-bold text-gray-700">
                    {STATUS_EMOJI[col]} {STATUS_LABEL[col]} ({tarjetas.length})
                  </h3>
                  <span className="text-xs font-semibold text-gray-500">
                    ${suma.toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {tarjetas.length === 0 ? (
                    <p className="text-xs text-gray-400 px-1 py-3">
                      Sin cotizaciones aquí.
                    </p>
                  ) : (
                    tarjetas.map((quotation) => {
                      const sem = semaforoDe(quotation);
                      const contact = contactOf(quotation);
                      return (
                        <div
                          key={quotation.id}
                          onClick={() => handleRowClick(quotation)}
                          className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-pointer hover:shadow"
                        >
                          {/* Orden de Felipe (03-08): estado arriba
                              (control para mover, compacto — la columna
                              ya dice el estado); abajo el semáforo junto
                              al Ver — la gestión y la acción, juntas. */}
                          <div
                            className="flex items-center justify-between gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-sm font-bold text-gray-700">
                              #{quotation.quotation_number}
                            </span>
                            {estadoPill(quotation, "icono")}
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
                          <div
                            className="mt-2 flex items-center justify-between gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-sm font-semibold text-gray-900">
                              ${quotation.total_amount.toLocaleString("es-CL")}
                            </span>
                            <div className="flex items-center gap-2">
                              {sem && (
                                <button
                                  type="button"
                                  onClick={() => setBitacoraFor(quotation)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${sem.clase}`}
                                  title="Abrir bitácora de seguimiento"
                                >
                                  <MessageSquare size={12} className="shrink-0" />
                                  {sem.texto}
                                </button>
                              )}
                              <button
                                onClick={() => handleViewQuotation(quotation)}
                                className="text-sm font-semibold text-blue-600 hover:underline"
                                title="Ver cotización (solo lectura)"
                              >
                                Ver
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
      )}

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
                    title="Ver cotización (solo lectura)"
                  >
                    Ver
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Rechazadas: plegadas bajo el tablero — mirar por qué se pierde
          es oro; tenerlo a la vista todos los días, no. */}
      {vista === "tablero" && !busquedaActiva && (
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
                  Ninguna cotización rechazada.
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
                      title="Ver cotización (solo lectura)"
                    >
                      Ver
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Lista de cotizaciones — mismo esquema visual que Post-Venta
          (coherencia del sistema, acordado 22-07): fila clickeable con
          chevron, columna Estado (píldora-selector, click aislado) y
          "Ver" azul para el visor. Eliminar vive en el formulario. */}
      {vista === "lista" && (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Cotizaciones</h2>
          <span className="text-sm text-gray-500">
            {filteredQuotations.length} de {quotations.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => handleSort("quotation_number")}
                >
                  N° Cot.{" "}
                  {sortBy === "quotation_number"
                    ? sortOrder === "asc"
                      ? "▲"
                      : "▼"
                    : ""}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => handleSort("event_date")}
                >
                  Fecha evento{" "}
                  {sortBy === "event_date"
                    ? sortOrder === "asc"
                      ? "▲"
                      : "▼"
                    : ""}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seguimiento
                </th>
                <th className="px-6 py-3" />
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : filteredQuotations.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No se encontraron cotizaciones
                  </td>
                </tr>
              ) : (
                filteredQuotations.map((quotation) => {
                  const contact = contactOf(quotation);
                  const clientType = (
                    quotation.clients as unknown as { client_type?: string }
                  )?.client_type;
                  const endDate = (
                    quotation as unknown as { event_end_date?: string | null }
                  )?.event_end_date;
                  return (
                    <tr
                      key={quotation.id}
                      onClick={() => handleRowClick(quotation)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                        #{quotation.quotation_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatISOUTCDateToString(quotation.event_date)}
                        </div>
                        {endDate && String(endDate) !== String(quotation.event_date) && (
                          <div className="text-xs text-gray-500">
                            al {formatISOUTCDateToString(endDate)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {quotation.clients.name.slice(0, 40) +
                            (quotation.clients.name.length > 40 ? "..." : "")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {clientType || ""}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {contact.name || "—"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatPhone(contact.phone)}
                        </div>
                        {contact.email && (
                          <div
                            className="text-xs text-gray-500 truncate max-w-[180px]"
                            title={contact.email}
                          >
                            {contact.email}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ${quotation.total_amount.toLocaleString("es-CL")}
                      </td>
                      {/* Click aislado: cambiar el estado no abre la fila */}
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {estadoPill(quotation)}
                      </td>
                      {/* Bitácora comercial: semáforo (vivas) o icono
                          discreto (cerradas, para leer la historia). */}
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const sem = semaforoDe(quotation);
                          return sem ? (
                            <button
                              type="button"
                              onClick={() => setBitacoraFor(quotation)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${sem.clase}`}
                              title="Abrir bitácora de seguimiento"
                            >
                              <MessageSquare size={12} className="shrink-0" />
                              {sem.texto}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setBitacoraFor(quotation)}
                              className="text-gray-300 hover:text-gray-500"
                              title="Ver bitácora de seguimiento"
                            >
                              <MessageSquare size={16} />
                            </button>
                          );
                        })()}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleViewQuotation(quotation)}
                          className="text-sm font-semibold text-blue-600 hover:underline"
                          title="Ver cotización (solo lectura)"
                        >
                          Ver
                        </button>
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

      {bitacoraFor && (
        <BitacoraModal
          quotation={bitacoraFor}
          onClose={() => setBitacoraFor(null)}
          onChanged={() =>
            void queryClient.invalidateQueries({
              queryKey: ["seguimientos", "map"],
            })
          }
        />
      )}
    </div>
  );
}

// ---- Bitácora comercial (migración 59): el hilo de una cotización ----
// La conversación para VENDER la propuesta, separada de su contenido.
// Notas editables/borrables SOLO por su autor (estándar del mercado:
// la inmutabilidad castiga el tipeo y desincentiva registrar). El
// envío al cliente aparece como entrada del sistema, gris y discreta.
function BitacoraModal({
  quotation,
  onClose,
  onChanged,
}: {
  readonly quotation: QuotationWithClient;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hiloQuery = useQuery({
    queryKey: ["seguimientos", quotation.id],
    staleTime: 0,
    queryFn: () => getFollowupsByQuotation(quotation.id),
  });
  const notas = hiloQuery.data ?? [];

  const [nota, setNota] = useState("");
  const [tipo, setTipo] = useState("");
  const [proxima, setProxima] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNota, setEditNota] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);

  const refrescar = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["seguimientos", quotation.id],
    });
    onChanged();
  };

  const guardar = async () => {
    const texto = nota.trim();
    if (!texto || guardando) return;
    setGuardando(true);
    setErr(null);
    try {
      await createFollowup({
        quotation_id: quotation.id,
        note: texto,
        ...(tipo ? { tipo: tipo as FollowupTipo } : {}),
        ...(proxima ? { next_contact_date: proxima } : {}),
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

  const guardarEdicion = async (id: number) => {
    const texto = editNota.trim();
    if (!texto) return;
    try {
      await updateFollowup(id, { note: texto });
      setEditId(null);
      await refrescar();
    } catch {
      setErr("No se pudo editar la nota");
    }
  };

  const borrar = async (id: number) => {
    setConfirmDelId(null);
    try {
      await deleteFollowup(id);
      toast.success("Nota eliminada");
      await refrescar();
    } catch {
      setErr("No se pudo eliminar la nota");
    }
  };

  // Hilo mixto: notas humanas + el envío al cliente como entrada del
  // sistema, todo en un solo orden cronológico (más nuevo arriba).
  type Entrada =
    | { kind: "nota"; at: string; nota: Followup }
    | { kind: "sistema"; at: string; texto: string };
  const entradas: Entrada[] = [
    ...notas.map((n) => ({ kind: "nota" as const, at: n.created_at, nota: n })),
    ...(quotation.sent_at
      ? [
          {
            kind: "sistema" as const,
            at: quotation.sent_at,
            texto: "Cotización enviada al cliente",
          },
        ]
      : []),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between p-5 border-b border-gray-200">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Seguimiento — #{quotation.quotation_number}
            </h3>
            {/* El contacto A MANO donde se anota la llamada: nombre,
                teléfono y correo del mandante (camino a tablero-único —
                antes vivían solo en la columna de la Lista). */}
            {(() => {
              const c = contactOf(quotation);
              return (
                <p className="text-xs text-gray-500">
                  {quotation.clients?.name}
                  {c.name && c.name !== quotation.clients?.name
                    ? ` · ${c.name}`
                    : ""}
                  {c.phone ? ` · 📞 ${formatPhone(c.phone)}` : ""}
                  {c.email ? ` · ✉️ ${c.email}` : ""}
                </p>
              );
            })()}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {hiloQuery.isPending ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : entradas.length === 0 ? (
            <p className="text-sm text-gray-500">
              Sin notas todavía. La primera gestión parte abajo. 👇
            </p>
          ) : (
            entradas.map((e) =>
              e.kind === "sistema" ? (
                <div key={`sys-${e.at}`} className="text-xs text-gray-400">
                  ⚙ {e.texto} — {fechaCorta(e.at)}
                </div>
              ) : (
                <div
                  key={e.nota.id}
                  className="border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">
                        {e.nota.author_name || "—"}
                      </span>{" "}
                      · {fechaCorta(e.nota.created_at)}
                      {e.nota.updated_at ? " · editada" : ""}
                      {e.nota.tipo ? (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded-full">
                          {TIPO_ETIQUETA[e.nota.tipo] || e.nota.tipo}
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
                                }}
                                className="text-gray-300 hover:text-gray-500"
                                title="Editar mi nota"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelId(e.nota.id)}
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
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void guardarEdicion(e.nota.id)}
                          className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-gray-800 whitespace-pre-wrap">
                      {e.nota.note}
                    </p>
                  )}
                  {e.nota.next_contact_date && (
                    <p className="mt-1.5 text-xs text-blue-700">
                      📅 Próximo contacto: {ddmm(e.nota.next_contact_date)}
                    </p>
                  )}
                </div>
              ),
            )
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 p-5 space-y-2.5">
          {err && <p className="text-xs text-red-600">{err}</p>}
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="¿Qué pasó con esta negociación? (llamada, respuesta, espera de aprobación…)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-40">
              <SelectWithSearch
                options={Object.entries(TIPO_ETIQUETA).map(([v, l]) => ({
                  value: v,
                  label: l,
                }))}
                value={tipo}
                onChange={setTipo}
                placeholder="Tipo (opcional)"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              Próx. contacto
              <input
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
              disabled={!nota.trim() || guardando}
              className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {(() => {
                if (guardando) return "Guardando…";
                return proxima ? "Guardar" : "Guardar (sin próximo contacto)";
              })()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
