import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import type { MarcaDeExigencia } from "../../services/exigencias.service";
import {
  borrarLoQueSabemos,
  cambiarLoQueSabemos,
  getLoQueSabemos,
  type RespuestaDeLaEmpresa,
} from "../../services/loQueSabemos.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { claveDeLoQueSabemos } from "./exigencias";
import LoTengoONoPuedo from "./LoTengoONoPuedo";

// «LO QUE EVENTIA SABE DE TU EMPRESA» (decisión 119, parte 3, 07-11;
// migración 190). Felipe: "en la siguiente cotización no me vuelve a
// preguntar si tengo ramplas, po. Lo aprende como parte del conocimiento de
// la empresa". Lo que la empresa respondió al armar una postulación o marcó
// en «Bases y criterios» (si la IA no lo sabía): cada respuesta con su
// detalle y la licitación de donde salió. Aquí se corrige: la respuesta con
// los mismos dos botones, el detalle con «Cambiar» y «Borrar» la olvida.

type Cambios = { respuesta?: MarcaDeExigencia; detalle?: string };

export default function LoQueSabemosDeTuEmpresa() {
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useQuery({
    queryKey: claveDeLoQueSabemos,
    queryFn: getLoQueSabemos,
  });
  const [editando, setEditando] = useState<{
    id: number;
    detalle: string;
  } | null>(null);
  const [porBorrar, setPorBorrar] = useState<number | null>(null);

  const cambiar = useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: Cambios }) =>
      cambiarLoQueSabemos(id, cambios),
    onSuccess: (fila) => {
      qc.setQueryData<RespuestaDeLaEmpresa[]>(claveDeLoQueSabemos, (antes) =>
        antes?.map((r) =>
          r.id === fila.id ? { ...r, ...fila, oportunidad: r.oportunidad } : r,
        ),
      );
      setEditando(null);
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo cambiar la respuesta.")),
  });
  const borrar = useMutation({
    mutationFn: (id: number) => borrarLoQueSabemos(id),
    onSuccess: (_, id) => {
      qc.setQueryData<RespuestaDeLaEmpresa[]>(claveDeLoQueSabemos, (antes) =>
        antes?.filter((r) => r.id !== id),
      );
      setPorBorrar(null);
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo borrar la respuesta.")),
  });
  const ocupado = cambiar.isPending || borrar.isPending;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Brain size={15} /> Lo que Eventia sabe de tu empresa
        </h2>
        <p className="text-xs text-gray-500">
          Lo que respondiste al armar una postulación o marcaste en «Bases y
          criterios». La IA no te lo vuelve a preguntar y lo usa en tus
          documentos.
        </p>
      </div>

      {isLoading ? null : lista.length === 0 ? (
        <p className="text-sm text-gray-500">
          Todavía nada: se llena con lo que respondas al armar tu próxima
          postulación.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {lista.map((r) => (
            <li key={r.id} className="px-3 py-2 space-y-1.5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm text-gray-800">{r.pregunta}</p>
                  <p className="text-xs text-gray-500">
                    {r.detalle && <span>{r.detalle} · </span>}
                    {r.oportunidad?.codigo && r.oportunidad_id ? (
                      <>
                        de la{" "}
                        <Link
                          to={`/oportunidades/${r.oportunidad_id}`}
                          className="underline hover:text-gray-800"
                        >
                          {r.oportunidad.codigo}
                        </Link>{" "}
                        ·{" "}
                      </>
                    ) : null}
                    {formatMomento(r.actualizado_en, "medio")}
                    {editando?.id !== r.id && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() =>
                            setEditando({ id: r.id, detalle: r.detalle ?? "" })
                          }
                          disabled={ocupado}
                          className="font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Cambiar
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <LoTengoONoPuedo
                  marca={r.respuesta}
                  sinQuitar
                  deshabilitado={ocupado}
                  onMarcar={(respuesta) =>
                    respuesta &&
                    cambiar.mutate({ id: r.id, cambios: { respuesta } })
                  }
                />
                {porBorrar === r.id ? (
                  <ConfirmInline
                    question="¿Olvidar esta respuesta?"
                    yesLabel="Borrar"
                    onYes={() => borrar.mutate(r.id)}
                    onNo={() => setPorBorrar(null)}
                    busy={borrar.isPending}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPorBorrar(r.id)}
                    disabled={ocupado}
                    className="mt-1 text-gray-300 hover:text-red-500"
                    title="Borrar: la IA lo vuelve a preguntar"
                    aria-label={`Borrar «${r.pregunta}»`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {editando?.id === r.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editando.detalle}
                    onChange={(e) =>
                      setEditando({ id: r.id, detalle: e.target.value })
                    }
                    maxLength={500}
                    aria-label={`Detalle de «${r.pregunta}»`}
                    placeholder="Detalle (vacío lo borra)"
                    className="min-w-0 flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      cambiar.mutate({
                        id: r.id,
                        cambios: { detalle: editando.detalle },
                      })
                    }
                    disabled={ocupado}
                    className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="text-sm text-gray-500 hover:text-gray-800"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
