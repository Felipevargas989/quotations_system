import { ClipboardCopy, ExternalLink, FileWarning } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import type { OferenteComparado } from "../../services/comparacion.service";

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

export const CENTRO_DE_AYUDA = "https://ayuda.mercadopublico.cl/";

type Paso = "cerrado" | "confirmar" | "falta" | "texto";

export default function IncumplimientosGraves({
  oferente: o,
  adjudicada,
}: {
  readonly oferente: OferenteComparado;
  readonly adjudicada: boolean;
}) {
  const [paso, setPaso] = useState<Paso>("cerrado");
  const graves = o.graves ?? [];
  if (graves.length === 0) return null;
  const porAusencia = graves.some((g) => g.por_ausencia);
  const reclamo = !o.es_tuya ? (o.reclamo ?? null) : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(reclamo ?? "");
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

  return (
    <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-800">
        <FileWarning size={13} /> Incumplimientos graves
      </p>
      <ul className="space-y-1.5">
        {graves.map((g) => (
          <li key={g.que} className="space-y-0.5">
            <p className="text-sm text-red-900">{g.que}</p>
            <p className="text-xs text-red-800">Dónde se ve: {g.prueba}</p>
            <p className="text-xs text-red-800">Regla: {g.regla}</p>
            {g.por_ausencia && (
              <p className="text-xs text-amber-800">
                No aparece en lo que subiste de este oferente.
              </p>
            )}
          </li>
        ))}
      </ul>

      {reclamo &&
        (adjudicada ? (
          <p className="text-xs text-gray-700">
            Ya se adjudicó: lo que queda es impugnar ante el Tribunal de
            Contratación Pública, dentro de 10 días hábiles desde que se publicó
            la adjudicación.
          </p>
        ) : paso === "cerrado" ? (
          redactar
        ) : paso === "confirmar" ? (
          <ConfirmInline
            question={`¿Subiste todo lo que presentó ${o.nombre}?`}
            yesLabel="Sí, subí todo"
            tono="normal"
            onYes={() => setPaso("texto")}
            onNo={() => setPaso("falta")}
          />
        ) : paso === "falta" ? (
          <div className="space-y-1.5">
            <p className="text-xs text-amber-800">
              Sube todo lo que presentó {o.nombre} y vuelve a comparar antes de
              reclamar: lo que falta puede estar en lo que no subiste.
            </p>
            {redactar}
          </div>
        ) : (
          <div className="space-y-1.5">
            <textarea
              readOnly
              value={reclamo}
              rows={14}
              aria-label={`Reclamo sobre la oferta de ${o.nombre}`}
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
              Pégalo en un reclamo del Centro de Ayuda, con el ID de la
              licitación. Antes, revisa que cada dato sea cierto: lo encontró la
              IA. Eventia no envía nada.
            </p>
          </div>
        ))}
    </div>
  );
}
