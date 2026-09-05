import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Eye,
  Mail,
  Pencil,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import Modal from "../../components/Modal";
import MultiSelect from "../../components/MultiSelect";
import { toast } from "../../components/toast/Toast";
import {
  AudienciasMarketing,
  CampanaMarketing,
  FiltroSegmento,
  contactosDeAudienciaImportada,
  crearAudienciaMarketing,
  crearCampanaMarketing,
  eliminarAudienciaImportada,
  eliminarAudienciaMarketing,
  eliminarContactoImportado,
  getAudienciasMarketing,
  getCampanasMarketing,
  importarContactosMarketing,
  previaSegmento,
  renombrarAudienciaGuardada,
  renombrarAudienciaImportada,
} from "../../services/marketing.service";
import SegmentoBuilder from "./SegmentoBuilder";
import CampanaMarcaPropia from "./CampanaMarcaPropia";
import {
  opcionesDeAudiencias,
  unaAudiencia,
} from "./audienciasDeCampana";
import { leerArchivoDeContactos } from "./leerArchivoDeContactos";
import { humanizeApiError } from "../../utils/apiErrors";
import { matchesSearch } from "../../utils/searchMatch";
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
  // LOS FILTROS SE RECUERDAN al navegar (regla de Felipe 26-08).
  const [pestana, setPestana] = useState<"campanas" | "audiencias">(() => {
    try {
      return (
        (sessionStorage.getItem("mk.pestana") as
          | "campanas"
          | "audiencias"
          | null) ?? "campanas"
      );
    } catch {
      return "campanas";
    }
  });
  const elegirPestana = (p: "campanas" | "audiencias") => {
    setPestana(p);
    try {
      sessionStorage.setItem("mk.pestana", p);
    } catch {
      /* sin memoria de pestaña: no es grave */
    }
  };
  const qc = useQueryClient();
  // El formulario de nueva campana vive en la pestana Campanas pero
  // necesita la estanteria de audiencias: el estado sube aca para que
  // la consulta sepa cuando hace falta.
  const [creando, setCreando] = useState(false);
  const { data: audiencias } = useQuery({
    queryKey: ["marketing", "audiencias"],
    queryFn: getAudienciasMarketing,
    // La materia prima de los filtros (tipos, estanteria) casi nunca
    // cambia: 5 min en memoria para que "Nueva audiencia" abra al tiro
    // y un hipo del servidor no se sienta (Felipe 26-08). Crear/borrar
    // audiencias refresca igual via invalidateQueries.
    staleTime: 5 * 60_000,
    // Es LA consulta pesada del modulo (resuelve cada audiencia contra
    // toda la base para los conteos en vivo). Solo corre cuando se
    // mira; entrar a Campanas y volver de una ficha no la paga.
    enabled: pestana === "audiencias" || creando,
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
              onClick={() => elegirPestana(id)}
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
              creando={creando}
              onCreando={setCreando}
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
  // EL LECTOR DE ARCHIVOS (27-08): elige un .txt/.csv/.xlsx y cae en
  // la caja de siempre — mismo conteo, misma validación, mismo botón.
  const refArchivo = useRef<HTMLInputElement>(null);
  const alElegirArchivo = async (input: HTMLInputElement) => {
    const archivo = input.files?.[0];
    input.value = "";
    if (!archivo) return;
    const r = await leerArchivoDeContactos(archivo);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setTexto(r.texto);
    if (!etiqueta.trim()) {
      setEtiqueta(archivo.name.replace(/\.[^.]+$/, ""));
    }
    toast.success("Archivo leído: revisa el conteo y aprieta Importar");
  };

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
  // EL LÁPIZ (Felipe 27-08): renombrar en línea, ✓ para guardar.
  const [renombrando, setRenombrando] = useState<
    { tipo: "g"; id: number; valor: string } | { tipo: "i"; nombre: string; valor: string } | null
  >(null);
  const renombrar = useMutation({
    mutationFn: () => {
      if (!renombrando) return Promise.reject(new Error("nada que renombrar"));
      return renombrando.tipo === "g"
        ? renombrarAudienciaGuardada(renombrando.id, renombrando.valor.trim())
        : renombrarAudienciaImportada(
            renombrando.nombre,
            renombrando.valor.trim(),
          );
    },
    onSuccess: () => {
      toast.success("Nombre cambiado");
      setRenombrando(null);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  // Borrar una IMPORTADA (Felipe 27-08): mismo ritual de confirmar.
  const [borrandoImp, setBorrandoImp] = useState<string | null>(null);
  const eliminarImp = useMutation({
    mutationFn: (nom: string) => eliminarAudienciaImportada(nom),
    onSuccess: (r) => {
      toast.success(
        `Audiencia eliminada (${String(r.eliminados)} contactos fuera). Las bajas se conservan: son para siempre.`,
      );
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
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
                className="grid grid-cols-[1fr_110px_170px_auto] items-center gap-2 py-2 text-sm"
              >
                {renombrando?.tipo === "g" && renombrando.id === a.id ? (
                  <span className="flex items-center gap-1 min-w-0">
                    <input
                      value={renombrando.valor}
                      onChange={(e) =>
                        setRenombrando({ ...renombrando, valor: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renombrar.mutate();
                        if (e.key === "Escape") setRenombrando(null);
                      }}
                      autoFocus
                      className="flex-1 min-w-0 border border-blue-300 rounded-lg px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => renombrar.mutate()}
                      disabled={!renombrando.valor.trim() || renombrar.isPending}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenombrando(null)}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="min-w-0 truncate text-gray-900">
                    {a.nombre}
                  </span>
                )}
                <span className="justify-self-start text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  De tu base
                </span>
                <span className="tabular-nums text-gray-600 text-right whitespace-nowrap">
                  {a.total} hoy
                </span>
                <span className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setRenombrando({ tipo: "g", id: a.id, valor: a.nombre })
                  }
                  title="Cambiar el nombre"
                  className="shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
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
                </span>
              </li>
            ))}
            {importadas.map((a) => (
              <li
                key={`i-${a.audiencia}`}
                className="grid grid-cols-[1fr_110px_170px_auto] items-center gap-2 py-2 text-sm"
              >
                {renombrando?.tipo === "i" &&
                renombrando.nombre === a.audiencia ? (
                  <span className="flex items-center gap-1 min-w-0">
                    <input
                      value={renombrando.valor}
                      onChange={(e) =>
                        setRenombrando({ ...renombrando, valor: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renombrar.mutate();
                        if (e.key === "Escape") setRenombrando(null);
                      }}
                      autoFocus
                      className="flex-1 min-w-0 border border-blue-300 rounded-lg px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => renombrar.mutate()}
                      disabled={!renombrando.valor.trim() || renombrar.isPending}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenombrando(null)}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="min-w-0 truncate text-gray-900">
                    {a.audiencia}
                  </span>
                )}
                <span className="justify-self-start text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  Importada
                </span>
                <span className="tabular-nums text-gray-600 text-right whitespace-nowrap">
                  {a.contactos} contactos
                  {a.bajas > 0 && (
                    <span className="text-gray-400">
                      {" "}
                      · {a.bajas} {a.bajas === 1 ? "baja" : "bajas"}
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setRenombrando({
                      tipo: "i",
                      nombre: a.audiencia,
                      valor: a.audiencia,
                    })
                  }
                  title="Cambiar el nombre"
                  className="shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
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
                {borrandoImp === a.audiencia ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        eliminarImp.mutate(a.audiencia);
                        setBorrandoImp(null);
                      }}
                      className="px-2 py-1 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                    >
                      Borrar
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorrandoImp(null)}
                      className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBorrandoImp(a.audiencia)}
                    title="Eliminar esta lista importada (las bajas registradas se conservan)"
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                </span>
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
          Elige un archivo (.txt, .csv, .xlsx) o pega desde Excel: una línea
          por contacto — <span className="font-mono">correo, nombre, empresa</span>{" "}
          (nombre y empresa optativos). Re-importar la misma etiqueta no
          duplica.
        </p>
        <div className="space-y-2">
          <input
            ref={refArchivo}
            type="file"
            accept=".txt,.csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => void alElegirArchivo(e.target)}
          />
          <button
            type="button"
            onClick={() => refArchivo.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" /> Elegir archivo…
          </button>
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
          {contactos.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-x-2 px-3 py-1.5 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                <span>Correo</span>
                <span>Nombre</span>
                <span>Empresa</span>
              </div>
              <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto text-xs">
                {contactos.map((ct) => (
                  <li
                    key={ct.email}
                    className="grid grid-cols-[1.2fr_1fr_1fr] gap-x-2 px-3 py-1"
                  >
                    <span className="truncate text-gray-700">{ct.email}</span>
                    <span className="truncate text-gray-600">
                      {ct.name ?? "—"}
                    </span>
                    <span className="truncate text-gray-500">
                      {ct.empresa ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 tabular-nums">
              {contactos.length} contactos detectados
              {(() => {
                const lineas = texto
                  .split(/\r?\n/)
                  .filter((l) => l.trim()).length;
                const fuera = lineas - contactos.length;
                return fuera > 0 ? (
                  <span className="text-amber-600">
                    {" "}
                    · {fuera} línea{fuera === 1 ? "" : "s"} no parece
                    {fuera === 1 ? "" : "n"} contacto
                  </span>
                ) : null;
              })()}
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
    // Caché PROPIO: compartir clave con la previa del constructor
    // parecía gratis pero las dos consultas devuelven FORMAS distintas
    // (muestra vs filas) y chocaban — la barredora lo pilló.
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

  // Sacar UN contacto (solo importadas): las guardadas son una
  // pregunta viva — ahí mandan las bajas o el filtro, no una lista.
  const qc = useQueryClient();
  const [sacando, setSacando] = useState<string | null>(null);
  const sacar = useMutation({
    mutationFn: (email: string) =>
      eliminarContactoImportado(viendo.nombre, email),
    onSuccess: () => {
      toast.success("Contacto fuera de la audiencia");
      void qc.invalidateQueries({ queryKey: ["marketing"] });
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <Modal
      titulo={viendo.nombre}
      subtitulo={
        consulta.data
          ? `${String(total - bajas)} contactos` +
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
      <div className="grid grid-cols-[1.1fr_0.9fr_1.2fr_auto] gap-x-2 pb-1 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <span>Cliente</span>
        <span>Contacto</span>
        <span>Correo</span>
        <span className="w-6" />
      </div>
      <ul className="divide-y divide-gray-100 text-xs">
        {filas.map((f) => (
          <li
            key={f.email}
            className={`grid grid-cols-[1.1fr_0.9fr_1.2fr_auto] items-center gap-x-2 py-1.5 ${
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
            {viendo.tipo === "importada" ? (
              sacando === f.email ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      sacar.mutate(f.email);
                      setSacando(null);
                    }}
                    className="px-1.5 py-0.5 bg-red-600 text-white rounded font-semibold hover:bg-red-700 text-[10px]"
                  >
                    Sacar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSacando(null)}
                    className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 rounded text-[10px]"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setSacando(f.email)}
                  title="Sacar este contacto de la audiencia"
                  className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )
            ) : (
              <span className="w-6" />
            )}
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

/**
 * EL HISTORIAL COMO TABLA (Felipe 26-08, calcado de Post-Venta):
 * N° · fecha de envío · nombre · audiencia · destinatarios · estado,
 * con buscador y orden por columnas. Toda la gestión (prueba, envío,
 * resultados, segunda pasada) vive DENTRO de la ficha de la campaña.
 */
function Campanas({
  campanas,
  audiencias,
  creando,
  onCreando,
  onCambio,
}: {
  readonly campanas: CampanaMarketing[];
  readonly audiencias?: AudienciasMarketing;
  readonly creando: boolean;
  readonly onCreando: (v: boolean) => void;
  readonly onCambio: () => void;
}) {
  const navigate = useNavigate();
  const [busca, setBuscaEstado] = useState(() => {
    try {
      return sessionStorage.getItem("mk.busca") ?? "";
    } catch {
      return "";
    }
  });
  const setBusca = (v: string) => {
    setBuscaEstado(v);
    try {
      sessionStorage.setItem("mk.busca", v);
    } catch {
      /* sin memoria de pestaña: no es grave */
    }
  };
  const [sortCol, setSortColEstado] = useState<"numero" | "fecha" | null>(
    () => {
      try {
        return (
          (sessionStorage.getItem("mk.sortCol") as "numero" | "fecha" | null) ||
          null
        );
      } catch {
        return null;
      }
    },
  );
  const [sortDir, setSortDirEstado] = useState<"asc" | "desc">(() => {
    try {
      return (
        (sessionStorage.getItem("mk.sortDir") as "asc" | "desc" | null) ??
        "desc"
      );
    } catch {
      return "desc";
    }
  });
  const setSortCol = (v: "numero" | "fecha" | null) => {
    setSortColEstado(v);
    try {
      sessionStorage.setItem("mk.sortCol", v ?? "");
    } catch {
      /* no es grave */
    }
  };
  const setSortDir = (v: "asc" | "desc") => {
    setSortDirEstado(v);
    try {
      sessionStorage.setItem("mk.sortDir", v);
    } catch {
      /* no es grave */
    }
  };
  const toggleSort = (col: "numero" | "fecha") => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortCol(null);
    }
  };

  const filtradas = campanas.filter((c) =>
    matchesSearch(busca, String(c.id), c.nombre, c.asunto, c.audiencia_ref ?? ""),
  );
  const ordenadas = [...filtradas].sort((a, b) => {
    if (sortCol === "numero") {
      return sortDir === "asc" ? a.id - b.id : b.id - a.id;
    }
    if (sortCol === "fecha") {
      const fa = a.enviada_at ?? "";
      const fb = b.enviada_at ?? "";
      return sortDir === "asc" ? fa.localeCompare(fb) : fb.localeCompare(fa);
    }
    // Orden por defecto: lo más nuevo arriba (borradores incluidos).
    return b.created_at.localeCompare(a.created_at);
  });

  const flecha = (col: "numero" | "fecha") =>
    sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {creando ? null : (
          <button
            type="button"
            onClick={() => onCreando(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + Nueva campaña
          </button>
        )}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por N°, nombre, asunto o audiencia…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {creando && (
        <NuevaCampana
          audiencias={audiencias}
          onListo={() => {
            onCreando(false);
            onCambio();
          }}
          onCancelar={() => onCreando(false)}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historial</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pincha una campaña para abrir su ficha: indicadores,
            destinatarios, el correo enviado y la segunda pasada.
          </p>
        </div>
        {ordenadas.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            {busca ? "Nada calza con la búsqueda." : "Todavía no hay campañas."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm table-fixed">
              <thead className="bg-gray-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th
                    className="w-[4%] px-4 py-2.5 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort("numero")}
                  >
                    N°{flecha("numero")}
                  </th>
                  <th
                    className="w-[10%] px-3 py-2.5 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort("fecha")}
                  >
                    Fecha envío{flecha("fecha")}
                  </th>
                  <th className="w-[34%] px-3 py-2.5">Campaña</th>
                  <th className="w-[14%] px-3 py-2.5">Audiencia</th>
                  <th className="w-[20%] px-3 py-2.5 text-center whitespace-nowrap">
                    Destinatarios
                  </th>
                  <th className="w-[14%] px-3 py-2.5 text-center">Estado</th>
                  <th className="w-[4%] px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ordenadas.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() =>
                      navigate(`/marketing/campana/${String(c.id)}`)
                    }
                    className="cursor-pointer hover:bg-blue-50/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-blue-600 tabular-nums">
                      #{c.id}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 tabular-nums whitespace-nowrap">
                      {c.enviada_at
                        ? formatISOUTCDateToString(c.enviada_at.slice(0, 10))
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block font-medium text-gray-900 truncate">
                        {c.nombre}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {c.asunto}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 truncate">
                      {c.audiencia_ref ?? "segmento de tu base"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums">
                      {c.total_destinatarios ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
                          c.estado === "enviada"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : c.estado === "programada"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {c.estado === "enviada"
                          ? "Enviada"
                          : c.estado === "programada"
                            ? "Programada"
                            : "Borrador"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-gray-400">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
  // LA CAMPAÑA NO ARMA AUDIENCIAS: las ELIGE — y desde el 27-08 puede
  // elegir VARIAS (unión deduplicada: quien está en dos recibe UNO).
  // "todos" = el filtro vacío · "g:id" = guardada · "i:nombre" = importada.
  const [audSels, setAudSels] = useState<string[]>([]);
  // Marca propia de la campana (28-08): vacios = la de Configuracion.
  const [pBanner, setPBanner] = useState("");
  const [pWhatsapp, setPWhatsapp] = useState("");

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


  const crear = useMutation({
    mutationFn: () =>
      crearCampanaMarketing({
        nombre,
        asunto,
        titulo,
        cuerpo,
        preencabezado: preencabezado.trim() || undefined,
        ...(pBanner ? { banner_url: pBanner } : {}),
        ...(pWhatsapp.trim() ? { whatsapp: pWhatsapp.trim() } : {}),
        audiencias: audSels.map(unaAudiencia),
      }),
    onSuccess: () => {
      toast.success(
        "Campaña guardada como borrador. Mándate la prueba antes de enviar.",
      );
      onListo();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const opciones = opcionesDeAudiencias(audiencias);

  const lista =
    nombre.trim() &&
    asunto.trim() &&
    titulo.trim() &&
    cuerpo.trim() &&
    audSels.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Nueva campaña</h2>
      <div className="pb-1">
        <p className="text-xs font-semibold uppercase text-gray-500 mb-1.5">
          ¿A quién va?
        </p>
        <div className="max-w-md">
          <MultiSelect
            options={opciones}
            value={audSels}
            onChange={setAudSels}
            placeholder="Elegir una o varias audiencias…"
            buscador
            searchPlaceholder="Buscar audiencia por nombre…"
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          Puedes elegir varias: se juntan y quien esté en dos recibe UN
          solo correo. Las audiencias se crean en la pestaña Audiencias;
          las "en vivo" se recalculan solas al momento de enviar.
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

      <CampanaMarcaPropia
        bannerUrl={pBanner}
        whatsapp={pWhatsapp}
        onBanner={setPBanner}
        onWhatsapp={setPWhatsapp}
      />

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