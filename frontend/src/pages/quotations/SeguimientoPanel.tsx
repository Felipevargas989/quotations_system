// EL PANEL DE SEGUIMIENTO — vive acá desde el 07-08-2026 porque ahora
// lo montan DOS pantallas: la ficha del negocio (venta) y Post-Venta
// (evento ganado). Antes vivía dentro de NegocioPage.
//
// Es UN SOLO HILO: la historia completa del evento, desde el primer
// contacto hasta lo que pase después de ganarlo. "Si algo se olvida uno
// va a seguimiento y está todo" (Felipe, 07-08).
//
// Tres modos, no dos (el tercero es del 07-08):
//   · VENTA (solicitada, enviada, en_negociacion): tipo y próximo
//     contacto OBLIGATORIOS. Un negocio vivo siempre tiene próximo paso.
//   · OPERACIÓN (aceptada, realizada): todo OPCIONAL — acá se anota lo
//     que pasa con un evento ya ganado y no hay nada que perseguir.
//     Pero si se pone fecha, ES un compromiso vivo: vence y avisa.
//   · ARCHIVO (rechazada, cancelada): murió el deal y mató todo
//     seguimiento (regla de Close de Felipe). Notas sueltas, compromisos
//     inertes en gris.
import { useMemo, useRef, useState } from "react";
import {
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
import { toast } from "../../components/toast/Toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import ConfirmInline from "../../components/ConfirmInline";
import { QuotationWithClient } from "../../types/quotations.types";
import {
  Followup,
  FollowupTipo,
  getFollowupsByQuotation,
  createFollowup,
  updateFollowup,
  deleteFollowup,
} from "../../services/quotationFollowups.service";
import {
  EventDocument,
  getDocumentsByQuotation,
  addDocument,
  deleteDocument,
} from "../../services/documents.service";
import {
  uploadEventDocument,
  resolveStorageUrl,
} from "../../services/storage.service";

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

// Tipos de gestión con los iconos de línea de la casa (pedido de
// Felipe 04-08: los emojis desentonaban).
const TIPOS_GESTION: { v: string; l: string }[] = [
  { v: "llamada", l: "Llamada" },
  { v: "correo", l: "Correo" },
  { v: "reunion", l: "Reunión" },
  { v: "whatsapp", l: "WhatsApp" },
  { v: "otro", l: "Otro" },
];
const nombreTipo = (v: string) => TIPOS_GESTION.find((t) => t.v === v)?.l || v;

const IconoTipo = ({
  tipo,
  size = 14,
}: {
  readonly tipo: string;
  readonly size?: number;
}) => {
  if (tipo === "llamada") return <Phone size={size} />;
  if (tipo === "correo") return <Mail size={size} />;
  if (tipo === "reunion") return <Users size={size} />;
  if (tipo === "whatsapp") return <IconoWhatsApp size={size} />;
  return <Tag size={size} />;
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

// ---- Rediseño del hilo (04-08, regla de Close de Felipe): "un negocio
// vivo siempre tiene próximo paso; en rechazadas y cerradas muere el
// deal y mata todo seguimiento". ----
// Estados donde el negocio sigue VIVO para el seguimiento (exactos).
// Estados donde el negocio sigue VIVO para la VENTA: tipo y próximo
// contacto obligatorios.
export const ESTADOS_VIVOS_SEGUIMIENTO = [
  "solicitada",
  "enviada",
  "en_negociacion",
];

// Estados de un evento GANADO (07-08): el hilo sigue abierto como
// bitácora — todo opcional — pero una fecha puesta acá SÍ es un
// compromiso vivo que vence y avisa.
export const ESTADOS_OPERATIVOS_SEGUIMIENTO = ["aceptada", "realizada"];

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

export function HiloSeguimiento({
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
        ...(negocioVivo && editTipo ? { tipo: editTipo as FollowupTipo } : {}),
        ...(negocioVivo && editFecha ? { next_contact_date: editFecha } : {}),
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
  const compromisoFecha = notaCompromiso?.next_contact_date?.slice(0, 10) || "";
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
                                  onClick={() => void guardarEdicion(e.nota.id)}
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

export function AdjuntosComerciales({
  quotationId,
}: {
  readonly quotationId: string;
}) {
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

  // ARRASTRAR Y SOLTAR (06-08, pedido de Felipe): en Mac el pantallazo
  // queda flotando abajo a la derecha y se arrastra DIRECTO desde ahí,
  // sin pasar por Descargas. El botón de siempre sigue igual: esto es
  // una puerta más, no un reemplazo. De regalo, pegar con Ctrl+V.
  const [arrastrando, setArrastrando] = useState(false);
  const recibir = (f: File | null | undefined) => {
    if (!f) return;
    setArchivo(f);
    setErr(null);
  };
  const alSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const sueltos = Array.from(e.dataTransfer.files || []);
    recibir(sueltos[0]);
    // Se sube de a uno (cada respaldo lleva su comentario): decirlo en
    // vez de descartar en silencio los demás.
    if (sueltos.length > 1)
      toast.warn(
        `Se tomó "${sueltos[0].name}". Los respaldos se suben de a uno: arrastra el siguiente cuando termine.`,
      );
  };

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
      // Solo se limpia si sigue siendo el mismo archivo: si soltaste
      // otro mientras este subía, el nuevo se conserva (revisión 06-08).
      setArchivo((actual) => (actual === archivo ? null : actual));
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
    <div
      onDragOver={(e) => {
        e.preventDefault();
        // Con el visor abierto la tarjeta NO recibe: el archivo caería
        // invisible bajo el modal (revisión 06-08).
        if (!arrastrando && !visor) setArrastrando(true);
      }}
      onDragLeave={(e) => {
        // Solo apagar cuando el puntero sale de la tarjeta completa.
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setArrastrando(false);
      }}
      onDrop={visor ? (e) => e.preventDefault() : alSoltar}
      className={`border rounded-xl flex flex-col transition-colors ${
        arrastrando
          ? "border-blue-400 border-dashed bg-blue-50/60"
          : "border-gray-200"
      }`}
    >
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
        {arrastrando && (
          <p className="text-xs font-semibold text-blue-600">
            Suelta aquí el pantallazo ↓
          </p>
        )}
        {archivo && !arrastrando && (
          <p className="text-xs text-gray-600 truncate">
            Listo para subir: <b className="text-gray-800">{archivo.name}</b>
          </p>
        )}
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
