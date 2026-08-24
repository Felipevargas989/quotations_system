import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import TablaDeJornadas from "../../components/personas/TablaDeJornadas";
import { RevisionAntesDeLiquidar } from "./RevisionDeNomina";
import NumberInput from "../../components/inputs/NumberInput";
import { horasTrabajadas } from "../../components/inputs";
import Estrellas from "../../components/Estrellas";
import { toast } from "../../components/toast/Toast";
import { getQuotations } from "../../services/quotations.service";
import { QuotationStatus } from "../../types/quotations.types";
import Modal from "../../components/Modal";
import {
  cerrarFicha,
  traerPlantaAlEvento,
  createPool,
  getDiaMasViejo,
  createReview,
  getPools,
  getSheets,
  getStaff,
  getStaffSemana,
  repartirPool,
  sinPropina,
  updatePool,
  updateStaff,
} from "../../services/people.service";
import type { Asignacion, EstadoFicha, Pozo } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  formatFechaEvento,
  formatISOUTCDateToString,
  hoyEnChile,
} from "../../utils/dates";

const sumarDias = (isoDia: string, n: number) =>
  new Date(new Date(`${isoDia}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

// LA FICHA DE CADA EVENTO — EL CICLO COMPLETO (etapas 4 y 5)
//
// armando → confirmado → trabajado → cerrada. El paso "trabajado" es el
// que hoy no existe en el Excel, y es la razón de que no se sepa a quién
// se le debe. Al cerrar: se reparte la propina (cuadra o no avanza — el
// candado es del backend y mira LA PLATA, no los porcentajes) y se
// evalúa a la gente (con botón de saltar).
//
// Las horas reales se ajustan en la sábana (la casilla de cada día);
// acá se VEN, se reparte y se cierra.

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

/**
 * VELOCIDAD (Felipe, 18-08: "además que es lento"). Al cambiar una hora,
 * la colación, el monto o el chip, la fila se mueve AL INSTANTE en la
 * pantalla y el servidor confirma por detrás; si falla, vuelve. Se
 * pintan las dos cachés donde viven las jornadas de liquidación: la del
 * evento abierto y la ventana de días de restaurante. Solo esas —
 * "people" a secas también guarda personas, cuyos ids chocarían.
 */
type ParcheDeStaff = { id: number; cambios: Record<string, unknown> };
const pintarStaff = (
  qc: ReturnType<typeof useQueryClient>,
  { id, cambios }: ParcheDeStaff,
) => {
  const anteriores: [readonly unknown[], unknown][] = [];
  for (const llave of [
    ["people", "staff-evento"],
    ["people", "liquidacion-ventana"],
  ] as const) {
    for (const [key, data] of qc.getQueriesData<Asignacion[]>({ queryKey: llave })) {
      if (!Array.isArray(data)) continue;
      anteriores.push([key, data]);
      qc.setQueryData<Asignacion[]>(
        key,
        data.map((a) => (a.id === id ? ({ ...a, ...cambios } as Asignacion) : a)),
      );
    }
  }
  return () => {
    for (const [key, data] of anteriores) qc.setQueryData(key, data);
  };
};
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

// Los eventos aceptados/realizados, con el MISMO queryKey para las tres
// mesas de trabajo — una sola descarga, y compartida.
//
// SOLO LOS ÚLTIMOS SEIS MESES Y EL FUTURO (17-08, "está lento"): esta
// lista existe para poner el nombre del cliente al lado de un evento en
// Liquidación, Nómina y Evaluaciones. Traía las 146 cotizaciones de la
// historia (97 de más de seis meses) y era la consulta más lenta del
// módulo. La liquidación mira una ventana de 42 días, así que un evento
// más viejo que seis meses no aparece en ninguna de estas listas.
const SEIS_MESES_ATRAS = (() => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
})();

export const eventosQueryOptions = {
  queryKey: ["people", "eventos-semana", SEIS_MESES_ATRAS] as const,
  // Cinco minutos: el catálogo de eventos no cambia a cada clic.
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const r = (await getQuotations(
      undefined,
      [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA],
      "event_date",
      "desc",
      SEIS_MESES_ATRAS,
    )) as { data?: unknown[] };
    return ((r?.data ?? r ?? []) as Record<string, unknown>[]).map((q) => ({
      id: String(q.id),
      numero: Number(q.quotation_number),
      cliente: String((q.clients as { name?: string })?.name ?? ""),
      inicio: iso(q.event_date as string),
      termino: iso(q.event_end_date as string),
    }));
  },
};

// EN LIQUIDACIÓN SOLO HAY DOS ESTADOS (Felipe, 15-08): pendiente o
// liquidado. El ciclo armando → confirmado → trabajado pertenecía a
// cuando esta pestaña acompañaba el evento desde antes; el armado vive
// en Planificación, y acá un evento del mes pasado no se está armando.


interface EventoFila {
  id: string;
  nombre: string;
  inicio: string;
  termino: string;
  estado: EstadoFicha;
}

export default function FichasTab() {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState<EventoFila | null>(null);
  const [verLiquidados, setVerLiquidados] = useState(false);
  const [diaModal, setDiaModal] = useState<number | null>(null);
  // LA TANDA SE CONGELA AL ABRIR (Felipe, 16-08). Antes el día repartido
  // desaparecía de la lista en el acto y no se podía volver con ‹ › a
  // revisar lo que uno acababa de repartir. Ahora los días con los que
  // se abrió son los del recorrido completo: se reparte, se navega, se
  // corrige, y recién al cerrar la lista se recalcula.
  const [tanda, setTanda] = useState<readonly string[]>([]);

  const hoy = hoyEnChile();
  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  // ACÁ SE REPARTE PLATA: sin caché (regla de la casa, escrita en
  // lib/queryClient.ts — "las pantallas de PLATA definirán staleTime 0;
  // ahí la frescura manda"). Con los 30 segundos por defecto, Felipe
  // agregó un garzón en Planificación y al liquidar el día no aparecía:
  // se habría repartido la propina sin él.
  const { data: sheets = [] } = useQuery({
    queryKey: ["people", "sheets"],
    queryFn: getSheets,
    staleTime: 0,
  });
  const { data: pools = [] } = useQuery({
    queryKey: ["people", "pools"],
    queryFn: getPools,
    staleTime: 0,
  });
  // La ventana del restaurante: seis semanas, PERO si quedó un día más
  // viejo sin liquidar, se abre hasta ahí. Antes se cortaba seco a los
  // 42 días y ese día desaparecía de la pantalla: no se podía repartir,
  // ni marcar sin propina, ni pagar por ningún otro camino — la jornada
  // de quien trabajó quedaba impagable (revisión del 16-08).
  const { data: masViejo } = useQuery({
    queryKey: ["people", "dia-mas-viejo"],
    queryFn: getDiaMasViejo,
    staleTime: 0,
  });
  const seisSemanas = sumarDias(hoy, -42);
  const desdeVentana =
    masViejo?.day && masViejo.day < seisSemanas ? masViejo.day : seisSemanas;
  const { data: staffVentana = [] } = useQuery({
    queryKey: ["people", "liquidacion-ventana", desdeVentana, hoy],
    queryFn: () => getStaffSemana(desdeVentana, hoy),
    staleTime: 0,
  });

  const filas: EventoFila[] = useMemo(() => {
    const porEvento = new Map(sheets.map((s) => [s.quotation_id, s.status]));
    // EL HISTORIAL ES DE LO QUE FELIPE LIQUIDA (21-08): "quería tener el
    // historial de lo que voy liquidando, pero esos 14 son anteriores a
    // esta implementación". Los cierres administrativos del arranque
    // (migración 86) no se listan. Un evento que él liquide vacío
    // mañana SÍ: es historia suya.
    const administrativas = new Set(
      sheets.filter((s) => s.cierre_administrativo).map((s) => s.quotation_id),
    );
    return (
      eventos
        // SE LIQUIDA LO QUE YA PASÓ (Felipe, 15-08): "no pago un evento
        // de diciembre en agosto". Los futuros no aparecen acá — para
        // armarlos está la Planificación.
        .filter((q) => (q.termino || q.inicio) <= hoy)
        .filter((q) => !administrativas.has(q.id))
        .map((q) => ({
          id: q.id,
          nombre: `N° ${String(q.numero)} · ${q.cliente}`,
          inicio: q.inicio,
          termino: q.termino || q.inicio,
          estado: porEvento.get(q.id) ?? ("armando" as EstadoFicha),
        }))
        // El más viejo primero: es el que más urge liquidar.
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
    );
  }, [eventos, sheets, hoy]);

  /** De los días que siguen en la mesa, cuáles ya están repartidos y
   *  solo esperan la nómina: se pintan verdes para no confundirlos con
   *  los que aún no se tocan. */
  const diasRepartidos = useMemo(
    () =>
      new Set(
        pools
          .filter((p) => p.day && p.distributed_at)
          .map((p) => String(p.day).slice(0, 10)),
      ),
    [pools],
  );

  const pendientes = filas.filter((f) => f.estado !== "cerrada");
  const liquidados = filas.filter((f) => f.estado === "cerrada");

  // Los días de restaurante que siguen en la mesa. UN DÍA SE VA CUANDO
  // LLEGA A LA NÓMINA, NO CUANDO SE REPARTE (Felipe, 16-08): entre las
  // dos cosas hay un rato en que uno revisa y corrige, y si el día
  // desapareciera al repartirlo no habría dónde volver a mirarlo.
  //
  // Entonces sale de la lista si: su propina ya se fue a una nómina, o
  // el día se marcó sin propina (pozo en cero: no hay nada que mandar).
  const diasPendientes = useMemo(() => {
    const resueltos = new Map<string, boolean>();
    for (const p of pools) {
      if (!p.day || !p.distributed_at) continue;
      const pozo = Number(p.first_amount) + Number(p.second_amount);
      resueltos.set(String(p.day).slice(0, 10), pozo <= 0);
    }
    // Lo repartido que todavía NO fue a nómina mantiene vivo su día.
    const esperandoNomina = new Set<string>();
    for (const a of staffVentana) {
      if (a.quotation_id !== null) continue;
      if (Number(a.tip_amount ?? 0) > 0 && a.tip_payroll_id === null) {
        esperandoNomina.add(String(a.day).slice(0, 10));
      }
    }
    const dias = new Set<string>();
    for (const a of staffVentana) {
      if (a.quotation_id !== null) continue;
      const d = String(a.day).slice(0, 10);
      const sinPropinaEseDia = resueltos.get(d);
      const listo =
        sinPropinaEseDia === true || // día marcado sin propina
        (resueltos.has(d) && !esperandoNomina.has(d)); // repartido y pagado
      if (d <= hoy && !listo) dias.add(d);
    }
    return [...dias].sort();
  }, [staffVentana, pools, hoy]);

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["people", "pools"] });
    void qc.invalidateQueries({ queryKey: ["people", "liquidacion-ventana"] });
  };

  if (abierta) {
    return (
      <FichaAbierta
        evento={filas.find((f) => f.id === abierta.id) ?? abierta}
        onVolver={() => setAbierta(null)}
        onCambio={() =>
          qc.invalidateQueries({ queryKey: ["people", "sheets"] })
        }
      />
    );
  }

  const FilaEvento = ({ f }: { readonly f: EventoFila }) => (
    <li key={f.id}>
      <button
        type="button"
        onClick={() => setAbierta(f)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">{f.nombre}</div>
          <div className="text-xs text-gray-500">
            {formatISOUTCDateToString(f.inicio)}
            {f.termino !== f.inicio &&
              ` — ${formatISOUTCDateToString(f.termino)}`}
          </div>
        </div>
        <ChipEstado estado={f.estado} />
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      {/* ---------- Los días de restaurante ---------- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">
              Días de restaurante
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Día por día: quiénes trabajaron, cuánta propina hubo y cómo
              se reparte. En verde, los que ya repartiste y esperan la
              nómina.
            </p>
          </div>
          {diasPendientes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTanda(diasPendientes);
                setDiaModal(0);
              }}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Repasar {diasPendientes.length}{" "}
              {diasPendientes.length === 1 ? "día" : "días"}
            </button>
          )}
        </div>
        {diasPendientes.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 py-4">
            Al día: no hay días de restaurante pendientes.
          </p>
        ) : (
          <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
            {diasPendientes.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setTanda(diasPendientes);
                  setDiaModal(i);
                }}
                title={
                  diasRepartidos.has(d)
                    ? "Repartido: esperando la nómina"
                    : "Sin repartir"
                }
                className={`px-2 py-1 text-xs tabular-nums border rounded-md ${
                  diasRepartidos.has(d)
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                }`}
              >
                {formatISOUTCDateToString(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Los eventos que ya pasaron ---------- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Eventos por liquidar</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Solo los que ya pasaron. Adentro: se confirman horas y
            asistencia, se ingresa la propina, se reparte y se liquida —
            de ahí queda lista para la nómina.
          </p>
        </div>
        {pendientes.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Nada pendiente: todos los eventos pasados están liquidados.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pendientes.map((f) => (
              <FilaEvento key={f.id} f={f} />
            ))}
          </ul>
        )}
        {liquidados.length > 0 && (
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setVerLiquidados(!verLiquidados)}
              className="w-full px-4 py-2 text-left text-xs text-gray-500 hover:bg-gray-50"
            >
              {verLiquidados ? "▾" : "▸"} {liquidados.length} ya{" "}
              {liquidados.length === 1 ? "liquidado" : "liquidados"}
            </button>
            {verLiquidados && (
              <ul className="divide-y divide-gray-100">
                {liquidados.map((f) => (
                  <FilaEvento key={f.id} f={f} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {diaModal !== null && tanda[diaModal] && (
        <DiaRestaurante
          dias={tanda}
          indice={diaModal}
          staff={staffVentana}
          pools={pools}
          onIr={(i) => setDiaModal(i)}
          onCambio={refrescar}
          onCerrar={() => setDiaModal(null)}
        />
      )}
    </div>
  );
}

function ChipEstado({ estado }: { readonly estado: EstadoFicha }) {
  const liquidado = estado === "cerrada";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        liquidado ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-700"
      }`}
    >
      {liquidado && <Lock className="w-3 h-3 inline mr-1 -mt-0.5" />}
      {liquidado ? "Liquidado" : "Por liquidar"}
    </span>
  );
}

