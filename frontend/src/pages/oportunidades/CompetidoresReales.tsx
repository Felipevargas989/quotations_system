import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  type CompetidorReal,
  type EstadoDeLaCompetencia,
  getCompetencia,
  marcarCompetidor,
} from "../../services/competencia.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatFechaEvento } from "../../utils/dates";
import {
  COLOR_DE_LA_ETIQUETA,
  conMarca,
  conteos,
  deLaVista,
  NOMBRE_DE_LA_ETIQUETA,
  NOMBRE_DE_LA_VISTA,
  textoDeEncuentros,
  textoDeLasActas,
  textoDelPrecio,
  textoDeMercado,
  type VistaDeCompetidores,
} from "./listaDeCompetidores";
import { urlCompetidor } from "./oportunidades.utils";

// «TUS COMPETIDORES» (decisiones 70 y 71 del doc 17). Felipe, 23-10: "mis
// competidores son esos": los que ofertaron donde ofertaste tú, ganaras o
// perdieras, con todo lo que hacen en tu zona ("es como un estudio de
// mercado"). Sale de las actas públicas de adjudicación, que se leen solas:
// sin botón ("la lectura de actas debería ser automática y debería ser un
// dato que me lo entregara"). Mientras se leen, la lista se pide cada 15 s.
// «Parecido a ti» se sacó el 23-10.

const CLAVE = ["oportunidades", "competencia"];

const VISTAS: VistaDeCompetidores[] = ["todos", "seguido"];

export default function CompetidoresReales() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: CLAVE,
    queryFn: getCompetencia,
    staleTime: 60 * 1000,
    refetchInterval: (q) => (q.state.data?.actas.leyendo ? 15_000 : false),
  });
  const [vista, setVista] = useState<VistaDeCompetidores>("todos");
  const [verDescartados, setVerDescartados] = useState(false);
  const [busca, setBusca] = useState("");

  // Seguir, sacar o recuperar: se anota en la lista que ya está.
  const marcar = useMutation({
    mutationFn: ({
      rut,
      cambios,
    }: {
      rut: string;
      cambios: { seguido?: boolean; descartado?: boolean };
    }) => marcarCompetidor(rut, cambios),
    onSuccess: (marca) =>
      qc.setQueryData<EstadoDeLaCompetencia>(CLAVE, (antes) =>
        antes
          ? { ...antes, competidores: conMarca(antes.competidores, marca) }
          : antes,
      ),
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  if (isPending) {
    return <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-6 text-center text-sm text-red-600">
        No se pudo armar la lista de tus competidores.
      </p>
    );
  }

  const { competidores, actas } = data;
  const cuantos = conteos(competidores);
  const lista = deLaVista(competidores, vista, verDescartados, busca);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          Con quién compites de verdad, según las actas de adjudicación: los que
          ofertaron donde ofertaste tú, ganaras o perdieras, con lo que hacen en
          tu zona, y los que sigues.
        </p>
        <p
          role="status"
          className="inline-flex items-center gap-2 text-sm text-gray-500"
        >
          {actas.leyendo && (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          )}
          {textoDeLasActas(actas)}
        </p>
      </div>

      {!data.rut_empresa && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Falta el RUT de tu empresa en «Mi empresa»: sin él no se sabe con
          quién compitió.
        </p>
      )}

      {competidores.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {actas.leidas < actas.total
            ? "Todavía no aparece nadie: las actas de tu zona se están leyendo solas, primero las de tus licitaciones y tus compradores."
            : "En las actas de tu zona no aparece nadie que haya ofertado donde ofertaste tú."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {VISTAS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={!verDescartados && vista === v}
                onClick={() => {
                  setVista(v);
                  setVerDescartados(false);
                }}
                className={`px-3 py-1.5 text-sm rounded-lg border ${
                  !verDescartados && vista === v
                    ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                    : "border-gray-200 bg-white text-gray-600 hover:text-gray-900"
                }`}
              >
                {NOMBRE_DE_LA_VISTA[v]} ({cuantos[v]})
              </button>
            ))}
            {(cuantos.descartados > 0 || verDescartados) && (
              <button
                type="button"
                aria-pressed={verDescartados}
                onClick={() => setVerDescartados((d) => !d)}
                className={`px-3 py-1.5 text-sm rounded-lg border ${
                  verDescartados
                    ? "border-gray-400 bg-gray-100 text-gray-900 font-semibold"
                    : "border-gray-200 bg-white text-gray-500 hover:text-gray-900"
                }`}
              >
                No son competidores ({cuantos.descartados})
              </button>
            )}
            <label className="relative ml-auto w-full sm:w-60">
              <span className="sr-only">Buscar un competidor</span>
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nombre o RUT"
                className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-sm"
              />
            </label>
          </div>

          {lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Nadie con ese filtro.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {lista.map((c) => (
                <FilaDeCompetidor
                  key={c.rut}
                  c={c}
                  ocupado={marcar.isPending && marcar.variables?.rut === c.rut}
                  onMarcar={(cambios) => marcar.mutate({ rut: c.rut, cambios })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilaDeCompetidor({
  c,
  ocupado,
  onMarcar,
}: {
  readonly c: CompetidorReal;
  readonly ocupado: boolean;
  readonly onMarcar: (cambios: {
    seguido?: boolean;
    descartado?: boolean;
  }) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const precio = textoDelPrecio(c.diferencia_de_precio, c.lineas_comparadas);
  return (
    <li className="p-3 space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={urlCompetidor(c.rut)}
            className="font-semibold text-blue-700 hover:underline"
          >
            {c.nombre}
          </Link>
          <span className="ml-2 text-xs text-gray-400">{c.rut}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {c.etiquetas.map((e) => (
              <span
                key={e}
                className={`px-2 py-0.5 text-xs rounded ${COLOR_DE_LA_ETIQUETA[e]}`}
              >
                {NOMBRE_DE_LA_ETIQUETA[e]}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {c.descartado ? (
            <button
              type="button"
              onClick={() => onMarcar({ descartado: false })}
              disabled={ocupado}
              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              Recuperar
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={c.seguido}
                onClick={() => onMarcar({ seguido: !c.seguido })}
                disabled={ocupado}
                className={`inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-50 ${
                  c.seguido
                    ? "text-indigo-700 hover:underline"
                    : "text-gray-600 hover:text-gray-900 hover:underline"
                }`}
              >
                <Star
                  size={14}
                  aria-hidden
                  className={c.seguido ? "fill-indigo-600 text-indigo-600" : ""}
                />
                {c.seguido ? "Dejar de seguir" : "Seguir"}
              </button>
              {confirmando ? (
                <ConfirmInline
                  question="¿No es tu competidor? Sale de la lista."
                  yesLabel="Sí, sacar"
                  tono="normal"
                  busy={ocupado}
                  onYes={() => {
                    setConfirmando(false);
                    onMarcar({ descartado: true });
                  }}
                  onNo={() => setConfirmando(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(true)}
                  className="text-xs text-gray-500 hover:text-gray-900 hover:underline"
                >
                  No es mi competidor
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {c.encuentros > 0 && (
        <p className="text-sm text-gray-700">
          {textoDeEncuentros(c)}
          {precio && ` · ${precio}`}
        </p>
      )}
      {c.participaciones > 0 && (
        <p className="text-sm text-gray-700">{textoDeMercado(c)}</p>
      )}
      {c.ultima && (
        <p className="text-xs text-gray-500">
          Última oferta: {formatFechaEvento(c.ultima, "medio")}
        </p>
      )}
    </li>
  );
}
