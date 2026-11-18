import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import { cambiarTipo, getPreviaDelTipo } from "../../services/people.service";
import type { Persona } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile } from "../../utils/dates";
import {
  chipTipoPersona,
  etiquetaTipoPersona,
  type TipoPersona,
} from "../../utils/estadoPersona";
import { fechaChilena, textosDeLaVentana } from "./tipoVigente";

// LA VENTANA «DESDE» (doc 10 §12, 17-11-2026)
//
// Felipe: "la ventana desde desarrollemos en el laboratorio". Cambiar el
// tipo en la ficha ya no rige desde el día en que se guarda: se elige
// desde qué día (hoy por defecto). Sofía pasó a planta el 01-11 y se
// registró después. La cuenta de qué pasa con sus días la hace el motor;
// acá solo se muestra, y lo ya liquidado o en nómina se avisa en ámbar.

export default function VentanaDesde({
  persona,
  kind,
  onCerrar,
}: {
  readonly persona: Persona;
  /** El tipo al que pasa. */
  readonly kind: TipoPersona;
  readonly onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [desde, setDesde] = useState(hoyEnChile);
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(desde);

  const previa = useQuery({
    queryKey: ["people", "tipo-previa", persona.id, kind, desde],
    queryFn: () => getPreviaDelTipo(persona.id, kind, desde),
    enabled: fechaOk,
    retry: false,
  });

  const confirmar = useMutation({
    mutationFn: () => cambiarTipo(persona.id, kind, desde),
    onSuccess: (r) => {
      toast.success(
        r.futuro
          ? `Listo: pasa a ${etiquetaTipoPersona(kind).toLowerCase()} el ${fechaChilena(desde)}.`
          : `Listo: es ${etiquetaTipoPersona(kind).toLowerCase()} desde el ${fechaChilena(desde)}.`,
      );
      // Cambian sus días y su ficha: se relee todo lo de Personal.
      void qc.invalidateQueries({ queryKey: ["people"] });
      onCerrar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const textos = previa.data ? textosDeLaVentana(previa.data) : null;
  const nombreNuevo = etiquetaTipoPersona(kind).toLowerCase();

  return (
    <Modal
      titulo={`Pasa a ${nombreNuevo}`}
      subtitulo={persona.name}
      ancho="max-w-md"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => confirmar.mutate()}
            disabled={!previa.data || confirmar.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmar.isPending ? "Guardando…" : `Cambiar a ${nombreNuevo}`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`px-2 py-0.5 rounded-full ${chipTipoPersona(persona.default_kind)}`}
          >
            {etiquetaTipoPersona(persona.default_kind)}
          </span>
          <span className="text-gray-400">→</span>
          <span className={`px-2 py-0.5 rounded-full ${chipTipoPersona(kind)}`}>
            {etiquetaTipoPersona(kind)}
          </span>
        </div>

        <div>
          <label
            htmlFor="tipo-desde"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Desde
          </label>
          <input
            id="tipo-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 min-h-[3.5rem]">
          {previa.isLoading && fechaOk ? (
            <p className="text-sm text-gray-400">Revisando sus días…</p>
          ) : previa.isError ? (
            <p className="text-sm text-red-700">
              {humanizeApiError(previa.error)}
            </p>
          ) : textos ? (
            <ul className="space-y-1 text-sm text-gray-800">
              {textos.lineas.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-gray-500 mt-2">
            Los días de eventos no cambian.
          </p>
        </div>

        {textos?.aviso && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{textos.aviso}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
