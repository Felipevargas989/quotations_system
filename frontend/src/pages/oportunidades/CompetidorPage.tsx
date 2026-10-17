import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getCompetidor } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import { urlMercadoPublico } from "./oportunidades.utils";

// LA FICHA DE UN COMPETIDOR (doc 17 §5.3, sprint 2): todo lo que ganó en
// las regiones de la empresa en los últimos 3 años, lo último primero.

export default function CompetidorPage() {
  const { rut = "" } = useParams();
  const {
    data: ficha,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["oportunidades", "competidor", rut],
    queryFn: () => getCompetidor(rut),
    enabled: rut !== "",
  });

  return (
    <div className="space-y-6">
      <Link
        to="/oportunidades"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={16} />
        Volver a Oportunidades
      </Link>

      {isPending ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : isError || !ficha ? (
        <p className="py-10 text-center text-sm text-red-600">
          No encontramos triunfos de ese proveedor en tus regiones.
        </p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-5 space-y-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {ficha.nombre}
              </h1>
              <p className="text-sm text-gray-500">RUT {ficha.rut}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Dato titulo="Ganó en tus regiones">
                {ficha.triunfos} {ficha.triunfos === 1 ? "vez" : "veces"}
              </Dato>
              <Dato titulo="Monto adjudicado">
                {ficha.monto_total > 0
                  ? formatCurrency(ficha.monto_total, "CLP")
                  : "No informado"}
              </Dato>
              <Dato titulo="Última vez">
                {formatMomento(ficha.ultimo, "medio")}
              </Dato>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ficha.organismos.map((o) => (
                <span
                  key={o.nombre}
                  className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
                >
                  {o.nombre} ({o.veces})
                </span>
              ))}
            </div>
          </div>

          <section className="bg-white rounded-lg shadow p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Lo que ganó</h2>
            <ul className="divide-y divide-gray-100">
              {ficha.triunfos_detalle.map((t) => (
                <li
                  key={t.codigo}
                  className="py-2 flex flex-wrap items-baseline justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{t.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {[t.organismo, t.comuna].filter(Boolean).join(" · ")} ·{" "}
                      {formatMomento(t.fecha_publicacion, "medio")}
                      {t.oferentes != null &&
                        ` · ${t.oferentes} ${t.oferentes === 1 ? "oferta" : "ofertas"}`}
                      {" · "}
                      <a
                        href={urlMercadoPublico(t.codigo, "licitacion")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                      >
                        {t.codigo}
                        <ExternalLink size={12} />
                      </a>
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                    {t.monto != null ? formatCurrency(t.monto, "CLP") : "—"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Dato({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-gray-50">
      <p className="text-xs text-gray-500">{titulo}</p>
      <div className="text-sm font-semibold text-gray-900">{children}</div>
    </div>
  );
}
