import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { HoraInput, formatoHoras, horasTrabajadas } from "../../components/inputs";
import {
  getEventServiceTimes,
  setEventServiceTime,
} from "../../services/logistics.service";
import { getQuotationById } from "../../services/quotations.service";
import {
  createDayNote,
  getDayNotes,
  removeDayNote,
  updateDayNote,
} from "../../services/people.service";
import type { Asignacion } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatPhone } from "../../utils/phone";
import {
  diasDelEvento,
  numeroDeDia,
  serviciosDelDia,
} from "./serviciosDelDia";

// EL RESUMEN DEL DÍA — LA HOJA DE RUTA DE UNA JORNADA
//
// Se abre DEBAJO de la grilla al pinchar la fecha. (El modal es otra
// cosa: es la edición de una casilla puntual.)
//
// Tres bloques, en este orden (Felipe, 15-08):
//   1. LOS EVENTOS, en corto: número, cliente, tipo, cuánta gente, el
//      contacto — y las CATEGORÍAS de servicio con su hora, editable
//      acá mismo. El detalle largo del menú NO va: es excesivo, y para
//      eso está la Ficha de Cocina.
//   2. PERSONAL STAFF — la gente de los eventos, agrupada por evento
//      cuando hay más de uno ("para saber quién va en cuál").
//   3. PERSONAL DE PLANTA — la misma tabla, exactamente igual.
//
// Las dos tablas comparten plantilla a propósito: cargo · persona ·
// horario · horas · tipo · estado. Un cargo que se necesita y no tiene
// a nadie igual aparece, con su "nadie puesto todavía".

const iso = (v: string | null | undefined) =>
  v ? String(v).slice(0, 10) : "";

const rotulo = (isoDia: string) => {
  const d = new Date(`${isoDia}T12:00:00Z`);
  return {
    dia: d
      .toLocaleDateString("es-CL", { weekday: "long", timeZone: "UTC" })
      .replace(".", ""),
    num: d.getUTCDate(),
    mes: d
      .toLocaleDateString("es-CL", { month: "long", timeZone: "UTC" })
      .replace(".", ""),
  };
};

export interface EventoDelResumen {
  readonly id: string;
  readonly numero: number;
  readonly cliente: string;
  readonly inicio: string | null;
  readonly termino: string | null;
  readonly personas: number;
  readonly ninos: number;
  readonly tipo: string | null;
  readonly observaciones: string | null;
  readonly contacto: string | null;
  readonly telefono: string | null;
}

/** Cuántos se necesitan de cada cargo ese día, por evento. Lleva el
 *  nombre además del número: un cargo con NADIE puesto no tiene de
 *  dónde sacarlo, y es justo el que hay que gritar. */
export interface CupoDelDia {
  readonly cargo: string;
  readonly necesita: number;
}
export type Cobertura = ReadonlyMap<string, CupoDelDia>;

