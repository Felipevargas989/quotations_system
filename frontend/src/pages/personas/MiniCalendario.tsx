import {
  HoraInput,
  SelectorColacion,
  formatoHoras,
  horasTrabajadas,
} from "../../components/inputs";
import { Clock } from "lucide-react";
import AdvertenciaHorasSemana, { diasConExceso } from "./AdvertenciaHorasSemana";
import type { Asignacion, Persona } from "../../types/people.types";

const rotulo = (isoDia: string) => {
  const d = new Date(`${isoDia}T12:00:00Z`);
  return {
    dia: d
      .toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" })
      .replace(".", ""),
    num: d.getUTCDate(),
    mes: d
      .toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" })
      .replace(".", ""),
  };
};

const hhmm = (v: string | null | undefined) => v?.slice(0, 5) ?? null;

/**
 * EL HORARIO QUE LE TOCA a esa persona ese día de la semana, bajando la
 * misma escalera que el backend: su horario de ESE día > el horario
 * único de la ficha > el estándar de la casa. Gemelo de `horarioDelDia`
 * en api-rest/src/people/people.service.ts — si cambia uno, cambia el
 * otro.
 */
export const horarioHabitual = (persona: Persona | null, dia: string) => {
  const diaSemana = String(new Date(`${dia}T00:00:00Z`).getUTCDay());
  const suyo = persona?.weekly_schedule?.[diaSemana];
  return {
    in: suyo?.in ?? hhmm(persona?.default_starts_at) ?? "09:00",
    out: suyo?.out ?? hhmm(persona?.default_ends_at) ?? "19:00",
    break: suyo?.break ?? persona?.default_break_minutes ?? 60,
  };
};

/**
 * EL CALENDARIO DE UNA PERSONA — en qué días viene y a qué hora.
 *
 * Con la forma que todos ya conocen (Felipe, 15-08: "un calendario tipo
 * Google Calendar, y dentro el horario de ingreso y salida"): una
 * cuadrícula de mes, el número del día en la esquina, y el turno como
 * una píldora dentro de la celda. Antes eran barras estiradas de lado a
 * lado con la hora flotando afuera, y no se leía.
 *
 * Se pincha una celda VACÍA para agregar el día; se pincha la PÍLDORA
 * para cambiar el horario de ese día suelto. Los días libres de su
 * ficha salen en gris, pero se pueden marcar igual: es el caso de
 * "tiene libre el viernes y quiero que trabaje el viernes".
 *
 * En ámbar, los días cuyo horario NO es el que le toca — se ven de una
 * pasada sin abrir nada.
 *
 * Ojo: esto cambia SUS JORNADAS de este mes, no la regla semanal de su
 * ficha.
 */
