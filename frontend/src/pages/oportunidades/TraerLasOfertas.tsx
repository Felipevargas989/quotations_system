import { CloudDownload, Loader2 } from "lucide-react";
import { type LineaDeTraerOfertas, useTraerOfertas } from "./useTraerOfertas";

// EL BOTÓN «TRAER LAS OFERTAS» (decisión 123 del doc 17, 10-11): en «La
// competencia» de una licitación, arriba a la derecha, con la misma forma
// que «Traer los documentos» de «Bases y anexos». Quieto mientras trae: el
// botón guarda el ancho del texto más largo y lo que hay que decir va
// debajo (que está trayendo, o cómo terminó la última vuelta).

const TONO: Record<LineaDeTraerOfertas["tono"], string> = {
  espera: "text-gray-500",
  bien: "text-green-700",
  ojo: "text-amber-700",
  error: "text-red-600",
};

export default function TraerLasOfertas({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const { trayendo, pedir, linea } = useTraerOfertas(oportunidadId);
  return (
    <div className="flex flex-col items-end gap-1 sm:shrink-0">
      <button
        type="button"
        onClick={pedir}
        disabled={trayendo}
        title="Del cuadro de ofertas público de Mercado Público"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {trayendo ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <CloudDownload size={14} aria-hidden />
        )}
        <span className="grid">
          <span
            aria-hidden={trayendo}
            className={`col-start-1 row-start-1 ${trayendo ? "invisible" : ""}`}
          >
            Traer las ofertas
          </span>
          <span
            aria-hidden={!trayendo}
            className={`col-start-1 row-start-1 ${trayendo ? "" : "invisible"}`}
          >
            Trayendo…
          </span>
        </span>
      </button>
      {linea && (
        <p className={`max-w-sm text-right text-xs ${TONO[linea.tono]}`}>
          {linea.texto}
        </p>
      )}
    </div>
  );
}
