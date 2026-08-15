import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Lock, X } from "lucide-react";
import NumberInput from "../../components/inputs/NumberInput";
import Estrellas from "../../components/Estrellas";
import { toast } from "../../components/toast/Toast";
import { horasTrabajadas, formatoHoras } from "../../components/inputs";
import { getQuotations } from "../../services/quotations.service";
import { QuotationStatus } from "../../types/quotations.types";
import {
  cerrarFicha,
  createPool,
  createReview,
  getPools,
  getSheets,
  getStaff,
  repartirPool,
  updatePool,
  upsertSheet,
} from "../../services/people.service";
import type { Asignacion, EstadoFicha, Pozo } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatISOUTCDateToString } from "../../utils/dates";

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
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

// Los eventos aceptados/realizados, con el MISMO queryKey que usa la
// sábana — una sola descarga para las tres mesas de trabajo.
export const eventosQueryOptions = {
  queryKey: ["people", "eventos-semana"] as const,
  queryFn: async () => {
    const r = (await getQuotations(
      undefined,
      [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA],
      "event_date",
      "desc",
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

const ORDEN: EstadoFicha[] = ["armando", "confirmado", "trabajado", "cerrada"];
const ETIQUETA: Record<EstadoFicha, string> = {
  armando: "Armando",
  confirmado: "Confirmado",
  trabajado: "Trabajado",
  cerrada: "Cerrada",
};

// Las plantillas del reparto. Los porcentajes se asignan por NOMBRE de
// cargo (garzón/cocina/desconche); lo que no calza queda en 0 y
// SIEMPRE se puede forzar a mano — de 176 días reales, 35 no fueron
// 60/40.
const PLANTILLAS: { nombre: string; pesos: [RegExp, number][] }[] = [
  { nombre: "El de siempre 60/40", pesos: [[/garz/i, 60], [/cocin/i, 40]] },
  {
    nombre: "Con desconche 55/35/10",
    pesos: [[/garz/i, 55], [/cocin/i, 35], [/desconch/i, 10]],
  },
  { nombre: "Solo garzones 100", pesos: [[/garz/i, 100]] },
];

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

  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const { data: sheets = [] } = useQuery({
    queryKey: ["people", "sheets"],
    queryFn: getSheets,
  });

  const filas: EventoFila[] = useMemo(() => {
    const porEvento = new Map(sheets.map((s) => [s.quotation_id, s.status]));
    return eventos
      .map((q) => ({
        id: q.id,
        nombre: `N° ${String(q.numero)} · ${q.cliente}`,
        inicio: q.inicio,
        termino: q.termino || q.inicio,
        estado: porEvento.get(q.id) ?? ("armando" as EstadoFicha),
      }))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
  }, [eventos, sheets]);

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

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Fichas de eventos</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          El ciclo de cada evento: armando → confirmado → trabajado →
          cerrada. Al cerrar se reparte la propina y se evalúa al equipo.
        </p>
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-gray-500 p-6 text-center">
          No hay eventos aprobados con fecha todavía.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {filas.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setAbierta(f)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {f.nombre}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatISOUTCDateToString(f.inicio)}
                    {f.termino !== f.inicio &&
                      ` — ${formatISOUTCDateToString(f.termino)}`}
                  </div>
                </div>
                <ChipEstado estado={f.estado} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipEstado({ estado }: { readonly estado: EstadoFicha }) {
  const estilo =
    estado === "cerrada"
      ? "bg-gray-100 text-gray-600"
      : estado === "trabajado"
        ? "bg-emerald-50 text-emerald-700"
        : estado === "confirmado"
          ? "bg-blue-50 text-blue-700"
          : "bg-amber-50 text-amber-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estilo}`}>
      {estado === "cerrada" && <Lock className="w-3 h-3 inline mr-1 -mt-0.5" />}
      {ETIQUETA[estado]}
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
  const cerrada = evento.estado === "cerrada";

  const { data: staff = [] } = useQuery({
    queryKey: ["people", "staff-evento", evento.id],
    queryFn: () => getStaff(evento.id),
  });
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

  const avanzar = useMutation({
    mutationFn: (estado: EstadoFicha) => upsertSheet(evento.id, estado),
    onSuccess: onCambio,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
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

      {/* El ciclo: cada paso se pincha para avanzar (o volver). La única
          puerta con candado es "cerrada", que va por su propio botón. */}
      <div className="flex items-center gap-1">
        {ORDEN.map((e, i) => (
          <button
            key={e}
            type="button"
            disabled={e === "cerrada" || cerrada || avanzar.isPending}
            onClick={() => avanzar.mutate(e)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              evento.estado === e
                ? "bg-blue-600 text-white border-blue-600"
                : ORDEN.indexOf(evento.estado) > i
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            } disabled:opacity-60`}
          >
            {i + 1}. {ETIQUETA[e]}
          </button>
        ))}
      </div>

      {/* Los días y la gente. Las horas se AJUSTAN en la sábana (la
          casilla del día); acá se leen. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-900">Los días y la gente</h3>
          <span className="text-sm text-gray-500">
            Jornadas: <strong className="text-gray-900">{clp(jornadas)}</strong>
            {propinas > 0 && (
              <>
                {" "}
                · Propinas repartidas:{" "}
                <strong className="text-gray-900">{clp(propinas)}</strong>
              </>
            )}
          </span>
        </div>
        {dias.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            Nadie asignado todavía — los nombres se ponen en Planificación.
          </p>
        ) : (
          <div className="space-y-2">
            {dias.map(([d, gente]) => (
              <div key={d} className="text-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase">
                  {formatISOUTCDateToString(d)}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {gente.map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <span className="flex-1 text-gray-900">
                        {a.people?.name ?? "—"}
                        <span className="text-gray-400 text-xs ml-2">
                          {a.management_resources?.name ?? "sin cargo"}
                        </span>
                      </span>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {a.starts_at?.slice(0, 5)}–{a.ends_at?.slice(0, 5)} ·{" "}
                        {formatoHoras(
                          horasTrabajadas(
                            a.starts_at?.slice(0, 5) ?? null,
                            a.ends_at?.slice(0, 5) ?? null,
                            a.break_minutes,
                          ),
                        )}
                      </span>
                      <span className="w-20 text-right tabular-nums text-gray-700">
                        {a.amount ? clp(Number(a.amount)) : "—"}
                      </span>
                      <span className="w-20 text-right tabular-nums text-emerald-700">
                        {a.tip_amount ? clp(Number(a.tip_amount)) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Las horas reales se ajustan en Planificación, pinchando el día.
        </p>
      </div>

      <Reparto
        evento={evento}
        pozo={pozo}
        staff={staff}
        cerrada={cerrada}
        onRefrescar={refrescar}
      />

      {/* El cierre: reparte, evalúa y candado. */}
      {!cerrada && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEvaluando(true)}
            disabled={evento.estado !== "trabajado"}
            title={
              evento.estado !== "trabajado"
                ? 'Se cierra desde "trabajado", con las horas reales ajustadas'
                : undefined
            }
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
          >
            Cerrar la ficha…
          </button>
        </div>
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

/** El pozo (con sus dos entregas) y el reparto por cargo y por horas. */
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
  const cargos = useMemo(() => {
    const m = new Map<number | null, string>();
    for (const a of staff) {
      m.set(a.role_id ?? null, a.management_resources?.name ?? "Sin cargo");
    }
    return [...m.entries()];
  }, [staff]);

  const [pcts, setPcts] = useState<Map<number | null, number>>(new Map());
  const pct = (id: number | null) => pcts.get(id) ?? 0;
  const total = cargos.reduce((t, [id]) => t + pct(id), 0);
  const monto = pozo
    ? Number(pozo.first_amount) + Number(pozo.second_amount)
    : 0;

  // "Si se le sube el porcentaje a uno, los demás bajan parejo" — al
  // cambiar uno a mano, el resto se ajusta proporcional para que la
  // suma quede en 100 (55/35/10 sin desconche queda 60/40 solo).
  const cambiar = (id: number | null, nuevo: number) => {
    const resto = cargos.filter(([cid]) => cid !== id);
    const sumaResto = resto.reduce((t, [cid]) => t + pct(cid), 0);
    const objetivo = Math.max(0, 100 - nuevo);
    const m = new Map(pcts);
    m.set(id, nuevo);
    for (const [cid] of resto) {
      m.set(
        cid,
        sumaResto > 0
          ? Math.round((pct(cid) / sumaResto) * objetivo * 100) / 100
          : resto.length > 0
            ? Math.round((objetivo / resto.length) * 100) / 100
            : 0,
      );
    }
    setPcts(m);
  };

  const plantilla = (pesos: [RegExp, number][]) => {
    const m = new Map<number | null, number>();
    for (const [id, nombre] of cargos) {
      const peso = pesos.find(([re]) => re.test(nombre));
      m.set(id, peso ? peso[1] : 0);
    }
    setPcts(m);
  };

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

      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-sm text-gray-600">
          Primera entrega
          <NumberInput
            value={pozo ? Number(pozo.first_amount) : 0}
            onChange={(v) => guardarPozo.mutate({ first_amount: v ?? 0 })}
            disabled={cerrada}
            className="block w-32 mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
          />
        </label>
        <label className="text-sm text-gray-600">
          Segunda entrega
          <NumberInput
            value={pozo ? Number(pozo.second_amount) : 0}
            onChange={(v) => guardarPozo.mutate({ second_amount: v ?? 0 })}
            disabled={cerrada}
            className="block w-32 mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
          />
        </label>
        <div className="text-sm text-gray-600 pb-2">
          Pozo: <strong className="text-gray-900">{clp(monto)}</strong>
          {pozo?.distributed_at && (
            <span className="ml-2 text-emerald-700 text-xs">
              <Check className="w-3.5 h-3.5 inline -mt-0.5" /> repartido
            </span>
          )}
        </div>
      </div>

      {monto > 0 && !cerrada && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {PLANTILLAS.map((p) => (
              <button
                key={p.nombre}
                type="button"
                onClick={() => plantilla(p.pesos)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
              >
                {p.nombre}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {cargos.map(([id, nombre]) => (
              <div key={id ?? 0} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-gray-900">{nombre}</span>
                <NumberInput
                  value={pct(id)}
                  onChange={(v) => cambiar(id, v ?? 0)}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                />
                <span className="text-gray-400 w-4">%</span>
                <span className="w-24 text-right tabular-nums text-gray-600">
                  {clp((monto * pct(id)) / 100)}
                </span>
              </div>
            ))}
          </div>

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
    for (const a of staff) m.set(a.person_id, a.people?.name ?? "—");
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mt-10 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h3 className="font-semibold text-gray-900">¿Qué tal trabajó el equipo?</h3>
            <p className="text-xs text-gray-500">
              Una evaluación por persona. Saltar está bien: sin evaluar no
              es lo mismo que malo. La nota puede ir sin tocar la estrella.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cancelar"
            className="p-1 text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="divide-y divide-gray-100 px-4">
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
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
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
        </div>
      </div>
    </div>
  );
}
