import { Trophy } from "lucide-react";
import { hoyEnChile } from "../../utils/dates";
import { separarGanadas } from "./servicioDeLaGanada";
import { separarMias } from "./oportunidades.utils";
import TarjetaDeLicitacion from "./TarjetaDeLicitacion";
import { useMisLicitaciones } from "./useMisLicitaciones";

// «GANADAS» (decisión 100 del doc 17, 28-10), al lado de «Mis
// licitaciones». Felipe: "las ganadas deberían estar en alguna parte más
// visible, para que no se me...". Arriba, por cumplir, en dorado y con
// cuándo es el servicio; abajo, las cumplidas. La misma consulta que «Mis
// licitaciones».

export default function Ganadas() {
  const { data: lista = [], isPending, isError } = useMisLicitaciones();

  if (isPending) {
    return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError) {
    return (
      <p className="py-10 text-center text-sm text-red-600">
        No se pudieron cargar tus ganadas. Intenta de nuevo en un rato.
      </p>
    );
  }
  const { porCumplir, cumplidas } = separarGanadas(
    separarMias(lista).ganadas,
    hoyEnChile(),
  );
  if (porCumplir.length + cumplidas.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Todavía no ganas ninguna. Cuando una postulada sale ganada, queda aquí
        con la fecha del servicio.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Trophy size={16} className="text-amber-600" />
            Por cumplir ({porCumplir.length})
          </h3>
          <p className="text-xs text-gray-500">
            Lo que ganaste, con la fecha del servicio.
          </p>
        </div>
        {porCumplir.length > 0 ? (
          <ul className="space-y-3">
            {porCumplir.map((m) => (
              <TarjetaDeLicitacion key={m.id} m={m} ganada="por_cumplir" />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Nada por cumplir.</p>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Cumplidas ({cumplidas.length})
          </h3>
          <p className="text-xs text-gray-500">
            {cumplidas.length > 0
              ? "Desde el día siguiente del servicio."
              : "Todavía ninguna. Aquí quedan desde el día siguiente del servicio."}
          </p>
        </div>
        {cumplidas.length > 0 && (
          <ul className="space-y-3">
            {cumplidas.map((m) => (
              <TarjetaDeLicitacion key={m.id} m={m} ganada="cumplida" />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
