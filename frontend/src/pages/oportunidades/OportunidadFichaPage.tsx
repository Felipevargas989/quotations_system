import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "../../components/toast/Toast";
import {
  actualizarOportunidad,
  getAnalisis,
  getFichaDeOportunidad,
  type CambioDeProceso,
  type EstadoOportunidad,
  type FichaDeOportunidad,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import AdjuntosDeLaOportunidad from "./AdjuntosDeLaOportunidad";
import AnalisisDeBases from "./AnalisisDeBases";
import CaminoDePostulacion from "./CaminoDePostulacion";
import ComparacionDeOfertas from "./ComparacionDeOfertas";
import ActaDeLaLicitacion from "./ActaDeLaLicitacion";
import ArmarPostulacion from "./ArmarPostulacion";
import CotizacionDeLaPostulacion from "./CotizacionDeLaPostulacion";
import ResumenDeNegocio from "./ResumenDeNegocio";
import { type PestanaDeFicha, yaSeAdjudico } from "./fichaEnCorto";
import FichaEnUnaMirada from "./FichaEnUnaMirada";
import MiPostulacion from "./MiPostulacion";
import SubirAMercadoPublico from "./SubirAMercadoPublico";
import { preguntarDeNuevo, TEXTO_DEL_DETALLE_MP } from "./tipoDeProceso";
import Ganadores from "./Ganadores";
import { RAZON_DE_PRIORIDAD } from "./coloresDeLaBandeja";
import { textoDelResultadoPublico } from "./resultadoDeCompraAgil";
import { avisoAlGuardar } from "./servicioDeLaGanada";
import { ALERTAS, ETIQUETAS, urlMercadoPublico } from "./oportunidades.utils";
import { preguntarPorQue } from "./porQueDescartas";

// LA FICHA DE UNA OPORTUNIDAD (doc 17 §5.3, sprint 2): lo que leyó la IA,
// qué piden, las bases y anexos que sube la empresa, las fechas, el
// historial de cambios, el año anterior (sprint 1b) y lo que decide la
// empresa (estado, responsable, notas).
//
// Ordenada el 17-10 (Felipe: "la información para abajo quedó muy
// desordenada... difícil de leer"): arriba "en una mirada"
// (FichaEnUnaMirada) y abajo cuatro pestañas: Resumen · Bases y criterios ·
// Mi postulación · Historial.

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
    // Una compra ágil sin detalle: el motor lo trae por detrás.
    refetchInterval: (q) => preguntarDeNuevo(q.state.data?.detalle_mp),
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

const CLAVE_PESTANA_DE_FICHA = "op.ficha.pestana";

const PESTANAS_DE_FICHA: ReadonlyArray<[PestanaDeFicha, string]> = [
  ["resumen", "Resumen"],
  ["bases", "Bases y criterios"],
  ["postulacion", "Mi postulación"],
  ["historial", "Historial"],
  // Decisión 41 (19-10): solo cuando ya se postuló.
  ["comparacion", "Comparación de ofertas"],
];

/** Después de postular se comparan las ofertas (decisión 41). */
const CON_COMPARACION = new Set(["postulada", "ganada", "perdida"]);

/** La pestaña se recuerda en la sesión: al pasar a otra ficha se llega a
 *  la misma (regla de Felipe del 26-08: la pantalla recuerda). */
const pestanaGuardada = (): PestanaDeFicha => {
  try {
    const v = sessionStorage.getItem(CLAVE_PESTANA_DE_FICHA);
    return PESTANAS_DE_FICHA.some(([id]) => id === v)
      ? (v as PestanaDeFicha)
      : "resumen";
  } catch {
    return "resumen";
  }
};

function Ficha({ ficha }: { readonly ficha: FichaDeOportunidad }) {
  const qc = useQueryClient();
  const p = ficha.proceso;

  const [pestanaElegida, setPestana] =
    useState<PestanaDeFicha>(pestanaGuardada);
  const visibles = PESTANAS_DE_FICHA.filter(
    ([id]) => id !== "comparacion" || CON_COMPARACION.has(ficha.estado),
  );
  const pestana = visibles.some(([id]) => id === pestanaElegida)
    ? pestanaElegida
    : "resumen";
  const elegir = (id: PestanaDeFicha) => {
    setPestana(id);
    try {
      sessionStorage.setItem(CLAVE_PESTANA_DE_FICHA, id);
    } catch {
      /* sin memoria de la pestaña: no es grave */
    }
  };

  // La misma consulta que "Lo que piden las bases": lo de "en una mirada"
  // sale de ahí.
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", ficha.id],
    queryFn: () => getAnalisis(ficha.id),
  });
  const bases = analisis?.estado === "listo" ? analisis.resultado : null;

  const [notas, setNotas] = useState(ficha.notas ?? "");
  useEffect(() => setNotas(ficha.notas ?? ""), [ficha.notas]);

  const guardar = useMutation({
    mutationFn: (cambios: {
      estado?: EstadoOportunidad;
      responsable_id?: string | null;
      notas?: string | null;
    }) => actualizarOportunidad(ficha.id, cambios),
    onSuccess: (respuesta, cambios) => {
      // Decisión 113: al descartar, el porqué de un clic, opcional.
      if (cambios.estado === "descartada") {
        preguntarPorQue(
          ficha.id,
          "Descartada. Queda en «Descartadas»: no se borra.",
        );
      } else {
        // Decisión 104: ganada, su cotización vinculada queda aceptada.
        toast.success(avisoAlGuardar(respuesta));
      }
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

      <FichaEnUnaMirada
        ficha={ficha}
        bases={bases}
        guardando={guardar.isPending}
        onGuardar={(cambios) => guardar.mutate(cambios)}
      />

      {ficha.estado !== "descartada" && (
        <CaminoDePostulacion oportunidadId={ficha.id} estado={ficha.estado} />
      )}

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {visibles.map(([id, texto]) => (
          <button
            key={id}
            type="button"
            onClick={() => elegir(id)}
            aria-pressed={pestana === id}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              pestana === id
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === "resumen" && (
        <>
          <ActaDeLaLicitacion
            acta={p.acta}
            seguida={ficha.estado === "seguida"}
            estadoEnMercadoPublico={p.estado}
          />
          {(ficha.estado === "seguida" || p.acta) && (
            <ResumenDeNegocio oportunidadId={ficha.id} />
          )}
          <Seccion titulo="Lo que leyó la IA">
            {ficha.razon && (
              <p className="text-sm text-gray-800">{ficha.razon}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {ficha.alertas.map((a) => (
                <span
                  key={a}
                  className={`px-2 py-0.5 text-xs rounded ${RAZON_DE_PRIORIDAD}`}
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
            </div>
            <p className="text-xs text-gray-400">
              Leída {formatMomento(ficha.leida_en, "diaHora", "")}
              {ficha.leida_con ? ` con ${ficha.leida_con}` : ""}. La IA propone;
              la decisión es tuya.
            </p>
          </Seccion>

          <Seccion titulo="Qué piden">
            <p className="text-sm text-gray-800 whitespace-pre-line">
              {p.descripcion ||
                (ficha.detalle_mp
                  ? TEXTO_DEL_DETALLE_MP[ficha.detalle_mp]
                  : "Mercado Público no trae descripción.")}
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
        </>
      )}

      {pestana === "bases" && (
        <>
          <AdjuntosDeLaOportunidad
            oportunidadId={ficha.id}
            plegadaDePartida={analisis?.estado === "listo"}
          />
          {/* En cuatro bloques relacionados (decisión 80): cómo te evalúan,
              lo que te deja fuera, lo que tienes que ofrecer (con lo que
              hay que conseguir) y lo que tienes que presentar. */}
          <AnalisisDeBases oportunidadId={ficha.id} ficha={ficha} />
        </>
      )}

      {pestana === "postulacion" && (
        <>
          {(ficha.estado === "postulada" || ficha.estado === "ganada") && (
            <p className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-sm text-sky-900">
              {ficha.estado === "ganada"
                ? "La ganaste: lo postulado es el contrato y no se modifica. Cúmplelo tal como se postuló."
                : "Ya la postulaste: la oferta, su cotización y los documentos quedan fijos, tal como se subieron a Mercado Público."}
            </p>
          )}
          {/* En tres pasos (decisión 79): arriba lo armado en una línea,
              después 1 El precio, 2 Tus documentos y 3 Subir. */}
          <ArmarPostulacion
            oportunidadId={ficha.id}
            congelada={
              ficha.estado === "postulada" || ficha.estado === "ganada"
            }
          />
          <CotizacionDeLaPostulacion
            oportunidadId={ficha.id}
            anterior={ficha.anterior}
            congelada={
              ficha.estado === "postulada" || ficha.estado === "ganada"
            }
            ganada={ficha.estado === "ganada"}
          />
          <MiPostulacion
            oportunidadId={ficha.id}
            congelada={
              ficha.estado === "postulada" || ficha.estado === "ganada"
            }
          />
          <SubirAMercadoPublico
            oportunidadId={ficha.id}
            codigo={ficha.codigo}
            cierre={ficha.proceso.fecha_cierre}
          />
        </>
      )}

      {pestana === "comparacion" && (
        <ComparacionDeOfertas
          oportunidadId={ficha.id}
          adjudicada={yaSeAdjudico(ficha)}
          perdida={ficha.estado === "perdida"}
        />
      )}

      {pestana === "historial" && (
        <>
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
                    href={urlMercadoPublico(
                      ficha.anterior.codigo,
                      "licitacion",
                    )}
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
                Todavía no hay historia de este comprador. Se va cargando de
                noche: 3 años, primero las fechas de hace un año.
              </p>
            )}
          </Seccion>

          {fechas.length > 0 && (
            <Seccion titulo="Fechas en Mercado Público">
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
        </>
      )}
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
  // Decisión 92: a quién eligieron, igual para cualquier empresa.
  if (c.tipo === "resultado") return textoDelResultadoPublico(c.despues);
  return c.tipo;
};
