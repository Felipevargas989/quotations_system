import { AlertTriangle } from "lucide-react";
import type {
  LineaComparada,
  OferenteComparado,
} from "../../services/comparacion.service";
import Plegable from "./Plegable";
import {
  aLaLetra,
  type Desenlace,
  enOrden,
  loQueLoDecide,
  nombreCorto,
  siAceptanTodo,
} from "./lineasDeLaComparacion";

// UNA LÍNEA DE LA COMPARACIÓN (decisión 125 del doc 17, 11-11; Felipe aprobó
// la maqueta ese día: "mucho mejor, hazlo así"). Cada línea de la licitación
// es una competencia aparte: su tarjeta trae solo a quienes postularon a
// ella, con los números adelante (puntaje y precio), el estado en una
// palabra con su detalle chico debajo, y los dos desenlaces: quién gana si
// la comisión acepta todo y quién si aplica las bases a la letra. La de la
// línea en que compite la empresa va primero y con borde azul. Desde la
// decisión 128 la tarjeta no ofrece el reclamo: va abajo, en `Reclamos`, y
// solo si la licitación se perdió.

const CUMPLE: Record<
  OferenteComparado["cumple_bases"],
  { texto: string; clases: string }
> = {
  si: { texto: "Cumple", clases: "bg-green-100 text-green-800" },
  dudoso: { texto: "En duda", clases: "bg-amber-100 text-amber-800" },
  no: { texto: "Fuera", clases: "bg-red-100 text-red-800" },
};

const COLUMNAS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

export default function LineaDeLaComparacion({
  linea,
  criterios,
  unica,
}: {
  readonly linea: LineaComparada;
  readonly criterios: ReadonlyArray<{ nombre: string; peso: number }>;
  /** La licitación no tiene líneas: no hace falta decir «compites». */
  readonly unica: boolean;
}) {
  const oferentes = enOrden(linea);
  const todo = siAceptanTodo(linea);
  const letra = aLaLetra(linea);
  const decide = loQueLoDecide(linea);
  const notas = <TablaDeNotas oferentes={oferentes} criterios={criterios} />;
  return (
    <article
      aria-label={linea.nombre || "La comparación"}
      className={`rounded-xl bg-white p-4 space-y-3 ${
        linea.compites ? "border-2 border-blue-300" : "border border-gray-200"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">
            {linea.nombre || "Cómo va la licitación"}
          </h3>
          {!unica && (
            <span
              className={`px-1.5 py-0.5 text-xs font-semibold rounded ${
                linea.compites
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {linea.compites ? "Compites" : "No compites"}
            </span>
          )}
        </div>
        {linea.tope && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            Tope {linea.tope}
          </span>
        )}
      </header>

      <div
        className={`grid gap-3 ${COLUMNAS[oferentes.length] ?? "sm:grid-cols-2 lg:grid-cols-4"}`}
      >
        {oferentes.map((o) => (
          <div
            key={o.nombre}
            className={`min-w-0 rounded-lg border p-3 ${
              o.es_tuya
                ? "border-blue-300 bg-blue-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <p
              className={`truncate text-xs font-semibold ${o.es_tuya ? "text-blue-700" : "text-gray-500"}`}
              title={o.nombre}
            >
              {nombreCorto(o)}
              {o.es_tuya ? " (tú)" : ""}
            </p>
            <p className="text-2xl font-semibold text-gray-900">
              {o.puntaje.toLocaleString("es-CL")}
            </p>
            <p className="text-sm text-gray-800">{o.precio}</p>
            <span
              className={`mt-2 inline-block px-1.5 py-0.5 text-xs font-semibold rounded ${CUMPLE[o.cumple_bases].clases}`}
            >
              {CUMPLE[o.cumple_bases].texto}
            </span>
            <p
              className="text-xs text-gray-600 line-clamp-2"
              title={o.por_que || undefined}
            >
              {o.en_corto?.trim() || o.por_que}
            </p>
          </div>
        ))}
      </div>

      {(todo || letra) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <CajaDeDesenlace cuando="Si les aceptan todo" d={todo} />
          <CajaDeDesenlace cuando="Si aplican las bases a la letra" d={letra} />
        </div>
      )}

      {decide && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Lo que lo decide: {decide.texto}</span>
          </p>
          {decide.de && decide.grave && (
            <div className="space-y-0.5 text-xs text-amber-900">
              {decide.grave.que !== decide.texto && (
                <p>
                  {decide.de.es_tuya ? "Tu oferta" : nombreCorto(decide.de)}:{" "}
                  {decide.grave.que}
                </p>
              )}
              <p>Dónde se ve: {decide.grave.prueba}</p>
              <p>Regla: {decide.grave.regla}</p>
            </div>
          )}
        </div>
      )}

      {linea.compites || unica ? (
        notas
      ) : (
        <Plegable titulo="Ver las notas de esta línea">{notas}</Plegable>
      )}
    </article>
  );
}

function CajaDeDesenlace({
  cuando,
  d,
}: {
  readonly cuando: string;
  readonly d: Desenlace | null;
}) {
  if (!d) return null;
  return (
    <div
      className={`min-w-0 rounded-lg border p-3 ${d.ganasTu ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}`}
    >
      <p className="text-xs text-gray-500">{cuando}</p>
      <p
        className={`text-sm font-semibold ${d.ganasTu ? "text-green-800" : "text-gray-900"}`}
      >
        {d.titulo}
      </p>
      {d.detalle && <p className="text-xs text-gray-600">{d.detalle}</p>}
    </div>
  );
}

/** La nota de cada criterio, el puntaje y la probabilidad; el porqué de cada
 *  nota aparece al pasar el mouse y en el detalle de la oferta. */
function TablaDeNotas({
  oferentes,
  criterios,
}: {
  readonly oferentes: readonly OferenteComparado[];
  readonly criterios: ReadonlyArray<{ nombre: string; peso: number }>;
}) {
  const celda = "py-1.5 px-2 text-right whitespace-nowrap";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="py-1.5 pr-3 text-left font-semibold">Criterio</th>
            {oferentes.map((o) => (
              <th
                key={o.nombre}
                className={`${celda} font-semibold ${o.es_tuya ? "text-blue-700" : ""}`}
              >
                {o.es_tuya ? "Tú" : nombreCorto(o)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {criterios.map((c, i) => (
            <tr key={c.nombre}>
              <td className="py-1.5 pr-3 text-gray-700">
                {c.nombre}{" "}
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {c.peso} %
                </span>
              </td>
              {oferentes.map((o) => {
                const n = o.notas.find((x) => x.criterio === i + 1);
                return (
                  <td
                    key={o.nombre}
                    className={`${celda} text-gray-900`}
                    title={n?.fundamento}
                  >
                    {n ? n.nota : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="font-semibold text-gray-900">
            <td className="py-1.5 pr-3">Puntaje</td>
            {oferentes.map((o) => (
              <td key={o.nombre} className={celda}>
                {o.puntaje.toLocaleString("es-CL")}
              </td>
            ))}
          </tr>
          <tr className="text-gray-500">
            <td className="py-1.5 pr-3">Probabilidad de ganar</td>
            {oferentes.map((o) => (
              <td key={o.nombre} className={celda}>
                {o.probabilidad} %
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
