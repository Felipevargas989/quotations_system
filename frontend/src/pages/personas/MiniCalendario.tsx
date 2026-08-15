import type { Persona } from "../../types/people.types";

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

/**
 * EL MINI CALENDARIO (Felipe, 15-08) — en qué días viene esa persona.
 *
 * Vive SOLO en Personal de planta: el personal de un evento viene por
 * los días del evento y ahí no se toca.
 *
 * Marcado = ese día viene. Se pincha para marcar y se vuelve a pinchar
 * para desmarcar. Sus días libres de la ficha salen apagados y con el
 * fondo rayado, pero igual se pueden marcar: es justo el caso de "tiene
 * libre el viernes y quiero que trabaje el viernes".
 *
 * Ojo: esto cambia SUS JORNADAS de este mes, no la regla semanal de su
 * ficha — un día suelto no le reescribe el horario permanente.
 */
export default function MiniCalendario({
  dias,
  persona,
  diasQueViene,
  onMarcar,
  onDesmarcar,
  onCerrar,
}: {
  readonly dias: readonly string[];
  readonly persona: Persona | null;
  readonly diasQueViene: ReadonlySet<string>;
  readonly onMarcar: (dia: string) => void;
  readonly onDesmarcar: (dia: string) => void;
  readonly onCerrar: () => void;
}) {
  // Las seis columnas de la semana chilena: domingo a sábado. El rango
  // parte en domingo, así que las filas calzan sin relleno.
  const semanas: string[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push([...dias.slice(i, i + 7)]);

  return (
    <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-600">
          En qué días viene {persona?.name ?? ""}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          listo
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
                return (
                  <td key={d} className="p-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => (viene ? onDesmarcar(d) : onMarcar(d))}
                      title={
                        libre
                          ? "Es su día libre en la ficha"
                          : `${r.dia} ${String(r.num)}`
                      }
                      className={`w-8 h-8 rounded-md text-sm tabular-nums transition-colors ${
                        viene
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : libre
                            ? "bg-gray-100 text-gray-400 border border-dashed border-gray-300 hover:bg-blue-50"
                            : "bg-white text-gray-600 border border-gray-200 hover:bg-blue-50"
                      }`}
                    >
                      {r.num}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11px] text-gray-500 mt-2">
        Azul = viene ese día. Los punteados son sus días libres de la
        ficha; márcalos igual si ese día viene.
      </p>
    </div>
  );
}

