import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ChipDeEstado from "../../components/ChipDeEstado";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  actualizarOportunidad,
  getFichaDeOportunidad,
  type CambioDeProceso,
  type EstadoOportunidad,
  type FichaDeOportunidad,
} from "../../services/oportunidades.service";
import { getUsers } from "../../services/users.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import AdjuntosDeLaOportunidad from "./AdjuntosDeLaOportunidad";
import AnalisisDeBases from "./AnalisisDeBases";
import DocumentosConIA from "./DocumentosConIA";
import MiPostulacion from "./MiPostulacion";
import ValidacionDeDocumentos from "./ValidacionDeDocumentos";
import Ganadores from "./Ganadores";
import {
  ALERTAS,
  cuandoCierra,
  esPrioridad,
  ESTADOS,
  ETIQUETAS,
  SE_HACE_EN_EL_COMPLEJO,
  SEMAFOROS,
  TIPOS,
  urlMercadoPublico,
} from "./oportunidades.utils";

// LA FICHA DE UNA OPORTUNIDAD (doc 17 §5.3, sprint 2): lo que leyó la IA,
// qué piden, las bases y anexos que sube la empresa, las fechas, el
// historial de cambios, el año anterior (sprint 1b) y lo que decide la
// empresa (estado, responsable, notas).

/** Las fechas que trae Mercado Público, en el orden en que pasan. */
const FECHAS: ReadonlyArray<[string, string]> = [
  ["FechaPublicacion", "Publicada"],
  ["fecha_publicacion", "Publicada"],
  ["FechaInicio", "Inicio de preguntas"],
  ["FechaFinal", "Cierre de preguntas"],
  ["FechaPubRespuestas", "Respuestas publicadas"],
  ["FechaVisitaTerreno", "Visita a terreno"],
  ["FechaCierre", "Cierre de ofertas"],
  ["fecha_cierre", "Cierre de ofertas"],
  ["FechaActoAperturaTecnica", "Apertura técnica"],
  ["FechaActoAperturaEconomica", "Apertura económica"],
  ["FechaEstimadaAdjudicacion", "Adjudicación estimada"],
  ["FechaAdjudicacion", "Adjudicación"],
];

type UsuarioDeLaEmpresa = { id: string; full_name: string; role: string };

export default function OportunidadFichaPage() {
  const { id } = useParams();
  const n = Number(id);
  const {
    data: ficha,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["oportunidades", "ficha", n],
    queryFn: () => getFichaDeOportunidad(n),
    enabled: Number.isInteger(n) && n > 0,
  });

  if (isPending) {
    return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError || !ficha) {
    return (
      <div className="space-y-4">
        <Volver />
        <p className="py-10 text-center text-sm text-red-600">
          No encontramos esa oportunidad.
        </p>
      </div>
    );
  }
  return <Ficha ficha={ficha} />;
}

function Volver() {
  return (
    <Link
      to="/oportunidades"
      className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
    >
      <ArrowLeft size={16} />
      Volver a Oportunidades
    </Link>
  );
}

