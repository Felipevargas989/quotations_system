import { HoraInput, formatoHoras, horasTrabajadas } from "../../components/inputs";
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
  editando,
  onMarcar,
  onDesmarcar,
  onEditar,
  onCambiarHorario,
  onCerrar,
}: {
  readonly dias: readonly string[];
  readonly persona: Persona | null;
  readonly diasQueViene: ReadonlySet<string>;
  /** Las jornadas de esa persona, para leer y ajustar su horario. */
  readonly asignaciones?: readonly Asignacion[];
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
  readonly onCerrar: () => void;
}) {
  const semanas: string[][] = [];
  for (let i = 0; i < dias.length; i += 7)
    semanas.push([...dias.slice(i, i + 7)]);

  const asignacionDe = (dia: string) =>
    asignaciones?.find(
      (a) => String(a.day).slice(0, 10) === dia && a.quotation_id === null,
    ) ?? null;

  const enEdicion = editando ? asignacionDe(editando) : null;

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
            En qué días viene {persona?.name ?? ""}
          </p>
          <p className="text-xs text-gray-500">
            {marcados.length} {marcados.length === 1 ? "día" : "días"}
            <span className="mx-1 text-gray-300">·</span>
            {formatoHoras(horasDelMes)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Listo
        </button>
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
            const primeroDelMes = r.num === 1;

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
                  onClick={() => {
                    if (viene) onDesmarcar(d);
                    else onMarcar(d);
                  }}
                  title={
                    viene
                      ? "Quitar este día"
                      : libre
                        ? "Es su día libre — márcalo si igual viene"
                        : "Agregar este día"
                  }
                  className="w-full flex items-start justify-between px-1 rounded hover:bg-blue-50 group"
                >
                  <span
                    className={`text-xs tabular-nums ${
                      viene ? "font-semibold text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {r.num}
                    {primeroDelMes && (
                      <span className="ml-1 text-[10px] text-gray-400">
                        {r.mes}
                      </span>
                    )}
                  </span>
                  {!viene && (
                    <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100">
                      +
                    </span>
                  )}
                </button>

                {viene &&
                  (onEditar ? (
                    <button
                      type="button"
                      onClick={() => onEditar(editando === d ? null : d)}
                      title="Cambiar el horario de este día"
                      className={`mt-0.5 w-full rounded px-1 py-1 text-[11px] leading-tight tabular-nums text-left transition-colors ${
                        editando === d
                          ? "bg-blue-600 text-white"
                          : distinto
                            ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                            : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                      }`}
                    >
                      {entrada}
                      <br />
                      {salida}
                    </button>
                  ) : (
                    <div className="mt-0.5 w-full rounded px-1 py-1 text-[11px] leading-tight tabular-nums bg-blue-50 text-blue-800">
                      {entrada}
                      <br />
                      {salida}
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
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs bg-white">
              {([0, 30, 60] as const).map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() =>
                    onCambiarHorario(editando, { break_minutes: min })
                  }
                  className={`px-1.5 py-0.5 ${
                    (enEdicion.break_minutes ?? 0) === min
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {min === 0 ? "—" : min === 30 ? "30 m" : "1 h"}
                </button>
              ))}
            </div>
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
        </div>
      )}

      <p className="text-[11px] text-gray-500 px-4 py-2 bg-gray-50 border-t border-gray-200">
        Pincha un <strong>día vacío</strong> para agregarlo y el{" "}
        <strong>horario</strong> para cambiar solo ese día. En ámbar, los días
        con horario distinto al que le toca. En gris, sus días libres.
      </p>
    </div>
  );
}