function FichaAbierta({
  evento,
  onVolver,
  onCambio,
}: {
  readonly evento: EventoFila;
  readonly onVolver: () => void;
  readonly onCambio: () => void;
}) {
  const qc = useQueryClient();
  const [evaluando, setEvaluando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const cerrada = evento.estado === "cerrada";

  // LA PLANTA DE ESOS DÍAS ENTRA AL EVENTO (Felipe, 18-08): "como en
  // el restaurante: aparecen todos y yo marco sin propina". Al abrir la
  // ficha —mientras está abierta— se le pide al backend que traiga a la
  // planta con turno esos días; no duplica a nadie, así que abrirla dos
  // veces no hace nada. Una ficha cerrada no se toca.
  const { data: todasLasFilas = [] } = useQuery({
    queryKey: ["people", "staff-evento", evento.id],
    queryFn: async () => {
      if (!cerrada) await traerPlantaAlEvento(evento.id);
      return getStaff(evento.id);
    },
    staleTime: 0,
  });
  // La liquidación es de GENTE: una silla vacía (cupo sin nombre,
  // migración 84) no vino, no cobra y no reparte. Al cerrar la ficha el
  // backend las retira y el costo converge a lo real.
  const staff = useMemo(
    () => todasLasFilas.filter((a) => a.person_id != null),
    [todasLasFilas],
  );
  const sillasSinNombre = todasLasFilas.length - staff.length;
  const { data: pools = [] } = useQuery({
    queryKey: ["people", "pools"],
    queryFn: getPools,
  });
  const pozo = pools.find((p) => p.quotation_id === evento.id) ?? null;

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["people", "pools"] });
    qc.invalidateQueries({ queryKey: ["people", "staff-evento", evento.id] });
    onCambio();
  };

  const cambiarStaff = useMutation({
    mutationFn: (v: { id: number; cambios: Parameters<typeof updateStaff>[1] }) =>
      updateStaff(v.id, v.cambios),
    // Optimista: se pinta ya, se confirma detrás, se deshace si falla.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["people", "staff-evento", evento.id] });
      return pintarStaff(qc, v as ParcheDeStaff);
    },
    onError: (e: unknown, _v, deshacer) => {
      deshacer?.();
      toast.error(humanizeApiError(e));
    },
    onSettled: refrescar,
  });
  // Por día, para leer la ficha como se vivió.
  const dias = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const a of staff) {
      const d = iso(a.day);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(a);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [staff]);

  const jornadas = staff.reduce((t, a) => t + Number(a.amount ?? 0), 0);
  const propinas = staff.reduce((t, a) => t + Number(a.tip_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onVolver}
          className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          aria-label="Volver a las fichas"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">{evento.nombre}</h2>
          <div className="text-xs text-gray-500">
            {formatISOUTCDateToString(evento.inicio)}
            {evento.termino !== evento.inicio &&
              ` — ${formatISOUTCDateToString(evento.termino)}`}
          </div>
        </div>
        <ChipEstado estado={evento.estado} />
      </div>

      {/* Los días y la gente. Las horas se AJUSTAN en la sábana (la
          casilla del día); acá se leen. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {sillasSinNombre > 0 && !cerrada && (
          <p className="text-xs text-amber-700 mb-2">
            {sillasSinNombre === 1
              ? "Queda 1 cupo planificado sin nombre: al cerrar se retira"
              : `Quedan ${sillasSinNombre} cupos planificados sin nombre: al cerrar se retiran`}{" "}
            y el costo queda en lo real.
          </p>
        )}
        {dias.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            Nadie vino a este evento — los nombres se ponen en
            Planificación.
          </p>
        ) : (
          <>
            <TablaDeJornadas
              titulo="Quiénes vinieron"
              secciones={dias.map(([d, gente]) => ({
                titulo: dias.length > 1 ? formatISOUTCDateToString(d) : undefined,
                filas: gente,
              }))}
              cerrada={cerrada}
              onCambiar={(id, cambios) => cambiarStaff.mutate({ id, cambios })}
            />
            {/* Los totales al pie, donde se suman. */}
            <p className="mt-2 text-right text-sm text-gray-500">
              Jornadas: <strong className="text-gray-900">{clp(jornadas)}</strong>
              {propinas > 0 && (
                <>
                  {" "}
                  · Propinas repartidas:{" "}
                  <strong className="text-gray-900">{clp(propinas)}</strong>
                </>
              )}
            </p>
          </>
        )}

      </div>

      <Reparto
        evento={evento}
        pozo={pozo}
        staff={staff}
        cerrada={cerrada}
        onRefrescar={refrescar}
      />

      {/* El cierre: PRIMERO la revisión (la tabla de Nómina, con lo que
          quedaría por pagar — Felipe, 18-08), y si aprueba, la evaluación
          de la gente y el candado. */}
      {!cerrada && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setRevisando(true)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Liquidar este evento…
          </button>
        </div>
      )}

      {revisando && (
        <RevisionAntesDeLiquidar
          quotationId={evento.id}
          nombreEvento={evento.nombre}
          onVolver={() => setRevisando(false)}
          onAprobar={() => {
            setRevisando(false);
            setEvaluando(true);
          }}
        />
      )}

      {evaluando && (
        <EvaluacionesModal
          evento={evento}
          staff={staff}
          onCerrado={() => {
            setEvaluando(false);
            refrescar();
          }}
          onCancelar={() => setEvaluando(false)}
        />
      )}
    </div>
  );
}

