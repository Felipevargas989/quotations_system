import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  CalendarClock,
  Eye,
  Inbox,
  RefreshCw,
  Settings,
  Star,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  actualizarOportunidad,
  correrRadar,
  getCorridasDelRadar,
  getOportunidades,
  type EstadoOportunidad,
  type Oportunidad,
  type Semaforo,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import CompetidoresOportunidades from "./CompetidoresOportunidades";
import ConfiguracionOportunidades from "./ConfiguracionOportunidades";
import MisLicitaciones from "./MisLicitaciones";
import OferenteOportunidades from "./OferenteOportunidades";
import PanelDeOportunidad from "./PanelDeOportunidad";
import {
  ALERTAS,
  contarPorSemaforo,
  cuandoCierra,
  esPrioridad,
  ESTADOS,
  ETIQUETAS,
  FILTROS_DE_PARTIDA,
  filtrarSinSemaforo,
  type Filtros,
  SEMAFOROS,
  textoDelAnterior,
  separarMias,
  TIPOS,
  VISTAS,
} from "./oportunidades.utils";
import SeVieneOportunidades from "./SeVieneOportunidades";
import { useMisLicitaciones } from "./useMisLicitaciones";

// OPORTUNIDADES (doc 17, sprint 2): la bandeja de licitaciones y compras
// ágiles que el radar trae cada 2 horas y la IA lee. Base: el mockup del
// 16-10. Solo administrador. Sin resumen por correo (Felipe, 17-10: "se
// revisa en Eventia").

const CLAVE_FILTROS = "op.filtros";
const CLAVE_PESTANA = "op.pestana";

type Pestana =
  | "bandeja"
  | "mias"
  | "seviene"
  | "competidores"
  | "empresa"
  | "configuracion";

const leerSesion = <T,>(clave: string, siNo: T): T => {
  try {
    const v = sessionStorage.getItem(clave);
    return v ? ({ ...siNo, ...(JSON.parse(v) as T) } as T) : siNo;
  } catch {
    return siNo;
  }
};

const guardarSesion = (clave: string, valor: unknown) => {
  try {
    sessionStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin memoria de filtros: no es grave */
  }
};

