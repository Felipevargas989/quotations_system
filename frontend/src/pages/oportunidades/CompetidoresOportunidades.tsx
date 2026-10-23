import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getQuienGana } from "../../services/competencia.service";
import { formatCurrency } from "../../utils/currencies";
import { formatFechaEvento } from "../../utils/dates";
import CompetidoresReales from "./CompetidoresReales";
import { urlCompetidor } from "./oportunidades.utils";

// COMPETIDORES, en dos vistas. La de entrada desde la decisión 70 (22-10),
// «Tus competidores»: con quién compite la empresa de verdad, según las
// actas de adjudicación (`CompetidoresReales`). Y «Quién gana en tu zona»:
// desde la decisión 71 (23-10) solo lo del rubro de la empresa (Felipe:
// "siento que estoy como en un mar de productores de eventos y yo no soy
// productor de eventos"): la IA revisa una vez cada licitación adjudicada de
// la zona y se cuenta quién ganó las líneas del rubro. Cada nombre lleva a
// su ficha, el estudio de mercado de ese proveedor.

const VISTAS = [
  ["tuyos", "Tus competidores"],
  ["zona", "Quién gana en tu zona"],
] as const;

export default function CompetidoresOportunidades() {
  const [vista, setVista] = useState<(typeof VISTAS)[number][0]>("tuyos");
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Competidores"
        className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
      >
        {VISTAS.map(([clave, nombre]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={vista === clave}
            onClick={() => setVista(clave)}
            className={`px-3 py-1.5 text-sm rounded-md ${
              vista === clave
                ? "bg-white font-semibold text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {nombre}
          </button>
        ))}
      </div>
      {vista === "tuyos" ? <CompetidoresReales /> : <QuienGanaEnTuZona />}
    </div>
  );
}

function QuienGanaEnTuZona() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["oportunidades", "competencia", "zona"],
    queryFn: getQuienGana,
    staleTime: 60 * 1000,
    refetchInterval: (q) => (q.state.data?.rubro.revisando ? 15_000 : false),
  });

  if (isPending) {
    return <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-6 text-center text-sm text-red-600">
        No se pudo armar la lista de quién gana en tu zona.
      </p>
    );
  }
  const { ranking, rubro } = data;
  const n = (x: number) => x.toLocaleString("es-CL");
  const avance =
    rubro.total === 0
      ? "Todavía no hay adjudicaciones en tus regiones."
      : rubro.revisadas >= rubro.total
        ? `La IA revisó las ${n(rubro.total)} licitaciones adjudicadas de tu zona.`
        : `La IA lleva ${n(rubro.revisadas)} de ${n(rubro.total)} licitaciones adjudicadas de tu zona${
            rubro.revisando ? " · revisando ahora" : " · sigue sola cada noche"
          }.`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-gray-500">
          Quién gana en tus regiones lo que tú haces: alimentación, cenas,
          celebraciones, fiestas de funcionarios, paseos, salón y alojamiento.
          Sin audio ni escenarios (últimos 3 años).
        </p>
        <p
          role="status"
          className="inline-flex items-center gap-2 text-sm text-gray-500"
        >
          {rubro.revisando && (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          )}
          {avance}
        </p>
      </div>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {rubro.revisadas < rubro.total
            ? "La IA está revisando las licitaciones de tu zona: los primeros nombres aparecen en unos minutos."
            : "En lo de tu rubro no hay ganadores en tus regiones."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium text-right">Ganó</th>
                <th className="px-3 py-2 font-medium text-right">Monto</th>
                <th className="px-3 py-2 font-medium">Última vez</th>
                <th className="px-3 py-2 font-medium">Dónde gana más</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ranking.map((c) => (
                <tr key={c.rut}>
                  <td className="px-3 py-2">
                    <Link
                      to={urlCompetidor(c.rut)}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {c.nombre}
                    </Link>
                    <span className="block text-xs text-gray-400">{c.rut}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.triunfos} {c.triunfos === 1 ? "vez" : "veces"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {c.monto_total > 0
                      ? formatCurrency(c.monto_total, "CLP")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.ultimo ? formatFechaEvento(c.ultimo, "medio") : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {c.organismos
                      .slice(0, 2)
                      .map((o) => `${o.nombre} (${o.veces})`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
