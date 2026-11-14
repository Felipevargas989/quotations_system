import { useQuery } from "@tanstack/react-query";
import { getLecturaSola } from "../../services/lectura-sola.service";
import { textoDeCosto } from "./oportunidades.utils";

// «BASES LEÍDAS SOLAS» (decisión 131, 12-11). Felipe quiere ver a diario lo
// que gasta la lectura sola de las bases sin gastar nada en mirarlo: es una
// consulta a la base, sin IA. Hoy y los últimos 7 días, en hora de Chile.
// Desde la decisión 132 cuenta la lectura corta de cada pasada (y lo que leyó
// Opus solo hasta el 12-11). Partió como un cuadro al lado de «Revisar
// ahora»; Felipe, el 14-11: "se ve feo ahí". Ahora es una línea más del
// estado del radar, con su mismo estilo, bajo «Al día…».

export default function GastoDeLaLecturaSola() {
  const { data } = useQuery({
    queryKey: ["oportunidades", "lectura-sola"],
    queryFn: getLecturaSola,
    refetchInterval: 5 * 60_000,
  });
  if (!data) return null;
  return (
    <div className="whitespace-nowrap">
      Bases leídas solas: hoy {data.hoy.bases} ({textoDeCosto(data.hoy.usd)}) ·
      7 días {data.semana.bases} ({textoDeCosto(data.semana.usd)})
    </div>
  );
}
