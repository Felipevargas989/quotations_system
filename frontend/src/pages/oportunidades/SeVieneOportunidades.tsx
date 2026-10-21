import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import type { Semaforo } from "../../services/oportunidades.service";
import {
  descartarSerie,
  getCalendario,
  getLecturaDelCalendario,
  type SeViene,
} from "../../services/seViene.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { matchesSearch } from "../../utils/searchMatch";
import { RECUADRO_DEL_GRUPO } from "./coloresDeLaBandeja";
import FilaDeSeViene from "./FilaDeSeViene";
import FiltroDelSemaforo from "./FiltroDelSemaforo";
import { agruparPorMes } from "./oportunidades.utils";

// SE VIENE (doc 17 §5.3, sprint 2): lo que el mismo comprador publicó en
// años anteriores, con un nombre parecido, y que debería volver a salir en
// los próximos 90 días. Ejemplo de Felipe: "en noviembre viene el Día de
// Campo del Dirigente". Se arma con la historia de 3 años, que se carga de
// noche: las primeras semanas trae poco.
//
// Desde la decisión 62 (20-10), con el semáforo de la bandeja. Felipe:
// "deberíamos filtrar con el mismo semáforo, no tiene sentido analizar 400
// opciones". El filtro es el de la bandeja (`FiltroDelSemaforo`): las rojas
// parten apagadas. Lo que la IA todavía no lee no se muestra mientras lee
// (el motor dice cómo va); si quedó sin leer, se ve sin color. La
// prioridad, en violeta como en la bandeja (decisión 31).
//
// Desde la 63 (esa misma noche), la IA dice si se repite aunque el nombre
// cambie, y cada serie se puede descartar; las descartadas se recuperan
// desde su botón.

const CLAVE = ["oportunidades", "calendario"];

/** La prioridad de la bandeja (decisión 64): de tu rubro (verde o amarillo)
 *  y de una comuna cercana; el monto no cuenta. */
