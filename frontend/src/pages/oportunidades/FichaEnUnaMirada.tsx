import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import ChipDeEstado from "../../components/ChipDeEstado";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type {
  EstadoOportunidad,
  FichaDeOportunidad,
  ResultadoDeBases,
} from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import Ganadores from "./Ganadores";
import {
  cuandoCierra,
  esPrioridad,
  ESTADOS,
  fechaDelEvento,
  SE_HACE_EN_EL_COMPLEJO,
  SEMAFOROS,
  TONO_DEL_LUGAR,
  urlMercadoPublico,
} from "./oportunidades.utils";
import SelloDeTipo from "./SelloDeTipo";
import { useResponsables } from "./useResponsables";

// "EN UNA MIRADA" (Felipe, 17-10: la ficha "quedó muy desordenada... difícil
// de leer"). Lo que se decide de un vistazo, arriba de las pestañas:
// cuándo cierra, el presupuesto, cuándo es el evento y para cuántos, si se
// puede en el complejo y quién ganó el año pasado; el estado y el
// responsable. Presupuesto, evento y lugar salen del análisis de las bases;
// sin él, de lo que trae Mercado Público y de la lectura del radar.

export default function FichaEnUnaMirada({
  ficha,
  bases,
  guardando,
  onGuardar,
}: {
  readonly ficha: FichaDeOportunidad;
  readonly bases: ResultadoDeBases | null;
  readonly guardando: boolean;
  readonly onGuardar: (cambios: {
    estado?: EstadoOportunidad;
    responsable_id?: string | null;
  }) => void;
}) {
  const p = ficha.proceso;
  const cierre = cuandoCierra(p.fecha_cierre);
  const responsables = useResponsables();
  const monto = bases && bases.monto > 0 ? bases.monto : p.monto;
  const evento = bases ? fechaDelEvento(bases) : "";
  const lugar = bases?.se_puede_en_el_complejo ?? ficha.se_hace_en_el_complejo;
  const anterior = ficha.anterior;

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              title={ficha.semaforo ? SEMAFOROS[ficha.semaforo].label : ""}
              className={`w-3 h-3 rounded-full ${
                ficha.semaforo ? SEMAFOROS[ficha.semaforo].punto : "bg-gray-300"
              }`}
            />
            <h1 className="text-xl font-bold text-gray-900">{p.nombre}</h1>
            {esPrioridad(ficha) && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
                Prioridad
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-500">
            <SelloDeTipo tipo={p.tipo} />
            <span>
              {[p.organismo, p.comuna, ficha.codigo]
                .filter(Boolean)
                .join(" · ")}
            </span>
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

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Dato titulo="Cierre">
          {formatMomento(p.fecha_cierre, "diaHora", "Sin fecha")}
          <Detalle
            clases={
              cierre.urgente ? "font-semibold text-red-600" : "text-gray-500"
            }
          >
            {cierre.texto}
          </Detalle>
        </Dato>
        <Dato titulo="Presupuesto">
          {monto ? formatCurrency(monto, p.moneda || "CLP") : "No informado"}
          {bases?.monto_detalle && (
            <Detalle titulo={bases.monto_detalle}>
              {bases.monto_detalle}
            </Detalle>
          )}
        </Dato>
        <Dato titulo="Evento">
          <span title={evento || undefined} className="line-clamp-3">
            {evento || (bases ? "No lo dicen" : "—")}
          </span>
          <Detalle>
            {bases?.personas
              ? `${bases.personas} personas`
              : bases
                ? ""
                : "Analiza las bases"}
          </Detalle>
        </Dato>
        <Dato titulo="Lugar">
          <span className={lugar ? TONO_DEL_LUGAR[lugar] : ""}>
            {lugar ? SE_HACE_EN_EL_COMPLEJO[lugar] : "—"}
          </span>
          {bases?.lugar && (
            <Detalle titulo={bases.lugar}>{bases.lugar}</Detalle>
          )}
        </Dato>
        <Dato titulo="El año pasado">
          {anterior ? (
            <>
              <Ganadores ganadores={anterior.ganadores} />
              <Detalle>
                {anterior.anio ?? "Antes"}
                {anterior.oferentes != null &&
                  ` · ${anterior.oferentes} ${anterior.oferentes === 1 ? "oferta" : "ofertas"}`}
              </Detalle>
            </>
          ) : (
            "Sin historia"
          )}
        </Dato>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Estado</span>
          <ChipDeEstado
            value={ficha.estado}
            opciones={ESTADOS}
            onChange={(v) => onGuardar({ estado: v as EstadoOportunidad })}
            disabled={guardando}
          />
        </div>
        <div className="flex items-center gap-2 min-w-[16rem]">
          <span className="text-xs text-gray-500">Responsable</span>
          <div className="flex-1">
            <SelectWithSearch
              options={responsables}
              value={ficha.responsable_id ?? ""}
              onChange={(v) => onGuardar({ responsable_id: v || null })}
              placeholder="Sin responsable"
              mostrarConteo={false}
              tamano="sm"
            />
          </div>
        </div>
      </div>
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
    <div className="min-w-0 p-3 rounded-lg bg-gray-50">
      <p className="text-xs text-gray-500">{titulo}</p>
      <div className="text-sm font-semibold text-gray-900">{children}</div>
    </div>
  );
}

/** La línea chica de abajo de cada dato: dos líneas como mucho; el texto
 *  completo, al pasar el mouse. */
function Detalle({
  children,
  titulo,
  clases = "text-gray-500",
}: {
  readonly children: ReactNode;
  readonly titulo?: string;
  readonly clases?: string;
}) {
  return (
    <span
      title={titulo}
      className={`text-xs font-normal line-clamp-2 ${clases}`}
    >
      {children}
    </span>
  );
}
