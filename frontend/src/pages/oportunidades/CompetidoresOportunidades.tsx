import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getCompetidores } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import CompetidoresReales from "./CompetidoresReales";
import { urlCompetidor } from "./oportunidades.utils";

// COMPETIDORES, en dos vistas. La de entrada desde la decisión 70 (22-10),
// «Tus competidores»: con quién compite la empresa de verdad, según las
// actas de adjudicación (`CompetidoresReales`). La de siempre (doc 17 §5.3,
// sprint 2), «Quién gana en tu zona»: quién gana en las regiones de la
// empresa, sacado de las adjudicaciones de la historia (3 años). Cada
// nombre lleva a su ficha.

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
  const {
    data = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["oportunidades", "competidores"],
    queryFn: getCompetidores,
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-red-600">
        No se pudo armar la lista de competidores.
      </p>
    );
  }
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        Todavía no hay adjudicaciones en tus regiones. Llegan con la historia de
        3 años, que se va cargando de noche, y con lo que cierra.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Quién gana en tus regiones, en lo que podría ser de tu rubro (últimos 3
        años).
      </p>
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
            {data.map((c) => (
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
                  {formatMomento(c.ultimo, "medio")}
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
    </div>
  );
}
