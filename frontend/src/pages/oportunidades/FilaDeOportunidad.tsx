import { AlarmClock } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  EstadoOportunidad,
  Oportunidad,
} from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import {
  filaDelSemaforo,
  NOMBRE_DEL_SEMAFORO,
  RAZON_DE_PRIORIDAD,
} from "./coloresDeLaBandeja";
import {
  ALERTAS,
  colorDeLaOportunidad,
  cuandoCierra,
  ESTADOS,
  ETIQUETAS,
  textoDelAnterior,
} from "./oportunidades.utils";
import SelloDeTipo from "./SelloDeTipo";

// UNA FILA DE LA BANDEJA. Aparte de OportunidadesPage desde el 19-10, con
// los colores de la decisión 31 (coloresDeLaBandeja.ts): el semáforo es la
// franja y la tinta de la fila; las razones de la prioridad van en violeta;
// la urgencia, con reloj y sin rojo. Sin «Ver resumen» (decisión 30, Felipe:
// "una vez que la pinche me muestra el modal"): la fila entera lo abre.

export default function FilaDeOportunidad({
  o,
  ocupado,
  onDecidir,
  onAbrir,
}: {
  readonly o: Oportunidad;
  readonly ocupado: boolean;
  readonly onDecidir: (estado: EstadoOportunidad) => void;
  readonly onAbrir: () => void;
}) {
  const p = o.proceso;
  const cierre = cuandoCierra(p.fecha_cierre);
  const estado = ESTADOS.find((e) => e.value === o.estado);
  // Los botones de la derecha deciden sin abrir el resumen.
  const solo = (accion: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    accion();
  };
  const color = colorDeLaOportunidad(o);
  const semaforo = color ? NOMBRE_DEL_SEMAFORO[color] : "Sin leer";
  return (
    <li
      onClick={() => {
        // Seleccionar texto para copiarlo no abre el resumen.
        if (window.getSelection()?.toString()) return;
        onAbrir();
      }}
      data-semaforo={color ?? "sin_leer"}
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 pl-3 pr-3 py-3 border-l-4 border-b border-b-gray-200 last:border-b-0 cursor-pointer ${filaDelSemaforo(
        color,
      )} ${o.estado === "descartada" ? "opacity-60" : ""}`}
    >
      <div className="min-w-0">
        <span className="sr-only">{semaforo}. </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SelloDeTipo tipo={p.tipo} />
          <Link
            to={`/oportunidades/${o.id}`}
            onClick={(e) => {
              // Un clic normal abre el resumen; con Ctrl, Cmd o la rueda, la
              // ficha en otra pestaña, como cualquier enlace.
              e.stopPropagation();
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
                return;
              e.preventDefault();
              onAbrir();
            }}
            className="text-sm font-semibold text-gray-900 hover:text-blue-700"
          >
            {p.nombre}
          </Link>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {[
            p.organismo,
            o.codigo,
            p.monto
              ? formatCurrency(p.monto, "CLP")
              : "presupuesto no publicado",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs mt-0.5">
          <span className="text-gray-500">
            Cierra {formatMomento(p.fecha_cierre, "diaHora", "sin fecha")}
          </span>{" "}
          {cierre.urgente ? (
            <span className="inline-flex items-center gap-1 font-semibold text-gray-900">
              <AlarmClock size={12} aria-hidden />
              {cierre.texto}
            </span>
          ) : (
            <span className="text-gray-500">({cierre.texto})</span>
          )}
        </p>
        {o.estado === "seguida" && (
          <p className="text-xs font-semibold text-sky-800 mt-1">
            En seguimiento · Mercado Público: {p.estado ?? "sin estado"}
          </p>
        )}
        {o.razon && <p className="text-sm text-gray-700 mt-1">{o.razon}</p>}
        {o.anterior && (
          <p className="text-xs text-gray-600 mt-1">
            {textoDelAnterior(o.anterior)}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {/* El alto valor ya no es prioridad (decisión 64): solo la comuna
              cercana va en violeta. */}
          {o.alertas
            .filter((a) => a === "comuna_cercana")
            .map((a) => (
              <span
                key={a}
                className={`px-2 py-0.5 text-xs rounded ${RAZON_DE_PRIORIDAD}`}
              >
                {ALERTAS[a] ?? a}
              </span>
            ))}
          {o.etiquetas
            .filter((e) => e !== "otro")
            .map((e) => (
              <span
                key={e}
                className="px-2 py-0.5 text-xs rounded bg-white/70 text-gray-600 border border-gray-200"
              >
                {ETIQUETAS[e] ?? e}
              </span>
            ))}
          {estado && o.estado !== "nueva" && (
            <span className={`px-2 py-0.5 text-xs rounded ${estado.clases}`}>
              {estado.label}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 items-stretch">
        {o.estado === "nueva" ? (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={solo(() => onDecidir("en_estudio"))}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Me interesa
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={solo(() => onDecidir("descartada"))}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
            >
              Descartar
            </button>
          </>
        ) : o.estado === "descartada" ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={solo(() => onDecidir("nueva"))}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
          >
            Recuperar
          </button>
        ) : (
          <Link
            to={`/oportunidades/${o.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1.5 text-xs font-semibold text-center text-gray-700 bg-white rounded-lg border border-gray-200 hover:bg-gray-100"
          >
            Ver ficha
          </Link>
        )}
      </div>
    </li>
  );
}