export default function ResumenDelDia({
  dia,
  eventos,
  staff,
  companyId,
  cobertura,
  onCerrar,
}: {
  readonly dia: string;
  readonly eventos: readonly EventoDelResumen[];
  readonly staff: readonly Asignacion[];
  readonly companyId: number;
  /** clave `${quotationId}|${cargoId}` → el cupo de ese día. */
  readonly cobertura: Cobertura;
  readonly onCerrar: () => void;
}) {
  const r = rotulo(dia);
  const delDia = staff.filter((a) => iso(a.day) === dia);
  const planta = delDia.filter((a) => a.quotation_id === null);

  // Los eventos que TOCAN este día: por fecha, o porque hay gente puesta
  // (los días de preparativo y de desarme caen fuera del rango de la
  // cotización, y esa gente antes no aparecía en ninguna lista).
  const conGente = new Set(
    delDia.map((a) => a.quotation_id).filter((q): q is string => q !== null),
  );
  const eventosDelDia = eventos.filter(
    (e) =>
      conGente.has(e.id) ||
      (e.inicio && e.inicio <= dia && (e.termino || e.inicio) >= dia),
  );

  // Gente puesta en un evento que ya no está en la lista (se anuló o
  // volvió a pre-venta): son los que hay que desconvocar.
  const huerfanos = delDia.filter(
    (a) =>
      a.quotation_id !== null &&
      !eventosDelDia.some((e) => e.id === String(a.quotation_id)),
  );

  // Personas ≠ jornadas: alguien puede hacer dos turnos el mismo día.
  const personasDistintas = new Set(delDia.map((a) => a.person_id)).size;
  const porConfirmar = delDia.filter((a) => a.status !== "confirmado").length;
  const horasTotales = delDia.reduce(
    (t, a) =>
      t +
      (horasTrabajadas(
        a.starts_at?.slice(0, 5) ?? null,
        a.ends_at?.slice(0, 5) ?? null,
        a.break_minutes,
      ) ?? 0),
    0,
  );

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {r.dia} {r.num} de {r.mes}
          </h2>
          <div className="text-sm text-gray-500 mt-0.5">
            {delDia.length === 0 ? (
              "Nadie asignado todavía"
            ) : (
              <span className="flex items-center gap-2 flex-wrap">
                <span>
                  {personasDistintas}{" "}
                  {personasDistintas === 1 ? "persona" : "personas"}
                </span>
                <span className="text-gray-300">·</span>
                <span>
                  {delDia.length}{" "}
                  {delDia.length === 1 ? "jornada" : "jornadas"}
                </span>
                <span className="text-gray-300">·</span>
                <span>{formatoHoras(horasTotales)}</span>
                {porConfirmar > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-amber-700 font-medium">
                      {porConfirmar} por confirmar
                    </span>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el resumen"
          className="p-1 text-gray-400 hover:text-gray-700 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5">
        {/* 1. LOS EVENTOS, en corto, con sus horarios de servicio. */}
        {eventosDelDia.length === 0 ? (
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <strong className="text-gray-700">Sin eventos este día.</strong> Lo
            que sigue es el personal de planta.
          </p>
        ) : (
          <div className="space-y-2">
            {eventosDelDia.map((e) => (
              <CabeceraEvento
                key={e.id}
                evento={e}
                dia={dia}
                companyId={companyId}
              />
            ))}
          </div>
        )}

        {/* 2. PERSONAL STAFF — agrupado por evento si hay más de uno. */}
        {eventosDelDia.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
              Personal staff
            </h3>
            {eventosDelDia.length === 1 ? (
              <TablaDeGente
                gente={delDia.filter(
                  (a) => String(a.quotation_id) === eventosDelDia[0].id,
                )}
                cobertura={cobertura}
                quotationId={eventosDelDia[0].id}
              />
            ) : (
              <div className="space-y-3">
                {eventosDelDia.map((e) => (
                  <div key={e.id}>
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-0.5">
                      #{e.numero} · {e.cliente}
                    </p>
                    <TablaDeGente
                      gente={delDia.filter(
                        (a) => String(a.quotation_id) === e.id,
                      )}
                      cobertura={cobertura}
                      quotationId={e.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {huerfanos.length > 0 && (
          <section className="border border-amber-200 bg-amber-50/50 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-amber-900 mb-1.5">
              Puestos en un evento que ya no está en la lista
            </h3>
            <p className="text-xs text-amber-800 mb-1.5">
              El evento se anuló o volvió a pre-venta. Si ya no van, hay que
              avisarles.
            </p>
            <TablaDeGente gente={huerfanos} />
          </section>
        )}

        {/* 3. PERSONAL DE PLANTA — la misma tabla. */}
        {planta.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
              Personal de planta
            </h3>
            <TablaDeGente gente={planta} />
          </section>
        )}

        {eventosDelDia.length === 0 && planta.length === 0 && (
          <p className="text-sm text-gray-500">
            Día libre: sin eventos ni gente asignada.
          </p>
        )}

        <NotasDelDia dia={dia} />
      </div>
    </div>
  );
}

/** El evento en corto, con las categorías de servicio y su hora. */
function CabeceraEvento({
  evento,
  dia,
  companyId,
}: {
  readonly evento: EventoDelResumen;
  readonly dia: string;
  readonly companyId: number;
}) {
  const qc = useQueryClient();
  const inicio = evento.inicio ?? dia;
  const totalDias = diasDelEvento(inicio, evento.termino);
  const diaN = numeroDeDia(inicio, dia);
  // Fuera del rango de la cotización = día de preparativos o de desarme.
  const fueraDeRango = diaN < 1 || diaN > totalDias;

  const [detalle, horas] = useQueries({
    queries: [
      {
        queryKey: ["people", "evento-items", evento.id],
        queryFn: () => getQuotationById(evento.id),
        staleTime: 5 * 60_000,
      },
      {
        // Sin caché: una hora recién puesta en la Ficha de Cocina tiene
        // que verse acá al tiro, y viceversa.
        queryKey: ["people", "horarios-servicios", evento.id],
        queryFn: () => getEventServiceTimes(companyId, evento.id),
      },
    ],
  });

  const servicios = useMemo(
    () =>
      fueraDeRango
        ? []
        : serviciosDelDia(
            (detalle.data?.data as { items?: unknown } | undefined)?.items,
            horas.data ?? {},
            diaN,
            totalDias,
            evento.personas,
            evento.ninos > 0,
          ),
    [detalle.data, horas.data, diaN, totalDias, evento, fueraDeRango],
  );

  // LA HORA SE GUARDA DONDE MISMO QUE LA FICHA DE COCINA (Felipe,
  // 15-08): "en la ficha de cocina selecciono la hora, se actualiza acá,
  // y si la actualizo acá, se actualiza allá". Es la misma tabla y la
  // misma clave; lo único que hay que hacer es refrescar los dos lados.
  const guardarHora = useMutation({
    mutationFn: async (v: { clave: string; hora: string }) => {
      const r = await setEventServiceTime(
        companyId,
        evento.id,
        v.clave,
        v.hora,
      );
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["people", "horarios-servicios", evento.id],
      });
      void qc.invalidateQueries({ queryKey: ["postventa", "cocina"] });
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-gray-900">
          #{evento.numero} · {evento.cliente}
        </span>
        {fueraDeRango ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
            {diaN < 1 ? "PREPARATIVOS" : "DESARME"}
          </span>
        ) : (
          totalDias > 1 && (
            <span className="text-xs text-gray-500">
              día {diaN} de {totalDias}
            </span>
          )
        )}
      </div>
      <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
        {evento.tipo && <span>{evento.tipo}</span>}
        <span className="inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          {evento.personas} personas
          {evento.ninos > 0 && ` (${evento.ninos} niños)`}
        </span>
        {evento.contacto && (
          <span>
            {evento.contacto}
            {evento.telefono && ` · ${formatPhone(evento.telefono)}`}
          </span>
        )}
      </div>

      {(detalle.isError || detalle.data?.error) && (
        <p className="text-xs text-amber-800 mt-1.5">
          No se pudieron cargar los servicios de este evento.
        </p>
      )}

      {servicios.length > 0 && (
        <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-2">
          {servicios.map((s) => (
            <span key={s.clave} className="inline-flex items-center gap-1.5">
              <span className="text-sm text-gray-700">{s.nombre}</span>
              <HoraInput
                value={s.hora}
                onChange={(v) => {
                  if (v) guardarHora.mutate({ clave: s.clave, hora: v });
                }}
                compacta
                aria-label={`Hora de ${s.nombre}`}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** La tabla de quién trabaja: la MISMA para staff y para planta. */
function TablaDeGente({
  gente,
  cobertura,
  quotationId,
}: {
  readonly gente: readonly Asignacion[];
  readonly cobertura?: Cobertura;
  readonly quotationId?: string;
}) {
  const porCargo = useMemo(() => {
    const m = new Map<string, { cargoId: number; lista: Asignacion[] }>();
    for (const a of gente) {
      const k = a.management_resources?.name ?? "Sin cargo";
      if (!m.has(k)) m.set(k, { cargoId: a.role_id ?? 0, lista: [] });
      m.get(k)!.lista.push(a);
    }
    // Un cargo que se necesita y NO tiene a NADIE también es una fila:
    // si no, "Garzón 4 de 4" se lee como cobertura completa mientras los
    // 2 barmans que faltan no aparecen por ninguna parte.
    if (quotationId && cobertura) {
      for (const [clave, cupo] of cobertura) {
        const [q, cargoId] = clave.split("|");
        if (q !== quotationId) continue;
        if (!m.has(cupo.cargo)) {
          m.set(cupo.cargo, { cargoId: Number(cargoId), lista: [] });
        }
      }
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [gente, cobertura, quotationId]);

  if (porCargo.length === 0) {
    return (
      <p className="text-sm text-amber-700">Sin gente asignada este día.</p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-gray-400">
          <th className="font-medium pb-1 w-40">Cargo</th>
          <th className="font-medium pb-1">Persona</th>
          <th className="font-medium pb-1 w-32 text-right">Horario</th>
          <th className="font-medium pb-1 w-16 text-right">Horas</th>
          <th className="font-medium pb-1 w-20 pl-3">Tipo</th>
          <th className="font-medium pb-1 w-28 text-right">Estado</th>
        </tr>
      </thead>
      <tbody>
        {porCargo.map(([cargo, { cargoId, lista }]) => {
          const necesita =
            quotationId && cobertura
              ? cobertura.get(`${quotationId}|${String(cargoId)}`)?.necesita
              : undefined;
          const falta = necesita !== undefined && lista.length < necesita;

          if (lista.length === 0) {
            return (
              <tr key={`vacio-${cargo}`} className="border-t border-gray-100">
                <td className="py-1 text-amber-700">
                  {cargo} <span className="text-xs">0 de {necesita ?? 0}</span>
                </td>
                <td colSpan={5} className="py-1 text-amber-700">
                  nadie puesto todavía
                </td>
              </tr>
            );
          }

          return lista.map((a, i) => (
            <tr key={a.id} className="border-t border-gray-100">
              <td className="py-1 align-top">
                {i === 0 && (
                  <span className={falta ? "text-amber-700" : "text-gray-600"}>
                    {cargo}
                    {necesita !== undefined && (
                      <span className="text-xs ml-1">
                        {lista.length} de {necesita}
                      </span>
                    )}
                  </span>
                )}
              </td>
              <td className="py-1 text-gray-900">{a.people?.name ?? "—"}</td>
              <td className="py-1 text-right tabular-nums text-gray-600">
                {a.starts_at && a.ends_at
                  ? `${a.starts_at.slice(0, 5)}–${a.ends_at.slice(0, 5)}`
                  : "—"}
              </td>
              <td className="py-1 text-right tabular-nums text-gray-600">
                {formatoHoras(
                  horasTrabajadas(
                    a.starts_at?.slice(0, 5) ?? null,
                    a.ends_at?.slice(0, 5) ?? null,
                    a.break_minutes,
                  ),
                )}
              </td>
              <td className="py-1 text-gray-500 text-xs pl-3">
                {a.kind === "planta" ? "planta" : "freelance"}
              </td>
              <td className="py-1 text-right">
                {a.status === "confirmado" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                    <Check className="w-3.5 h-3.5" /> confirmada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
                    <Search className="w-3.5 h-3.5" /> por confirmar
                  </span>
                )}
              </td>
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}

/** Los recados del día: lo que el personal tiene que hacer. */
function NotasDelDia({ dia }: { readonly dia: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");

  const { data: notas = [] } = useQuery({
    queryKey: ["people", "notas-dia", dia],
    queryFn: () => getDayNotes(dia, dia),
  });

  const refrescar = () =>
    qc.invalidateQueries({ queryKey: ["people", "notas-dia", dia] });

  const agregar = useMutation({
    mutationFn: (text: string) => createDayNote({ day: dia, text }),
    onSuccess: () => {
      setTexto("");
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const marcar = useMutation({
    mutationFn: (n: { id: number; done: boolean }) =>
      updateDayNote(n.id, { done: n.done }),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const borrar = useMutation({
    mutationFn: (id: number) => removeDayNote(id),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <section className="border-t border-gray-200 pt-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
        Qué hay que hacer
      </h3>
      {notas.length > 0 && (
        <ul className="space-y-1 mb-2">
          {notas.map((n) => (
            <li key={n.id} className="flex items-center gap-2 text-sm group">
              <button
                type="button"
                onClick={() => marcar.mutate({ id: n.id, done: !n.done })}
                aria-label={n.done ? "Marcar pendiente" : "Marcar hecho"}
                className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                  n.done
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-gray-300 hover:border-emerald-500"
                }`}
              >
                {n.done && <Check className="w-3 h-3" />}
              </button>
              <span
                className={
                  n.done
                    ? "flex-1 text-gray-400 line-through"
                    : "flex-1 text-gray-900"
                }
              >
                {n.text}
              </span>
              <button
                type="button"
                onClick={() => borrar.mutate(n.id)}
                aria-label={`Borrar "${n.text}"`}
                className="p-1 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) agregar.mutate(texto.trim());
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Un recado para este día: sacar las mesas del galpón, el bus se estaciona atrás…"
          aria-label="Nueva nota del día"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!texto.trim() || agregar.isPending}
          className="p-2 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40"
          aria-label="Agregar la nota"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>
    </section>
  );
}
