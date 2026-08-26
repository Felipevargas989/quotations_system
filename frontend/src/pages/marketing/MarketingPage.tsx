import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Mail, Send, Trash2, Upload, Users } from "lucide-react";
import Modal from "../../components/Modal";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  AudienciasMarketing,
  CampanaMarketing,
  FiltroSegmento,
  contactosDeAudienciaImportada,
  crearAudienciaMarketing,
  crearCampanaMarketing,
  destinatariosDeCampana,
  eliminarAudienciaMarketing,
  enviarCampana,
  enviarPruebaCampana,
  getAudienciasMarketing,
  getCampanasMarketing,
  importarContactosMarketing,
  previaSegmento,
  reenviarCampana,
  resultadosDeCampana,
  sinAbrirDeCampana,
} from "../../services/marketing.service";
import SegmentoBuilder from "./SegmentoBuilder";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatISOUTCDateToString } from "../../utils/dates";

/**
 * MÓDULO DE MARKETING, Fase 1 (doc 11, Felipe 25-08). Las reglas de
 * fierro viven en el backend; esta pantalla las hace visibles: baja
 * obligatoria (la pone la plantilla), regla de una vez, y SIN PRUEBA
 * NO HAY ENVÍO — el botón de envío real se abre recién con la prueba.
 */

/** CSV/pegado simple: correo[,nombre[,empresa]] por línea. */
const parsearContactos = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [email, name, empresa] = l.split(/[;,\t]/).map((x) => x?.trim());
      return { email: email ?? "", name: name || undefined, empresa: empresa || undefined };
    })
    .filter((c) => c.email && !c.email.toLowerCase().startsWith("email"));

