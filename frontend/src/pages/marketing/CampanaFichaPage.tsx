import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Send, Trash2 } from "lucide-react";
import Modal from "../../components/Modal";
import EditorDeBorrador from "./EditorDeBorrador";
import {
  opcionesDeAudiencias,
  seleccionDeCampana,
  unaAudiencia,
} from "./audienciasDeCampana";
import { toast } from "../../components/toast/Toast";
import {
  DestinatarioDeCampana,
  destinatariosDeCampana,
  editarCampanaMarketing,
  eliminarCampanaMarketing,
  getAudienciasMarketing,
  detalleDeCampana,
  enviarCampana,
  enviarPruebaCampana,
  htmlDeCampana,
  reenviarCampana,
  sinAbrirDeCampana,
} from "../../services/marketing.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatISOUTCDateToString } from "../../utils/dates";

/**
 * LA FICHA DE LA CAMPAÑA (Felipe 26-08), calcada de la ficha de
 * cliente: volver arriba, título con chip de estado, las cajitas de
 * KPIs de la industria (entrega, apertura, clics, CTOR, rebotes),
 * la tabla de personas con filtros, y el correo
 * TAL COMO SALIÓ a la derecha. Toda la gestión vive acá: prueba,
 * envío y la segunda pasada a los que no abrieron.
 */

type FiltroFila = "todos" | "abrieron" | "clicaron" | "sin_abrir" | "rebotes";

const fechaCorta = (iso: string | null) =>
  iso ? formatISOUTCDateToString(iso.slice(0, 10)) : "";

