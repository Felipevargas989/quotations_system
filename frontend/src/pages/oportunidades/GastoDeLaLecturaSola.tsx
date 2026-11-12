import { useQuery } from "@tanstack/react-query";
import { getLecturaSola } from "../../services/lectura-sola.service";
import { textoDeCosto } from "./oportunidades.utils";

// «BASES LEÍDAS SOLAS» (decisión 131, 12-11). Felipe quiere ver a diario lo
// que gasta la lectura sola de las bases sin gastar nada en mirarlo: es una
// consulta a la base, sin IA. Va bajo «Revisar ahora», donde ya mira cuándo
// se revisó. Hoy y los últimos 7 días, en hora de Chile. Desde la decisión
// 132 cuenta la lectura corta de cada pasada (y lo que leyó Opus
// solo hasta el 12-11).

export default function GastoDeLaLecturaSola() {
  const { data } = useQuery({
    queryKey: ["oportunidades", "lectura-sola"],
    queryFn: getLecturaSola,
    refetchInterval: 5 * 60_000,
  });
  if (!data) return null;
  const filas = [
    { cuando: "Hoy", ...data.hoy },
    { cuando: "7 días", ...data.semana },
  ];
  return (
    <div className="inline-block mt-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left">
      <p className="text-xs font-semibold text-emerald-800">
        Bases leídas solas
      </p>
      <table className="mt-1 text-xs text-gray-700">
        <tbody>
          {filas.map((f) => (
            <tr key={f.cuando}>
              <td className="pr-3 text-gray-500">{f.cuando}</td>
              <td className="pr-3 text-right font-semibold tabular-nums text-gray-900">
                {f.bases}
              </td>
              <td className="text-right tabular-nums">{textoDeCosto(f.usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
