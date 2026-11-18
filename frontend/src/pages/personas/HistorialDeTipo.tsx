import type { Persona } from "../../types/people.types";
import {
  formatFechaEvento,
  formatMomento,
  hoyEnChile,
} from "../../utils/dates";
import {
  chipTipoPersona,
  etiquetaTipoPersona,
} from "../../utils/estadoPersona";
import { historialReciente } from "./tipoVigente";

// EL HISTORIAL DE TIPO (doc 10 §12, 17-11-2026)
//
// Cada cambio entre planta y freelance queda a la vista en la ficha: a qué
// tipo pasó, desde qué día, quién lo registró y cuándo. Lo más nuevo
// arriba; lo que todavía no rige, en ámbar con «Pendiente».

export default function HistorialDeTipo({
  persona,
}: {
  readonly persona: Pick<Persona, "historial_tipo">;
}) {
  const cambios = historialReciente(persona.historial_tipo);
  const hoy = hoyEnChile();

  return (
    <section className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-900">Historial de tipo</h3>
      {cambios.length === 0 ? (
        <p className="text-sm text-gray-500 mt-1">Sin cambios de tipo.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {cambios.map((c) => {
            const pendiente = c.desde.slice(0, 10) > hoy;
            return (
              <li
                key={`${c.id ?? ""}-${c.desde}-${c.registrado_en ?? ""}`}
                className="py-2 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(c.kind)}`}
                    >
                      {etiquetaTipoPersona(c.kind)}
                    </span>
                    <span className="text-gray-900">
                      desde el{" "}
                      <strong>{formatFechaEvento(c.desde, "medio")}</strong>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Antes {etiquetaTipoPersona(c.anterior).toLowerCase()} ·
                    registró {c.registrado_por_nombre || "—"} ·{" "}
                    {formatMomento(c.registrado_en, "diaHora")}
                  </p>
                </div>
                {pendiente && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    Pendiente
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