export default function OportunidadesPage() {
  // LOS FILTROS Y LA PESTAÑA SE RECUERDAN al ir a una ficha y volver
  // (regla de Felipe, 26-08).
  const [pestana, setPestana] = useState<Pestana>(
    () => leerSesion<{ p: Pestana }>(CLAVE_PESTANA, { p: "bandeja" }).p,
  );
  const elegirPestana = (p: Pestana) => {
    setPestana(p);
    guardarSesion(CLAVE_PESTANA, { p });
  };
  // Cuántas hay en curso, a la vista en la pestaña.
  const { data: mias = [] } = useMisLicitaciones();
  const enCurso = separarMias(mias).enCurso.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oportunidades</h1>
          <p className="text-sm text-gray-500">
            Licitaciones y compras ágiles de Mercado Público, leídas con IA. Se
            pone al día cada 2 horas.
          </p>
        </div>
        <EstadoDelRadar />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex gap-1 px-4 border-b border-gray-200 overflow-x-auto">
          {(
            [
              ["bandeja", "Bandeja", Inbox],
              ["mias", "Mis licitaciones", Briefcase],
              ["seviene", "Se viene", CalendarClock],
              ["competidores", "Competidores", Users],
              ["empresa", "Mi empresa", Building2],
              ["configuracion", "Configuración", Settings],
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
              {id === "mias" && enCurso > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                  {enCurso}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {pestana === "configuracion" && <ConfiguracionOportunidades />}
          {pestana === "seviene" && <SeVieneOportunidades />}
          {pestana === "competidores" && <CompetidoresOportunidades />}
          {pestana === "empresa" && <OferenteOportunidades />}
          {pestana === "bandeja" && <Bandeja />}
          {pestana === "mias" && <MisLicitaciones />}
        </div>
      </div>
    </div>
  );
}

/** Cuándo se revisó Mercado Público por última vez, y el botón para
 *  revisarlo ahora (útil en el laboratorio, donde el reloj no corre). */
function EstadoDelRadar() {
  const qc = useQueryClient();
  const { data: corridas = [] } = useQuery({
    queryKey: ["oportunidades", "corridas"],
    queryFn: getCorridasDelRadar,
    refetchInterval: 60_000,
  });
  const ultima = corridas[0];
  const ultimaBuena = corridas.find((c) => c.estado === "ok");
  const corriendo = ultima?.estado === "corriendo";

  const revisar = useMutation({
    mutationFn: correrRadar,
    onSuccess: (r) => {
      if (r.iniciada) {
        toast.success(
          "Revisando Mercado Público. Tarda unos minutos: la bandeja se pone al día sola.",
        );
      } else {
        toast.warn(r.motivo ?? "Ya hay una revisión en marcha.");
      }
      void qc.invalidateQueries({ queryKey: ["oportunidades", "corridas"] });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo revisar.")),
  });

  return (
    <div className="text-right text-xs text-gray-500 space-y-1">
      <div>
        {corriendo
          ? `Revisando Mercado Público desde las ${formatMomento(ultima.empezo_en, "diaHora")}…`
          : ultimaBuena
            ? `Revisado ${formatMomento(ultimaBuena.termino_en ?? ultimaBuena.empezo_en, "diaHora")}`
            : "Todavía sin revisar"}
      </div>
      {ultima?.estado === "error" && (
        <div className="text-red-600">La última revisión falló.</div>
      )}
      <button
        type="button"
        onClick={() => revisar.mutate()}
        disabled={corriendo || revisar.isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        <RefreshCw size={14} className={corriendo ? "animate-spin" : ""} />
        Revisar ahora
      </button>
    </div>
  );
}

function Bandeja() {
  const qc = useQueryClient();
  const [filtros, setFiltrosEstado] = useState<Filtros>(() =>
    leerSesion<Filtros>(CLAVE_FILTROS, FILTROS_DE_PARTIDA),
  );
  const setFiltros = (cambios: Partial<Filtros>) =>
    setFiltrosEstado((antes) => {
      const nuevos = { ...antes, ...cambios };
      guardarSesion(CLAVE_FILTROS, nuevos);
      return nuevos;
    });

  const historial = filtros.vista === "historial";
  const {
    data: lista = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["oportunidades", "lista", historial ? "historial" : "vigentes"],
    queryFn: () => getOportunidades({ vigentes: !historial }),
  });

  const base = useMemo(
    () => filtrarSinSemaforo(lista, filtros),
    [lista, filtros],
  );
  const cuenta = contarPorSemaforo(base);
  const visibles = base.filter(
    (o) => !o.semaforo || filtros.semaforos.includes(o.semaforo),
  );
  const regiones = useMemo(
    () =>
      [...new Set(lista.map((o) => o.proceso.region).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b), "es"),
      ) as string[],
    [lista],
  );

  // El resumen al costado (doc 17, sprint 3, paso 1b): se abre al pinchar
  // cualquier parte de la fila (Felipe, 17-10, no encontraba el del
  // nombre); con Ctrl o Cmd el nombre sigue abriendo la ficha en otra
  // pestaña.
  const [abierta, setAbierta] = useState<Oportunidad | null>(null);

  const decidir = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoOportunidad }) =>
      actualizarOportunidad(id, { estado }),
    onSuccess: (_r, { estado }) => {
      setAbierta(null);
      toast.success(
        estado === "descartada"
          ? "Descartada. Queda en la vista Descartadas: no se borra."
          : estado === "en_estudio"
            ? "Quedó en «Mis licitaciones» para trabajarla."
            : "Lista.",
      );
      void qc.invalidateQueries({ queryKey: ["oportunidades", "lista"] });
      void qc.invalidateQueries({ queryKey: ["oportunidades", "mias"] });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  const alternarSemaforo = (s: Semaforo) =>
    setFiltros({
      semaforos: filtros.semaforos.includes(s)
        ? filtros.semaforos.filter((x) => x !== s)
        : [...filtros.semaforos, s],
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SEMAFOROS) as Semaforo[]).map((s) => {
          const activo = filtros.semaforos.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => alternarSemaforo(s)}
              aria-pressed={activo}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border ${
                activo
                  ? SEMAFOROS[s].chip
                  : "border-gray-200 bg-white text-gray-400"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${SEMAFOROS[s].punto}`}
              />
              {SEMAFOROS[s].label} {cuenta[s]}
              {!activo && s === "rojo" && " · ocultas"}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SelectWithSearch
          options={VISTAS.map((v) => ({ value: v.value, label: v.label }))}
          value={filtros.vista}
          onChange={(v) =>
            setFiltros({ vista: (v || "abiertas") as Filtros["vista"] })
          }
          sinLimpiar
          mostrarConteo={false}
          tamano="sm"
        />
        <SelectWithSearch
          options={[
            { value: "", label: "Licitaciones y compras ágiles" },
            { value: "licitacion", label: "Solo licitaciones" },
            { value: "compra_agil", label: "Solo compras ágiles" },
          ]}
          value={filtros.tipo}
          onChange={(v) => setFiltros({ tipo: v as Filtros["tipo"] })}
          sinLimpiar
          mostrarConteo={false}
          tamano="sm"
        />
        <SelectWithSearch
          options={[
            { value: "", label: "Todas tus regiones" },
            ...regiones.map((r) => ({ value: r, label: r })),
          ]}
          value={filtros.region}
          onChange={(v) => setFiltros({ region: v })}
          sinLimpiar
          mostrarConteo={false}
          tamano="sm"
        />
        <input
          type="text"
          value={filtros.busca}
          onChange={(e) => setFiltros({ busca: e.target.value })}
          placeholder="Buscar por nombre, organismo o código"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isPending ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-red-600">
          No se pudo cargar la bandeja. Intenta de nuevo en un rato.
        </p>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          {lista.length === 0
            ? "Todavía no hay oportunidades leídas. El radar las trae solo, cada 2 horas."
            : "Nada con estos filtros."}
        </p>
      ) : (
        <div className="space-y-5">
          {[
            {
              titulo: "Prioridad: comuna cercana o alto valor",
              filas: visibles.filter(esPrioridad),
              destacado: true,
            },
            {
              titulo: "El resto",
              filas: visibles.filter((o) => !esPrioridad(o)),
              destacado: false,
            },
          ]
            .filter((g) => g.filas.length > 0)
            .map((g, i, grupos) => (
              <section key={g.titulo}>
                {grupos.length > 1 && (
                  <h3
                    className={`flex items-center gap-1.5 mb-1 text-xs font-semibold uppercase tracking-wide ${
                      g.destacado ? "text-amber-700" : "text-gray-500"
                    }`}
                  >
                    {g.destacado && <Star size={14} />}
                    {g.titulo} ({g.filas.length})
                  </h3>
                )}
                <ul
                  className={`divide-y divide-gray-200 border-t ${
                    g.destacado
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-gray-200"
                  }`}
                >
                  {g.filas.map((o) => (
                    <FilaDeOportunidad
                      key={o.id}
                      o={o}
                      ocupado={decidir.isPending}
                      onDecidir={(estado) =>
                        decidir.mutate({ id: o.id, estado })
                      }
                      onAbrir={() => setAbierta(o)}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      {abierta && (
        <PanelDeOportunidad
          o={abierta}
          ocupado={decidir.isPending}
          onDecidir={(estado) => decidir.mutate({ id: abierta.id, estado })}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}

function FilaDeOportunidad({
  o,
  ocupado,
  onDecidir,
  onAbrir,
}: {
  readonly o: Oportunidad;
  readonly ocupado: boolean;
  readonly onDecidir: (estado: EstadoOportunidad) => void;
  readonly onAbrir: () => void;
}) {
  const p = o.proceso;
  const cierre = cuandoCierra(p.fecha_cierre);
  const estado = ESTADOS.find((e) => e.value === o.estado);
  // Los botones de la derecha deciden sin abrir el resumen.
  const solo = (accion: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    accion();
  };
  return (
    <li
      onClick={() => {
        // Seleccionar texto para copiarlo no abre el resumen.
        if (window.getSelection()?.toString()) return;
        onAbrir();
      }}
      className={`grid grid-cols-[14px_minmax(0,1fr)_auto] gap-3 px-2 py-3 -mx-2 rounded-lg cursor-pointer hover:bg-blue-50/50 ${
        o.estado === "descartada" ? "opacity-60" : ""
      }`}
    >
      <span
        title={o.semaforo ? SEMAFOROS[o.semaforo].label : "Sin leer"}
        className={`mt-1.5 w-2.5 h-2.5 rounded-full ${
          o.semaforo ? SEMAFOROS[o.semaforo].punto : "bg-gray-300"
        }`}
      />
      <div className="min-w-0">
        <Link
          to={`/oportunidades/${o.id}`}
          onClick={(e) => {
            // Un clic normal abre el resumen; con Ctrl, Cmd o la rueda, la
            // ficha en otra pestaña, como cualquier enlace.
            e.stopPropagation();
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onAbrir();
          }}
          className="text-sm font-semibold text-gray-900 hover:text-blue-700"
        >
          {p.nombre}
        </Link>
        <p className="text-xs text-gray-500 mt-0.5">
          {[
            p.organismo,
            `${TIPOS[p.tipo]} ${o.codigo}`,
            p.monto ? formatCurrency(p.monto, "CLP") : "monto no informado",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs mt-0.5">
          <span className="text-gray-500">
            Cierra {formatMomento(p.fecha_cierre, "diaHora", "sin fecha")}
          </span>{" "}
          <span
            className={
              cierre.urgente ? "font-semibold text-red-600" : "text-gray-500"
            }
          >
            ({cierre.texto})
          </span>
        </p>
        {o.razon && <p className="text-sm text-gray-700 mt-1">{o.razon}</p>}
        {o.anterior && (
          <p className="text-xs text-gray-600 mt-1">
            {textoDelAnterior(o.anterior)}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {o.alertas.map((a) => (
            <span
              key={a}
              className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700"
            >
              {ALERTAS[a] ?? a}
            </span>
          ))}
          {o.etiquetas
            .filter((e) => e !== "otro")
            .map((e) => (
              <span
                key={e}
                className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
              >
                {ETIQUETAS[e] ?? e}
              </span>
            ))}
          {estado && o.estado !== "nueva" && (
            <span className={`px-2 py-0.5 text-xs rounded ${estado.clases}`}>
              {estado.label}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 items-stretch">
        <button
          type="button"
          onClick={solo(onAbrir)}
          className="inline-flex items-center justify-center gap-1 px-3 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          <Eye size={13} /> Ver resumen
        </button>
        {o.estado === "nueva" ? (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={solo(() => onDecidir("en_estudio"))}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Me interesa
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={solo(() => onDecidir("descartada"))}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              Descartar
            </button>
          </>
        ) : o.estado === "descartada" ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={solo(() => onDecidir("nueva"))}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Recuperar
          </button>
        ) : (
          <Link
            to={`/oportunidades/${o.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1.5 text-xs font-semibold text-center text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Ver ficha
          </Link>
        )}
      </div>
    </li>
  );
}