/** El pozo y el reparto por puntos: el % de cada cargo es el valor de
 *  su hora (Felipe, 21-08). */
function Reparto({
  evento,
  pozo,
  staff,
  cerrada,
  onRefrescar,
}: {
  readonly evento: EventoFila;
  readonly pozo: Pozo | null;
  readonly staff: Asignacion[];
  readonly cerrada: boolean;
  readonly onRefrescar: () => void;
}) {
  // Los cargos que estuvieron: TODOS aparecen y preguntan (regla de la
  // casa — la cajera recibe en 82% de sus días y no era una "bolsa").
  // Los cargos que estuvieron. Si a TODA la gente de un cargo se le
  // marcó "sin propina", ese cargo no aparece: no hay a quién repartir.
  const cargos = useMemo(() => {
    const m = new Map<number | null, string>();
    for (const a of staff) {
      if (a.no_tip) continue;
      m.set(a.role_id ?? null, a.management_resources?.name ?? "Sin cargo");
    }
    return [...m.entries()];
  }, [staff]);

  // LOS PORCENTAJES YA REPARTIDOS SE LEEN DE VUELTA (Felipe, 15-08:
  // repartió 90/10 y los vio en cero). Desde el reparto por puntos
  // (21-08) vienen guardados en el pozo tal como se escribieron; para
  // los repartos anteriores a eso se deducen de lo que cada cargo se
  // llevó, como antes.
  const yaRepartidos = useMemo(() => {
    if (pozo?.porcentajes?.length) {
      return new Map<number | null, number>(
        pozo.porcentajes.map((p) => [p.role_id ?? null, p.pct]),
      );
    }
    const total = staff.reduce((t, a) => t + Number(a.tip_amount ?? 0), 0);
    if (total <= 0) return new Map<number | null, number>();
    const porCargo = new Map<number | null, number>();
    for (const a of staff) {
      const monto = Number(a.tip_amount ?? 0);
      if (monto <= 0) continue;
      const k = a.role_id ?? null;
      porCargo.set(k, (porCargo.get(k) ?? 0) + monto);
    }
    const m = new Map<number | null, number>();
    for (const [k, v] of porCargo) {
      m.set(k, Math.round((v / total) * 1000) / 10);
    }
    return m;
  }, [staff, pozo]);

  const [sinPropinaCargo, setSinPropinaCargo] = useState<Set<number | null>>(
    new Set(),
  );
  const [pcts, setPcts] = useState<Map<number | null, number>>(new Map());
  // Al abrir una ficha ya repartida, se parte de sus porcentajes.
  const [semilla, setSemilla] = useState(0);
  if (semilla === 0 && yaRepartidos.size > 0 && pcts.size === 0) {
    setSemilla(1);
    setPcts(yaRepartidos);
  }
  // UN SOLO CARGO SE LLEVA EL 100% SOLO (Felipe, 15-08). Si no hay
  // entre quiénes repartir, escribir "100" a mano era puro trámite: se
  // fija y la caja se bloquea. Vive en el getter y no en un estado, así
  // que al marcar "sin propina" a un cargo y quedar uno, se acomoda al
  // toque — y lo que se guarda sale del mismo getter.
  const activos = cargos.filter(([id]) => !sinPropinaCargo.has(id));
  const unico = activos.length === 1 ? activos[0][0] : undefined;
  const soloUno = activos.length === 1;
  const pct = (id: number | null) =>
    soloUno ? (id === unico ? 100 : 0) : (pcts.get(id) ?? 0);
  const total = cargos.reduce((t, [id]) => t + pct(id), 0);
  const monto = pozo
    ? Number(pozo.first_amount) + Number(pozo.second_amount)
    : 0;

  // LO QUE SE LLEVA CADA CARGO SALE DE SUS HORAS (21-08). El % es el
  // valor de la hora del cargo, no su tajada: cada jornada junta
  // horas × %, y la plata se reparte entre los puntos de todos. Gemelo
  // del cálculo del backend (9 h si una jornada no tiene horario).
  const puntosPorCargo = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const a of staff) {
      if (a.no_tip || a.person_id == null) continue;
      const k = a.role_id ?? null;
      const horas =
        horasTrabajadas(a.starts_at, a.ends_at, a.break_minutes) ?? 9;
      m.set(k, (m.get(k) ?? 0) + horas);
    }
    return m;
  }, [staff]);
  const totalPuntos = cargos.reduce(
    (t, [id]) => t + (puntosPorCargo.get(id) ?? 0) * pct(id),
    0,
  );
  const plataDe = (id: number | null) =>
    totalPuntos > 0
      ? (monto * (puntosPorCargo.get(id) ?? 0) * pct(id)) / totalPuntos
      : 0;

  // CADA CAJA ES DE QUIEN LA ESCRIBE (Felipe, 17-08). Antes, al cambiar
  // un porcentaje los demás se recalculaban solos "para que sumara 100";
  // pareció listo y resultó lo contrario — uno escribe 40 y ve moverse
  // los otros tres. Ahora no se toca nada: se escriben los que sean y
  // el botón se abre cuando la suma llega a 100, igual que en el modal
  // del día de restaurante. Una sola regla en las dos pantallas.
  const cambiar = (id: number | null, nuevo: number) =>
    setPcts(new Map(pcts).set(id, nuevo));

  const guardarPozo = useMutation({
    mutationFn: (cambios: { first_amount?: number; second_amount?: number }) =>
      pozo
        ? updatePool(pozo.id, cambios)
        : createPool({ quotation_id: evento.id, ...cambios }),
    onSuccess: onRefrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const repartir = useMutation({
    mutationFn: () =>
      repartirPool(
        pozo!.id,
        cargos.map(([role_id]) => ({ role_id, pct: pct(role_id) })),
      ),
    onSuccess: (r) => {
      toast.success(
        `${clp(r.repartido)} repartidos entre ${String(r.filas)} jornadas, al peso.`,
      );
      onRefrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="font-medium text-gray-900">La propina</h3>

      {/* UNA SOLA CAJA (Felipe, 15-08). El Excel anotaba el pozo en
          "primera" y "segunda entrega" porque a veces llega en dos
          veces; acá se suma en el mismo campo cuando llega el resto —
          lo que importa para repartir es el total. */}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-sm text-gray-600">
          Propina del evento
          <div className="relative w-40 mt-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
              $
            </span>
            <NumberInput
              // AL SALIR DEL CAMPO, NO EN CADA TECLA (Felipe, 15-08:
              // "ingresé 100.000" y quedó en 100). Guardando por tecla
              // se grababa 1, 10, 100… y el refresco del servidor
              // devolvía el valor a medio escribir, pisando el resto.
              value={pozo ? Number(pozo.first_amount) : undefined}
              onCommit={(v) => guardarPozo.mutate({ first_amount: v ?? 0 })}
              disabled={cerrada}
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg pl-5 pr-2 py-1.5 text-sm text-right"
            />
          </div>
        </label>
        {pozo?.distributed_at && (
          <span className="text-emerald-700 text-xs pb-2">
            <Check className="w-3.5 h-3.5 inline -mt-0.5" /> repartida
          </span>
        )}
      </div>

      {monto > 0 && !cerrada && (
        <>
          {/* EN COLUMNAS (Felipe, 16-08): el check colgaba del nombre del
              cargo, así que se corría con cada largo. La grilla nace del
              cargo más ancho — sirve para "Personal de aseo" igual que
              para "Cajera" — y dentro de cada fila las celdas entran a
              la grilla del contenedor con "contents". */}
          <div className="grid grid-cols-[minmax(0,max-content)_max-content_1fr_auto_auto] items-center gap-x-3 gap-y-1.5">
            {cargos.map(([id, nombre]) => {
              // SIN PROPINA PARA ESTE CARGO: la caja se bloquea en cero
              // y el 100% se reparte entre los demás (Felipe, 15-08).
              const fuera = sinPropinaCargo.has(id);
              return (
                <div key={id ?? 0} className="contents text-sm">
                  <span
                    className={`text-sm ${fuera ? "text-gray-400" : "text-gray-900"}`}
                  >
                    {nombre}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={fuera}
                      onChange={() => {
                        const s2 = new Set(sinPropinaCargo);
                        if (fuera) s2.delete(id);
                        else {
                          s2.add(id);
                          setPcts(new Map(pcts).set(id, 0));
                        }
                        setSinPropinaCargo(s2);
                      }}
                      className="rounded border-gray-300"
                    />
                    sin propina
                  </label>
                  {/* El ancho va en el CONTENEDOR: el campo numérico se
                      estira a lo que le den, y ponerle w-20 a él no
                      hacía nada (mismo tropiezo que con el monto). */}
                  <div
                    className="w-20 justify-self-end"
                    title={soloUno ? "Es el único cargo: se lleva todo" : undefined}
                  >
                    <NumberInput
                      value={pct(id) || undefined}
                      onChange={(v) => cambiar(id, v ?? 0)}
                      disabled={fuera || soloUno}
                      placeholder="0"
                      aria-label={`Porcentaje de ${nombre}`}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-right disabled:bg-gray-100"
                    />
                  </div>
                  <span className="text-sm text-gray-400">%</span>
                  <span
                    className="w-28 text-right tabular-nums text-sm text-gray-600"
                    title={`${(puntosPorCargo.get(id) ?? 0).toLocaleString("es-CL")} h de ${nombre}`}
                  >
                    {clp(plataDe(id))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* QUÉ SIGNIFICA EL % (Felipe, 21-08: "la distribuí igual
              entre cocina y garzones y no entiendo la diferencia"). */}
          <p className="text-xs text-gray-500">
            El % es el valor de la hora de cada cargo: mismas horas y
            mismo cargo, misma propina. Lo que se lleva cada cargo sale de
            sus horas.
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span
              className={`text-sm ${
                Math.abs(total - 100) < 0.001
                  ? "text-emerald-700"
                  : "text-amber-700"
              }`}
            >
              {Math.abs(total - 100) < 0.001
                ? `Cuadra: ${clp(monto)} completos al equipo.`
                : `Los porcentajes suman ${total.toLocaleString("es-CL")}% — el botón se abre en 100.`}
            </span>
            <button
              type="button"
              onClick={() => repartir.mutate()}
              disabled={
                !pozo || Math.abs(total - 100) > 0.001 || repartir.isPending
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {pozo?.distributed_at ? "Volver a repartir" : "Repartir"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Al cerrar: una evaluación por persona por evento, con saltar. */
function EvaluacionesModal({
  evento,
  staff,
  onCerrado,
  onCancelar,
}: {
  readonly evento: EventoFila;
  readonly staff: Asignacion[];
  readonly onCerrado: () => void;
  readonly onCancelar: () => void;
}) {
  const personas = useMemo(() => {
    const m = new Map<number, string>();
    // Solo gente con nombre: una silla vacía no se evalúa.
    for (const a of staff)
      if (a.person_id != null) m.set(a.person_id, a.people?.name ?? "—");
    return [...m.entries()];
  }, [staff]);

  const [notas, setNotas] = useState<Map<number, { stars: number | null; note: string }>>(
    new Map(),
  );
  const de = (id: number) => notas.get(id) ?? { stars: null, note: "" };
  const poner = (id: number, cambio: Partial<{ stars: number | null; note: string }>) =>
    setNotas((m) => new Map(m).set(id, { ...de(id), ...cambio }));

  const cerrar = useMutation({
    mutationFn: async () => {
      for (const [personId] of personas) {
        const e = de(personId);
        if (e.stars || e.note.trim()) {
          await createReview({
            person_id: personId,
            quotation_id: evento.id,
            stars: e.stars,
            note: e.note.trim() || null,
          });
        }
      }
      return cerrarFicha(evento.id);
    },
    onSuccess: () => {
      toast.success("Ficha cerrada: lista para la nómina.");
      onCerrado();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // La pieza de la casa (18-08): con muchas personas la lista crecía más
  // que la pantalla y este modal a mano perdía la cabecera. Modal ancla
  // arriba, tapa la altura y deja título y pie siempre a la vista.
  return (
    <Modal
      titulo="¿Qué tal trabajó el equipo?"
      subtitulo="Una evaluación por persona. Saltar está bien: sin evaluar no es lo mismo que malo. La nota puede ir sin tocar la estrella."
      ancho="max-w-lg"
      onCerrar={onCancelar}
      pie={
        <>
          <button
            type="button"
            onClick={onCancelar}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Todavía no
          </button>
          <button
            type="button"
            onClick={() => cerrar.mutate()}
            disabled={cerrar.isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {cerrar.isPending ? "Cerrando…" : "Guardar y cerrar la ficha"}
          </button>
        </>
      }
    >
        <ul className="divide-y divide-gray-100">
          {personas.map(([id, nombre]) => (
            <li key={id} className="py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">{nombre}</span>
                <Estrellas
                  value={de(id).stars}
                  onChange={(n) =>
                    poner(id, { stars: de(id).stars === n ? null : n })
                  }
                />
              </div>
              <input
                type="text"
                value={de(id).note}
                onChange={(e) => poner(id, { note: e.target.value })}
                placeholder='Nota sin bajar estrellas: "solo fines de semana", "no maneja"…'
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </li>
          ))}
        </ul>
    </Modal>
  );
}

/**
 * LA LIQUIDACIÓN DIARIA DEL RESTAURANTE (Felipe, 15-08): "se debe
 * cargar diario, porque se reparte diario según quiénes tocaron
 * propina ese día".
 *
 * El modal muestra quiénes trabajaron, pide el monto del pozo y el %
 * por cargo de los que estuvieron — sin plantillas: los porcentajes se
 * escriben según el día. Reparte por puntos (el % es el valor de la
 * hora del cargo, 21-08) y pasa solo al día siguiente.
 * Un día flojo se marca "sin propina" y también queda liquidado.
 */
function DiaRestaurante({
  dias,
  indice,
  staff,
  pools,
  onIr,
  onCambio,
  onCerrar,
}: {
  readonly dias: readonly string[];
  readonly indice: number;
  readonly staff: readonly Asignacion[];
  readonly pools: readonly Pozo[];
  readonly onIr: (indice: number) => void;
  readonly onCambio: () => void;
  readonly onCerrar: () => void;
}) {
  const dia = dias[indice];
  const [monto, setMonto] = useState<number | undefined>(undefined);
  const [pcts, setPcts] = useState<Map<number, number>>(new Map());
  const [sinCargo, setSinCargo] = useState<Set<number>>(new Set());

  // LAS HORAS SE CONFIRMAN ACÁ TAMBIÉN (Felipe, 16-08). El día del
  // restaurante tenía la lista de solo lectura, pero es la misma
  // necesidad que en el evento: la gente entra y sale a horas distintas
  // de las planificadas, y el reparto se calcula POR HORAS.
  const qc = useQueryClient();
  const cambiarStaff = useMutation({
    mutationFn: ({ id, cambios }: ParcheDeStaff) => updateStaff(id, cambios),
    // Optimista: se pinta ya, se confirma detrás, se deshace si falla.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["people", "liquidacion-ventana"] });
      return pintarStaff(qc, v);
    },
    onError: (e: unknown, _v, deshacer) => {
      deshacer?.();
      toast.error(humanizeApiError(e));
    },
    onSettled: onCambio,
  });


  const delDia = useMemo(
    () =>
      staff.filter(
        (a) =>
          a.quotation_id === null &&
          String(a.day).slice(0, 10) === dia &&
          // La fila solo-de-propina no se edita acá: es el reflejo de
          // un invitado del evento; abajo vive su checkbox.
          !a.solo_propina,
      ),
    [staff, dia],
  );

  // LOS INVITADOS DEL EVENTO (Felipe, 24-08): "un garzón que viene a un
  // evento, si llegan un par de mesas, puede atenderlas — son dos
  // propinas distintas". Se ofrecen aparte, desmarcados; el marcado
  // entra al pozo del día con su mismo horario del evento.
  const delEvento = useMemo(
    () =>
      staff.filter(
        (a) =>
          a.quotation_id !== null &&
          a.person_id != null &&
          String(a.day).slice(0, 10) === dia,
      ),
    [staff, dia],
  );
  const [invitados, setInvitados] = useState<Set<number>>(new Set());
  // Al entrar a un día, los ya incluidos (su fila solo-de-propina
  // existe) parten marcados.
  useEffect(() => {
    const yaIncluidos = new Set(
      staff
        .filter(
          (a) =>
            a.solo_propina &&
            a.person_id != null &&
            String(a.day).slice(0, 10) === dia,
        )
        .map((a) => a.person_id),
    );
    setInvitados(
      new Set(
        staff
          .filter(
            (a) =>
              a.quotation_id !== null &&
              a.person_id != null &&
              String(a.day).slice(0, 10) === dia &&
              yaIncluidos.has(a.person_id),
          )
          .map((a) => a.id),
      ),
    );
  }, [staff, dia]);
  const invitadosFilas = useMemo(
    () =>
      delEvento
        .filter((a) => invitados.has(a.id))
        // El "sin propina" de su fila del EVENTO habla del pozo del
        // evento; acá está invitado al del día, así que no lo excluye.
        .map((a) => ({ ...a, no_tip: false })),
    [delEvento, invitados],
  );
  // Lo que cada invitado ya recibió del pozo del DÍA (vive en su fila
  // solo-de-propina; la de su evento carga la propina del evento).
  const propinaDelDia = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of staff) {
      if (
        a.solo_propina &&
        a.person_id != null &&
        String(a.day).slice(0, 10) === dia &&
        a.tip_amount != null
      ) {
        m.set(a.person_id, Number(a.tip_amount));
      }
    }
    return m;
  }, [staff, dia]);

  // Si a toda la gente de un cargo se le marcó "sin propina", ese cargo
  // no aparece: no hay a quién repartirle.
  const cargos = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of [...delDia, ...invitadosFilas]) {
      if (a.no_tip) continue;
      m.set(a.role_id ?? 0, a.management_resources?.name ?? "Sin cargo");
    }
    return [...m.entries()];
  }, [delDia, invitadosFilas]);

  // LAS HORAS DE CADA CARGO, para mostrar lo que se lleva: el % es el
  // valor de la hora, no la tajada (21-08). Gemelo del backend.
  const horasPorCargo = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of [...delDia, ...invitadosFilas]) {
      if (a.no_tip || a.person_id == null) continue;
      const k = a.role_id ?? 0;
      const horas =
        horasTrabajadas(a.starts_at, a.ends_at, a.break_minutes) ?? 9;
      m.set(k, (m.get(k) ?? 0) + horas);
    }
    return m;
  }, [delDia, invitadosFilas]);

  // UN SOLO CARGO SE LLEVA EL 100% SOLO (Felipe, 15-08). Si no hay
  // entre quiénes repartir, escribir "100" a mano era puro trámite: se
  // fija y la caja se bloquea. Vive en el getter y no en un estado, así
  // que al marcar "sin propina" a un cargo y quedar uno, se acomoda al
  // toque — y lo que se guarda sale del mismo getter.
  const activos = cargos.filter(([id]) => !sinCargo.has(id));
  const soloUno = activos.length === 1;
  const unico = soloUno ? activos[0][0] : undefined;
  const pct = (id: number) =>
    soloUno ? (id === unico ? 100 : 0) : (pcts.get(id) ?? 0);
  const total = cargos.reduce((t, [id]) => t + pct(id), 0);
  const totalPuntos = cargos.reduce(
    (t, [id]) => t + (horasPorCargo.get(id) ?? 0) * pct(id),
    0,
  );
  const cuadra = Math.abs(total - 100) < 0.001;

  const pozoDia = useMemo(
    () => pools.find((p) => p.day && String(p.day).slice(0, 10) === dia) ?? null,
    [pools, dia],
  );
  const yaRepartido = !!pozoDia?.distributed_at;

  /** Lo que se le dio a cada cargo ese día, leído de vuelta de la plata
   *  repartida: al volver con ‹ › uno ve lo que dejó, no un formulario
   *  en blanco (Felipe, 16-08 — "navegar viendo y validando"). */
  const repartoGuardado = useMemo(() => {
    const total = delDia.reduce((t, a) => t + Number(a.tip_amount ?? 0), 0);
    const m = new Map<number, number>();
    if (total <= 0) return m;
    const porCargo = new Map<number, number>();
    for (const a of delDia) {
      const plata = Number(a.tip_amount ?? 0);
      if (plata <= 0) continue;
      const k = a.role_id ?? 0;
      porCargo.set(k, (porCargo.get(k) ?? 0) + plata);
    }
    for (const [k, v] of porCargo) m.set(k, Math.round((v / total) * 1000) / 10);
    return m;
  }, [delDia]);

  // Al cambiar de día no se arrastra nada del anterior: se recupera lo
  // de ESE día. Si ya estaba repartido aparece su pozo y su reparto; si
  // no, el formulario parte limpio.
  const [diaAnterior, setDiaAnterior] = useState<string | null>(null);
  if (dia !== diaAnterior) {
    setDiaAnterior(dia);
    const guardado = pozoDia
      ? Number(pozoDia.first_amount) + Number(pozoDia.second_amount)
      : 0;
    setMonto(guardado > 0 ? guardado : undefined);
    setPcts(repartoGuardado);
    setSinCargo(new Set());
  }

  const avanzar = () => {
    if (indice + 1 < dias.length) onIr(indice + 1);
    else onCerrar();
  };

  // El pozo del día, esté repartido o no: para volver a mirarlo hay que
  // encontrarlo. Antes se buscaba solo el sin repartir, así que un día
  // ya repartido abría en blanco y corregirlo creaba un pozo nuevo.
  const poolDelDia = () =>
    pools.find((p) => p.day && String(p.day).slice(0, 10) === dia) ?? null;

  const liquidar = useMutation({
    mutationFn: async () => {
      const existente = poolDelDia();
      const pozo = existente
        ? await updatePool(existente.id, { first_amount: monto ?? 0 })
        : await createPool({ day: dia, first_amount: monto ?? 0 });
      await repartirPool(
        pozo.id,
        cargos.map(([role_id]) => ({
          role_id: role_id === 0 ? null : role_id,
          pct: pct(role_id),
        })),
        [...invitados],
      );
      return pozo;
    },
    onSuccess: () => {
      // REPARTIR NO AVANZA (Felipe, 16-08): "para poder ver cuánto le
      // queda a cada persona". Se reparte, se mira la plata en la lista
      // de arriba, y al día siguiente se pasa con ‹ › cuando uno quiere.
      toast.success(`${formatISOUTCDateToString(dia)}: propina repartida.`);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  /** Los días de esta tanda que ya quedaron repartidos: exactamente lo
   *  que el botón negro manda a la nómina — esos días y nada más
   *  (Felipe, 16-08). Los eventos se liquidan por su cuenta. */
  const diasRepartidosDeLaTanda = dias.filter((d) =>
    pools.some(
      (p) => p.day && String(p.day).slice(0, 10) === d && p.distributed_at,
    ),
  );
  const repartidosDeLaTanda = diasRepartidosDeLaTanda.length;

  // EL DÍA NO CREA NÓMINAS (Felipe, 16-08: "mandé unos días a
  // liquidación y pasó directo a nómina de pago"). Repartir deja el día
  // liquidado y con eso aparece solo en "Liquidaciones por pagar", que
  // es donde se elige qué se paga y se revisan los datos del banco
  // antes de subir. Este botón se saltaba esa revisión entera.
  const sinPropinaHoy = useMutation({
    mutationFn: async () => {
      const existente = poolDelDia();
      const pozo =
        existente ?? (await createPool({ day: dia, first_amount: 0 }));
      if (existente && Number(existente.first_amount) > 0) {
        await updatePool(existente.id, { first_amount: 0 });
      }
      return sinPropina(pozo.id);
    },
    onSuccess: () => {
      toast.success(`${formatISOUTCDateToString(dia)}: sin propina, listo.`);
      onCambio();
      avanzar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const ocupado = liquidar.isPending || sinPropinaHoy.isPending;

  return (
    <Modal
      // La fecha al centro y grande: es lo que uno mira para saber
      // dónde está parado (Felipe, 15-08).
      titulo={
        <span className="flex items-center justify-center gap-4 w-full">
          {/* Compensa el ancho del ✕ del otro extremo, para que la
              fecha quede al centro del modal y no corrida. */}
          <span className="w-7 shrink-0" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onIr(indice - 1)}
            disabled={indice === 0}
            aria-label="Día anterior"
            className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg disabled:opacity-25"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-xl font-bold tabular-nums">
            {formatISOUTCDateToString(dia)}
          </span>
          <button
            type="button"
            onClick={() => onIr(indice + 1)}
            disabled={indice + 1 >= dias.length}
            aria-label="Día siguiente"
            className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg disabled:opacity-25"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </span>
      }
      subtitulo={
        // El mismo hueco de ✕ que compensa la fecha, para que las tres
        // líneas queden en el mismo eje (Felipe, 16-08). Sin él, el
        // subtítulo se centraba contra un ancho distinto que el título
        // y se veía corrido.
        <span className="flex justify-center">
          <span className="w-7 shrink-0" aria-hidden="true" />
          <span className="flex flex-col items-center">
            <span className="text-gray-600">
              {formatFechaEvento(dia, "diaYMes")}
            </span>
            <span>
              Día {indice + 1} de {dias.length}
              {repartidosDeLaTanda > 0 && (
                <span className="text-emerald-700">
                  {" "}
                  · {repartidosDeLaTanda} repartido
                  {repartidosDeLaTanda === 1 ? "" : "s"}
                </span>
              )}
            </span>
          </span>
        </span>
      }
      // Con los relojes adentro la fila tiene seis columnas: en 2xl los
      // nombres se partían en dos líneas (Felipe, 16-08).
      ancho="max-w-5xl"
      onCerrar={onCerrar}
      pie={
        <>
          {/* DÓNDE SIGUE (Felipe, 16-08: "quizás está bien y no entiendo
              el proceso"). El modal dejó de crear nóminas y sin decir a
              dónde va lo repartido, el paso siguiente queda invisible. */}
          <span className="mr-auto text-xs text-gray-500">
            Lo repartido espera en Nómina → Liquidaciones por pagar.
          </span>
          <button
            type="button"
            onClick={() => sinPropinaHoy.mutate()}
            disabled={ocupado}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            Sin propina este día
          </button>
          <button
            type="button"
            onClick={() => liquidar.mutate()}
            disabled={ocupado || !monto || !cuadra}
            title={
              !monto
                ? "Ponle el monto del pozo"
                : !cuadra
                  ? `Los porcentajes suman ${total.toLocaleString("es-CL")}%`
                  : undefined
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
          >
            {liquidar.isPending
              ? "Repartiendo…"
              : yaRepartido
                ? "Volver a repartir"
                : "Repartir"}
          </button>
          {/* Lo repartido queda esperando en "Liquidaciones por pagar":
              acá no se crea ninguna nómina. */}
          <button
            type="button"
            onClick={onCerrar}
            disabled={ocupado}
            title="Lo repartido queda en Liquidaciones por pagar"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-40 whitespace-nowrap"
          >
            Listo
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          {/* La tabla de la casa: su primer título es el de la sección
              (Felipe, 18-08), así que no lleva rótulo arriba. */}
          <TablaDeJornadas
            titulo="Quiénes trabajaron"
            secciones={[{ filas: delDia }]}
            onCambiar={(id, cambios) => cambiarStaff.mutate({ id, cambios })}
          />
          {/* La propina se reparte POR HORAS dentro del cargo, así que
              tocar una hora o sacar a alguien después de repartir deja
              la plata calculada con datos viejos. El sistema no lo
              rehace solo: quien decide es Felipe. */}
          {yaRepartido && (
            <p className="text-xs text-amber-700 mt-2">
              Este día ya está repartido. Si cambias horas o sacas a
              alguien, vuelve a repartir para que la plata se recalcule.
            </p>
          )}
        </div>

        {delEvento.length > 0 && (
          <div className="border border-gray-200 rounded-xl p-3">
            <p className="text-sm font-medium text-gray-900">
              Vinieron a un evento este día
            </p>
            <p className="text-xs text-gray-500 mb-2">
              El que marques entra también al pozo del día, con su mismo
              horario del evento. Su jornada se paga una sola vez, en el
              evento.
            </p>
            <ul className="space-y-1">
              {delEvento.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={invitados.has(a.id)}
                    onChange={() => {
                      const s2 = new Set(invitados);
                      if (s2.has(a.id)) s2.delete(a.id);
                      else s2.add(a.id);
                      setInvitados(s2);
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-900">{a.people?.name}</span>
                  <span className="text-gray-500">
                    {a.management_resources?.name ?? "Sin cargo"}
                  </span>
                  <span className="text-gray-400 text-xs ml-auto tabular-nums">
                    {(a.starts_at ?? "").slice(0, 5)}–
                    {(a.ends_at ?? "").slice(0, 5)}
                    {a.person_id != null &&
                      propinaDelDia.has(a.person_id) &&
                      ` · del día ${clp(propinaDelDia.get(a.person_id) ?? 0)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            Propina del día
          </span>
          <div className="w-32 relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
              $
            </span>
            <NumberInput
              value={monto}
              onChange={(v: number | undefined) => setMonto(v)}
              placeholder="0"
              aria-label="Monto del pozo del día"
              className="w-full border border-gray-300 rounded-lg pl-5 pr-2 py-1.5 text-sm text-right"
            />
          </div>
        </div>

        {(monto ?? 0) > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">
              Cómo se reparte
            </h4>
            {/* Mismas columnas que arriba: el cargo manda el ancho y los
                checks quedan a plomo, sea "Cajera" o "Personal de aseo"
                (Felipe, 16-08). */}
            <div className="grid grid-cols-[minmax(0,max-content)_max-content_1fr_auto_auto] items-center gap-x-3 gap-y-2">
              {cargos.map(([id, nombre]) => {
                const fuera = sinCargo.has(id);
                return (
                  <div key={id} className="contents">
                    <span
                      className={`text-sm whitespace-nowrap ${
                        fuera ? "text-gray-400" : "text-gray-900"
                      }`}
                    >
                      {nombre}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={fuera}
                        onChange={() => {
                          const s2 = new Set(sinCargo);
                          if (fuera) s2.delete(id);
                          else {
                            s2.add(id);
                            setPcts(new Map(pcts).set(id, 0));
                          }
                          setSinCargo(s2);
                        }}
                        className="rounded border-gray-300"
                      />
                      sin propina
                    </label>
                    <div
                      className="w-20 justify-self-end"
                      title={
                        soloUno ? "Es el único cargo: se lleva todo" : undefined
                      }
                    >
                      <NumberInput
                        value={pct(id) || undefined}
                        onChange={(v: number | undefined) =>
                          setPcts(new Map(pcts).set(id, v ?? 0))
                        }
                        disabled={fuera || soloUno}
                        placeholder="0"
                        aria-label={`Porcentaje de ${nombre}`}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-right disabled:bg-gray-100"
                      />
                    </div>
                    <span className="text-sm text-gray-400">%</span>
                    <span
                      className="w-24 text-right tabular-nums text-sm text-gray-600"
                      title={`${(horasPorCargo.get(id) ?? 0).toLocaleString("es-CL")} h de ${nombre}`}
                    >
                      {clp(
                        totalPuntos > 0
                          ? ((monto ?? 0) *
                              (horasPorCargo.get(id) ?? 0) *
                              pct(id)) /
                              totalPuntos
                          : 0,
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              El % es el valor de la hora de cada cargo: mismas horas y
              mismo cargo, misma propina.
            </p>
            <p
              className={`text-sm mt-2 ${
                cuadra ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {cuadra
                ? `Cuadra: ${clp(monto ?? 0)} completos al equipo.`
                : `Suman ${total.toLocaleString("es-CL")}% — el botón se abre en 100.`}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
