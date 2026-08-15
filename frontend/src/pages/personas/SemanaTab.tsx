import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";
import AgregadorDeItems from "../../components/selects/AgregadorDeItems";
import type { SelectOption } from "../../components/selects/types";
import { toast } from "../../components/toast/Toast";
import { getQuotations } from "../../services/quotations.service";
import { QuotationStatus } from "../../types/quotations.types";
import {
  getAllEventResources,
  getManagementResources,
} from "../../services/logistics.service";
import {
  addStaff,
  getStaffSemana,
  peopleQueryOptions,
  removeStaff,
  updateStaff,
} from "../../services/people.service";
import type { Asignacion, Persona } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile } from "../../utils/dates";
import { chipTipoPersona, etiquetaTipoPersona } from "../../utils/estadoPersona";
import { formatearRut } from "../../utils/rut";

// LA SEMANA — DONDE LA PLANIFICACIÓN RECIBE NOMBRE Y APELLIDO
//
// La grilla preliminar de cada evento (cuántos, qué días, a qué valor)
// vive en Gestión. ACÁ se junta TODO lo que viene en la semana y se le
// ponen los nombres: quién va, quién confirmó, quién falta por conseguir.
//
// Es la mesa del lunes: Felipe no se sienta a llenar el Joker No 1, se
// sienta a llenar la semana. Y la semana corre de DOMINGO a sábado, como
// su semana real (medido en el Excel: el domingo ya es semana nueva).
//
// Ver docs/arquitectura/10_MODULO_DE_PERSONAS.md

const DIA_MS = 86_400_000;

const sumarDias = (isoDia: string, n: number) =>
  new Date(new Date(`${isoDia}T00:00:00Z`).getTime() + n * DIA_MS)
    .toISOString()
    .slice(0, 10);

/** El domingo de la semana a la que pertenece el día. */
const domingoDe = (isoDia: string) => {
  const d = new Date(`${isoDia}T00:00:00Z`);
  return sumarDias(isoDia, -d.getUTCDay());
};

const rotulo = (isoDia: string) => {
  const d = new Date(`${isoDia}T12:00:00Z`);
  return {
    dia: d.toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
    num: d.getUTCDate(),
    mes: d.toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" }).replace(".", ""),
  };
};

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

interface FilaSemana {
  quotationId: string;
  evento: string;
  cargoId: number;
  cargo: string;
  precio: number;
  necesita: Map<string, number>;
  sinRepartir: number;
}

