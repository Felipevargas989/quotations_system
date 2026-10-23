import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type FichaDeMercado,
  getFichaDeMercado,
  type ParticipacionDeMercado,
} from "../../services/competencia.service";
import { formatCurrency } from "../../utils/currencies";
import { formatFechaEvento } from "../../utils/dates";
import { textoDelPrecio } from "./listaDeCompetidores";
import { urlMercadoPublico } from "./oportunidades.utils";

// LA FICHA DE UN COMPETIDOR, COMO ESTUDIO DE MERCADO (decisión 71 del doc 17,
// 23-10). Felipe: "me gustaría ver en cuáles más él participó y perdió, él
// participó y ganó, y para ir mapeando qué tipo de cosas hacen y a quién les
// venden... es como un estudio de mercado". Todo sale de las actas leídas de
// la zona y de lo adjudicado (aunque no tenga acta): cuánto participa y
// gana, a quién le vende, cuándo compitió contigo y la lista completa, con
// quién le ganó cuando perdió.

type Filtro = "todas" | "ganadas" | "perdidas";

export default function CompetidorPage() {
  const { rut = "" } = useParams();
  const {
    data: ficha,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["oportunidades", "competencia", "ficha", rut],
    queryFn: () => getFichaDeMercado(rut),
    enabled: rut !== "",
    retry: false,
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
          No encontramos a ese proveedor en las actas ni en lo adjudicado en tu
          zona.
        </p>
      ) : (
        <Ficha ficha={ficha} />
      )}
    </div>
  );
}

function Ficha({ ficha }: { readonly ficha: FichaDeMercado }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const { resumen } = ficha;
  const lista = ficha.licitaciones.filter((l) =>
    filtro === "todas" ? true : filtro === "ganadas" ? l.gano : !l.gano,
  );
  return (
    <>
      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{ficha.nombre}</h1>
            <p className="text-sm text-gray-500">RUT {ficha.rut}</p>
          </div>
          {ficha.seguido && (
            <span className="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-800">
              Lo sigues
            </span>
          )}
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          <Dato titulo="Participó">{veces(resumen.participaciones)}</Dato>
          <Dato titulo="Ganó">{veces(resumen.ganadas)}</Dato>
          <Dato titulo="Perdió">{veces(resumen.perdidas)}</Dato>
          <Dato titulo="Monto ganado">
            {resumen.monto_ganado > 0
              ? formatCurrency(resumen.monto_ganado, "CLP")
              : "—"}
          </Dato>
          <Dato titulo="Última vez">
            {resumen.ultima ? formatFechaEvento(resumen.ultima, "medio") : "—"}
          </Dato>
        </div>
        {resumen.compradores.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">A quién le vende</p>
            <div className="flex flex-wrap gap-1.5">
              {resumen.compradores.slice(0, 8).map((c) => (
                <span
                  key={c.nombre}
                  className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700"
                >
                  {c.nombre} · participó {c.veces}, ganó {c.ganadas}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {ficha.encuentros.length > 0 && (
        <section className="bg-white rounded-lg shadow p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Cuando compitió contigo
          </h2>
          <ul className="divide-y divide-gray-100">
            {ficha.encuentros.map((e) => {
              const precio = textoDelPrecio(
                e.diferencia_de_precio,
                e.lineas_comparadas,
              );
              return (
                <li
                  key={e.codigo}
                  className="py-2 flex flex-wrap items-baseline justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">
                      {e.proceso ?? e.codigo}
                    </p>
                    <Donde
                      codigo={e.codigo}
                      partes={[
                        e.organismo,
                        e.fecha && formatFechaEvento(e.fecha, "medio"),
                      ]}
                    />
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-900">
                      Su oferta <b>{plata(e.su_oferta)}</b> · la tuya{" "}
                      <b>{plata(e.tu_oferta)}</b>
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

      <section className="bg-white rounded-lg shadow p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Todas sus licitaciones
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["todas", `Todas (${resumen.participaciones})`],
                ["ganadas", `Ganó (${resumen.ganadas})`],
                ["perdidas", `Perdió (${resumen.perdidas})`],
              ] as const
            ).map(([clave, nombre]) => (
              <button
                key={clave}
                type="button"
                aria-pressed={filtro === clave}
                onClick={() => setFiltro(clave)}
                className={`px-2.5 py-1 text-xs rounded-lg border ${
                  filtro === clave
                    ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                    : "border-gray-200 bg-white text-gray-600 hover:text-gray-900"
                }`}
              >
                {nombre}
              </button>
            ))}
          </div>
        </div>
        {lista.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            Nada con ese filtro.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lista.map((l) => (
              <FilaDeParticipacion key={l.codigo} l={l} rut={ficha.rut} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function FilaDeParticipacion({
  l,
  rut,
}: {
  readonly l: ParticipacionDeMercado;
  readonly rut: string;
}) {
  const otros = l.ganadores.filter((g) => g.rut !== rut);
  return (
    <li className="py-2 flex flex-wrap items-baseline justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm text-gray-900">
          {l.proceso ?? l.codigo}
          {l.contigo && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-orange-50 text-orange-800">
              Contigo
            </span>
          )}
        </p>
        <Donde
          codigo={l.codigo}
          partes={[
            l.organismo,
            l.comuna,
            l.fecha && formatFechaEvento(l.fecha, "medio"),
            l.ofertas != null &&
              `${l.ofertas} ${l.ofertas === 1 ? "oferta" : "ofertas"}`,
          ]}
        />
        {l.detalle && (
          <p className="text-xs text-gray-500 line-clamp-1" title={l.detalle}>
            Ofreció: {l.detalle}
          </p>
        )}
      </div>
      <div className="text-right text-sm">
        <p className="text-gray-900">
          {l.gano ? "Ganó" : "Perdió"}
          {l.su_oferta != null && (
            <>
              {" · "}
              <b>{plata(l.su_oferta)}</b>
            </>
          )}
        </p>
        {!l.gano && otros.length > 0 && (
          <p className="text-xs text-gray-500">
            Ganó{" "}
            {otros
              .map((g) =>
                g.monto > 0 ? `${g.nombre} (${plata(g.monto)})` : g.nombre,
              )
              .join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}

/** «Quillón · 20 sept 2025 · 4364-5-LE25 ↗». */
function Donde({
  codigo,
  partes,
}: {
  readonly codigo: string;
  readonly partes: ReadonlyArray<string | false | null | undefined>;
}) {
  return (
    <p className="text-xs text-gray-500">
      {partes.filter(Boolean).join(" · ")}
      {partes.some(Boolean) && " · "}
      <a
        href={urlMercadoPublico(codigo, "licitacion")}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
      >
        {codigo}
        <ExternalLink size={12} />
      </a>
    </p>
  );
}

const veces = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

const plata = (n: number | null) =>
  n != null ? formatCurrency(n, "CLP") : "—";

/** Quién ganó esa licitación entre los dos (en una de varias líneas,
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
