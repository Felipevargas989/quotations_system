import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  buscarEnLasActas,
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
  textoDeCompradores,
  textoDeEncuentros,
  textoDelPrecio,
  type VistaDeCompetidores,
} from "./listaDeCompetidores";
import { urlCompetidor } from "./oportunidades.utils";

// «TUS COMPETIDORES» (decisión 70 del doc 17, 22-10). Felipe: "podemos
// hacerle seguimiento a las empresas con las que he competido... también
// busca empresas similares, complejos turísticos o restaurantes que hayan
// postulado a servicios públicos a los que yo postulo... debería haber un
// botón de «no es mi competidor» (con un confirmar)".
//
// Sale de las actas públicas de adjudicación, que traen todas las ofertas:
// quién ofertó donde ofertaste tú (y quién ganó), quién se parece a ti y
// postula a tus compradores (lo dice la IA) y a quién sigues. «Buscar en
// las actas» las lee por detrás; mientras lee, la lista se pide cada 5 s.

const CLAVE = ["oportunidades", "competencia"];

const VISTAS: VistaDeCompetidores[] = [
  "todos",
  "compitio",
  "similar",
  "seguido",
];

export default function CompetidoresReales() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: CLAVE,
    queryFn: getCompetencia,
    staleTime: 60 * 1000,
    refetchInterval: (q) => (q.state.data?.busqueda.buscando ? 5000 : false),
  });
  const [vista, setVista] = useState<VistaDeCompetidores>("todos");
  const [verDescartados, setVerDescartados] = useState(false);
  const [busca, setBusca] = useState("");

  const buscar = useMutation({
    mutationFn: buscarEnLasActas,
    onSuccess: (estado) => qc.setQueryData(CLAVE, estado),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo empezar la búsqueda.")),
  });

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

  const { competidores, busqueda } = data;
  const cuantos = conteos(competidores);
  const lista = deLaVista(competidores, vista, verDescartados, busca);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          Con quién compites de verdad, según las actas de adjudicación: los que
          ofertaron donde ofertaste tú, los parecidos a ti que postulan a tus
          compradores y los que sigues.
        </p>
        <Busqueda
          busqueda={busqueda}
          empezando={buscar.isPending}
          onBuscar={() => buscar.mutate()}
        />
      </div>

      {!data.rut_empresa && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Falta el RUT de tu empresa en «Mi empresa»: sin él no se sabe con
          quién compitió.
        </p>
      )}

      {competidores.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {busqueda.buscando
            ? "Todavía no aparece nadie: las actas se están leyendo."
            : "Todavía no hay actas leídas. Aprieta «Buscar en las actas»: lee las de tus licitaciones, las de tus compradores y las de tus comunas cercanas (3 años). Tarda unos minutos y sigue aunque cierres la pantalla; de noche sigue sola con lo que falte."}
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

/** «Buscar en las actas», o cómo va la búsqueda. */
function Busqueda({
  busqueda,
  empezando,
  onBuscar,
}: {
  readonly busqueda: EstadoDeLaCompetencia["busqueda"];
  readonly empezando: boolean;
  readonly onBuscar: () => void;
}) {
  if (busqueda.buscando) {
    return (
      <p
        role="status"
        className="inline-flex items-center gap-2 text-sm text-gray-600"
      >
        <Loader2 size={16} className="animate-spin" aria-hidden />
        {busqueda.total === 0
          ? "Buscando actas…"
          : busqueda.leidas < busqueda.total
            ? `Leyendo actas: ${busqueda.leidas} de ${busqueda.total}`
            : "La IA está viendo quién se parece a ti…"}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onBuscar}
      disabled={empezando}
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
    >
      <Search size={14} aria-hidden />
      Buscar en las actas
    </button>
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
  const precio = textoDelPrecio(c.diferencia_de_precio);
  const pie = [
    c.similar_razon && `Según la IA: ${c.similar_razon}`,
    c.ultima && `Última oferta: ${formatFechaEvento(c.ultima, "medio")}`,
  ].filter(Boolean);
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
      {c.en_tus_compradores > 0 && (
        <p className="text-sm text-gray-700">{textoDeCompradores(c)}</p>
      )}
      {pie.length > 0 && (
        <p className="text-xs text-gray-500">{pie.join(" · ")}</p>
      )}
    </li>
  );
}
