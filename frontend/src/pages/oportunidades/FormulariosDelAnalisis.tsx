import { FileText } from "lucide-react";
import type { FormularioDelAnalisis } from "../../services/oportunidades.service";
import { nombreLegible } from "./fichaEnCorto";
import { PARTE_DE_LA_OFERTA } from "./formulariosDelComprador";

// LOS FORMULARIOS QUE ENCONTRÓ EL ANÁLISIS DE LAS BASES (Felipe, 18-10:
// "que cuando la IA analice los documentos identifique dónde están los
// formularios a rellenar... y deje listo el proceso de generación"). Cada
// uno con el archivo y la página donde viene en blanco, en qué parte de la
// oferta se entrega, y los que no aplican o no vinieron en lo subido.

export default function FormulariosDelAnalisis({
  formularios,
}: {
  readonly formularios: readonly FormularioDelAnalisis[];
}) {
  const aplican = formularios.filter((f) => f.aplica).length;
  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <FileText size={14} /> Formularios para llenar ({aplican})
      </h3>
      <ul className="divide-y divide-gray-100 text-sm">
        {formularios.map((f, i) => (
          <li
            key={`${f.nombre}-${i}`}
            className={`py-1.5 ${f.aplica ? "" : "text-gray-400"}`}
          >
            <span
              className={`font-medium ${f.aplica ? "text-gray-900" : "line-through"}`}
            >
              {f.nombre}
            </span>
            {!f.aplica ? (
              <span className="ml-1.5 text-xs">
                No aplica{f.por_que_no_aplica ? `: ${f.por_que_no_aplica}` : ""}
              </span>
            ) : f.archivo ? (
              <span className="ml-1.5 text-xs text-gray-500">
                {nombreLegible(f.archivo)}
                {f.paginas ? `, pág. ${f.paginas}` : ""}
                {PARTE_DE_LA_OFERTA[f.se_entrega_en]
                  ? ` · se entrega en la ${PARTE_DE_LA_OFERTA[f.se_entrega_en]}`
                  : ""}
              </span>
            ) : (
              <span className="ml-1.5 text-xs text-amber-700">
                No viene en lo que subiste: búscalo en Mercado Público y súbelo
                a «Bases y anexos».
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