export default function SemanaTab({ companyId }: { readonly companyId: number }) {
  const qc = useQueryClient();
  const [domingo, setDomingo] = useState(() => domingoDe(hoyEnChile()));
  const [casilla, setCasilla] = useState<{ dia: string; fila: FilaSemana } | null>(null);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(domingo, i)), [domingo]);
  const hasta = dias[6];

  const { data: eventos = [] } = useQuery({
    queryKey: ["people", "eventos-semana"],
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
  });

  const { data: lineas = [] } = useQuery({
    queryKey: ["people", "necesidades"],
    queryFn: () => getAllEventResources(companyId),
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["people", "catalogo-recursos"],
    queryFn: () => getManagementResources(companyId),
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["people", "staff-semana", domingo],
    queryFn: () => getStaffSemana(domingo, hasta),
  });
  const { data: personas = [] } = useQuery(peopleQueryOptions);

  // Poner o sacar gente NO cambia las necesidades (esas viven en
  // Recursos): se refresca solo el staff de ESTA semana — una consulta,
  // no el catálogo entero de todos los eventos.
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["people", "staff-semana", domingo] });
  };

  const poner = useMutation({
    mutationFn: (p: { personId: number; dia: string; fila: FilaSemana }) =>
      addStaff({
        quotation_id: p.fila.quotationId,
        person_id: p.personId,
        day: p.dia,
        role_id: p.fila.cargoId,
        amount: p.fila.precio || null,
      }),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const sacar = useMutation({
    mutationFn: (id: number) => removeStaff(id),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const cambiar = useMutation({
    mutationFn: (p: { id: number; cambios: Parameters<typeof updateStaff>[1] }) =>
      updateStaff(p.id, p.cambios),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Las filas de la semana: cada (evento, cargo) que necesita gente en
  // estos siete días — o que ya tiene a alguien puesto.
  const filas = useMemo(() => {
    const porRecurso = new Map(catalogo.map((r) => [r.id, r]));
    const porEvento = new Map(eventos.map((e) => [e.id, e]));
    const m = new Map<string, FilaSemana>();

    for (const l of lineas) {
      const r = porRecurso.get(l.resource_id);
      const e = porEvento.get(String(l.quotation_id));
      if (!r || r.type !== "personal" || !e) continue;
      const d = iso(l.day);
      const enSemana = d !== null && d >= domingo && d <= hasta;
      // Las líneas sin repartir se avisan cuando el EVENTO cae en la semana.
      const eventoEnSemana =
        !!e.inicio && e.inicio <= hasta && (e.termino || e.inicio) >= domingo;
      if (!enSemana && !(d === null && eventoEnSemana)) continue;

      const k = `${e.id}|${r.id}`;
      if (!m.has(k)) {
        m.set(k, {
          quotationId: e.id,
          evento: `#${e.numero} · ${e.cliente}`,
          cargoId: r.id,
          cargo: r.name,
          precio: l.price_fixed || Number(r.list_price_fixed) || 0,
          necesita: new Map(),
          sinRepartir: 0,
        });
      }
      const f = m.get(k)!;
      if (d && enSemana) f.necesita.set(d, (f.necesita.get(d) || 0) + (l.quantity || 0));
      else f.sinRepartir += l.quantity || 0;
    }

    // Gente puesta en una casilla cuyo cargo ya no está costeado: la fila
    // igual se muestra, para que nadie quede invisible.
    for (const a of staff) {
      const e = porEvento.get(String(a.quotation_id));
      const r = a.role_id ? porRecurso.get(a.role_id) : null;
      const k = `${a.quotation_id}|${a.role_id ?? 0}`;
      if (!m.has(k)) {
        m.set(k, {
          quotationId: String(a.quotation_id),
          evento: e ? `#${e.numero} · ${e.cliente}` : "Evento",
          cargoId: a.role_id ?? 0,
          cargo: r?.name ?? a.management_resources?.name ?? "Sin cargo",
          precio: Number(r?.list_price_fixed) || 0,
          necesita: new Map(),
          sinRepartir: 0,
        });
      }
    }

    return [...m.values()].sort(
      (a, b) => a.evento.localeCompare(b.evento) || a.cargo.localeCompare(b.cargo),
    );
  }, [lineas, catalogo, eventos, staff, domingo, hasta]);

  const puestos = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const a of staff) {
      const k = `${a.quotation_id}|${a.role_id ?? 0}|${iso(a.day)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [staff]);

  const enCasilla = (f: FilaSemana, d: string) =>
    puestos.get(`${f.quotationId}|${f.cargoId}|${d}`) ?? [];

  const faltan = filas.reduce(
    (s, f) =>
      s + dias.reduce((t, d) => t + Math.max(0, (f.necesita.get(d) || 0) - enCasilla(f, d).length), 0),
    0,
  );
  const sinRepartir = filas.reduce((s, f) => s + f.sinRepartir, 0);

  // Agrupar filas por evento para pintar el encabezado una sola vez.
  const grupos = useMemo(() => {
    const g = new Map<string, FilaSemana[]>();
    for (const f of filas) {
      if (!g.has(f.evento)) g.set(f.evento, []);
      g.get(f.evento)!.push(f);
    }
    return [...g.entries()];
  }, [filas]);

  const r0 = rotulo(domingo);
  const r6 = rotulo(hasta);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDomingo(sumarDias(domingo, -7))}
            aria-label="Semana anterior"
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[13rem] text-center">
            {r0.dia} {r0.num} {r0.mes} — {r6.dia} {r6.num} {r6.mes}
          </span>
          <button
            type="button"
            onClick={() => setDomingo(sumarDias(domingo, 7))}
            aria-label="Semana siguiente"
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDomingo(domingoDe(hoyEnChile()))}
            className="ml-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            hoy
          </button>
        </div>
        {faltan > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <AlertTriangle className="w-4 h-4" />
            Faltan <strong>{faltan}</strong> por conseguir
          </span>
        )}
      </div>

      {sinRepartir > 0 && (
        <p className="text-xs text-amber-700">
          ⚠ Hay {sinRepartir} {sinRepartir === 1 ? "cupo" : "cupos"} sin día
          asignado en eventos de esta semana: repártelos en la grilla de
          Personal del evento (Post-Venta → Gestión).
        </p>
      )}

      {filas.length === 0 ? (
        <p className="text-center py-16 text-gray-500">
          Nada que armar esta semana: no hay eventos con personal costeado.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[11rem]">
                  Evento · cargo
                </th>
                {dias.map((d) => {
                  const r = rotulo(d);
                  const esHoy = d === hoyEnChile();
                  return (
                    <th
                      key={d}
                      className={`px-2 py-2 text-center font-medium min-w-[4.5rem] ${
                        esHoy ? "text-blue-700" : "text-gray-600"
                      }`}
                    >
                      <div className="text-[11px] text-gray-400 leading-none">{r.dia}</div>
                      <div className="leading-tight">{r.num}</div>
                      <div className="text-[11px] text-gray-400 leading-none">{r.mes}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grupos.map(([evento, filasDelEvento]) => (
                <FilasDeEvento
                  key={evento}
                  evento={evento}
                  filas={filasDelEvento}
                  dias={dias}
                  enCasilla={enCasilla}
                  casilla={casilla}
                  onAbrir={(dia, fila) =>
                    setCasilla(
                      casilla?.dia === dia && casilla.fila === fila ? null : { dia, fila },
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {casilla && (
        <CasillaAbierta
          dia={casilla.dia}
          fila={casilla.fila}
          asignados={enCasilla(casilla.fila, casilla.dia)}
          personas={personas}
          onCerrar={() => setCasilla(null)}
          onPoner={(personId) =>
            poner.mutate({ personId, dia: casilla.dia, fila: casilla.fila })
          }
          onSacar={(id) => sacar.mutate(id)}
          onCambiar={(id, cambios) => cambiar.mutate({ id, cambios })}
        />
      )}
    </div>
  );
}

function FilasDeEvento({
  evento,
  filas,
  dias,
  enCasilla,
  casilla,
  onAbrir,
}: {
  readonly evento: string;
  readonly filas: FilaSemana[];
  readonly dias: string[];
  readonly enCasilla: (f: FilaSemana, d: string) => Asignacion[];
  readonly casilla: { dia: string; fila: FilaSemana } | null;
  readonly onAbrir: (dia: string, fila: FilaSemana) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50/60">
        <td
          colSpan={1 + dias.length}
          className="px-3 py-1.5 text-xs font-semibold text-gray-700 sticky left-0"
        >
          {evento}
        </td>
      </tr>
      {filas.map((f) => (
        <tr key={`${f.quotationId}|${f.cargoId}`}>
          <td className="px-3 py-2 text-gray-900 sticky left-0 bg-white pl-6">
            {f.cargo}
            {f.sinRepartir > 0 && (
              <span className="ml-2 text-[11px] text-amber-700" title="Cupos sin día asignado">
                +{f.sinRepartir} sin día
              </span>
            )}
          </td>
          {dias.map((d) => {
            const necesita = f.necesita.get(d) || 0;
            const tiene = enCasilla(f, d).length;
            const abierta = casilla?.dia === d && casilla.fila === f;
            if (necesita === 0 && tiene === 0)
              return (
                <td key={d} className="px-2 py-2 text-center text-gray-200">
                  ·
                </td>
              );
            const falta = necesita - tiene;
            return (
              <td key={d} className="px-1 py-1 text-center">
                <button
                  type="button"
                  onClick={() => onAbrir(d, f)}
                  className={`w-full px-2 py-1.5 rounded-md text-sm tabular-nums transition-colors ${
                    abierta
                      ? "bg-blue-600 text-white"
                      : falta > 0
                        ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  {tiene}/{necesita}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/** La casilla abierta: quiénes van ese día, en ese cargo, en ese evento. */
function CasillaAbierta({
  dia,
  fila,
  asignados,
  personas,
  onCerrar,
  onPoner,
  onSacar,
  onCambiar,
}: {
  readonly dia: string;
  readonly fila: FilaSemana;
  readonly asignados: Asignacion[];
  readonly personas: readonly Persona[];
  readonly onCerrar: () => void;
  readonly onPoner: (personId: number) => void;
  readonly onSacar: (id: number) => void;
  readonly onCambiar: (id: number, cambios: Parameters<typeof updateStaff>[1]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const r = rotulo(dia);
  const necesita = fila.necesita.get(dia) || 0;
  const puestos = new Set(asignados.map((a) => a.person_id));

  // Los bloqueados y los no disponibles no se ofrecen — pero no se borran:
  // siguen en la libreta, y en la nómina si se les debe.
  const disponibles: SelectOption[] = personas
    .filter((p) => p.status === "activa" && !puestos.has(p.id))
    .map((p) => ({
      value: String(p.id),
      label: p.name,
      hint: [
        p.management_resources?.name,
        p.default_kind === "planta" ? "planta" : undefined,
        p.rut ? formatearRut(p.rut) : "sin RUT",
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {fila.cargo} · {r.dia} {r.num} de {r.mes}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {fila.evento} · {asignados.length} de {necesita}
          </span>
        </h3>
        <button onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      {asignados.length > 0 && (
        <ul className="space-y-1.5">
          {asignados.map((a) => (
            <li key={a.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex-1 text-gray-900">{a.people?.name ?? "—"}</span>
              <button
                type="button"
                onClick={() =>
                  onCambiar(a.id, { kind: a.kind === "planta" ? "freelance" : "planta" })
                }
                title="Cambiar entre planta y freelance SOLO para este día"
                className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(a.kind)}`}
              >
                {etiquetaTipoPersona(a.kind)}
              </button>
              <span className="w-24 text-right tabular-nums text-sm text-gray-600">
                {a.kind === "planta" ? (
                  <span className="text-gray-400" title="De planta: no cuesta un peso extra">
                    —
                  </span>
                ) : (
                  clp(a.amount ?? fila.precio)
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  onCambiar(a.id, {
                    status: a.status === "confirmado" ? "por_confirmar" : "confirmado",
                  })
                }
                title={a.status === "confirmado" ? "Confirmada" : "Por confirmar"}
                className={`p-1 rounded ${
                  a.status === "confirmado"
                    ? "text-emerald-600 hover:bg-emerald-50"
                    : "text-amber-500 hover:bg-amber-50"
                }`}
              >
                {a.status === "confirmado" ? <Check className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => onSacar(a.id)}
                aria-label={`Sacar a ${a.people?.name}`}
                className="p-1 text-gray-300 hover:text-red-600 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AgregadorDeItems
        opciones={disponibles}
        onAgregar={(v) => onPoner(Number(v))}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        placeholder="Buscar y poner a alguien…"
      />

      <p className="text-xs text-gray-500">
        El tipo y el monto son <strong>de este día</strong>: cambiarlos acá no
        toca la ficha de la persona. Un planta que trabaja en su día libre se
        marca freelance y esa jornada sí se paga.
      </p>
    </div>
  );
}
