import { Loader2 } from "lucide-react";
import type {
  Generacion,
  TipoDeGeneracion,
} from "../../services/oportunidades.service";
import { formatMomento } from "../../utils/dates";
import { TEXTOS_DE_GENERACION, textoDeCosto } from "./oportunidades.utils";

// CÓMO VA UN TRABAJO DE LA IA (doc 17, sprint 3, paso 4): trabajando, lo
// que hizo (cada documento con lo que falta completar) o por qué no
// resultó. Lo que entregó y no pasó la revisión del motor queda a la vista
// con su motivo.

export default function EstadoDeGeneracion({
  tipo,
  generacion,
}: {
  readonly tipo: TipoDeGeneracion;
  readonly generacion: Generacion | null | undefined;
}) {
  if (!generacion) return null;
  const textos = TEXTOS_DE_GENERACION[tipo];

  if (generacion.estado === "procesando") {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <Loader2 size={14} className="animate-spin" /> {textos.trabajando}
      </p>
    );
  }

  const r = generacion.resultado;
  return (
    <div className="space-y-2">
      {generacion.estado === "error" && (
        <p className="text-sm text-red-600">{generacion.error}</p>
      )}
      {r?.resumen && <p className="text-sm text-gray-700">{r.resumen}</p>}

      {r && r.documentos.length > 0 && (
        <ul className="space-y-1.5">
          {r.documentos.map((d) => (
            <li
              key={d.adjunto_id}
              className="rounded-lg border border-gray-200 px-3 py-2"
            >
              <p className="text-sm font-medium text-gray-900">{d.nombre}</p>
              {d.que_se_hizo && (
                <p className="text-xs text-gray-500">{d.que_se_hizo}</p>
              )}
              {d.pendientes.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-800 space-y-0.5">
                  {d.pendientes.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {r && r.pendientes.length > 0 && (
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-900">
            Lo que te toca completar
          </p>
          <ul className="list-disc pl-5 text-xs text-amber-900 space-y-0.5">
            {r.pendientes.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {r && r.descartados.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700 space-y-0.5">
          {r.descartados.map((d) => (
            <li key={d.nombre}>
              {d.nombre}: {d.motivo}
            </li>
          ))}
        </ul>
      )}

      {r && r.no_entregados.length > 0 && (
        <p className="text-xs text-gray-500">
          No entregó: {r.no_entregados.join(", ")}
        </p>
      )}

      <p className="text-xs text-gray-400">
        {generacion.estado === "listo" ? "Hecho" : "Intentado"} el{" "}
        {formatMomento(
          generacion.terminado_en ?? generacion.creado_en,
          "diaHora",
        )}
        {generacion.costo_usd != null &&
          ` · costó ${textoDeCosto(generacion.costo_usd)}`}
        {generacion.no_leidos.length > 0 &&
          ` · no usó: ${generacion.no_leidos.map((n) => `${n.nombre} (${n.motivo})`).join(", ")}`}
      </p>
    </div>
  );
}