export default function CampanaFichaPage() {
  const { id } = useParams();
  const campanaId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detalle = useQuery({
    queryKey: ["marketing", "campana-detalle", campanaId],
    queryFn: () => detalleDeCampana(campanaId),
    enabled: Number.isFinite(campanaId),
  });
  const vista = useQuery({
    // El correo tal como salio solo cambia si cambia la marca en
    // Configuracion: 5 min de cache para que reabrir la ficha vuele.
    staleTime: 5 * 60_000,
    queryKey: ["marketing", "campana-html", campanaId],
    queryFn: () => htmlDeCampana(campanaId),
    enabled: Number.isFinite(campanaId),
  });
  const refrescar = () =>
    void qc.invalidateQueries({ queryKey: ["marketing"] });

  const c = detalle.data?.campana;
  const k = detalle.data?.kpis;
  const filas = useMemo(
    () => detalle.data?.destinatarios ?? [],
    [detalle.data],
  );

  // ---- Filtros de la tabla de personas ----
  // LOS FILTROS SE RECUERDAN al navegar (regla de Felipe 26-08):
  // volver a la ficha no borra lo elegido.
  const [filtro, setFiltro] = useState<FiltroFila>(() => {
    try {
      return (
        (sessionStorage.getItem(
          `mk.ficha.${String(campanaId)}.filtro`,
        ) as FiltroFila | null) ?? "todos"
      );
    } catch {
      return "todos";
    }
  });
  const elegirFiltro = (f: FiltroFila) => {
    setFiltro(f);
    try {
      sessionStorage.setItem(`mk.ficha.${String(campanaId)}.filtro`, f);
    } catch {
      /* sin memoria de pestaña: no es grave */
    }
  };
  const pasa = (f: DestinatarioDeCampana): boolean =>
    filtro === "todos"
      ? true
      : filtro === "abrieron"
        ? !!f.opened_at
        : filtro === "clicaron"
          ? !!f.clicked_at
          : filtro === "rebotes"
            ? !!f.bounced_at
            : !f.opened_at && !f.bounced_at; // sin abrir
  const visibles = filas.filter(pasa);

  // ---- Acciones de borrador: prueba y envío ----
  const prueba = useMutation({
    mutationFn: () => enviarPruebaCampana(campanaId),
    onSuccess: (r) => {
      toast.success(`Prueba enviada a ${r.enviada_a}. Revisa tu casilla.`);
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const [confirmando, setConfirmando] = useState<number | null>(null);

  // ---- Editar el borrador desde la ficha (Felipe 26-08) ----
  const [editando, setEditando] = useState(false);

  // Eliminar el BORRADOR (28-08): las enviadas son historia y el motor
  // las rechaza; acá el botón ni siquiera aparece.
  const [borrando, setBorrando] = useState(false);
  const eliminar = useMutation({
    mutationFn: () => eliminarCampanaMarketing(campanaId),
    onSuccess: () => {
      toast.success("Campaña eliminada");
      qc.invalidateQueries({ queryKey: ["marketing"] });
      navigate("/marketing");
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const enviar = useMutation({
    mutationFn: () => enviarCampana(campanaId),
    onSuccess: (r) => {
      toast.success(
        `Campaña enviada a ${r.enviados} destinatarios` +
          (r.fallidos ? ` · ${r.fallidos} fallidos` : ""),
      );
      setConfirmando(null);
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const preguntarEnvio = async () => {
    try {
      const { destinatarios } = await destinatariosDeCampana(campanaId);
      setConfirmando(destinatarios);
    } catch (e) {
      toast.error(humanizeApiError(e));
    }
  };

  // ---- La segunda pasada (misma gestión de siempre, ahora acá) ----
  const [modalReenvio, setModalReenvio] = useState<number | null>(null);
  const [asuntoNuevo, setAsuntoNuevo] = useState("");
  const reenviar = useMutation({
    mutationFn: () => reenviarCampana(campanaId, asuntoNuevo.trim()),
    onSuccess: (r) => {
      toast.success(
        `Segunda pasada enviada a ${r.reenviados} que no habían abierto.`,
      );
      setModalReenvio(null);
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const abrirReenvio = async () => {
    if (!c) return;
    try {
      const { sin_abrir } = await sinAbrirDeCampana(campanaId);
      setAsuntoNuevo(`¿Lo viste? ${c.asunto}`);
      setModalReenvio(sin_abrir);
    } catch (e) {
      toast.error(humanizeApiError(e));
    }
  };
  const dias = c?.enviada_at
    ? Math.floor((Date.now() - new Date(c.enviada_at).getTime()) / 86400000)
    : null;
  const asuntoRepetido =
    !!c && asuntoNuevo.trim().toLowerCase() === c.asunto.trim().toLowerCase();

  if (detalle.isLoading || !c || !k) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/marketing")}
          className="flex items-center gap-1 text-blue-600 text-sm font-medium hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a marketing
        </button>
        <p className="text-sm text-gray-500">
          {detalle.isError ? humanizeApiError(detalle.error) : "Cargando…"}
        </p>
      </div>
    );
  }

  const enviada = c.estado === "enviada";
  const chipFiltro = (activo: boolean) =>
    `px-2.5 py-1 text-xs rounded-full border tabular-nums ${
      activo
        ? "bg-blue-50 text-blue-700 border-blue-300 font-medium"
        : "text-gray-600 border-gray-200 hover:bg-gray-50"
    }`;

  return (
    <div className="space-y-6">
      {/* Cabecera, calcada de la ficha de cliente */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/marketing")}
          className="flex items-center gap-1 text-blue-600 text-sm font-medium hover:underline mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a marketing
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{c.nombre}</h1>
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${
              enviada
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            {enviada
              ? `enviada · ${fechaCorta(c.enviada_at)}`
              : "borrador"}
          </span>
          <span className="flex-1" />
          {/* LA acción de la ficha, arriba de las cajas de KPIs
              (Felipe 26-08). Usada la 2ª pasada, desaparece: el tope
              de la industria son 2 envíos por campaña. */}
          {!enviada &&
            (borrando ? (
              <span className="flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => eliminar.mutate()}
                  className="px-2.5 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                >
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setBorrando(false)}
                  className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setBorrando(true)}
                title="Eliminar este borrador"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            ))}
          {enviada &&
            !c.reenviada_con_asunto &&
            filas.some((f) => !f.opened_at && !f.bounced_at) && (
              <button
                type="button"
                onClick={() => void abrirReenvio()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <Send className="w-4 h-4" /> Reenviar a los que no abrieron
              </button>
            )}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          audiencia "{c.audiencia_ref ?? "segmento de tu base"}"
          {dias !== null
            ? ` · hace ${String(dias)} ${dias === 1 ? "día" : "días"}`
            : ""}
        </p>
      </div>

      {/* Las cajitas de KPIs de la industria (solo enviadas) */}
      {enviada && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs font-medium text-gray-600">Entregados</p>
            <p className="text-xl font-bold text-blue-600 tabular-nums">
              {k.entregados}
            </p>
            <p className="text-xs text-gray-400">
              {k.tasa_entrega}% de {k.enviados} enviados · sano ≥98%
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs font-medium text-gray-600">
              Tasa de apertura
            </p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">
              {k.tasa_apertura}%
            </p>
            <p className="text-xs text-gray-400">
              {k.aperturas} aperturas · industria ~21%
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs font-medium text-gray-600">Tasa de clics</p>
            <p className="text-xl font-bold text-purple-600 tabular-nums">
              {k.tasa_clics}%
            </p>
            <p className="text-xs text-gray-400">
              {k.clics} clics · industria ~2%
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs font-medium text-gray-600">CTOR</p>
            <p className="text-xl font-bold text-teal-600 tabular-nums">
              {k.ctor}%
            </p>
            <p className="text-xs text-gray-400">
              clics de quienes abrieron · bueno 10-15%
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs font-medium text-gray-600">Rebotes</p>
            <p
              className={`text-xl font-bold tabular-nums ${
                k.tasa_rebote > 2 ? "text-red-600" : "text-gray-700"
              }`}
            >
              {k.rebotes}
            </p>
            <p className="text-xs text-gray-400">
              {k.tasa_rebote}% · sano &lt;2% (los duros se dan de baja solos)
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs font-medium text-gray-600">Bajas</p>
            <p
              className={`text-xl font-bold tabular-nums ${
                k.tasa_baja > 1 ? "text-red-600" : "text-gray-700"
              }`}
            >
              {k.bajas}
            </p>
            <p className="text-xs text-gray-400">
              {k.tasa_baja}% de deserción · sana &lt;0,5%
            </p>
          </div>
        </div>
      )}

      {/* Acciones de borrador: prueba obligatoria y envío */}
      {!enviada && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
          <p className="text-sm text-gray-600 flex-1 min-w-[220px]">
            Esta campaña es un borrador. Sin prueba a tu casilla no se abre
            el envío real.
          </p>
          <button
            type="button"
            onClick={() => prueba.mutate()}
            disabled={prueba.isPending}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {prueba.isPending
              ? "Enviando…"
              : c.prueba_enviada_at
                ? "Prueba de nuevo"
                : "Prueba a mi casilla"}
          </button>
          {confirmando !== null ? (
            <span className="flex items-center gap-1.5 text-sm">
              <span className="text-gray-700 font-medium tabular-nums">
                ¿Enviar a {confirmando} destinatarios?
              </span>
              <button
                type="button"
                onClick={() => enviar.mutate()}
                disabled={enviar.isPending || confirmando === 0}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {enviar.isPending ? "Enviando…" : "Sí, enviar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void preguntarEnvio()}
              disabled={!c.prueba_enviada_at}
              title={
                c.prueba_enviada_at
                  ? undefined
                  : "Primero mándate la prueba: sin prueba no hay envío"
              }
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" /> Enviar
            </button>
          )}
        </div>
      )}

      {/* Dos columnas: personas a la izquierda, el correo a la derecha */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_660px] gap-4 items-start">
        {enviada ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <button
                type="button"
                onClick={() => elegirFiltro("todos")}
                className={chipFiltro(filtro === "todos")}
              >
                Todos ({filas.length})
              </button>
              <button
                type="button"
                onClick={() => elegirFiltro("abrieron")}
                className={chipFiltro(filtro === "abrieron")}
              >
                Abrieron ({k.aperturas})
              </button>
              <button
                type="button"
                onClick={() => elegirFiltro("clicaron")}
                className={chipFiltro(filtro === "clicaron")}
              >
                Clicaron ({k.clics})
              </button>
              <button
                type="button"
                onClick={() => elegirFiltro("sin_abrir")}
                className={chipFiltro(filtro === "sin_abrir")}
              >
                Sin abrir (
                {filas.filter((f) => !f.opened_at && !f.bounced_at).length})
              </button>
              <button
                type="button"
                onClick={() => elegirFiltro("rebotes")}
                className={chipFiltro(filtro === "rebotes")}
              >
                Rebotes ({k.rebotes})
              </button>
            </div>
            <div className="grid grid-cols-[1fr_0.8fr_1.2fr_0.9fr] gap-x-2 pb-1 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              <span>Nombre</span>
              <span>Empresa</span>
              <span>Correo</span>
              <span>Estado</span>
            </div>
            <ul className="divide-y divide-gray-100 text-xs max-h-[520px] overflow-y-auto">
              {visibles.map((f) => (
                <li
                  key={f.id}
                  className="grid grid-cols-[1fr_0.8fr_1.2fr_0.9fr] gap-x-2 py-1.5 items-center"
                >
                  <span className="truncate text-gray-900">
                    {f.name ?? "—"}
                  </span>
                  <span
                    className="truncate text-gray-500"
                    title={f.empresa ?? undefined}
                  >
                    {f.empresa ?? "—"}
                  </span>
                  <span className="truncate text-gray-400" title={f.email}>
                    {f.email}
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    {f.bounced_at ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px]">
                        rebotó
                      </span>
                    ) : f.opened_at ? (
                      <>
                        <span
                          className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]"
                          title={`Abrió el ${fechaCorta(f.opened_at)}`}
                        >
                          abrió {fechaCorta(f.opened_at)}
                        </span>
                        {f.clicked_at && (
                          <span className="px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px]">
                            clic
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-[10px]">
                        sin abrir
                      </span>
                    )}
                    {f.reenviado_at && (
                      <span
                        className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-[10px]"
                        title="Recibió la segunda pasada"
                      >
                        2ª
                      </span>
                    )}
                    {f.baja && (
                      <span
                        className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px]"
                        title="Se dio de baja desde este correo: no recibirá más campañas"
                      >
                        se bajó
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {visibles.length === 0 && (
                <li className="py-4 text-center text-gray-500">
                  Nadie en este filtro.
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Contenido</h2>
              {!editando && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
              )}
            </div>
            {editando ? (
              <EditorDeBorrador
                campana={c}
                onListo={() => {
                  setEditando(false);
                  refrescar();
                }}
                onCancelar={() => setEditando(false)}
              />
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Así se ve el correo con la marca de hoy. La lista de
                  destinatarios aparecerá acá cuando la campaña se envíe.
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {c.cuerpo}
                </p>
              </>
            )}
          </div>
        )}

        {/* El correo TAL COMO SALIÓ */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-1">
            El correo {enviada ? "que salió" : "que saldrá"}
          </h2>
          <p className="text-xs text-gray-500 mb-3 truncate">
            Asunto: {vista.data?.asunto ?? c.asunto}
          </p>
          {vista.data ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              {/* 600px = el ancho REAL del correo en la bandeja: se
                  muestra tal cual, sin aplastarlo (Felipe 26-08). */}
              <iframe
                title="Vista del correo"
                sandbox=""
                srcDoc={vista.data.html}
                className="w-[600px] min-w-[600px] h-[640px] bg-white"
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500">Cargando la vista…</p>
          )}
        </div>
      </div>

      {/* El modal de la segunda pasada (la gestión de siempre) */}
      {modalReenvio !== null && (
        <Modal
          titulo="Segunda pasada a los que no abrieron"
          subtitulo={`Campaña "${c.nombre}"${dias !== null ? ` · enviada hace ${String(dias)} ${dias === 1 ? "día" : "días"}` : ""}`}
          ancho="max-w-lg"
          onCerrar={() => setModalReenvio(null)}
          pie={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalReenvio(null)}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => reenviar.mutate()}
                disabled={
                  reenviar.isPending ||
                  modalReenvio === 0 ||
                  !asuntoNuevo.trim() ||
                  asuntoRepetido
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {reenviar.isPending
                  ? "Enviando…"
                  : `Reenviar a ${String(modalReenvio)}`}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              Van a recibirla{" "}
              <span className="font-semibold tabular-nums">
                {modalReenvio}
              </span>{" "}
              contactos que no abrieron la primera. Es una sola segunda
              pasada: después de esta no hay más reenvíos.
            </p>
            {dias === null ? null : dias < 2 ? (
              <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                El manual dice esperar entre 2 y 7 días antes de la segunda
                pasada — recién {dias === 0 ? "va hoy" : "va un día"}. Puedes
                reenviar igual, pero dar un respiro suele abrir más correos.
              </p>
            ) : dias > 7 ? (
              <p className="text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-600 px-3 py-2">
                Ya pasaron {dias} días — el manual recomienda entre 2 y 7,
                pero reenviar tarde sigue siendo mejor que no reenviar.
              </p>
            ) : (
              <p className="text-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2">
                Buen momento: el manual recomienda la segunda pasada entre 2
                y 7 días después.
              </p>
            )}
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Asunto nuevo (obligatorio)
              </p>
              <input
                value={asuntoNuevo}
                onChange={(e) => setAsuntoNuevo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                maxLength={200}
              />
              {asuntoRepetido && (
                <p className="text-[11px] text-red-600 mt-1">
                  Tiene que ser distinto al original ("{c.asunto}") — el
                  mismo asunto dos veces huele a spam.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