export default function MiniCalendario({
  dias,
  persona,
  diasQueViene,
  asignaciones,
  diasEnEvento,
  guardado = false,
  editando,
  onMarcar,
  onDesmarcar,
  onEditar,
  onCambiarHorario,
  onCerrar,
  jornadasParaHoras,
  soloLectura = false,
}: {
  readonly dias: readonly string[];
  readonly persona: Persona | null;
  readonly diasQueViene: ReadonlySet<string>;
  /** Las jornadas de esa persona, para leer y ajustar su horario. */
  readonly asignaciones?: readonly Asignacion[];
  /** Los días en que esa persona está en un EVENTO. Ahí no se le pone
   *  planta: su jornada la ocupa el evento, y se avisa. */
  readonly diasEnEvento?: ReadonlySet<string>;
  /** "Guardado ✓" — se enciende un par de segundos tras cada cambio. */
  readonly guardado?: boolean;
  /** El día cuyo horario se está editando. */
  readonly editando?: string | null;
  readonly onMarcar: (dia: string) => void;
  readonly onDesmarcar: (dia: string) => void;
  readonly onEditar?: (dia: string | null) => void;
  readonly onCambiarHorario?: (
    dia: string,
    cambios: {
      starts_at?: string | null;
      ends_at?: string | null;
      break_minutes?: number | null;
    },
  ) => void;
  /** Solo donde el calendario se despliega de verdad (la casilla de
   *  Planificación). En la ficha es una pestaña: no hay nada que
   *  cerrar, y el botón no hacía nada (Felipe, 15-08). */
  readonly onCerrar?: () => void;
  /** Sus jornadas CRUDAS (sin filtro de pantalla) para sumar las horas
   *  de la semana. Si no viene, se usan las mismas `asignaciones`. */
  readonly jornadasParaHoras?: readonly Asignacion[];
  /** Abierto desde la casilla de un EVENTO: se mira, no se marca. Los
   *  días de evento se cambian en la planificación del evento (regla
   *  del 15-08); acá solo se ve en qué anda la persona (17-08). */
  readonly soloLectura?: boolean;
}) {
  const semanas: string[][] = [];
  for (let i = 0; i < dias.length; i += 7)
    semanas.push([...dias.slice(i, i + 7)]);

  const asignacionDe = (dia: string) =>
    asignaciones?.find(
      (a) => String(a.day).slice(0, 10) === dia && a.quotation_id === null,
    ) ?? null;

  /** Los eventos de esa persona ese día (puede haber más de uno). */
  const eventosDe = (dia: string) =>
    asignaciones?.filter(
      (a) => String(a.day).slice(0, 10) === dia && a.quotation_id !== null,
    ) ?? [];

  const enEdicion = editando ? asignacionDe(editando) : null;

  // EL RELOJ ROJO (Felipe, 04-09): los días extraordinarios de una
  // semana pasada de horas, marcados a la vista. Mismo cálculo que la
  // línea del editor — una sola matemática para las dos caras.
  const relojes = diasConExceso(
    persona,
    dias,
    jornadasParaHoras ?? asignaciones ?? [],
  );

  // El resumen del mes: cuántos días y cuántas horas suman.
  const marcados = [...dias].filter((d) => diasQueViene.has(d));
  const horasDelMes = marcados.reduce((t, d) => {
    const a = asignacionDe(d);
    const hab = horarioHabitual(persona, d);
    return (
      t +
      (horasTrabajadas(
        hhmm(a?.starts_at) ?? hab.in,
        hhmm(a?.ends_at) ?? hab.out,
        a?.break_minutes ?? hab.break,
      ) ?? 0)
    );
  }, 0);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {soloLectura ? "En qué anda" : "En qué días viene"}{" "}
            {persona?.name ?? ""}
          </p>
          <p className="text-xs text-gray-500">
            {marcados.length} {marcados.length === 1 ? "día" : "días"}
            <span className="mx-1 text-gray-300">·</span>
            {formatoHoras(horasDelMes)}
            {guardado && (
              <span className="ml-2 text-emerald-600 font-medium">
                Guardado ✓
              </span>
            )}
          </p>
        </div>
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Listo
          </button>
        )}
      </div>

      {/* La cuadrícula del mes. */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((n, i) => (
          <div
            key={`${n}-${String(i)}`}
            className="px-2 py-1.5 text-center text-[11px] font-medium uppercase text-gray-400"
          >
            {n}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {semanas.flatMap((semana, fi) =>
          semana.map((d, ci) => {
            const viene = diasQueViene.has(d);
            const libre = persona?.days_off?.includes(
              new Date(`${d}T00:00:00Z`).getUTCDay(),
            );
            const r = rotulo(d);
            const a = asignacionDe(d);
            const hab = horarioHabitual(persona, d);
            const entrada = hhmm(a?.starts_at) ?? hab.in;
            const salida = hhmm(a?.ends_at) ?? hab.out;
            const distinto =
              viene && (entrada !== hab.in || salida !== hab.out);
            // ÁMBAR = POR CONFIRMAR, en staff y en eventos por igual
            // (Felipe, 17-08). Y el STAFF CONFIRMADO se cierra: es un
            // refuerzo ya pactado (día, cargo, monto) y se toca desde la
            // casilla de Planificación, no desde acá. La jornada normal
            // de planta nace confirmada por diseño (es su horario, no
            // una oferta) y SIGUE editable: para eso existe este
            // calendario en su ficha.
            const porConfirmar = viene && a?.status === "por_confirmar";
            const staffCerrado =
              viene && a?.kind === "freelance" && a?.status === "confirmado";
            const primeroDelMes = r.num === 1;
            const enEvento = diasEnEvento?.has(d) ?? false;

            if (enEvento) {
              // LOS COLORES DE LA CASA (Felipe, 17-08): lila es el Staff
              // del restaurante; en un evento manda el ESTADO — verde
              // confirmado, ámbar por confirmar — igual que en la sábana.
              const evs = eventosDe(d);
              const todoConfirmado =
                evs.length > 0 && evs.every((e) => e.status === "confirmado");
              // SOLO LA CAJITA LLEVA COLOR, NUNCA EL DÍA ENTERO (Felipe,
              // 17-08: "en un calendario lleno se verá abrumante"). Si es
              // editable o no, se sabe al pasar el cursor.
              const tono = todoConfirmado
                ? { caja: "bg-emerald-50 text-emerald-900" }
                : { caja: "bg-amber-50 text-amber-900" };
              return (
                <div
                  key={d}
                  className={`min-h-[4.5rem] p-1 border-gray-100 bg-white ${
                    ci < 6 ? "border-r" : ""
                  } ${fi < semanas.length - 1 ? "border-b" : ""}`}
                >
                  <div className="flex items-start justify-between px-1">
                    <span className="text-xs tabular-nums font-semibold text-gray-900">
                      {r.num}
                      {primeroDelMes && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          {r.mes}
                        </span>
                      )}
                    </span>
                    {relojes.has(d) && (
                      <span title={relojes.get(d)}>
                        <Clock className="w-3 h-3 text-red-600" />
                      </span>
                    )}
                  </div>
                  {/* Su jornada la ocupa el evento: no se le pone planta
                      encima, para que nunca aparezca duplicada. Se ve
                      QUÉ hace y a qué hora, no solo "en evento". */}
                  {(evs.length > 0 ? evs : [null]).map((e, i) => (
                    <div
                      key={e?.id ?? i}
                      className={`mt-0.5 w-full rounded px-1 py-1 text-[11px] leading-tight cursor-default ${tono.caja}`}
                      title={
                        todoConfirmado
                          ? "Evento, confirmado. Se cambia en la planificación del evento, no acá."
                          : "Evento, por confirmar. Se cambia en la planificación del evento, no acá."
                      }
                    >
                      <span className="font-medium">
                        {e?.management_resources?.name ?? "Evento"}
                      </span>
                      {e?.starts_at && e?.ends_at && (
                        <span className="block tabular-nums opacity-80">
                          {hhmm(e.starts_at)}–{hhmm(e.ends_at)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            }

            return (
              <div
                key={d}
                className={`min-h-[4.5rem] p-1 border-gray-100 ${
                  ci < 6 ? "border-r" : ""
                } ${fi < semanas.length - 1 ? "border-b" : ""} ${
                  libre && !viene ? "bg-gray-50" : "bg-white"
                }`}
              >
                <button
                  type="button"
                  disabled={soloLectura || staffCerrado}
                  onClick={() => {
                    if (soloLectura || staffCerrado) return;
                    if (viene) onDesmarcar(d);
                    else onMarcar(d);
                  }}
                  title={
                    soloLectura
                      ? viene
                        ? "Viene al restaurante ese día"
                        : undefined
                      : staffCerrado
                        ? "Staff confirmado: se saca desde la casilla de Planificación"
                        : viene
                          ? "Quitar este día"
                          : libre
                            ? "Es su día libre — márcalo si igual viene"
                            : "Agregar este día"
                  }
                  className={`w-full flex items-start justify-between px-1 rounded group ${
                    soloLectura || staffCerrado
                      ? "cursor-default"
                      : "hover:bg-blue-50"
                  }`}
                >
                  <span
                    className={`text-xs tabular-nums flex items-center gap-1 ${
                      viene ? "font-semibold text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {r.num}
                    {primeroDelMes && (
                      <span className="ml-1 text-[10px] text-gray-400">
                        {r.mes}
                      </span>
                    )}
                    {relojes.has(d) && (
                      <span title={relojes.get(d)}>
                        <Clock className="w-3 h-3 text-red-600" />
                      </span>
                    )}
                  </span>
                  {!viene && !soloLectura && (
                    <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100">
                      +
                    </span>
                  )}
                </button>

                {viene &&
                  (onEditar && !staffCerrado ? (
                    <button
                      type="button"
                      onClick={() => onEditar(editando === d ? null : d)}
                      title={
                        porConfirmar
                          ? "Por confirmar. Cambiar el horario de este día"
                          : "Cambiar el horario de este día"
                      }
                      className={`mt-0.5 w-full rounded px-1 py-1 text-[11px] leading-tight tabular-nums text-left transition-colors ${
                        editando === d
                          ? "bg-violet-600 text-white"
                          : porConfirmar || distinto
                            ? "bg-amber-50 text-amber-900 hover:bg-amber-100"
                            : "bg-violet-50 text-violet-800 hover:bg-violet-100"
                      }`}
                    >
                      <span className="block font-medium">
                        {a?.management_resources?.name ??
                          persona?.management_resources?.name ??
                          "Staff"}
                      </span>
                      <span className="block opacity-80">
                        {entrada}–{salida}
                      </span>
                    </button>
                  ) : (
                    <div
                      className={`mt-0.5 w-full rounded px-1 py-1 text-[11px] leading-tight tabular-nums cursor-default ${
                        porConfirmar
                          ? "bg-amber-50 text-amber-900"
                          : "bg-violet-50 text-violet-800"
                      }`}
                      title={
                        staffCerrado
                          ? "Staff confirmado: se cambia desde la casilla de Planificación, no acá"
                          : porConfirmar
                            ? "Por confirmar"
                            : "Viene al restaurante ese día"
                      }
                    >
                      <span className="block font-medium">
                        {a?.management_resources?.name ??
                          persona?.management_resources?.name ??
                          "Staff"}
                      </span>
                      <span className="block opacity-80">
                        {entrada}–{salida}
                      </span>
                    </div>
                  ))}
              </div>
            );
          }),
        )}
      </div>

      {/* El editor del día suelto: se abre al pinchar su píldora. */}
      {editando && enEdicion && onCambiarHorario && (
        <div className="border-t border-blue-200 bg-blue-50/50 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">
              {rotulo(editando).dia} {rotulo(editando).num} de{" "}
              {rotulo(editando).mes}
            </span>
            <HoraInput
              value={hhmm(enEdicion.starts_at)}
              onChange={(v) => onCambiarHorario(editando, { starts_at: v })}
              compacta
              aria-label="Entrada de ese día"
            />
            <span className="text-xs text-gray-400">a</span>
            <HoraInput
              value={hhmm(enEdicion.ends_at)}
              onChange={(v) => onCambiarHorario(editando, { ends_at: v })}
              compacta
              aria-label="Salida de ese día"
            />
            <span className="text-xs text-gray-500">· colación</span>
            {/* La pieza de la casa, no una copia: es la misma colación
                que ven Planificación y Liquidación. */}
            <SelectorColacion
              value={enEdicion.break_minutes}
              onChange={(min) =>
                onCambiarHorario(editando, { break_minutes: min })
              }
            />
            <span className="ml-auto text-sm font-medium text-gray-700 tabular-nums">
              {formatoHoras(
                horasTrabajadas(
                  hhmm(enEdicion.starts_at),
                  hhmm(enEdicion.ends_at),
                  enEdicion.break_minutes,
                ),
              )}
            </span>
            <button
              type="button"
              onClick={() => onEditar?.(null)}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-white rounded"
            >
              cerrar
            </button>
          </div>
          {/* La advertencia de horas, donde se asignan las horas
              (capítulo 11): solo para jornadas de planta, solo si la
              semana queda pasada. */}
          {persona && enEdicion.kind === "planta" && (
            <div className="mt-2">
              <AdvertenciaHorasSemana
                persona={persona}
                dia={editando}
                jornadas={jornadasParaHoras ?? asignaciones ?? []}
              />
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-500 px-4 py-2 bg-gray-50 border-t border-gray-200">
        {soloLectura ? (
          <>
            Lila: restaurante. Verde: evento confirmado. Ámbar: por confirmar.
            En gris, sus días libres. Se mira desde acá; se cambia en su
            ficha o en la planificación del evento.
          </>
        ) : (
          <>
            Pincha un <strong>día vacío</strong> para agregarlo y la{" "}
            <strong>cajita</strong> para cambiar solo ese día. Lila:
            restaurante. Verde: evento confirmado. Ámbar: por confirmar, o
            con horario distinto al que le toca. En gris, sus días libres.
            Los días de evento se cambian en la planificación del evento.
          </>
        )}
      </p>
    </div>
  );
}
