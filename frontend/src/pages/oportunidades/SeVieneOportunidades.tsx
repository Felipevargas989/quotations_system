import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Semaforo } from "../../services/oportunidades.service";
import {
  getCalendario,
  getLecturaDelCalendario,
  type SeViene,
} from "../../services/seViene.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import { matchesSearch } from "../../utils/searchMatch";
import {
  filaDelSemaforo,
  NOMBRE_DEL_SEMAFORO,
  RAZON_DE_PRIORIDAD,
} from "./coloresDeLaBandeja";
import FiltroDelSemaforo from "./FiltroDelSemaforo";
import Ganadores from "./Ganadores";
import {
  agruparPorMes,
  ALERTAS,
  textoDeAnios,
  urlMercadoPublico,
} from "./oportunidades.utils";

// SE VIENE (doc 17 §5.3, sprint 2): lo que el mismo comprador publicó en
// años anteriores, con un nombre parecido, y que debería volver a salir en
// los próximos 90 días. Ejemplo de Felipe: "en noviembre viene el Día de
// Campo del Dirigente". Se arma con la historia de 3 años, que se carga de
// noche: las primeras semanas trae poco.
//
// Desde la decisión 62 (20-10), con el semáforo de la bandeja. Felipe:
// "deberíamos filtrar con el mismo semáforo, no tiene sentido analizar 400
// opciones". Se ven las verdes y las amarillas, con su franja y su razón;
// las rojas, solo si se piden. Lo que la IA todavía no lee no se muestra
// mientras lee (el motor dice cómo va); si quedó sin leer, se ve sin color.
// La prioridad, en violeta como en la bandeja (decisión 31): el amarillo es
// del semáforo. El filtro es el de la bandeja (`FiltroDelSemaforo`; Felipe:
// "sería bueno que este filtro sea el mismo, con verdes, amarillas, rojas y
// buscador"): las rojas parten apagadas.

const CLAVE = ["oportunidades", "calendario"];

const esPrioridad = (s: SeViene) => s.comuna_cercana || s.alto_valor;

export default function SeVieneOportunidades() {
  const qc = useQueryClient();
  const {
    data = [],
    dataUpdatedAt,
    isFetching,
    isPending,
    isError,
  } = useQuery({
    queryKey: CLAVE,
    queryFn: getCalendario,
    staleTime: 5 * 60 * 1000,
  });
  const [soloPrioridad, setSoloPrioridad] = useState(false);
  const [semaforos, setSemaforos] = useState<Semaforo[]>(["verde", "amarillo"]);
  const [busca, setBusca] = useState("");

  // Mientras falten por leer, se pregunta cómo va la lectura que mandó el
  // calendario (una consulta nueva por cada calendario que llega).
  const sinLeer = data.filter((s) => !s.semaforo).length;
  const { data: lectura } = useQuery({
    queryKey: [...CLAVE, "lectura", dataUpdatedAt],
    queryFn: getLecturaDelCalendario,
    enabled: sinLeer > 0,
    refetchInterval: (q) => (q.state.data?.leyendo === false ? false : 5000),
  });
  // Cuando termina, el calendario otra vez: ahí vienen los colores.
  const estabaLeyendo = useRef(false);
  useEffect(() => {
    if (lectura?.leyendo) {
      estabaLeyendo.current = true;
    } else if (lectura && estabaLeyendo.current) {
      estabaLeyendo.current = false;
      void qc.invalidateQueries({ queryKey: CLAVE, exact: true });
    }
  }, [lectura, qc]);

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

  // Recién terminada, sigue «leyendo» hasta que llega el calendario nuevo:
  // si no, lo sin leer se asoma un instante antes de tener su color.
  const leyendo = sinLeer > 0 && (lectura?.leyendo !== false || isFetching);
  // Todo menos el semáforo, como en la bandeja: así cada color dice cuántas
  // hay con los demás filtros puestos.
  const base = data.filter(
    (s) =>
      (!soloPrioridad || esPrioridad(s)) &&
      matchesSearch(busca, s.nombre, s.organismo, s.comuna, s.ultima.codigo),
  );
  const porSemaforo: Record<Semaforo, number> = {
    verde: 0,
    amarillo: 0,
    rojo: 0,
  };
  for (const s of base) if (s.semaforo) porSemaforo[s.semaforo]++;
  const lista = base.filter((s) =>
    s.semaforo ? semaforos.includes(s.semaforo) : !leyendo,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Lo que el mismo comprador publicó en años anteriores y debería volver
          a salir en los próximos 90 días.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroDelSemaforo
            seleccion={semaforos}
            onCambiar={setSemaforos}
            porSemaforo={porSemaforo}
            busca={busca}
            onBuscar={setBusca}
          />
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
      </div>

      {leyendo && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          La IA le está poniendo el semáforo a lo que se viene
          {lectura?.total ? `: van ${lectura.leidas} de ${lectura.total}` : ""}.
          Tarda unos minutos la primera vez y queda guardado.
        </p>
      )}

      {lista.length === 0 ? (
        leyendo ? null : (
          <p className="py-6 text-center text-sm text-gray-500">
            {data.length === 0
              ? "Todavía no hay nada que anunciar. El calendario se arma con la historia de 3 años, que se va cargando de noche."
              : "Nada con esos filtros."}
          </p>
        )
      ) : (
        agruparPorMes(lista).map(([mes, items]) => (
          <section key={mes} className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">{mes}</h3>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {items.map((s) => (
                <li
                  key={`${s.ultima.codigo}-${s.esperada}`}
                  data-semaforo={s.semaforo ?? "sin_leer"}
                  className={`p-3 space-y-1 border-l-4 ${filaDelSemaforo(s.semaforo)}`}
                >
                  <span className="sr-only">
                    {s.semaforo ? NOMBRE_DEL_SEMAFORO[s.semaforo] : "Sin leer"}
                    .{" "}
                  </span>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {s.nombre}
                    </p>
                    <p
                      className={`text-xs ${
                        s.atrasada
                          ? "inline-flex items-center gap-1 font-semibold text-gray-900"
                          : "text-gray-500"
                      }`}
                    >
                      {s.atrasada && <AlarmClock size={12} aria-hidden />}
                      {s.atrasada
                        ? `Debía salir cerca del ${formatMomento(s.esperada, "diaMes")} y todavía no aparece`
                        : `Se espera cerca del ${formatMomento(s.esperada, "diaMes")}`}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {[s.organismo, s.comuna].filter(Boolean).join(" · ")}
                  </p>
                  {s.razon && (
                    <p className="text-sm text-gray-700">{s.razon}</p>
                  )}
                  {!s.semaforo && (
                    <p className="text-xs text-gray-500">
                      La IA no pudo leerla todavía: se reintenta en una hora.
                    </p>
                  )}
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
                  {esPrioridad(s) && (
                    <div className="flex flex-wrap gap-1.5">
                      {(["comuna_cercana", "alto_valor"] as const)
                        .filter((a) => s[a])
                        .map((a) => (
                          <span
                            key={a}
                            className={`px-2 py-0.5 text-xs rounded ${RAZON_DE_PRIORIDAD}`}
                          >
                            {ALERTAS[a]}
                          </span>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
