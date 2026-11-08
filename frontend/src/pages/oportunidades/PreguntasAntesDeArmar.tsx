import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import type { MarcaDeExigencia } from "../../services/exigencias.service";
import {
  type PreguntaDeLaPostulacion,
  responderYArmar,
  type TrabajoDeOferta,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { claveDeLoQueSabemos } from "./exigencias";
import LoTengoONoPuedo from "./LoTengoONoPuedo";

// LAS PREGUNTAS ANTES DE ARMAR (decisión 119, parte 3, 07-11). Felipe:
// "vuelvo a la licitación, me aparece el modal de lo que me falta, yo
// respondo las preguntas y lo genera. Pero una vez que ya lo generó, en la
// siguiente cotización no me vuelve a preguntar". Solo lo que la IA no sabe
// de la empresa; lo respondido queda en «Mi empresa» y marcado en «Bases y
// criterios», y recién ahí se arma.

type Respuesta = { marca: MarcaDeExigencia | null; detalle: string };

export default function PreguntasAntesDeArmar({
  oportunidadId,
  total,
  preguntas,
  onCerrar,
  onArmando,
}: {
  readonly oportunidadId: number;
  /** El precio con que se pidió armar, con IVA. */
  readonly total: number;
  readonly preguntas: PreguntaDeLaPostulacion[];
  readonly onCerrar: () => void;
  /** Ya partió el armado: con la oferta en curso. */
  readonly onArmando: (fila: TrabajoDeOferta) => void;
}) {
  const qc = useQueryClient();
  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({});
  const de = (clave: string): Respuesta =>
    respuestas[clave] ?? { marca: null, detalle: "" };
  const poner = (clave: string, cambio: Partial<Respuesta>) =>
    setRespuestas((antes) => ({
      ...antes,
      [clave]: { ...de(clave), ...antes[clave], ...cambio },
    }));
  const faltan = preguntas.filter((p) => !de(p.clave).marca).length;

  const responder = useMutation({
    mutationFn: () =>
      responderYArmar(
        oportunidadId,
        total,
        preguntas.map((p) => {
          const r = de(p.clave);
          return {
            clave: p.clave,
            pregunta: p.pregunta,
            exigencia: p.exigencia,
            respuesta: r.marca ?? "no_puedo",
            ...(r.detalle.trim() ? { detalle: r.detalle.trim() } : {}),
          };
        }),
      ),
    onSuccess: (fila) => {
      // Lo respondido quedó en «Mi empresa» y en «Bases y criterios».
      void qc.invalidateQueries({ queryKey: claveDeLoQueSabemos });
      void qc.invalidateQueries({
        queryKey: ["oportunidades", "ficha", oportunidadId],
      });
      toast.success("La IA está armando la postulación: tarda unos minutos.");
      onArmando(fila);
    },
    onError: (e) =>
      toast.error(
        humanizeApiError(e, "No se pudieron guardar las respuestas."),
      ),
  });

  return (
    <Modal
      titulo="Antes de armar, responde esto"
      subtitulo={`${preguntas.length === 1 ? "Una pregunta" : `${preguntas.length} preguntas`} sobre tu empresa. Lo que respondas queda en «Mi empresa» y no se vuelve a preguntar.`}
      onCerrar={onCerrar}
      pie={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {!(total > 0)
              ? "Escribe el precio antes de armar"
              : faltan > 0
                ? `${faltan === 1 ? "Falta 1" : `Faltan ${faltan}`} por responder`
                : "Todo respondido"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={responder.isPending}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Ahora no
            </button>
            <button
              type="button"
              onClick={() => responder.mutate()}
              disabled={faltan > 0 || !(total > 0) || responder.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {responder.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Guardar y armar
            </button>
          </div>
        </div>
      }
    >
      <ul className="divide-y divide-gray-100">
        {preguntas.map((p) => {
          const r = de(p.clave);
          return (
            <li key={p.clave} className="py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium text-gray-900">
                    {p.pregunta}
                  </p>
                  {p.pregunta !== p.exigencia && (
                    <p className="text-xs text-gray-500">
                      Las bases: «{p.exigencia}»
                    </p>
                  )}
                </div>
                <LoTengoONoPuedo
                  marca={r.marca}
                  onMarcar={(marca) => poner(p.clave, { marca })}
                  deshabilitado={responder.isPending}
                />
              </div>
              {r.marca && (
                <input
                  type="text"
                  value={r.detalle}
                  onChange={(e) => poner(p.clave, { detalle: e.target.value })}
                  maxLength={500}
                  disabled={responder.isPending}
                  aria-label={`Detalle de «${p.pregunta}»`}
                  placeholder={
                    r.marca === "lo_tengo"
                      ? "Cómo, si quieres (ej: rampa en la entrada principal)"
                      : "Por qué, si quieres"
                  }
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
