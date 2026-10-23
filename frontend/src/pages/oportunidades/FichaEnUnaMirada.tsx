import {
  CalendarDays,
  Clock,
  Coins,
  ExternalLink,
  type LucideIcon,
  MapPin,
  Trophy,
} from "lucide-react";
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
import { eventoEnCorto, LUGAR_EN_CORTO } from "./fichaEnCorto";
import Ganadores from "./Ganadores";
import {
  cuandoCierra,
  esPrioridad,
  ESTADOS,
  SEMAFOROS,
  TONO_DEL_LUGAR,
  urlMercadoPublico,
} from "./oportunidades.utils";
import SelloDeTipo from "./SelloDeTipo";
import { useResponsables } from "./useResponsables";

// "EN UNA MIRADA" (Felipe, 17-10: la ficha "quedó muy desordenada... difícil
// de leer"). Lo que se decide de un vistazo, arriba de las pestañas:
// cuándo cierra, el presupuesto, cuándo es el evento y para cuántos, si se
// puede en el complejo y quién ganó el año pasado. Presupuesto, evento y
// lugar salen del análisis de las bases; sin él, de lo que trae Mercado
// Público y de la lectura del radar.
//
// Más clara el 17-10 en la noche ("vamos con todas"): un ícono por dato,
// el evento en corto («vie 30 oct · 18:00 a 02:00 · 160 personas»), el
// texto largo completo al pasar el mouse, y el estado y el responsable
// arriba a la derecha, junto a Mercado Público. Desde el 22-10 (decisión
// 66) solo el enlace a Mercado Público va pegado al borde derecho; el
// estado y el responsable se quedan donde estaban (Felipe: "el en estudio
// y el responsable estaban bien donde estaban").

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
  const evento = eventoEnCorto(bases);
  const lugar = bases?.se_puede_en_el_complejo ?? ficha.se_hace_en_el_complejo;
  const anterior = ficha.anterior;
  // Sin el dato (un motor anterior), se asume que la historia sigue
  // cargando: es lo que pasa las primeras noches.
  const historiaCargando = (ficha.historia_pendiente ?? 1) > 0;

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full space-y-1">
          {/* Una sola línea (23-10, Felipe eligió la opción B): un título
              largo se corta con «…» y se lee completo al pasar el mouse.
              Antes la fila se partía y dejaba el punto solo arriba y
              «Prioridad» solo abajo. */}
          <div className="flex min-w-0 items-center gap-2">
            <span
              title={ficha.semaforo ? SEMAFOROS[ficha.semaforo].label : ""}
              className={`w-3 h-3 shrink-0 rounded-full ${
                ficha.semaforo ? SEMAFOROS[ficha.semaforo].punto : "bg-gray-300"
              }`}
            />
            <h1
              title={p.nombre}
              className="min-w-0 truncate text-xl font-bold text-gray-900"
            >
              {p.nombre}
            </h1>
            {esPrioridad(ficha) && (
              <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
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
        <div className="flex flex-wrap items-center gap-2">
          <ChipDeEstado
            value={ficha.estado}
            opciones={ESTADOS}
            onChange={(v) => onGuardar({ estado: v as EstadoOportunidad })}
            disabled={guardando}
          />
          <div className="w-52" title="Responsable">
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
        <a
          href={urlMercadoPublico(ficha.codigo, p.tipo)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
        >
          Mercado Público
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Dato icono={Clock} titulo="Cierre">
          {formatMomento(p.fecha_cierre, "diaHora", "Sin fecha")}
          <Detalle
            clases={
              cierre.urgente ? "font-semibold text-red-600" : "text-gray-500"
            }
          >
            {cierre.texto}
          </Detalle>
        </Dato>
        <Dato
          icono={Coins}
          titulo="Presupuesto"
          completo={bases?.monto_detalle}
        >
          {monto ? formatCurrency(monto, p.moneda || "CLP") : "No publicado"}
          <Detalle>
            {bases?.monto_detalle || (monto ? "" : "búscalo en las bases")}
          </Detalle>
        </Dato>
        <Dato icono={CalendarDays} titulo="Evento" completo={evento.completo}>
          {evento.principal || (bases ? "No lo dicen" : "—")}
          <Detalle>{bases ? evento.detalle : "Analiza las bases"}</Detalle>
        </Dato>
        <Dato icono={MapPin} titulo="Lugar" completo={bases?.lugar}>
          <span className={lugar ? TONO_DEL_LUGAR[lugar] : ""}>
            {lugar ? (LUGAR_EN_CORTO[lugar] ?? lugar) : "—"}
          </span>
          {bases?.lugar && <Detalle>{bases.lugar}</Detalle>}
        </Dato>
        <Dato icono={Trophy} titulo="El año pasado">
          {anterior ? (
            <>
              <Ganadores ganadores={anterior.ganadores} />
              <Detalle>
                {anterior.anio ?? "Antes"}
                {anterior.oferentes != null &&
                  ` · ${anterior.oferentes} ${anterior.oferentes === 1 ? "oferta" : "ofertas"}`}
              </Detalle>
            </>
          ) : historiaCargando ? (
            <>
              Aún cargando
              <Detalle>la historia entra de noche</Detalle>
            </>
          ) : (
            <>
              No hubo
              <Detalle>ninguna compra parecida</Detalle>
            </>
          )}
        </Dato>
      </div>
    </div>
  );
}

function Dato({
  icono: Icono,
  titulo,
  completo,
  children,
}: {
  readonly icono: LucideIcon;
  readonly titulo: string;
  /** El texto entero, al pasar el mouse sobre la tarjeta. */
  readonly completo?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      title={completo || undefined}
      className="min-w-0 p-3 rounded-lg bg-gray-50"
    >
      <p className="flex items-center gap-1 text-xs text-gray-500">
        <Icono size={13} aria-hidden="true" />
        {titulo}
      </p>
      <div className="text-sm font-semibold text-gray-900">{children}</div>
    </div>
  );
}

/** La línea chica de abajo de cada dato: una línea; el texto completo, al
 *  pasar el mouse sobre la tarjeta. (Sin "block": pisaría el line-clamp,
 *  como pasó el 17-10.) */
function Detalle({
  children,
  clases = "text-gray-500",
}: {
  readonly children: ReactNode;
  readonly clases?: string;
}) {
  return (
    <span className={`text-xs font-normal line-clamp-1 ${clases}`}>
      {children}
    </span>
  );
}