export default function MarketingPage() {
  const [pestana, setPestana] = useState<"campanas" | "audiencias">("campanas");
  const qc = useQueryClient();
  const { data: audiencias } = useQuery({
    queryKey: ["marketing", "audiencias"],
    queryFn: getAudienciasMarketing,
  });
  const { data: campanas = [] } = useQuery({
    queryKey: ["marketing", "campanas"],
    queryFn: getCampanasMarketing,
  });
  const refrescar = () =>
    void qc.invalidateQueries({ queryKey: ["marketing"] });

  // MISMOS ESTILOS DE LA CASA (Felipe, 25-08: "mira Proveedores y mira
  // Marketing"): título plano a la izquierda, subtítulo gris, tabs con
  // ícono dentro del panel blanco, contenido a todo el ancho. Calcado
  // de LogisticaPage.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
        <p className="text-sm text-gray-500">
          Campañas por correo con tus propios datos. Todo correo lleva su
          link de baja; quien se baja no vuelve a recibir nada.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex gap-1 px-4 border-b border-gray-200 overflow-x-auto">
          {(
            [
              ["campanas", "Campañas", Mail],
              ["audiencias", "Audiencias", Users],
            ] as const
          ).map(([id, texto, Icono]) => (
            <button
              key={id}
              onClick={() => setPestana(id)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                pestana === id
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              <Icono size={16} />
              {texto}
            </button>
          ))}
        </div>

        <div className="p-4">
          {pestana === "audiencias" ? (
            <Audiencias audiencias={audiencias} onCambio={refrescar} />
          ) : (
            <Campanas
              campanas={campanas}
              audiencias={audiencias}
              onCambio={refrescar}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Audiencias({
  audiencias,
  onCambio,
}: {
  readonly audiencias?: AudienciasMarketing;
  readonly onCambio: () => void;
}) {
  const [etiqueta, setEtiqueta] = useState("");
  const [texto, setTexto] = useState("");
  const contactos = useMemo(() => parsearContactos(texto), [texto]);

  const importar = useMutation({
    mutationFn: () =>
      importarContactosMarketing({ audiencia: etiqueta.trim(), contactos }),
    onSuccess: (r) => {
      toast.success(
        `${r.importados} contactos importados a "${etiqueta.trim()}"` +
          (r.invalidos.length
            ? ` · ${r.invalidos.length} correos inválidos quedaron fuera`
            : ""),
      );
      setTexto("");
      setEtiqueta("");
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // LA AUDIENCIA GUARDADA (modelo Mailchimp que validó Felipe): se
  // guarda la PREGUNTA con nombre, no la lista — el conteo es de hoy.
  const [nombre, setNombre] = useState("");
  const [filtro, setFiltro] = useState<FiltroSegmento>({});
  const guardar = useMutation({
    mutationFn: () =>
      crearAudienciaMarketing({ nombre: nombre.trim(), filtro }),
    onSuccess: (a) => {
      toast.success(
        `Audiencia "${a.nombre}" guardada. Se recalcula sola: si mañana entran clientes que calzan, quedan adentro.`,
      );
      setNombre("");
      setFiltro({});
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarAudienciaMarketing(id),
    onSuccess: () => {
      toast.success("Audiencia eliminada");
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const [borrando, setBorrando] = useState<number | null>(null);
  // Ver quiénes están dentro (Felipe 26-08): el ojito de cada fila.
  const [viendo, setViendo] = useState<
    | { tipo: "guardada"; nombre: string; filtro: FiltroSegmento }
    | { tipo: "importada"; nombre: string }
    | null
  >(null);

  const guardadas = audiencias?.guardadas ?? [];
  const importadas = audiencias?.importadas ?? [];

  return (
    <div className="space-y-4">
      {viendo && (
        <VerAudiencia viendo={viendo} onCerrar={() => setViendo(null)} />
      )}
      {/* 1. LA ESTANTERÍA: todas las audiencias en una sola lista. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" /> Tus audiencias
        </h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">
          Una audiencia guardada es una pregunta viva: el conteo es de hoy
          y se recalcula solo al momento de enviar. Las importadas son
          listas fijas que trajiste de afuera.
        </p>
        {guardadas.length === 0 && importadas.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            Todavía no tienes audiencias. Crea una abajo desde tu base, o
            importa una lista.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {guardadas.map((a) => (
              <li
                key={`g-${String(a.id)}`}
                className="flex items-center gap-2 py-2 text-sm"
              >
                <span className="flex-1 min-w-0 truncate text-gray-900">
                  {a.nombre}
                </span>
                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  De tu base
                </span>
                <span className="shrink-0 tabular-nums text-gray-600 w-24 text-right">
                  {a.total} hoy
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setViendo({
                      tipo: "guardada",
                      nombre: a.nombre,
                      filtro: a.filtro,
                    })
                  }
                  title="Ver quiénes están dentro"
                  className="shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {borrando === a.id ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        eliminar.mutate(a.id);
                        setBorrando(null);
                      }}
                      className="px-2 py-1 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                    >
                      Borrar
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorrando(null)}
                      className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBorrando(a.id)}
                    title="Eliminar esta audiencia (las campañas ya creadas guardan su propia copia del filtro)"
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
            {importadas.map((a) => (
              <li
                key={`i-${a.audiencia}`}
                className="flex items-center gap-2 py-2 text-sm"
              >
                <span className="flex-1 min-w-0 truncate text-gray-900">
                  {a.audiencia}
                </span>
                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  Importada
                </span>
                <span className="shrink-0 tabular-nums text-gray-600 text-right whitespace-nowrap">
                  {a.contactos} contactos
                  {a.bajas > 0 && (
                    <span className="text-gray-400">
                      {" "}
                      · {a.bajas} {a.bajas === 1 ? "baja" : "bajas"}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setViendo({ tipo: "importada", nombre: a.audiencia })
                  }
                  title="Ver quiénes están dentro (bajas marcadas)"
                  className="shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <span className="shrink-0 w-[26px]" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2. NUEVA AUDIENCIA DESDE LA BASE: filtrar → nombrar → guardar.
          El título va DENTRO de la columna izquierda del constructor,
          para que la previa suba hasta casi arriba de la caja. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <SegmentoBuilder
          audiencias={audiencias}
          filtro={filtro}
          onFiltro={setFiltro}
          encabezado={
            <div>
              <h2 className="font-semibold text-gray-900">
                Nueva audiencia desde tu base
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Arma el filtro, mira la previa, ponle nombre y guárdala.
                Después cualquier campaña la elige de la lista.
              </p>
            </div>
          }
        />
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder='Nombre de la audiencia (ej: "Empresas que nos compraron")'
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            maxLength={120}
          />
          <button
            type="button"
            onClick={() => guardar.mutate()}
            disabled={!nombre.trim() || guardar.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {guardar.isPending ? "Guardando…" : "Guardar audiencia"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Upload className="w-4 h-4 text-gray-500" /> Importar audiencia
        </h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Pega desde Excel: una línea por contacto —{" "}
          <span className="font-mono">correo, nombre, empresa</span> (nombre y
          empresa optativos). Re-importar la misma etiqueta no duplica.
        </p>
        <div className="space-y-2">
          <input
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder='Etiqueta de la audiencia (ej: "cabañas-2026")'
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder={"paola@empresa.cl, Paola Lagos, Colegio Alemán\njuan@otra.cl"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 tabular-nums">
              {contactos.length} contactos detectados
            </span>
            <button
              type="button"
              onClick={() => importar.mutate()}
              disabled={
                !etiqueta.trim() || contactos.length === 0 || importar.isPending
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {importar.isPending ? "Importando…" : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Quiénes están dentro de una audiencia (Felipe 26-08): la ventana del
 * ojito. Guardadas: la lista EN VIVO del mismo motor de la previa
 * (bajas ya descontadas). Importadas: la lista fija con los dados de
 * baja MARCADOS en gris, no escondidos.
 */
function VerAudiencia({
  viendo,
  onCerrar,
}: {
  readonly viendo:
    | { tipo: "guardada"; nombre: string; filtro: FiltroSegmento }
    | { tipo: "importada"; nombre: string };
  readonly onCerrar: () => void;
}) {
  const consulta = useQuery({
    queryKey: ["marketing", "ver-audiencia", viendo.tipo, viendo.nombre],
    queryFn: async () => {
      if (viendo.tipo === "guardada") {
        const r = await previaSegmento(viendo.filtro);
        return {
          total: r.total,
          filas: r.muestra.map((m) => ({
            cliente: m.cliente,
            contacto: m.contacto,
            email: m.email,
            baja: false,
          })),
        };
      }
      const r = await contactosDeAudienciaImportada(viendo.nombre);
      return {
        total: r.length,
        filas: r.map((c) => ({
          cliente: c.empresa ?? "—",
          contacto: c.nombre,
          email: c.email,
          baja: c.baja,
        })),
      };
    },
  });
  const filas = consulta.data?.filas ?? [];
  const total = consulta.data?.total ?? 0;
  const bajas = filas.filter((f) => f.baja).length;

  return (
    <Modal
      titulo={viendo.nombre}
      subtitulo={
        consulta.data
          ? `${String(filas.length - bajas)} contactos` +
            (bajas
              ? ` · ${String(bajas)} ${bajas === 1 ? "baja" : "bajas"}`
              : "") +
            (viendo.tipo === "guardada"
              ? " · lista en vivo, bajas ya descontadas"
              : "")
          : "Cargando…"
      }
      ancho="max-w-2xl"
      onCerrar={onCerrar}
    >
      <div className="grid grid-cols-[1.1fr_0.9fr_1.2fr] gap-x-2 pb-1 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <span>Cliente</span>
        <span>Contacto</span>
        <span>Correo</span>
      </div>
      <ul className="divide-y divide-gray-100 text-xs">
        {filas.map((f) => (
          <li
            key={f.email}
            className={`grid grid-cols-[1.1fr_0.9fr_1.2fr] gap-x-2 py-1.5 ${
              f.baja ? "opacity-50" : ""
            }`}
          >
            <span className="truncate text-gray-900" title={f.cliente ?? ""}>
              {f.cliente}
            </span>
            <span className="truncate text-gray-500">
              {f.contacto ?? "—"}
              {f.baja && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
                  baja
                </span>
              )}
            </span>
            <span className="truncate text-gray-400" title={f.email}>
              {f.email}
            </span>
          </li>
        ))}
        {total > filas.length && (
          <li className="py-1.5 text-gray-400">
            … y {total - filas.length} más
          </li>
        )}
        {consulta.data && filas.length === 0 && (
          <li className="py-4 text-center text-gray-500">
            Esta audiencia está vacía hoy.
          </li>
        )}
      </ul>
    </Modal>
  );
}

function Campanas({
  campanas,
  audiencias,
  onCambio,
}: {
  readonly campanas: CampanaMarketing[];
  readonly audiencias?: AudienciasMarketing;
  readonly onCambio: () => void;
}) {
  const [creando, setCreando] = useState(false);
  return (
    <div className="space-y-4">
      {creando ? (
        <NuevaCampana
          audiencias={audiencias}
          onListo={() => {
            setCreando(false);
            onCambio();
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Nueva campaña
        </button>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historial</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sin prueba a tu casilla no se abre el envío real. Una campaña
            jamás le llega dos veces al mismo correo.
          </p>
        </div>
        {campanas.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Todavía no hay campañas.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {campanas.map((c) => (
              <FilaCampana key={c.id} c={c} onCambio={onCambio} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilaCampana({
  c,
  onCambio,
}: {
  readonly c: CampanaMarketing;
  readonly onCambio: () => void;
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const prueba = useMutation({
    mutationFn: () => enviarPruebaCampana(c.id),
    onSuccess: (r) => {
      toast.success(`Prueba enviada a ${r.enviada_a}. Revisa tu casilla.`);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const enviar = useMutation({
    mutationFn: () => enviarCampana(c.id),
    onSuccess: (r) => {
      toast.success(
        `Campaña enviada a ${r.enviados} destinatarios` +
          (r.fallidos ? ` · ${r.fallidos} fallidos` : ""),
      );
      setConfirmando(null);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const preguntar = async () => {
    try {
      const { destinatarios } = await destinatariosDeCampana(c.id);
      setConfirmando(destinatarios);
    } catch (e) {
      toast.error(humanizeApiError(e));
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-gray-900 truncate">
            {c.nombre}
          </span>
          <span className="block text-xs text-gray-500 truncate">
            {c.asunto} ·{" "}
            {c.audiencia_ref
              ? `audiencia "${c.audiencia_ref}"`
              : c.audiencia_tipo === "segmento"
                ? "segmento de tu base"
                : `clientes: ${(c.tipos_cliente ?? []).join(", ")}`}
          </span>
        </span>
        {c.estado === "enviada" ? (
          <ResultadosDeCampana c={c} onCambio={onCambio} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => prueba.mutate()}
              disabled={prueba.isPending}
              className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {prueba.isPending
                ? "Enviando…"
                : c.prueba_enviada_at
                  ? "Prueba de nuevo"
                  : "Prueba a mi casilla"}
            </button>
            {confirmando !== null ? (
              <span className="shrink-0 flex items-center gap-1.5 text-xs">
                <span className="text-gray-700 font-medium tabular-nums">
                  ¿Enviar a {confirmando} destinatarios?
                </span>
                <button
                  type="button"
                  onClick={() => enviar.mutate()}
                  disabled={enviar.isPending || confirmando === 0}
                  className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {enviar.isPending ? "Enviando…" : "Sí, enviar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(null)}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void preguntar()}
                disabled={!c.prueba_enviada_at}
                title={
                  c.prueba_enviada_at
                    ? undefined
                    : "Primero mándate la prueba: sin prueba no hay envío"
                }
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-40"
              >
                <Send className="w-3 h-3" /> Enviar
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function NuevaCampana({
  audiencias,
  onListo,
  onCancelar,
}: {
  readonly audiencias?: AudienciasMarketing;
  readonly onListo: () => void;
  readonly onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [preencabezado, setPreencabezado] = useState("");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  // LA CAMPAÑA NO ARMA AUDIENCIAS: ELIGE UNA (flujo que validó Felipe).
  // "todos" = el filtro vacío · "g:id" = guardada · "i:nombre" = importada.
  const [audSel, setAudSel] = useState("");

  // MERGE TAGS VISIBLES (Felipe 26-08): botoncitos que se insertan
  // donde está el cursor, en el último campo personalizable tocado.
  type CampoTag = "asunto" | "preencabezado" | "titulo" | "cuerpo";
  const refsTag = {
    asunto: useRef<HTMLInputElement>(null),
    preencabezado: useRef<HTMLInputElement>(null),
    titulo: useRef<HTMLInputElement>(null),
    cuerpo: useRef<HTMLTextAreaElement>(null),
  };
  const setsTag: Record<CampoTag, (v: string) => void> = {
    asunto: setAsunto,
    preencabezado: setPreencabezado,
    titulo: setTitulo,
    cuerpo: setCuerpo,
  };
  const valoresTag: Record<CampoTag, string> = {
    asunto,
    preencabezado,
    titulo,
    cuerpo,
  };
  const [campoTag, setCampoTag] = useState<CampoTag>("cuerpo");
  const insertarTag = (tag: string) => {
    const el = refsTag[campoTag].current;
    const valor = valoresTag[campoTag];
    const ini = el?.selectionStart ?? valor.length;
    const fin = el?.selectionEnd ?? ini;
    setsTag[campoTag](valor.slice(0, ini) + tag + valor.slice(fin));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + tag.length, ini + tag.length);
    });
  };

  const laAudiencia = () => {
    if (audSel === "todos") {
      return {
        audiencia_tipo: "segmento" as const,
        filtro: {} as FiltroSegmento,
        audiencia_ref: "Todos los clientes",
      };
    }
    if (audSel.startsWith("g:")) {
      return {
        audiencia_tipo: "segmento" as const,
        audiencia_id: Number(audSel.slice(2)),
      };
    }
    return {
      audiencia_tipo: "importada" as const,
      audiencia_ref: audSel.slice(2),
    };
  };

  const crear = useMutation({
    mutationFn: () =>
      crearCampanaMarketing({
        nombre,
        asunto,
        titulo,
        cuerpo,
        preencabezado: preencabezado.trim() || undefined,
        ...laAudiencia(),
      }),
    onSuccess: () => {
      toast.success(
        "Campaña guardada como borrador. Mándate la prueba antes de enviar.",
      );
      onListo();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const opciones = [
    {
      value: "todos",
      label: `Todos los clientes (${String(audiencias?.clientes_con_correo ?? 0)})`,
      group: "De tu base (en vivo)",
    },
    ...(audiencias?.guardadas ?? []).map((g) => ({
      value: `g:${String(g.id)}`,
      label: `${g.nombre} (${String(g.total)} hoy)`,
      group: "Tus audiencias guardadas (en vivo)",
    })),
    ...(audiencias?.importadas ?? []).map((a) => ({
      value: `i:${a.audiencia}`,
      label: `${a.audiencia} (${String(a.contactos)})`,
      group: "Importadas",
    })),
  ];

  const lista =
    nombre.trim() && asunto.trim() && titulo.trim() && cuerpo.trim() && audSel;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Nueva campaña</h2>
      <div className="pb-1">
        <p className="text-xs font-semibold uppercase text-gray-500 mb-1.5">
          ¿A quién va?
        </p>
        <div className="max-w-md">
          <SelectWithSearch
            options={opciones}
            value={audSel}
            onChange={setAudSel}
            placeholder="Elegir audiencia…"
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          Las audiencias se crean y guardan en la pestaña Audiencias. Las
          "en vivo" se recalculan solas al momento de enviar.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre interno (ej: Paseos empresas 2026)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          ref={refsTag.asunto}
          onFocus={() => setCampoTag("asunto")}
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          placeholder="Asunto del correo — sirve {nombre} y {empresa}. Ej: {nombre}, ¿paseo de fin de año?"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <input
          ref={refsTag.preencabezado}
          onFocus={() => setCampoTag("preencabezado")}
          value={preencabezado}
          onChange={(e) => setPreencabezado(e.target.value)}
          placeholder="Preencabezado (optativo) — sirve {nombre}. Ej: Fechas de temporada abiertas, {nombre}"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          maxLength={200}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Es el segundo asunto: una buena frase acá sube las aperturas.
        </p>
      </div>
      <input
        ref={refsTag.titulo}
        onFocus={() => setCampoTag("titulo")}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título grande dentro del correo — sirve {nombre} y {empresa}. Ej: ¡Nos volveremos a ver!"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <div>
        <textarea
          ref={refsTag.cuerpo}
          onFocus={() => setCampoTag("cuerpo")}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          rows={6}
          placeholder={"El cuerpo del correo. Párrafos separados por línea en blanco.\nSirve {nombre} y {empresa}. Ej: Hola {nombre}, ¿cómo está? Le escribe Felipe de..."}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {/* Los merge tags a la vista: se insertan donde está el cursor. */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
          <span className="text-gray-500">Personalizar:</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertarTag("{nombre}")}
            className="px-2 py-0.5 rounded-md border border-gray-300 bg-gray-50 font-mono text-gray-700 hover:bg-blue-50 hover:border-blue-300"
            title="El nombre de la persona que recibe (ej: Sandra)"
          >
            {"{nombre}"}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertarTag("{empresa}")}
            className="px-2 py-0.5 rounded-md border border-gray-300 bg-gray-50 font-mono text-gray-700 hover:bg-blue-50 hover:border-blue-300"
            title="La empresa u organización de la persona (ej: Municipalidad de Quillón)"
          >
            {"{empresa}"}
          </button>
          <span className="text-gray-400">
            — pínchalo y se escribe donde estás escribiendo (sirven en
            asunto, preencabezado, título y cuerpo). Si el contacto no
            tiene el dato, va "estimado cliente" / "su organización".
          </span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        Los botones van solos: WhatsApp y "Cotiza aquí" (tu formulario
        público) salen en todos los correos con lo configurado en
        Configuración de la empresa.
      </p>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => crear.mutate()}
          disabled={!lista || crear.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          {crear.isPending ? "Guardando…" : "Guardar borrador"}
        </button>
      </div>
    </div>
  );
}

/**
 * Fase 2: lo que pasó con una campaña enviada, y la segunda pasada.
 * Los sellos llegan por el webhook de Resend; sin webhook configurado
 * los contadores quedan en cero (se activa con RESEND_WEBHOOK_SECRET).
 */
function ResultadosDeCampana({
  c,
  onCambio,
}: {
  readonly c: CampanaMarketing;
  readonly onCambio: () => void;
}) {
  const { data: r } = useQuery({
    queryKey: ["marketing", "resultados", c.id],
    queryFn: () => resultadosDeCampana(c.id),
  });
  // EL REENVÍO CON MANUAL (validado 25-08): una sola segunda pasada,
  // idealmente entre 2 y 7 días después, y SIEMPRE con asunto nuevo —
  // el backend rechaza el asunto repetido; acá se guía antes de chocar.
  const [modal, setModal] = useState<number | null>(null);
  const [asuntoNuevo, setAsuntoNuevo] = useState("");
  const reenviar = useMutation({
    mutationFn: () => reenviarCampana(c.id, asuntoNuevo.trim()),
    onSuccess: (res) => {
      toast.success(
        `Segunda pasada enviada a ${res.reenviados} que no habían abierto.`,
      );
      setModal(null);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const preguntar = async () => {
    try {
      const { sin_abrir } = await sinAbrirDeCampana(c.id);
      setAsuntoNuevo(`¿Lo viste? ${c.asunto}`);
      setModal(sin_abrir);
    } catch (e) {
      toast.error(humanizeApiError(e));
    }
  };
  const dias = c.enviada_at
    ? Math.floor((Date.now() - new Date(c.enviada_at).getTime()) / 86400000)
    : 0;
  const asuntoRepetido =
    asuntoNuevo.trim().toLowerCase() === c.asunto.trim().toLowerCase();
  return (
    <span className="shrink-0 flex items-center gap-2">
      {/* Anchos FIJOS para que las filas del historial queden alineadas
          como tabla (Felipe 26-08). */}
      <span className="inline-flex justify-center w-48 shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums whitespace-nowrap">
        enviada · {c.total_destinatarios ?? 0} ·{" "}
        {c.enviada_at ? formatISOUTCDateToString(c.enviada_at.slice(0, 10)) : ""}
      </span>
      <span
        className="w-44 shrink-0 text-xs text-gray-500 tabular-nums whitespace-nowrap overflow-hidden"
        title="Aperturas · clicks · rebotes — y 2ª: cuántos recibieron la segunda pasada (webhook de Resend)"
      >
        {r
          ? `👁 ${String(r.abiertos)} · 🔗 ${String(r.clicks)} · ↩ ${String(r.rebotes)}${r.reenviados > 0 ? ` · 2ª ${String(r.reenviados)}` : ""}`
          : "…"}
      </span>
      <button
        type="button"
        onClick={() => void preguntar()}
        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
        title="Una sola segunda pasada, solo a quienes no abrieron, con asunto nuevo"
      >
        Reenviar a los que no abrieron
      </button>
      {modal !== null && (
        <Modal
          titulo="Segunda pasada a los que no abrieron"
          subtitulo={`Campaña "${c.nombre}" · enviada hace ${String(dias)} ${dias === 1 ? "día" : "días"}`}
          ancho="max-w-lg"
          onCerrar={() => setModal(null)}
          pie={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => reenviar.mutate()}
                disabled={
                  reenviar.isPending ||
                  modal === 0 ||
                  !asuntoNuevo.trim() ||
                  asuntoRepetido
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {reenviar.isPending
                  ? "Enviando…"
                  : `Reenviar a ${String(modal)}`}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              Van a recibirla{" "}
              <span className="font-semibold tabular-nums">{modal}</span>{" "}
              contactos que no abrieron la primera. Es una sola segunda
              pasada: después de esta no hay más reenvíos.
            </p>
            {dias < 2 ? (
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
                Buen momento: el manual recomienda la segunda pasada entre
                2 y 7 días después.
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
    </span>
  );
}
