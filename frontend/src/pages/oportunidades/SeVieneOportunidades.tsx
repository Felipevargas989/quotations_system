import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { getCalendario } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import Ganadores from "./Ganadores";
import {
  agruparPorMes,
  textoDeAnios,
  urlMercadoPublico,
} from "./oportunidades.utils";

// SE VIENE (doc 17 §5.3, sprint 2): lo que el mismo comprador publicó en
// años anteriores, con un nombre parecido, y que debería volver a salir en
// los próximos 90 días. Ejemplo de Felipe: "en noviembre viene el Día de
// Campo del Dirigente". Se arma con la historia de 3 años, que se carga de
// noche: las primeras semanas trae poco.

export default function SeVieneOportunidades() {
  const {
    data = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["oportunidades", "calendario"],
    queryFn: getCalendario,
    staleTime: 5 * 60 * 1000,
  });
  const [soloPrioridad, setSoloPrioridad] = useState(false);

  if (isPending) {
    return <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-red-600">
        No se pudo armar el calendario.
      </p>
    );
  }

  const lista = soloPrioridad
    ? data.filter((s) => s.comuna_cercana || s.alto_valor)
    : data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Lo que el mismo comprador publicó en años anteriores y debería volver
          a salir en los próximos 90 días.
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={soloPrioridad}
            onChange={(e) => setSoloPrioridad(e.target.checked)}
            className="rounded border-gray-300"
          />
          Solo comuna cercana o alto valor
        </label>
      </div>

      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Todavía no hay nada que anunciar. El calendario se arma con la
          historia de 3 años, que se va cargando de noche.
        </p>
      ) : (
        agruparPorMes(lista).map(([mes, items]) => (
          <section key={mes} className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">{mes}</h3>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {items.map((s) => (
                <li
                  key={`${s.ultima.codigo}-${s.esperada}`}
                  className="p-3 space-y-1"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {s.nombre}
                      {(s.comuna_cercana || s.alto_valor) && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
                          Prioridad
                        </span>
                      )}
                    </p>
                    <p
                      className={`text-xs ${
                        s.atrasada
                          ? "font-semibold text-amber-700"
                          : "text-gray-500"
                      }`}
                    >
                      {s.atrasada
                        ? `Debía salir cerca del ${formatMomento(s.esperada, "diaMes")} y todavía no aparece`
                        : `Se espera cerca del ${formatMomento(s.esperada, "diaMes")}`}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {[s.organismo, s.comuna].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-sm text-gray-700">
                    {textoDeAnios(s.anios)}. La última vez (
                    {formatMomento(s.ultima.fecha_publicacion, "medio")}){" "}
                    {s.ultima.ganadores.length > 0 ? (
                      <>
                        ganó <Ganadores ganadores={s.ultima.ganadores} />
                      </>
                    ) : s.ultima.monto ? (
                      `tenía ${formatCurrency(s.ultima.monto, "CLP")} de presupuesto`
                    ) : (
                      "no informó ganador"
                    )}
                    {s.ultima.oferentes != null &&
                      ` · ${s.ultima.oferentes} ${s.ultima.oferentes === 1 ? "oferta" : "ofertas"}`}
                    {" · "}
                    <a
                      href={urlMercadoPublico(s.ultima.codigo, "licitacion")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                    >
                      {s.ultima.codigo}
                      <ExternalLink size={12} />
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
