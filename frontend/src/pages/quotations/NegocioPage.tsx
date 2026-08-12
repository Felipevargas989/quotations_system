// FICHA DEL NEGOCIO (04-08-2026, "el descreme, no el CRM") — la página
// propia de cada cotización en juego, al estilo de la ficha de
// Post-Venta: se llega pinchando la tarjeta del tablero, "← Volver"
// conserva el tablero tal como estaba. Dos pestañas: Seguimiento (el
// hilo comercial + respaldos + compartir por WhatsApp/correo) y
// Cotización (resumen + PDF + editar).
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Mail, Phone } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../components/toast/Toast";
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
import MotivoPerdida from "../../components/MotivoPerdida";
import { createFollowup } from "../../services/quotationFollowups.service";
import { formatPhone } from "../../utils/phone";
import { useCopiarDato } from "../../hooks/useCopiarDato";
// Los dos bloques del seguimiento se mudaron a su propio archivo el
// 07-08: ahora los monta también Post-Venta.
import { HiloSeguimiento, AdjuntosComerciales } from "./SeguimientoPanel";
import { normalizeText } from "../../utils/searchMatch";
import { SECTION_ROLES } from "../../constants/permissions";

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
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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

export default function NegocioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, company, userRole } = useAuth();
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
  // Outlook web y no `mailto:` (decisión de Felipe, 07-08). El mailto
  // delega en la app de correo por omisión del sistema, y esa
  // preferencia en macOS solo se cambia dentro de Mail.app —que exige
  // configurarle una cuenta para dejarte llegar—. Media hora peleando
  // con Apple para que el botón abriera Outlook; más barato apuntarle
  // derecho.
  //
  // OJO si algún día hay clientes de verdad: esto le impone Outlook web
  // a todos. Ahí habría que volverlo una opción por empresa
  // (Configuración → "Abrir correos con: sistema / Outlook / Gmail").
  const correoHref = contacto.email
    ? `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
        contacto.email,
      )}&subject=${encodeURIComponent(
        `Cotización N°${fila?.quotation_number ?? ""} — ${company?.name || ""}`,
      )}`
    : null;

  // Copiar teléfono/correo del mandante, igual que en la ficha del
  // cliente: el dato en azul, un clic lo copia y confirma con un ✓.
  const { copiado: datoCopiado, copiar: copiarDato } = useCopiarDato();

  // Recepción entra a la ficha para hacer seguimiento, no para editar.
  const puedeEditar = SECTION_ROLES.quotations_edit.includes(userRole as never);

  const refrescarEstado = async () => {
    await queryClient.invalidateQueries({ queryKey: ["quotations"] });
    await queryClient.invalidateQueries({ queryKey: ["quotation", id] });
  };

  // Motivo de pérdida (migración 61): rechazar o anular pide su razón
  // antes de aplicarse; el comentario queda como nota del hilo.
  const [pidiendoMotivo, setPidiendoMotivo] = useState<string | null>(null);
  const [guardandoMotivo, setGuardandoMotivo] = useState(false);

  const cambiarEstado = async (nuevo: string, motivo?: string) => {
    if (!fila || nuevo === fila.quotation_status) return;
    if ((nuevo === "rechazada" || nuevo === "cancelada") && !motivo) {
      setPidiendoMotivo(nuevo);
      return;
    }
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
        {
          quotation_status: nuevo as QuotationStatus,
          ...(motivo ? { loss_reason: motivo } : {}),
        } as never,
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
            {/* Apilados bajo el nombre (07-08, pedido de Felipe):
                cada dato en su línea y el ícono como etiqueta, igual que
                en la ficha del cliente y en Post-Venta. */}
            <div className="mt-1 text-sm text-gray-500">
              <p>{contacto.name || "—"}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                {contacto.phone && (
                  <button
                    type="button"
                    // El número CRUDO: los espacios del formateado rompen
                    // al pegarlo en un marcador.
                    onClick={() => void copiarDato("tel", contacto.phone)}
                    title="Copiar teléfono"
                    className="flex w-fit items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <Phone size={13} className="shrink-0" />
                    {formatPhone(contacto.phone)}
                    <span className="inline-block w-3 text-green-600">
                      {datoCopiado === "tel" ? "✓" : ""}
                    </span>
                  </button>
                )}
                {contacto.email && (
                  <button
                    type="button"
                    onClick={() => void copiarDato("mail", contacto.email)}
                    title="Copiar correo"
                    className="flex w-fit items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <Mail size={13} className="shrink-0" />
                    {contacto.email}
                    <span className="inline-block w-3 text-green-600">
                      {datoCopiado === "mail" ? "✓" : ""}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* El chip cambia de estado solo si quien mira puede
                editar (12-08). Sin permiso cae al chip fijo de abajo,
                que ya existía para las cerradas: se lee el estado y no
                se ofrece una puerta que el servidor cierra con 403. */}
            {puedeEditar &&
            ESTADOS_VIVOS_FICHA.includes(fila?.quotation_status || "") ? (
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
                // Pestaña nueva: con `mailto:` daba igual porque no
                // navegaba, pero Outlook web SÍ es una dirección y sin
                // esto se llevaba la ficha (07-08).
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
                title="Escribir correo al mandante en Outlook"
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
          puedeEditarFecha={puedeEditar}
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
              // Y por eso mismo se le esconde a recepción (12-08): esta
              // pestaña NO es un resumen, es el editor completo — cambia
              // ítems y descuentos, con auto-guardado. Recepción hace
              // seguimiento y mira la oferta por el visor del tablero.
              ...(puedeEditar ? ([["cotizacion", "Servicios"]] as const) : []),
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
              {/* Los respaldos (contratos, OC, facturas) son de
                  operaciones para arriba: sus tres endpoints niegan a
                  recepción. Se esconde entera — dejarla puesta era
                  ofrecer un formulario de subida que guardaba el archivo
                  en el bucket y DESPUÉS rebotaba con 403 (12-08). */}
              {puedeEditar && <AdjuntosComerciales quotationId={fila.id} />}
            </div>
          )}
          {tab === "cotizacion" &&
            puedeEditar &&
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

      {pidiendoMotivo && (
        <MotivoPerdida
          tipo={pidiendoMotivo === "cancelada" ? "anulacion" : "rechazo"}
          guardando={guardandoMotivo}
          onCancelar={() => setPidiendoMotivo(null)}
          onConfirmar={(motivo, comentario) => {
            const estado = pidiendoMotivo;
            setGuardandoMotivo(true);
            void (async () => {
              try {
                await cambiarEstado(estado, motivo);
                if (comentario)
                  await createFollowup({
                    quotation_id: id!,
                    note: comentario,
                  }).catch(() => {});
                queryClient.invalidateQueries({
                  queryKey: ["followups", id],
                });
                setPidiendoMotivo(null);
              } finally {
                setGuardandoMotivo(false);
              }
            })();
          }}
        />
      )}
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

// ---- Respaldos comerciales: pantallazos de WhatsApp, correos… ----
// Mismo lenguaje que Documentos de Post-Venta (comentario como
// etiqueta, "Ver" sin descargas forzadas, visor al lado) pero SOLO la
// categoría "comercial": cuando el evento pase a Post-Venta, la
// historia viaja con él sin mezclarse con contratos y comprobantes.
