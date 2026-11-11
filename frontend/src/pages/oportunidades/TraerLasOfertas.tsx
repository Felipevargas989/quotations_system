import { CloudDownload, Loader2 } from "lucide-react";
import {
  type LineaDeTraerOfertas,
  MIENTRAS_TRAE,
  useTraerOfertas,
} from "./useTraerOfertas";

// EL BOTÓN «TRAER LAS OFERTAS» (decisión 123 del doc 17, 10-11): en «La
// competencia» de una licitación, arriba a la derecha, con la misma forma
// que «Traer los documentos» de «Bases y anexos». Quieto mientras trae: el
// botón guarda el ancho del texto más largo y lo que hay que decir va
// debajo (que está trayendo, o cómo terminó la última vuelta), en una línea
// que guarda su lugar aunque no se vea: al apretar, nada se mueve.
//
// Desde la decisión 125 (11-11) el botón principal de la pestaña es «Traer y
// comparar», que hace las dos cosas. Este queda al lado de la lista, en
// blanco (`secundario`), para quien quiere mirar las ofertas sin compararlas.

const TONO: Record<LineaDeTraerOfertas["tono"], string> = {
  espera: "text-gray-500",
  bien: "text-green-700",
  ojo: "text-amber-700",
  error: "text-red-600",
};

export default function TraerLasOfertas({
  oportunidadId,
  secundario = false,
}: {
  readonly oportunidadId: number;
  /** En blanco con borde: no es la acción principal de la pantalla. */
  readonly secundario?: boolean;
}) {
  const { trayendo, pedir, linea } = useTraerOfertas(oportunidadId);
  return (
    <div className="flex flex-col items-end gap-1 sm:shrink-0">
      <button
        type="button"
        onClick={pedir}
        disabled={trayendo}
        title="Del cuadro de ofertas público de Mercado Público"
        className={`inline-flex items-center gap-1.5 rounded-lg font-semibold disabled:opacity-50 ${
          secundario
            ? "px-2.5 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            : "px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700"
        }`}
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
      <p
        aria-hidden={!linea}
        className={`max-w-xl text-right text-xs ${linea ? TONO[linea.tono] : "invisible"}`}
      >
        {linea?.texto ?? MIENTRAS_TRAE}
      </p>
    </div>
  );
}
