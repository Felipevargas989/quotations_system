// FICHA DEL NEGOCIO (04-08-2026, "el descreme, no el CRM") — la página
// propia de cada cotización en juego, al estilo de la ficha de
// Post-Venta: se llega pinchando la tarjeta del tablero, "← Volver"
// conserva el tablero tal como estaba. Dos pestañas: Seguimiento (el
// hilo comercial + respaldos + compartir por WhatsApp/correo) y
// Cotización (resumen + PDF + editar).
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Pencil, Trash2, Upload } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../components/toast/Toast";
import ConfirmInline from "../../components/ConfirmInline";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
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
} from "../../services/quotations.service";
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
import { formatISOUTCDateToString } from "../../utils/dates";
import { formatPhone } from "../../utils/phone";
import { normalizeText } from "../../utils/searchMatch";

const TIPO_ETIQUETA: Record<string, string> = {
  llamada: "📞 Llamada",
  correo: "✉️ Correo",
  reunion: "🤝 Reunión",
  whatsapp: "💬 WhatsApp",
  otro: "📌 Otro",
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

export default function NegocioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, company } = useAuth();
  const [tab, setTab] = useState<"seguimiento" | "cotizacion">("seguimiento");

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
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
              {ESTADO_ETIQUETA[fila?.quotation_status || ""] ||
                fila?.quotation_status}
            </span>
            {wspHref && (
              <a
                href={wspHref}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                title="Abrir WhatsApp con el mandante"
              >
                💬 WhatsApp
              </a>
            )}
            {correoHref && (
              <a
                href={correoHref}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
                title="Escribir correo al mandante"
              >
                ✉️ Correo
              </a>
            )}
          </div>
        </div>

        {/* Lo que importa, en grande: las 3 cajitas de la casa (mismo
            lenguaje que Pagos y Gestión de Post-Venta). */}
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-4 border-b border-gray-200">
          <div className="border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">Tipo de evento</p>
            <p className="text-lg font-bold text-gray-900 truncate">
              {String(fila?.event_type || "—")}
            </p>
          </div>
          <div className="border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">Fecha del evento</p>
            <p className="text-lg font-bold text-gray-900">
              {fila ? formatISOUTCDateToString(fila.event_date) : "…"}
            </p>
          </div>
          <div className="border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">Monto</p>
            <p className="text-lg font-bold text-gray-900">
              ${fila?.total_amount.toLocaleString("es-CL")}
            </p>
          </div>
        </div>

        {/* Pestañas — misma estética que Post-Venta (subrayado azul),
            coherencia del sistema (pedido de Felipe 04-08). */}
        <div className="shrink-0 flex gap-1 px-6 border-b border-gray-200 items-center">
          {(
            [
              ["seguimiento", "Seguimiento"],
              ["cotizacion", "Cotización"],
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <HiloSeguimiento quotation={fila} />
              <AdjuntosComerciales quotationId={fila.id} />
            </div>
          )}
          {tab === "cotizacion" && fila && (
            <div className="max-w-2xl space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Monto</p>
                  <p className="font-semibold text-gray-900">
                    ${fila.total_amount.toLocaleString("es-CL")}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Personas</p>
                  <p className="font-semibold text-gray-900">
                    {detalle?.people_count ?? fila.people_count ?? "—"}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Fecha del evento</p>
                  <p className="font-semibold text-gray-900">
                    {formatISOUTCDateToString(fila.event_date)}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Tipo</p>
                  <p className="font-semibold text-gray-900">
                    {String(fila.event_type || "—")}
                  </p>
                </div>
              </div>
              {detalle?.observations && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Observaciones</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {detalle.observations}
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setVerPdf(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                >
                  Ver PDF
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/quotation-form/${fila.id}`)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
                >
                  Editar cotización
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {verPdf && fila && (
        <QuotationViewer quotation={fila} onClose={() => setVerPdf(false)} />
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
    await queryClient.invalidateQueries({ queryKey: ["seguimientos", "map"] });
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

  const guardarEdicion = async (nid: number) => {
    const texto = editNota.trim();
    if (!texto) return;
    try {
      await updateFollowup(nid, { note: texto });
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

  return (
    <div className="border border-gray-200 rounded-xl flex flex-col">
      <h3 className="text-sm font-bold text-gray-700 px-4 pt-3 pb-2 flex items-center gap-1.5">
        <MessageSquare size={15} /> Hilo de seguimiento
      </h3>
      <div className="flex-1 overflow-y-auto max-h-[420px] px-4 space-y-3">
        {(() => {
          if (hiloQuery.isPending)
            return <p className="text-sm text-gray-500">Cargando…</p>;
          if (entradas.length === 0)
            return (
              <p className="text-sm text-gray-500">
                Sin notas todavía. La primera gestión parte abajo. 👇
              </p>
            );
          return entradas.map((e) =>
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
                  {e.nota.author_user_id === user?.id && editId !== e.nota.id && (
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
                    📅 Próximo contacto:{" "}
                    {e.nota.next_contact_date.slice(8, 10)}-
                    {e.nota.next_contact_date.slice(5, 7)}
                  </p>
                )}
              </div>
            ),
          );
        })()}
      </div>

      <div className="shrink-0 border-t border-gray-200 p-4 space-y-2.5 mt-3">
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
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
        <Upload size={15} /> Respaldos comerciales
      </h3>
      <p className="text-xs text-gray-500 -mt-1.5">
        Pantallazos de WhatsApp, correos — la evidencia del último estado.
      </p>

      <div className="space-y-2">
        <input
          type="file"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-semibold hover:file:bg-gray-200"
        />
        <input
          type="text"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Comentario (será la etiqueta del respaldo)"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void subir()}
            disabled={!archivo || subiendo}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {subiendo ? "Subiendo…" : "Subir respaldo"}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      <div className="divide-y divide-gray-100">
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

      {visor && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <p className="text-xs text-gray-500 px-3 py-1.5 bg-gray-50 border-b border-gray-200 truncate">
            {visor.file_name}
          </p>
          {(() => {
            if (!visorUrl)
              return <p className="p-3 text-sm text-gray-500">Cargando…</p>;
            if (esImagen(visor.file_url) || esImagen(visorUrl))
              return (
                <img
                  src={visorUrl}
                  alt={visor.file_name}
                  className="max-h-[380px] w-full object-contain bg-gray-50"
                />
              );
            return (
              <iframe
                src={visorUrl}
                title={visor.file_name}
                className="w-full h-[380px]"
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}
