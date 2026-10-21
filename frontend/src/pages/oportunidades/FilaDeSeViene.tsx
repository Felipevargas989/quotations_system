import { AlarmClock, ExternalLink } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import type { SeViene } from "../../services/seViene.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import {
  filaDelSemaforo,
  NOMBRE_DEL_SEMAFORO,
  RAZON_DE_PRIORIDAD,
} from "./coloresDeLaBandeja";
import Ganadores from "./Ganadores";
import {
  ALERTAS,
  textoDeAnios,
  urlMercadoPublico,
} from "./oportunidades.utils";

// UNA SERIE DE «SE VIENE» (decisiones 62 y 63 del doc 17, 20-10): la franja
// y la razón del semáforo, cuándo se espera, los años en que salió y la
// última vez. Desde la 63, el sello de si se repite, según la IA (Felipe:
// "dos licitaciones con nombres similares, con montos similares, debería ser
// considerado una repetición"), y «Descartar», con confirmación, "si es que
// yo siento que no se va a repetir". Se recupera desde «Descartadas».

export default function FilaDeSeViene({
  s,
  ocupado,
  onDescartar,
}: {
  readonly s: SeViene;
  readonly ocupado: boolean;
  readonly onDescartar: (descartada: boolean) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const prioridad = (["comuna_cercana", "alto_valor"] as const).filter(
    (a) => s[a],
  );
  return (
    <li
      data-semaforo={s.semaforo ?? "sin_leer"}
      className={`p-3 space-y-1 border-l-4 ${filaDelSemaforo(s.semaforo)}`}
    >
      <span className="sr-only">
        {s.semaforo ? NOMBRE_DEL_SEMAFORO[s.semaforo] : "Sin leer"}.{" "}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{s.nombre}</p>
        <p
          className={`text-xs ${
            s.atrasada
              ? "inline-flex items-center gap-1 font-semibold text-gray-900"
              : "text-gray-500"
          }`}
        >
          {s.atrasada && <AlarmClock size={12} aria-hidden />}
          {s.atrasada
            ? `Debía salir cerca del ${formatMomento(s.esperada, "diaMes")} y todavía no aparece`
            : `Se espera cerca del ${formatMomento(s.esperada, "diaMes")}`}
        </p>
      </div>
      <p className="text-xs text-gray-500">
        {[s.organismo, s.comuna].filter(Boolean).join(" · ")}
      </p>
      {s.razon && <p className="text-sm text-gray-700">{s.razon}</p>}
      {!s.semaforo && (
        <p className="text-xs text-gray-500">
          La IA no pudo leerla todavía: se reintenta en una hora.
        </p>
      )}
      <p className="text-sm text-gray-700">
        {textoDeAnios(s.anios)}. La última vez (
        {formatMomento(s.ultima.fecha_publicacion, "medio")}){" "}
        {s.ultima.ganadores.length > 0 ? (
          <>
            ganó <Ganadores ganadores={s.ultima.ganadores} />
          </>
        ) : s.ultima.monto ? (
          `tenía ${formatCurrency(s.ultima.monto, "CLP")} de presupuesto`
        ) : (
          "no informó ganador"
        )}
        {s.ultima.oferentes != null &&
          ` · ${s.ultima.oferentes} ${s.ultima.oferentes === 1 ? "oferta" : "ofertas"}`}
        {" · "}
        <a
          href={urlMercadoPublico(s.ultima.codigo, "licitacion")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
        >
          {s.ultima.codigo}
          <ExternalLink size={12} />
        </a>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {s.repite !== null && (
            <span
              title={s.repeticion ?? undefined}
              className={`px-2 py-0.5 text-xs rounded ${
                s.repite
                  ? "bg-blue-50 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {s.repite ? "Se repite" : "Solo una vez"}
            </span>
          )}
          {prioridad.map((a) => (
            <span
              key={a}
              className={`px-2 py-0.5 text-xs rounded ${RAZON_DE_PRIORIDAD}`}
            >
              {ALERTAS[a]}
            </span>
          ))}
        </div>
        {s.semaforo &&
          (s.descartada ? (
            <button
              type="button"
              onClick={() => onDescartar(false)}
              disabled={ocupado}
              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              Recuperar
            </button>
          ) : confirmando ? (
            <ConfirmInline
              question="¿Descartar? No vuelve a aparecer en «Se viene»."
              yesLabel="Sí, descartar"
              tono="normal"
              busy={ocupado}
              onYes={() => {
                setConfirmando(false);
                onDescartar(true);
              }}
              onNo={() => setConfirmando(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="text-xs text-gray-500 hover:text-gray-900 hover:underline"
            >
              Descartar
            </button>
          ))}
      </div>
    </li>
  );
}
