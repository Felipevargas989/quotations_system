import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getEncuentros } from "../../services/competencia.service";
import { getCompetidor } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatFechaEvento, formatMomento } from "../../utils/dates";
import { textoDelPrecio } from "./listaDeCompetidores";
import { urlMercadoPublico } from "./oportunidades.utils";

// LA FICHA DE UN COMPETIDOR (doc 17 §5.3, sprint 2): todo lo que ganó en
// las regiones de la empresa en los últimos 3 años, lo último primero.
// Desde la decisión 70 (22-10), también «Cuando compitió contigo»: las
// licitaciones donde ofertaron los dos, con su oferta, la tuya y quién
// ganó. Un proveedor que nunca ganó en la zona (el motor dice 404) igual
// tiene ficha si se cruzó con la empresa.

export default function CompetidorPage() {
  const { rut = "" } = useParams();
  const zona = useQuery({
    queryKey: ["oportunidades", "competidor", rut],
    queryFn: () => getCompetidor(rut),
    enabled: rut !== "",
    retry: false,
  });
  const cruces = useQuery({
    queryKey: ["oportunidades", "competencia", "encuentros", rut],
    queryFn: () => getEncuentros(rut),
    enabled: rut !== "",
    retry: false,
  });

  const ficha = zona.data;
  const encuentros = cruces.data?.encuentros ?? [];
  const nombre = ficha?.nombre ?? cruces.data?.nombre ?? null;
  const cargando = zona.isPending || cruces.isPending;

  return (
    <div className="space-y-6">
      <Link
        to="/oportunidades"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={16} />
        Volver a Oportunidades
      </Link>

      {cargando ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : !ficha && encuentros.length === 0 ? (
        <p className="py-10 text-center text-sm text-red-600">
          No encontramos a ese proveedor en tus regiones ni en tus licitaciones.
        </p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-5 space-y-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {nombre ?? rut}
              </h1>
              <p className="text-sm text-gray-500">RUT {ficha?.rut ?? rut}</p>
            </div>
            {ficha && (
              <>
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
              </>
            )}
          </div>

          {encuentros.length > 0 && (
            <section className="bg-white rounded-lg shadow p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Cuando compitió contigo
              </h2>
              <ul className="divide-y divide-gray-100">
                {encuentros.map((e) => {
                  const precio =
                    e.su_oferta && e.tu_oferta
                      ? textoDelPrecio((e.su_oferta / e.tu_oferta - 1) * 100)
                      : null;
                  return (
                    <li
                      key={e.codigo}
                      className="py-2 flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">
                          {e.proceso ?? e.codigo}
                        </p>
                        <p className="text-xs text-gray-500">
                          {[
                            e.organismo,
                            e.fecha && formatFechaEvento(e.fecha, "medio"),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {" · "}
                          <a
                            href={urlMercadoPublico(e.codigo, "licitacion")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                          >
                            {e.codigo}
                            <ExternalLink size={12} />
                          </a>
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-gray-900">
                          Su oferta{" "}
                          <b>
                            {e.su_oferta != null
                              ? formatCurrency(e.su_oferta, "CLP")
                              : "—"}
                          </b>{" "}
                          · la tuya{" "}
                          <b>
                            {e.tu_oferta != null
                              ? formatCurrency(e.tu_oferta, "CLP")
                              : "—"}
                          </b>
                        </p>
                        <p className="text-xs text-gray-500">
                          {[resultado(e.gano_el, e.ganaste), precio]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {ficha && (
            <section className="bg-white rounded-lg shadow p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Lo que ganó
              </h2>
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
          )}
        </>
      )}
    </div>
  );
}

/** Quién ganó esa licitación entre los dos (en una con varias líneas,
 *  pueden ganar los dos). */
const resultado = (ganoEl: boolean, ganaste: boolean): string =>
  ganoEl && ganaste
    ? "Ganaron los dos (líneas distintas)"
    : ganoEl
      ? "Ganó él"
      : ganaste
        ? "Ganaste tú"
        : "No ganó ninguno de los dos";

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
