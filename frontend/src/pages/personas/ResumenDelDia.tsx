import { useMemo, type ReactNode } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, Search, Users, X } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { HoraInput, formatoHoras, horasTrabajadas } from "../../components/inputs";
import {
  COLOR_SECCION,
  type ColorDeSeccion,
} from "../../components/grilla/coloresDeSeccion";
import {
  getEventServiceTimes,
  setEventServiceTime,
} from "../../services/logistics.service";
import { getQuotationById } from "../../services/quotations.service";
import type { Asignacion } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatPhone } from "../../utils/phone";
import {
  diasDelEvento,
  numeroDeDia,
  serviciosDelDia,
} from "./serviciosDelDia";
import { esDePlanta } from "./bandasDelStaff";
import { costoDeLaGente, pagoDelDia, pesos } from "./eventosDeLaSabana";

// EL RESUMEN DEL DÍA — LA HOJA DE RUTA DE UNA JORNADA
//
// Se abre DEBAJO de la grilla al pinchar la fecha. (El modal es otra
// cosa: es la edición de una casilla puntual.)
//
// Cuatro bloques, en este orden (Felipe, 15-08; el cuarto, 21-10-2026):
//   1. LOS EVENTOS, en corto: número, cliente, tipo, cuánta gente, el
//      contacto — y las CATEGORÍAS de servicio con su hora, editable
//      acá mismo. El detalle largo del menú NO va: es excesivo, y para
//      eso está la Ficha de Cocina.
//   2. PERSONAL DE EVENTOS — la gente de los eventos, planta o freelance,
//      agrupada por evento cuando hay más de uno ("para saber quién va
//      en cuál").
//   3. PERSONAL DE PLANTA — la misma tabla: las jornadas de planta sin
//      evento.
//   4. PERSONAL STAFF — la misma tabla: el freelance sin evento. "Si es
//      staff (o freelance) queda siempre abajo; si es planta, queda en
//      planta" (Felipe, 21-10-2026), igual que las bandas de la sábana.
//
// Las tablas comparten plantilla a propósito: cargo · persona ·
// horario · horas · tipo · estado · pago. Un cargo que se necesita y no
// tiene a nadie igual aparece, con su "nadie puesto todavía".
//
// LO QUE CUESTA EL DÍA (Felipe, 09-11-2026: "agregar la columna de costos
// (pago por día) — sé que planta no dirá nada adicional, pero así puedo
// comprobar cuánto me está costando el día completo"). Cada bloque lleva
// su color —los de la sábana: verde eventos, azul planta, lila staff— y
// su subtotal, y abajo va el total del día. La planta va en blanco salvo
// que se le haya puesto un adicional, y lo que falta por conseguir suma a
// su valor estimado. El recuadro de recados («Qué hay que hacer») salió
// ese mismo día; lo ya escrito sigue guardado en la base (`day_notes`).

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
  const sinEvento = delDia.filter((a) => a.quotation_id === null);
  const planta = sinEvento.filter(esDePlanta);
  const staffSinEvento = sinEvento.filter((a) => !esDePlanta(a));

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

  // Personas ≠ jornadas: alguien puede hacer dos turnos el mismo día. Las
  // sillas vacías no son nadie todavía: van como «Falta por conseguir» en
  // su tabla, no en la cuenta de personas.
  const conNombre = delDia.filter((a) => a.person_id != null);
  const personasDistintas = new Set(conNombre.map((a) => a.person_id)).size;
  const porConfirmar = conNombre.filter((a) => a.status !== "confirmado").length;
  const horasTotales = conNombre.reduce(
    (t, a) =>
      t +
      (horasTrabajadas(
        a.starts_at?.slice(0, 5) ?? null,
        a.ends_at?.slice(0, 5) ?? null,
        a.break_minutes,
      ) ?? 0),
    0,
  );

  // Lo que cuesta el día, por bloque y en total. La gente de un evento
  // anulado (huérfanos) no suma: hay que desconvocarla.
  const deEventos = delDia.filter(
    (a) =>
      a.quotation_id !== null &&
      eventosDelDia.some((e) => e.id === String(a.quotation_id)),
  );
  const costoEventos = costoDeLaGente(deEventos);
  const costoPlanta = costoDeLaGente(planta);
  const costoStaff = costoDeLaGente(staffSinEvento);
  const costoTotal = costoEventos + costoPlanta + costoStaff;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {r.dia} {r.num} de {r.mes}
          </h2>
          <div className="text-sm text-gray-500 mt-0.5">
            {conNombre.length === 0 ? (
              "Nadie asignado todavía"
            ) : (
              <span className="flex items-center gap-2 flex-wrap">
                <span>
                  {personasDistintas}{" "}
                  {personasDistintas === 1 ? "persona" : "personas"}
                </span>
                <span className="text-gray-300">·</span>
                <span>
                  {conNombre.length}{" "}
                  {conNombre.length === 1 ? "jornada" : "jornadas"}
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
            <strong className="text-gray-700">Sin eventos este día.</strong>
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

        {/* 2. PERSONAL DE EVENTOS — agrupado por evento si hay más de uno. */}
        {eventosDelDia.length > 0 && (
          <Bloque titulo="Personal de eventos" color="verde" costo={costoEventos}>
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
          </Bloque>
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
          <Bloque titulo="Personal de planta" color="azul" costo={costoPlanta}>
            <TablaDeGente gente={planta} />
          </Bloque>
        )}

        {/* 4. PERSONAL STAFF — el freelance sin evento, siempre abajo. */}
        {staffSinEvento.length > 0 && (
          <Bloque titulo="Personal staff" color="violeta" costo={costoStaff}>
            <TablaDeGente gente={staffSinEvento} />
          </Bloque>
        )}

        {eventosDelDia.length === 0 && sinEvento.length === 0 ? (
          <p className="text-sm text-gray-500">
            Día libre: sin eventos ni gente asignada.
          </p>
        ) : (
          <div className="flex items-center justify-between border-t-2 border-gray-300 pt-2 px-3">
            <span className="text-sm font-semibold text-gray-900">
              Total del día
            </span>
            <span className="text-base font-semibold tabular-nums text-gray-900">
              {pesos(costoTotal)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Un bloque del resumen con el color de su sección en la sábana y lo que
 *  cuesta ese día a la derecha. */
function Bloque({
  titulo,
  color,
  costo,
  children,
}: {
  readonly titulo: string;
  readonly color: ColorDeSeccion;
  readonly costo: number;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <div
        className={`flex items-center justify-between gap-2 border-l-4 rounded-none px-3 py-1.5 mb-1.5 ${COLOR_SECCION[color]}`}
      >
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <span className="text-sm font-semibold tabular-nums">
          {costo > 0 ? pesos(costo) : "—"}
        </span>
      </div>
      {children}
    </section>
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
          <th className="font-medium pb-1 w-24 text-right">Pago</th>
        </tr>
      </thead>
      <tbody>
        {porCargo.map(([cargo, { cargoId, lista }]) => {
          const necesita =
            quotationId && cobertura
              ? cobertura.get(`${quotationId}|${String(cargoId)}`)?.necesita
              : undefined;
          // "n de m" cuenta a la gente con nombre: la silla vacía es la que
          // falta, no una persona más.
          const sentados = lista.filter((a) => a.person_id != null).length;
          const falta = necesita !== undefined && sentados < necesita;

          if (lista.length === 0) {
            return (
              <tr key={`vacio-${cargo}`} className="border-t border-gray-100">
                <td className="py-1 text-amber-700">
                  {cargo} <span className="text-xs">0 de {necesita ?? 0}</span>
                </td>
                <td colSpan={6} className="py-1 text-amber-700">
                  nadie puesto todavía
                </td>
              </tr>
            );
          }

          return lista.map((a, i) => {
            const pago = pagoDelDia(a);
            const vacia = a.person_id == null;
            return (
              <tr key={a.id} className="border-t border-gray-100">
                <td className="py-1 align-top">
                  {i === 0 && (
                    <span className={falta ? "text-amber-700" : "text-gray-600"}>
                      {cargo}
                      {necesita !== undefined && (
                        <span className="text-xs ml-1">
                          {sentados} de {necesita}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className={`py-1 ${vacia ? "text-amber-700" : "text-gray-900"}`}>
                  {vacia ? "Falta por conseguir" : (a.people?.name ?? "—")}
                </td>
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
                  {vacia ? "" : a.kind === "planta" ? "planta" : "freelance"}
                </td>
                <td className="py-1 text-right">
                  {vacia ? null : a.status === "confirmado" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                      <Check className="w-3.5 h-3.5" /> confirmada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
                      <Search className="w-3.5 h-3.5" /> por confirmar
                    </span>
                  )}
                </td>
                {/* La planta, en blanco salvo un adicional; un freelance
                    sin monto, la raya; la silla vacía, su estimado. */}
                <td
                  className={`py-1 text-right tabular-nums ${
                    vacia ? "text-amber-700" : "text-gray-900"
                  }`}
                >
                  {pago !== null
                    ? pesos(pago)
                    : a.kind === "planta" && !vacia
                      ? ""
                      : "—"}
                </td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}