function Ficha({ ficha }: { readonly ficha: FichaDeOportunidad }) {
  const qc = useQueryClient();
  const p = ficha.proceso;
  const cierre = cuandoCierra(p.fecha_cierre);

  const { data: usuarios = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async (): Promise<UsuarioDeLaEmpresa[]> => {
      const { data, error } = await getUsers();
      if (error) throw error;
      return (data as UsuarioDeLaEmpresa[] | null) ?? [];
    },
  });
  // Solo los administradores ven el módulo (Felipe, 17-10).
  const responsables = usuarios.filter((u) => u.role === "administrador");

  const [notas, setNotas] = useState(ficha.notas ?? "");
  useEffect(() => setNotas(ficha.notas ?? ""), [ficha.notas]);

  const guardar = useMutation({
    mutationFn: (cambios: {
      estado?: EstadoOportunidad;
      responsable_id?: string | null;
      notas?: string | null;
    }) => actualizarOportunidad(ficha.id, cambios),
    onSuccess: () => {
      toast.success("Guardado.");
      void qc.invalidateQueries({ queryKey: ["oportunidades"] });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  const fechas = FECHAS.filter(([clave]) => {
    const v = p.fechas?.[clave];
    return typeof v === "string" && v.trim() !== "";
  });

  return (
    <div className="space-y-6">
      <Volver />

      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  ficha.semaforo
                    ? SEMAFOROS[ficha.semaforo].punto
                    : "bg-gray-300"
                }`}
              />
              <h1 className="text-xl font-bold text-gray-900">{p.nombre}</h1>
              {esPrioridad(ficha) && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
                  Prioridad
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {[p.organismo, p.unidad, p.comuna, p.region]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs text-gray-500">
              {TIPOS[p.tipo]} {ficha.codigo}
            </p>
          </div>
          <a
            href={urlMercadoPublico(ficha.codigo, p.tipo)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
          >
            Ver en Mercado Público
            <ExternalLink size={14} />
          </a>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Dato titulo="Monto">
            {p.monto
              ? formatCurrency(p.monto, p.moneda || "CLP")
              : "No informado"}
          </Dato>
          <Dato titulo="Cierre de ofertas">
            {formatMomento(p.fecha_cierre, "diaHora", "Sin fecha")}
            <span
              className={`block text-xs ${
                cierre.urgente ? "font-semibold text-red-600" : "text-gray-500"
              }`}
            >
              {cierre.texto}
            </span>
          </Dato>
          <Dato titulo="Estado">
            <ChipDeEstado
              value={ficha.estado}
              opciones={ESTADOS}
              onChange={(v) =>
                guardar.mutate({ estado: v as EstadoOportunidad })
              }
              disabled={guardar.isPending}
            />
          </Dato>
        </div>

        <div className="max-w-sm">
          <p className="text-xs text-gray-500 mb-1">Responsable</p>
          <SelectWithSearch
            options={responsables.map((u) => ({
              value: u.id,
              label: u.full_name,
            }))}
            value={ficha.responsable_id ?? ""}
            onChange={(v) => guardar.mutate({ responsable_id: v || null })}
            placeholder="Sin responsable"
            mostrarConteo={false}
            tamano="sm"
          />
        </div>
      </div>

      <Seccion titulo="Lo que leyó la IA">
        {ficha.razon && <p className="text-sm text-gray-800">{ficha.razon}</p>}
        <div className="flex flex-wrap gap-1.5">
          {ficha.alertas.map((a) => (
            <span
              key={a}
              className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700"
            >
              {ALERTAS[a] ?? a}
            </span>
          ))}
          {ficha.etiquetas.map((e) => (
            <span
              key={e}
              className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
            >
              {ETIQUETAS[e] ?? e}
            </span>
          ))}
          {ficha.se_hace_en_el_complejo && (
            <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
              {SE_HACE_EN_EL_COMPLEJO[ficha.se_hace_en_el_complejo]}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Leída {formatMomento(ficha.leida_en, "diaHora", "")}
          {ficha.leida_con ? ` con ${ficha.leida_con}` : ""}. La IA propone; la
          decisión es tuya.
        </p>
      </Seccion>

      <Seccion titulo="Qué piden">
        <p className="text-sm text-gray-800 whitespace-pre-line">
          {p.descripcion || "Mercado Público no trae descripción."}
        </p>
        {p.productos.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {p.productos.map((x, i) => (
              <li key={i}>
                {x.nombre}
                {x.cantidad ? ` (${x.cantidad})` : ""}
                {x.descripcion ? `: ${x.descripcion}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <AdjuntosDeLaOportunidad
        oportunidadId={ficha.id}
        codigo={ficha.codigo}
        tipo={p.tipo}
      />

      <AnalisisDeBases oportunidadId={ficha.id} />

      <DocumentosConIA oportunidadId={ficha.id} />

      <MiPostulacion
        oportunidadId={ficha.id}
        codigo={ficha.codigo}
        tipo={p.tipo}
      />

      <ValidacionDeDocumentos oportunidadId={ficha.id} />

      {fechas.length > 0 && (
        <Seccion titulo="Fechas">
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
            {fechas.map(([clave, etiqueta]) => (
              <div key={clave} className="flex justify-between gap-3">
                <dt className="text-gray-500">{etiqueta}</dt>
                <dd className="text-gray-900">
                  {formatMomento(String(p.fechas[clave]), "diaHora")}
                </dd>
              </div>
            ))}
          </dl>
        </Seccion>
      )}

      <Seccion titulo="Historial de cambios">
        {ficha.cambios.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin cambios desde que el radar la vio por primera vez (
            {formatMomento(p.primera_vez_visto, "diaHora")}).
          </p>
        ) : (
          <ul className="text-sm text-gray-700 space-y-1">
            {ficha.cambios.map((c) => (
              <li key={c.id}>
                <span className="text-gray-500">
                  {formatMomento(c.creado_en, "diaHora")}:
                </span>{" "}
                {describirCambio(c)}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="El año anterior">
        {ficha.anterior ? (
          <div className="space-y-1">
            <p className="text-sm text-gray-800">
              {ficha.anterior.anio ?? "Antes"}: ganó{" "}
              <Ganadores ganadores={ficha.anterior.ganadores} />
              {ficha.anterior.oferentes != null &&
                ` · ${ficha.anterior.oferentes} ${ficha.anterior.oferentes === 1 ? "oferta" : "ofertas"}`}
            </p>
            <p className="text-xs text-gray-500">
              {ficha.anterior.nombre} ·{" "}
              <a
                href={urlMercadoPublico(ficha.anterior.codigo, "licitacion")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline"
              >
                {ficha.anterior.codigo}
              </a>
              {ficha.anterior.url_acta && (
                <>
                  {" · "}
                  <a
                    href={ficha.anterior.url_acta}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:underline"
                  >
                    Acta de adjudicación
                  </a>
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Todavía no hay historia de este comprador. Se va cargando de noche:
            3 años, primero las fechas de hace un año.
          </p>
        )}
      </Seccion>

      <Seccion titulo="Notas">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Lo que conviene recordar: a quién llamar, qué falta, qué se ofreció."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => guardar.mutate({ notas: notas.trim() || null })}
          disabled={guardar.isPending || notas === (ficha.notas ?? "")}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Guardar notas
        </button>
      </Seccion>
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

function Seccion({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      {children}
    </section>
  );
}

const describirCambio = (c: CambioDeProceso): string => {
  if (c.tipo === "fecha_cierre") {
    const antes = c.antes?.fecha_cierre as string | undefined;
    const despues = c.despues?.fecha_cierre as string | undefined;
    return `movieron el cierre de ${formatMomento(antes, "diaHora", "sin fecha")} a ${formatMomento(despues, "diaHora", "sin fecha")}`;
  }
  if (c.tipo === "reapertura") return "estaba cerrada y volvió a abrirse";
  return c.tipo;
};
