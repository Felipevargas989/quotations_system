import { formatMomento } from "../../utils/dates";
import { cuandoCierra } from "./oportunidades.utils";
import SetParaMercadoPublico from "./SetParaMercadoPublico";
import TituloDeBloque from "./TituloDeBloque";
import ValidacionDeDocumentos from "./ValidacionDeDocumentos";

// «SUBIR A MERCADO PÚBLICO» (decisión 79 del doc 17, 26-10): el paso 3 de
// «Mi postulación». Felipe: "hagamos un orden lógico". Con el cierre a la
// vista, primero «Validar todo» (la IA revisa todo contra las bases) y
// después el ZIP con una carpeta por cada parte del portal.

export default function SubirAMercadoPublico({
  oportunidadId,
  codigo,
  cierre,
}: {
  readonly oportunidadId: number;
  readonly codigo: string;
  readonly cierre: string | null;
}) {
  const cuando = cuandoCierra(cierre);
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-gray-900">
          <TituloDeBloque numero={3}>Subir a Mercado Público</TituloDeBloque>
        </h2>
        {cierre && (
          <p
            className={`text-xs ${cuando.urgente ? "font-semibold text-red-600" : "text-gray-500"}`}
          >
            {cuando.cerrada
              ? `Cerró el ${formatMomento(cierre, "diaHora")}.`
              : `Cierra el ${formatMomento(cierre, "diaHora")} · ${cuando.texto.replace(/^cierra /, "")}`}
          </p>
        )}
      </div>
      <ValidacionDeDocumentos oportunidadId={oportunidadId} cierre={cierre} />
      <SetParaMercadoPublico oportunidadId={oportunidadId} codigo={codigo} />
    </section>
  );
}
