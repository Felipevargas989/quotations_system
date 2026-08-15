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
 * EL MINI CALENDARIO (Felipe, 15-08) — en qué días viene esa persona y
 * a qué hora.
 *
 * Marcado = ese día viene. Se pincha el NÚMERO para marcar y desmarcar;
 * se pincha la HORA de abajo para ajustar ese día suelto. Sus días
 * libres de la ficha salen apagados y punteados, pero igual se pueden
 * marcar: es el caso de "tiene libre el viernes y quiero que trabaje el
 * viernes".
 *
 * Los días con un horario DISTINTO al habitual salen destacados, para
 * que se vean de un vistazo sin abrir nada.
 *
 * Ojo: esto cambia SUS JORNADAS de este mes, no la regla semanal de su
 * ficha — un día suelto no le reescribe el horario permanente.
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
    cambios: { starts_at?: string | null; ends_at?: string | null; break_minutes?: number | null },
  ) => void;
  readonly onCerrar: () => void;
}) {
  // Las filas de la semana chilena: domingo a sábado. El rango parte en
  // domingo, así que calzan sin relleno.
  const semanas: string[][] = [];
  for (let i = 0; i < dias.length; i += 7)
    semanas.push([...dias.slice(i, i + 7)]);

  const asignacionDe = (dia: string) =>
    asignaciones?.find(
      (a) => String(a.day).slice(0, 10) === dia && a.quotation_id === null,
    ) ?? null;

  const enEdicion = editando ? asignacionDe(editando) : null;

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          En qué días viene {persona?.name ?? ""}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Listo
        </button>
      </div>

      <table className="w-full">
        <thead>
          <tr>
            {["D", "L", "M", "M", "J", "V", "S"].map((letra, i) => (
              <th
                key={`${letra}-${String(i)}`}
                className="text-[11px] font-medium text-gray-400 pb-1"
              >
                {letra}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana) => (
            <tr key={semana[0]}>
              {semana.map((d) => {
                const viene = diasQueViene.has(d);
                const libre = persona?.days_off?.includes(
                  new Date(`${d}T00:00:00Z`).getUTCDay(),
                );
                const r = rotulo(d);
                const a = asignacionDe(d);
                const hab = horarioHabitual(persona, d);
                const entrada = hhmm(a?.starts_at) ?? hab.in;
                const salida = hhmm(a?.ends_at) ?? hab.out;
                // Un día con horario distinto al que le toca se destaca.
                const distinto =
                  viene && (entrada !== hab.in || salida !== hab.out);
                return (
                  <td key={d} className="p-0.5 align-top">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (viene) onDesmarcar(d);
                          else onMarcar(d);
                        }}
                        title={
                          libre
                            ? "Es su día libre en la ficha"
                            : `${r.dia} ${String(r.num)}`
                        }
                        className={`w-full h-8 rounded-md text-sm tabular-nums transition-colors ${
                          viene
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : libre
                              ? "bg-gray-100 text-gray-400 border border-dashed border-gray-300 hover:bg-blue-50"
                              : "bg-white text-gray-600 border border-gray-200 hover:bg-blue-50"
                        }`}
                      >
                        {r.num}
                      </button>
                      {viene &&
                        (onEditar ? (
                          <button
                            type="button"
                            onClick={() =>
                              onEditar(editando === d ? null : d)
                            }
                            title="Cambiar el horario de este día"
                            className={`w-full text-[10px] leading-tight tabular-nums rounded px-0.5 py-0.5 ${
                              editando === d
                                ? "bg-blue-100 text-blue-800"
                                : distinto
                                  ? "bg-amber-100 text-amber-800 font-medium hover:bg-amber-200"
                                  : "text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {entrada.slice(0, 5)}–{salida.slice(0, 5)}
                          </button>
                        ) : (
                          <span className="text-[10px] leading-tight tabular-nums text-gray-500">
                            {entrada.slice(0, 5)}–{salida.slice(0, 5)}
                          </span>
                        ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* El editor del día suelto: se abre al pinchar su hora. */}
      {editando && enEdicion && onCambiarHorario && (
        <div className="mt-3 bg-white border border-blue-200 rounded-lg p-3">
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
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
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
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            >
              cerrar
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-500 mt-2">
        Azul = viene ese día. Pincha el <strong>número</strong> para marcar o
        desmarcar, y la <strong>hora</strong> para cambiar solo ese día. En
        ámbar, los días con horario distinto al suyo. Los punteados son sus
        días libres de la ficha.
      </p>
    </div>
  );
}
