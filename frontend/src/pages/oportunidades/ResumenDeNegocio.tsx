import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  getResumenDeNegocio,
  pedirResumenDeNegocio,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";

// EL RESUMEN DE NEGOCIO DE UNA LICITACIÓN SEGUIDA (decisión 30 del doc 17,
// sprint E, 19-10). Felipe: "quién se la ganó, qué incluye el programa, qué
// postuló, bajo qué precios... información que me pueda servir para
// negocios del Valle". Lo hace la IA con lo publicado, el acta y lo subido
// a «Bases y anexos», cruzado con lo que vende la empresa («Mi empresa»).

const Lista = ({
  titulo,
  cosas,
  numerada = false,
}: {
  readonly titulo: string;
  readonly cosas: readonly string[];
  readonly numerada?: boolean;
}) =>
  cosas.length === 0 ? null : (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {titulo}
      </h3>
      {numerada ? (
        <ol className="list-decimal pl-5 text-sm text-gray-800 space-y-0.5">
          {cosas.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
          {cosas.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );

export default function ResumenDeNegocio({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "resumen-de-negocio", oportunidadId];
  const { data: trabajo } = useQuery({
    queryKey: clave,
    queryFn: () => getResumenDeNegocio(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 4000 : false,
  });
  const pedir = useMutation({
    mutationFn: () => pedirResumenDeNegocio(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(clave, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir el resumen.")),
  });
  const enCurso = trabajo?.estado === "procesando" || pedir.isPending;
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Sparkles size={15} /> Resumen de negocio
          </h2>
          <p className="text-xs text-gray-500">
            La IA lee lo publicado, el acta y lo que subiste a «Bases y anexos»,
            y lo cruza con lo que vende tu empresa («Mi empresa»).
          </p>
        </div>
        <button
          type="button"
          onClick={() => pedir.mutate()}
          disabled={enCurso}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {enCurso ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {r ? "Volver a hacer" : "Hacer resumen de negocio"}
        </button>
      </div>

      {enCurso && (
        <p className="text-sm text-gray-600">
          La IA está escribiendo el resumen: tarda uno o dos minutos.
        </p>
      )}
      {trabajo?.estado === "error" && (
        <p className="text-sm text-red-700">
          {trabajo.error ?? "No se pudo hacer el resumen."}
        </p>
      )}

      {r && (
        <div className="space-y-4">
          <p className="text-sm text-gray-800">{r.resumen}</p>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Quién ganó</p>
            <p className="text-sm font-semibold text-gray-900">
              {r.quien_gano}
            </p>
          </div>
          <Lista titulo="Qué incluye" cosas={r.que_incluye} />
          {r.ofertas.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Qué ofreció cada uno
              </h3>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {r.ofertas.map((o) => (
                  <li key={`${o.proveedor}-${o.precio}`} className="px-3 py-2">
                    <p className="text-sm">
                      <span className="font-semibold text-gray-900">
                        {o.proveedor}
                      </span>{" "}
                      · {o.precio}
                      {o.gano && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">
                          Ganó
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-600">{o.que_ofrecio}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <Lista titulo="Para tu empresa" cosas={r.para_tu_empresa} />
          </div>
          <Lista
            titulo="Siguientes pasos"
            cosas={r.siguientes_pasos}
            numerada
          />
          {trabajo?.costo_usd != null && (
            <p className="text-xs text-gray-400">
              Costó US${trabajo.costo_usd.toLocaleString("es-CL")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
