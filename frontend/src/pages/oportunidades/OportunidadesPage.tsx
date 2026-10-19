import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  AlertTriangle,
  Archive,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  HelpCircle,
  Hourglass,
  Inbox,
  RefreshCw,
  Settings,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  actualizarOportunidad,
  correrRadar,
  getCorridasDelRadar,
  getOportunidades,
  type EstadoOportunidad,
  type Oportunidad,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import {
  agruparPorCierre,
  type ClaveDeGrupo,
  contarPorVista,
  conVistaValida,
  queDiceLaBandejaVacia,
  useProximaPasada,
} from "./bandeja";
import BandejaVacia from "./BandejaVacia";
import { RECUADRO_DEL_GRUPO } from "./coloresDeLaBandeja";
import { type Cobertura, coberturaDe } from "./cobertura";
import CompetidoresOportunidades from "./CompetidoresOportunidades";
import FilaDeOportunidad from "./FilaDeOportunidad";
import ConfiguracionOportunidades from "./ConfiguracionOportunidades";
import FiltrosDeLaBandeja from "./FiltrosDeLaBandeja";
import MisLicitaciones from "./MisLicitaciones";
import OferenteOportunidades from "./OferenteOportunidades";
import PanelDeOportunidad from "./PanelDeOportunidad";
import {
  contarPorSemaforo,
  FILTROS_DE_PARTIDA,
  filtrarSinSemaforo,
  type Filtros,
  separarMias,
} from "./oportunidades.utils";
import SeVieneOportunidades from "./SeVieneOportunidades";
import { useMisLicitaciones } from "./useMisLicitaciones";

// OPORTUNIDADES (doc 17, sprint 2): la bandeja de licitaciones y compras
// ágiles que el radar trae (09, 12, 15 y 18 h, y de noche; decisión 18) y la
// IA lee. Base: el mockup del 16-10. Solo administrador. Sin resumen por
// correo (Felipe, 17-10: "se revisa en Eventia").

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
            pone al día a las 9, 12, 15 y 18 h, y de noche.
          </p>
        </div>
        <EstadoDelRadar />
      </div>

      {/* Sin overflow-hidden: recortaba lo que se despliega (el filtro
          "Por revisar" con la bandeja vacía y el estado en «Mis
          licitaciones»; Felipe, 17-10). */}
      <div className="bg-white rounded-lg shadow">
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
          {pestana === "bandeja" && (
            <Bandeja
              enCurso={enCurso}
              onIrAMisLicitaciones={() => elegirPestana("mias")}
            />
          )}
          {pestana === "mias" && <MisLicitaciones />}
        </div>
      </div>
    </div>
  );
}

const ESTILO_DE_COBERTURA: Record<
  Cobertura["tono"],
  { readonly icono: LucideIcon; readonly clases: string }
> = {
  al_dia: { icono: CheckCircle2, clases: "text-green-700" },
  faltan: { icono: Hourglass, clases: "text-amber-700" },
  atrasado: { icono: AlertTriangle, clases: "text-red-600 font-semibold" },
};

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
  // Al lado de cuándo se revisó, cuándo vuelve a revisar (18-10).
  const proxima = useProximaPasada();
  // «¿Está todo?»: cuánto falta por traer y por leer (18-10).
  const cobertura = coberturaDe(corridas);
  const estiloCobertura = cobertura && ESTILO_DE_COBERTURA[cobertura.tono];

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
          : `${
              ultimaBuena
                ? `Revisado ${formatMomento(ultimaBuena.termino_en ?? ultimaBuena.empezo_en, "diaHora")}`
                : "Todavía sin revisar"
            } · próxima ${proxima}`}
      </div>
      {cobertura && estiloCobertura && (
        <div
          title="Según la última pasada buena del radar"
          className={`flex items-center justify-end gap-1 ${estiloCobertura.clases}`}
        >
          <estiloCobertura.icono size={13} className="shrink-0" />
          {cobertura.texto}
        </div>
      )}
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

