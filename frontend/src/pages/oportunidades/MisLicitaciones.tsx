import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { separarMias } from "./oportunidades.utils";
import TarjetaDeLicitacion from "./TarjetaDeLicitacion";
import { useMisLicitaciones } from "./useMisLicitaciones";

// "MIS LICITACIONES" (Felipe, 17-10: "¿dónde van a quedar compiladas las
// que sí me interesan para luego trabajarlas?"). Las que marcaste «Me
// interesa», con el avance de cada una. Al pinchar una se abre su ficha,
// donde se trabaja. Desde el 19-10 en dos listas (Felipe: "ya postuladas
// abajo y de algún color diferente para saber que están listas"): por
// postular, por vencimiento, y las postuladas aparte, en verde. Desde el
// 28-10 las ganadas tienen su pestaña (decisión 100): aquí, al final y
// plegadas, quedan solo las perdidas.

export default function MisLicitaciones() {
  const { data: lista = [], isPending, isError } = useMisLicitaciones();
  const { porPostular, postuladas, perdidas } = separarMias(lista);
  const [verPerdidas, setVerPerdidas] = useState(false);

  if (isPending) {
    return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError) {
    return (
      <p className="py-10 text-center text-sm text-red-600">
        No se pudieron cargar tus licitaciones. Intenta de nuevo en un rato.
      </p>
    );
  }
  if (lista.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Todavía no marcas ninguna. En la Bandeja, pincha una licitación y elige
        «Me interesa»: queda aquí para trabajarla.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Encabezado
          titulo={`Por postular (${porPostular.length})`}
          detalle="De la que vence antes a la que vence después."
        />
        {porPostular.length > 0 ? (
          <ul className="space-y-3">
            {porPostular.map((m) => (
              <TarjetaDeLicitacion key={m.id} m={m} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Nada por postular.</p>
        )}
      </div>
      {postuladas.length > 0 && (
        <div className="space-y-3">
          <Encabezado
            titulo={`Postuladas (${postuladas.length})`}
            detalle="Listas: ahora a esperar el resultado."
          />
          <ul className="space-y-3">
            {postuladas.map((m) => (
              <TarjetaDeLicitacion key={m.id} m={m} lista />
            ))}
          </ul>
        </div>
      )}
      {perdidas.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setVerPerdidas((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"
          >
            {verPerdidas ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            Perdidas ({perdidas.length})
          </button>
          {verPerdidas && (
            <ul className="space-y-3">
              {perdidas.map((m) => (
                <TarjetaDeLicitacion key={m.id} m={m} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Encabezado({
  titulo,
  detalle,
}: {
  readonly titulo: string;
  readonly detalle: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      <p className="text-xs text-gray-500">{detalle}</p>
    </div>
  );
}
