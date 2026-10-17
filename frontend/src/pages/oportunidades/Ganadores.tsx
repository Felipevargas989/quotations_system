import { Link } from "react-router-dom";
import type { GanadorDeProceso } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { urlCompetidor } from "./oportunidades.utils";

/** "SOL DE QUILLON SPA por $12.000.000": con RUT, el nombre lleva a la
 *  ficha del competidor. */
export default function Ganadores({
  ganadores,
}: {
  readonly ganadores: GanadorDeProceso[];
}) {
  if (ganadores.length === 0) return <span>sin ganador informado</span>;
  return (
    <>
      {ganadores.map((g, i) => (
        <span key={`${g.rut ?? g.nombre}-${i}`}>
          {i > 0 && ", "}
          {g.rut ? (
            <Link
              to={urlCompetidor(g.rut)}
              className="font-semibold text-blue-700 hover:underline"
            >
              {g.nombre}
            </Link>
          ) : (
            <span className="font-semibold">{g.nombre}</span>
          )}
          {g.monto != null && ` por ${formatCurrency(g.monto, "CLP")}`}
        </span>
      ))}
    </>
  );
}