/** Cómo se ve el título de cada grupo de la lista (`agruparPorCierre`). */
const ESTILO_DEL_GRUPO: Record<
  ClaveDeGrupo,
  {
    readonly icono: LucideIcon;
    readonly clases: string;
    readonly ayuda?: string;
  }
> = {
  prioridad: { icono: Star, clases: "" },
  pronto: { icono: AlarmClock, clases: "" },
  semana: {
    icono: CalendarDays,
    clases: "",
    ayuda: "Cierran en 4 a 7 días",
  },
  despues: { icono: CalendarRange, clases: "" },
  sin_cierre: { icono: HelpCircle, clases: "" },
  cerradas: { icono: Archive, clases: "" },
};

function Bandeja({
  enCurso,
  onIrAMisLicitaciones,
}: {
  readonly enCurso: number;
  readonly onIrAMisLicitaciones: () => void;
}) {
  const qc = useQueryClient();
  const proxima = useProximaPasada();
  const [filtros, setFiltrosEstado] = useState<Filtros>(() =>
    conVistaValida(leerSesion<Filtros>(CLAVE_FILTROS, FILTROS_DE_PARTIDA)),
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
  const porVista = useMemo(
    () => contarPorVista(lista, filtros),
    [lista, filtros],
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
          ? "Descartada. Queda en «Descartadas»: no se borra."
          : estado === "en_estudio"
            ? "Quedó en «Mis licitaciones» para trabajarla."
            : "Lista.",
      );
      void qc.invalidateQueries({ queryKey: ["oportunidades", "lista"] });
      void qc.invalidateQueries({ queryKey: ["oportunidades", "mias"] });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  return (
    <div className="space-y-4">
      <FiltrosDeLaBandeja
        filtros={filtros}
        onCambiar={setFiltros}
        porVista={porVista}
        porSemaforo={cuenta}
        regiones={regiones}
      />

      {isPending ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-red-600">
          No se pudo cargar la bandeja. Intenta de nuevo en un rato.
        </p>
      ) : visibles.length === 0 ? (
        <BandejaVacia
          caso={queDiceLaBandejaVacia(lista.length, filtros)}
          vista={filtros.vista}
          proxima={proxima}
          rojas={filtros.semaforos.includes("rojo") ? 0 : cuenta.rojo}
          enCurso={enCurso}
          onVerRojas={() =>
            setFiltros({ semaforos: [...filtros.semaforos, "rojo"] })
          }
          onQuitarFiltros={() =>
            setFiltros({
              tipo: FILTROS_DE_PARTIDA.tipo,
              region: FILTROS_DE_PARTIDA.region,
              busca: FILTROS_DE_PARTIDA.busca,
              semaforos: FILTROS_DE_PARTIDA.semaforos,
            })
          }
          onIrAMisLicitaciones={onIrAMisLicitaciones}
        />
      ) : (
        <div className="space-y-5">
          {agruparPorCierre(visibles).map((g) => {
            const estilo = ESTILO_DEL_GRUPO[g.clave];
            // Cada grupo en su recuadro; la prioridad, en violeta (decisión
            // 31: el amarillo es solo del semáforo).
            const colores =
              RECUADRO_DEL_GRUPO[
                g.clave === "prioridad" ? "prioridad" : "otro"
              ];
            return (
              <section
                key={g.clave}
                className={`overflow-hidden rounded-lg border bg-white ${colores.recuadro}`}
              >
                <h3
                  title={estilo.ayuda}
                  className={`flex items-center gap-1.5 px-3 py-2 border-b text-xs font-semibold uppercase tracking-wide ${colores.titulo} ${estilo.clases}`}
                >
                  <estilo.icono size={14} />
                  {g.titulo} ({g.filas.length})
                </h3>
                <ul>
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
            );
          })}
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
