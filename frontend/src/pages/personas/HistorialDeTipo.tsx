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
import { historialReciente, lineaDeOrigen } from "./tipoVigente";

// EL HISTORIAL DE TIPO (doc 10 §12, 17-11-2026)
//
// Cada cambio entre planta y freelance queda a la vista en la ficha: a qué
// tipo pasó, desde qué día, quién lo registró y cuándo. Lo más nuevo
// arriba; lo que todavía no rige, en ámbar con «Pendiente».
//
// Desde el 19-11-2026 (§12.1) nunca se ve vacío: al final va la línea de
// origen, derivada y sin escribir nada («Planta · desde que empezó en el
// sistema»). Felipe: "la gente de planta toda está (a excepción de Sofía)
// desde que empezamos con el sistema". Sin historial, junto a ella va
// «Anotar desde cuándo», que abre la ventana «Desde» en su modo nuevo.

export default function HistorialDeTipo({
  persona,
  onAnotarDesde,
}: {
  readonly persona: Pick<Persona, "historial_tipo" | "default_kind">;
  /** Sin historial: abre la ventana para anotar desde cuándo. */
  readonly onAnotarDesde?: () => void;
}) {
  const cambios = historialReciente(persona.historial_tipo);
  const origen = lineaDeOrigen(persona);
  const hoy = hoyEnChile();

  return (
    <section className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-900">Historial de tipo</h3>
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
        <li
          className="py-2 flex items-start justify-between gap-3"
          data-testid="linea-de-origen"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(origen.kind)}`}
              >
                {etiquetaTipoPersona(origen.kind)}
              </span>
              <span className="text-gray-900">
                desde que empezó en el sistema
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {origen.hasta
                ? `Hasta el cambio del ${formatFechaEvento(origen.hasta, "medio")}`
                : "Sin cambios registrados"}
            </p>
          </div>
          {!origen.hasta && onAnotarDesde && (
            <button
              type="button"
              onClick={onAnotarDesde}
              className="shrink-0 text-xs text-blue-700 hover:text-blue-900 hover:underline"
            >
              Anotar desde cuándo
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}
