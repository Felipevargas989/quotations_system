import { ClipboardCopy, ExternalLink, FileWarning } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import type { OferenteComparado } from "../../services/comparacion.service";
import { nombreCorto } from "./lineasDeLaComparacion";

// LOS INCUMPLIMIENTOS GRAVES Y EL RECLAMO (decisión 59 del doc 17, 20-10).
// Felipe: "dejemos en el comparativo una función de que en caso de
// incumplimiento grave, genere un texto para hacer un reclamos en el centro
// de ayuda". Lo que según las bases o la ley deja fuera una oferta, con su
// prueba y su regla. En la de un competidor, mientras no se adjudique,
// «Redactar reclamo» muestra el texto que armó el motor para copiarlo y
// pegarlo en el Centro de Ayuda de Mercado Público: Eventia no envía nada.
// Si algo es porque «no está», antes pregunta si se subió todo lo de ese
// oferente (el 20-10, con Sol de Quillón, faltaban archivos por subir y la
// comparación los dio por no presentados).
//
// Desde la decisión 125 (11-11) es la tercera columna de cada oferta, «Lo
// puede dejar fuera», siempre en su lugar aunque esté vacía. Y el reclamo
// solo llega para quien compite contigo en tu línea (lo decide el motor).

export const CENTRO_DE_AYUDA = "https://ayuda.mercadopublico.cl/";

type Paso = "cerrado" | "confirmar" | "falta" | "texto";

/** El reclamo de una oferta: el botón, la pregunta si algo «falta» y el
 *  texto para copiar. Nada si el motor no armó uno. */
export function Reclamo({
  oferente: o,
  adjudicada,
}: {
  readonly oferente: OferenteComparado;
  /** Ya adjudicada: no se ofrece el reclamo, sino el camino del Tribunal. */
  readonly adjudicada: boolean;
}) {
  const [paso, setPaso] = useState<Paso>("cerrado");
  const reclamo = !o.es_tuya ? (o.reclamo ?? null) : null;
  if (!reclamo) return null;
  const quien = nombreCorto(o);
  const porAusencia = (o.graves ?? []).some((g) => g.por_ausencia);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(reclamo);
      toast.success("Texto copiado: pégalo en el Centro de Ayuda.");
    } catch {
      toast.error("No se pudo copiar: selecciónalo y cópialo a mano.");
    }
  };

  const redactar = (
    <button
      type="button"
      onClick={() => setPaso(porAusencia ? "confirmar" : "texto")}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
    >
      <FileWarning size={13} /> Redactar reclamo
    </button>
  );

  if (adjudicada) {
    return (
      <p className="text-xs text-gray-700">
        Ya se adjudicó: lo que queda es impugnar ante el Tribunal de
        Contratación Pública, dentro de 10 días hábiles desde que se publicó la
        adjudicación.
      </p>
    );
  }
  if (paso === "cerrado") return redactar;
  if (paso === "confirmar") {
    return (
      <ConfirmInline
        question={`¿Está todo lo que presentó ${quien}?`}
        yesLabel="Sí, está todo"
        tono="normal"
        onYes={() => setPaso("texto")}
        onNo={() => setPaso("falta")}
      />
    );
  }
  if (paso === "falta") {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-amber-800">
          Trae o sube todo lo que presentó {quien} y vuelve a comparar antes de
          reclamar: lo que falta puede estar en lo que no llegó.
        </p>
        {redactar}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <textarea
        readOnly
        value={reclamo}
        rows={14}
        aria-label={`Reclamo sobre la oferta de ${quien}`}
        className="w-full p-2 text-xs text-gray-900 bg-white border border-gray-300 rounded-lg"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void copiar()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <ClipboardCopy size={13} /> Copiar
        </button>
        <a
          href={CENTRO_DE_AYUDA}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          Abrir el Centro de Ayuda <ExternalLink size={12} />
        </a>
      </div>
      <p className="text-xs text-gray-600">
        Pégalo en un reclamo del Centro de Ayuda, con el ID de la licitación.
        Antes, revisa que cada dato sea cierto: lo encontró la IA. Eventia no
        envía nada.
      </p>
    </div>
  );
}

/** «Lo puede dejar fuera»: cada incumplimiento con dónde se ve y la regla
 *  de las bases, y el reclamo si corresponde. */
export default function IncumplimientosGraves({
  oferente: o,
  adjudicada,
}: {
  readonly oferente: OferenteComparado;
  readonly adjudicada: boolean;
}) {
  const graves = o.graves ?? [];
  return (
    <div className="space-y-1.5">
      <span className="inline-block px-1.5 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">
        Lo puede dejar fuera
      </span>
      {graves.length === 0 ? (
        <p className="text-sm text-gray-500">Nada a la vista</p>
      ) : (
        <ul className="space-y-2">
          {graves.map((g) => (
            <li key={g.que} className="space-y-0.5">
              <p className="text-sm text-gray-900">{g.que}</p>
              <p className="text-xs text-gray-600">Dónde se ve: {g.prueba}</p>
              <p className="text-xs text-gray-600">Regla: {g.regla}</p>
              {g.por_ausencia && (
                <p className="text-xs text-amber-800">
                  Es porque no aparece entre lo que llegó de este oferente.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Reclamo oferente={o} adjudicada={adjudicada} />
    </div>
  );
}