const esPrioridad = (s: SeViene) =>
  s.comuna_cercana && (s.semaforo === "verde" || s.semaforo === "amarillo");

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
  const [semaforos, setSemaforos] = useState<Semaforo[]>(["verde", "amarillo"]);
  const [busca, setBusca] = useState("");
  const [region, setRegion] = useState("");
  const [verDescartadas, setVerDescartadas] = useState(false);

  // Mientras falte algo por leer (el semáforo o si se repite), se pregunta
  // cómo va la lectura que mandó el calendario (una consulta nueva por cada
  // calendario que llega).
  const sinLeer = data.filter((s) => !s.semaforo).length;
  const pendientes = data.filter(
    (s) => !s.semaforo || s.repite === null,
  ).length;
  const { data: lectura } = useQuery({
    queryKey: [...CLAVE, "lectura", dataUpdatedAt],
    queryFn: getLecturaDelCalendario,
    enabled: pendientes > 0,
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

  // Descartar o recuperar: se anota en la lista que ya está, sin volver a
  // pedir el calendario entero.
  const descartar = useMutation({
    mutationFn: ({
      codigo,
      descartada,
    }: {
      codigo: string;
      descartada: boolean;
    }) => descartarSerie(codigo, descartada),
    onSuccess: ({ codigo, descartada }) =>
      qc.setQueryData<SeViene[]>(CLAVE, (antes) =>
        antes?.map((s) =>
          s.ultima.codigo === codigo ? { ...s, descartada } : s,
        ),
      ),
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo descartar.")),
  });

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
  const descartadas = data.filter((s) => s.descartada).length;
  const regiones = [...new Set(data.map((s) => s.region).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), "es"),
  ) as string[];
  // Todo menos el semáforo, como en la bandeja: así cada color dice cuántas
  // hay con los demás filtros puestos.
  const base = data.filter(
    (s) =>
      // Boolean: un motor de antes de la decisión 63 no trae el campo.
      Boolean(s.descartada) === verDescartadas &&
      (!region || s.region === region) &&
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
  // Como la bandeja (Felipe, 20-10: "prioridad está en una lista arriba y
  // las que no son prioridad en otra lista abajo"): la prioridad en su
  // recuadro violeta y el resto por mes, cada uno en el suyo.
  const grupos: Array<{
    clave: string;
    titulo: string;
    prioridad: boolean;
    filas: SeViene[];
  }> = [
    {
      clave: "prioridad",
      titulo: "Prioridad",
      prioridad: true,
      filas: lista.filter(esPrioridad),
    },
    ...agruparPorMes(lista.filter((s) => !esPrioridad(s))).map(
      ([mes, filas]) => ({ clave: mes, titulo: mes, prioridad: false, filas }),
    ),
  ].filter((g) => g.filas.length > 0);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Lo que el mismo comprador publicó en años anteriores y debería volver
          a salir en los próximos 90 días.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {regiones.length > 1 && (
            <div className="w-full sm:w-52">
              <SelectWithSearch
                options={[
                  { value: "", label: "Todas tus regiones" },
                  ...regiones.map((r) => ({ value: r, label: r })),
                ]}
                value={region}
                onChange={(v) => setRegion(v)}
                sinLimpiar
                mostrarConteo={false}
                tamano="sm"
              />
            </div>
          )}
          <FiltroDelSemaforo
            seleccion={semaforos}
            onCambiar={setSemaforos}
            porSemaforo={porSemaforo}
            busca={busca}
            onBuscar={setBusca}
          />
          {(descartadas > 0 || verDescartadas) && (
            <button
              type="button"
              aria-pressed={verDescartadas}
              onClick={() => setVerDescartadas((v) => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${
                verDescartadas
                  ? "border-gray-400 bg-gray-100 text-gray-900 font-semibold"
                  : "border-gray-200 bg-white text-gray-500 hover:text-gray-900"
              }`}
            >
              {verDescartadas
                ? "Volver a lo que se viene"
                : `Descartadas (${descartadas})`}
            </button>
          )}
        </div>
      </div>

      {(lectura?.leyendo || (sinLeer > 0 && !lectura)) && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          La IA está revisando lo que se viene (el semáforo y si se repite)
          {lectura?.total ? `: van ${lectura.leidas} de ${lectura.total}` : ""}.
          Tarda unos minutos la primera vez y queda guardado.
        </p>
      )}

      {lista.length === 0 ? (
        leyendo ? null : (
          <p className="py-6 text-center text-sm text-gray-500">
            {data.length === 0
              ? "Todavía no hay nada que anunciar. El calendario se arma con la historia de 3 años, que se va cargando de noche."
              : verDescartadas
                ? "No hay descartadas con esos filtros."
                : "Nada con esos filtros."}
          </p>
        )
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => {
            const colores =
              RECUADRO_DEL_GRUPO[g.prioridad ? "prioridad" : "otro"];
            const Icono = g.prioridad ? Star : CalendarDays;
            return (
              <section
                key={g.clave}
                className={`overflow-hidden rounded-lg border bg-white ${colores.recuadro}`}
              >
                <h3
                  title={
                    g.prioridad
                      ? "De tu rubro y de una comuna cercana"
                      : undefined
                  }
                  className={`flex items-center gap-1.5 px-3 py-2 border-b text-xs font-semibold uppercase tracking-wide ${colores.titulo}`}
                >
                  <Icono size={14} />
                  {g.titulo} ({g.filas.length})
                </h3>
                <ul className="divide-y divide-gray-200">
                  {g.filas.map((s) => (
                    <FilaDeSeViene
                      key={`${s.ultima.codigo}-${s.esperada}`}
                      s={s}
                      ocupado={
                        descartar.isPending &&
                        descartar.variables?.codigo === s.ultima.codigo
                      }
                      onDescartar={(descartada) =>
                        descartar.mutate({
                          codigo: s.ultima.codigo,
                          descartada,
                        })
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
