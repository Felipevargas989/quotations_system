import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  firmarDocumentos,
  type GeneracionesDeOportunidad,
  type TipoProceso,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import AdjuntosDeLaOportunidad from "./AdjuntosDeLaOportunidad";
import EstadoDeGeneracion from "./EstadoDeGeneracion";
import { sePuedeFirmar } from "./oportunidades.utils";
import { claveDeGeneraciones, useGeneraciones } from "./useGeneraciones";

// MI POSTULACIÓN (doc 17, sprint 3, pasos 3 y 4): lo que la empresa va a
// presentar, con el botón "Firmar" en cada Word que todavía no está
// firmado. La firma va en dos tiempos (decidido el 17-10): lo que hace la
// IA sale SIN firma, se revisa y recién ahí se firma; así nunca sale un
// documento firmado que nadie miró.

export default function MiPostulacion({
  oportunidadId,
  codigo,
  tipo,
}: {
  readonly oportunidadId: number;
  readonly codigo: string;
  readonly tipo: TipoProceso;
}) {
  const qc = useQueryClient();
  const { data: generaciones } = useGeneraciones(oportunidadId);
  const [porFirmar, setPorFirmar] = useState<number | null>(null);
  const firmando = generaciones?.firma?.estado === "procesando";

  const firmar = useMutation({
    mutationFn: (adjuntoId: number) =>
      firmarDocumentos(oportunidadId, [adjuntoId]),
    onSuccess: (fila) => {
      qc.setQueryData<GeneracionesDeOportunidad>(
        claveDeGeneraciones(oportunidadId),
        (antes) => ({
          anexos: antes?.anexos ?? null,
          propuesta: antes?.propuesta ?? null,
          firma: fila,
        }),
      );
      toast.success("La IA está poniendo la firma.");
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo firmar.")),
    onSettled: () => setPorFirmar(null),
  });

  return (
    <AdjuntosDeLaOportunidad
      oportunidadId={oportunidadId}
      codigo={codigo}
      tipo={tipo}
      seccion="postulacion"
      accionesDeFila={(a) =>
        !sePuedeFirmar(a) ? null : porFirmar === a.id ? (
          <ConfirmInline
            question="¿Ya lo revisaste? Se le pone la foto de la firma."
            yesLabel="Sí, firmar"
            onYes={() => firmar.mutate(a.id)}
            onNo={() => setPorFirmar(null)}
            busy={firmar.isPending}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPorFirmar(a.id)}
            disabled={firmando}
            title={firmando ? "Ya hay una firma en curso" : undefined}
            className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900 disabled:opacity-50"
          >
            <PenLine size={14} /> Firmar
          </button>
        )
      }
      pie={
        generaciones?.firma ? (
          <div className="p-3 rounded-lg bg-gray-50">
            <EstadoDeGeneracion tipo="firma" generacion={generaciones.firma} />
          </div>
        ) : null
      }
    />
  );
}
