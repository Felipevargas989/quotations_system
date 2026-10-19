import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  armarLaOferta,
  getOfertaDeLaPostulacion,
  type FilaDeLaOferta,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";

// LA OFERTA (decisión 33 del doc 17, sprint G, 19-10). Felipe: "busca una
// forma que sea escalable... quizás vincular a la cotización y que ambos
// lean la cotización". La IA arma UNA vez qué se ofrece por cada punto de
// las bases y con qué productos del catálogo; de ahí sale la cotización
// («Crear cotización», abajo) y de la cotización, la propuesta técnica y
// los anexos. Lo que falta en el catálogo se agrega una vez, con su precio.

const ORIGEN: Record<
  FilaDeLaOferta["origen"],
  { texto: string; tono: string }
> = {
  catalogo: { texto: "Catálogo", tono: "bg-green-50 text-green-700" },
  subcontratar: {
    texto: "Agregar al catálogo",
    tono: "bg-amber-50 text-amber-800",
  },
  completar: { texto: "Por definir", tono: "bg-gray-100 text-gray-700" },
};

export default function OfertaDeLaPostulacion({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "oferta", oportunidadId];
  const { data: trabajo } = useQuery({
    queryKey: clave,
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });
  const armar = useMutation({
    mutationFn: () => armarLaOferta(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(clave, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo armar la oferta.")),
  });
  const enCurso = trabajo?.estado === "procesando" || armar.isPending;
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <ClipboardList size={15} /> La oferta
          </h2>
          <p className="text-xs text-gray-500">
            La IA arma qué ofreces por cada punto de las bases, con tu catálogo.
            De aquí salen la cotización, la propuesta técnica y los anexos: los
            tres dicen lo mismo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => armar.mutate()}
          disabled={enCurso}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {enCurso && <Loader2 size={14} className="animate-spin" />}
          {enCurso
            ? "Armando la oferta…"
            : r
              ? "Volver a armar"
              : "Armar la oferta con IA"}
        </button>
      </div>

      {trabajo?.estado === "error" && (
        <p className="text-sm text-red-700">
          {trabajo.error ?? "No se pudo armar la oferta."}
        </p>
      )}

      {r && (
        <div className="space-y-4">
          {r.resumen && <p className="text-sm text-gray-800">{r.resumen}</p>}

          {r.faltan_en_el_catalogo.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Falta en tu catálogo ({r.faltan_en_el_catalogo.length})
              </p>
              <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">
                {r.faltan_en_el_catalogo.map((f) => (
                  <li key={f.que}>
                    {f.que}
                    {f.por_que && (
                      <span className="text-amber-700"> · {f.por_que}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800">
                Agrégalo al catálogo con su precio y vuelve a armar la oferta:
                así la cotización cobra lo que de verdad cuesta.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-3 font-semibold">Lo que piden</th>
                  <th className="py-1.5 pr-3 font-semibold">Lo que ofreces</th>
                  <th className="py-1.5 font-semibold">De dónde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {r.matriz.map((f, i) => (
                  <tr key={`${i}-${f.especificacion}`} className="align-top">
                    <td className="py-1.5 pr-3 text-gray-700">
                      {f.especificacion}
                      {f.pagina > 0 && (
                        <span className="text-xs text-gray-400">
                          {" "}
                          (pág. {f.pagina})
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-900">{f.como}</td>
                    <td className="py-1.5">
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${ORIGEN[f.origen].tono}`}
                      >
                        {ORIGEN[f.origen].texto}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
