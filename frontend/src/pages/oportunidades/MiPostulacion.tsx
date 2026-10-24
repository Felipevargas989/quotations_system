import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  type AdjuntoDeOportunidad,
  firmarDocumentos,
  getAdjuntos,
  type GeneracionesDeOportunidad,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import AdjuntosDeLaOportunidad from "./AdjuntosDeLaOportunidad";
import EstadoDeGeneracion from "./EstadoDeGeneracion";
import { sinFirmarDeLaUltimaVuelta, sinLosWordYaFirmados } from "./firmarTodos";
import { sePuedeFirmar } from "./oportunidades.utils";
import {
  claveDeGeneraciones,
  claveDeLaPostulacion,
  useGeneraciones,
} from "./useGeneraciones";

// MI POSTULACIÓN (doc 17, sprint 3, pasos 3 y 4): lo que la empresa va a
// presentar, con el botón "Firmar" en cada Word que todavía no está
// firmado. La firma va en dos tiempos (decidido el 17-10): lo que hace la
// IA sale SIN firma, se revisa y recién ahí se firma; así nunca sale un
// documento firmado que nadie miró. Desde el 19-10 la firma deja cada
// documento en PDF (lo que se sube a Mercado Público), y «Firmar todos»
// firma de una vez lo último que hizo la IA (firmarTodos.ts). Desde el
// 24-10 (decisión 78), «Abrir» muestra cada Word sin firmar en una sola
// pantalla para verlo y editarlo, con «Volver a validar» y «Firmar» ahí
// mismo (EditorDeWord). Felipe: "el ver y editar debería ser el mismo".

// La pantalla se baja recién al abrir el primer documento.
const EditorDeWord = lazy(() => import("./EditorDeWord"));

export default function MiPostulacion({
  oportunidadId,
  congelada = false,
}: {
  readonly oportunidadId: number;
  /** Postulada o ganada: lo postulado ya no se edita (decisión 33). */
  readonly congelada?: boolean;
}) {
  const qc = useQueryClient();
  const { data: generaciones } = useGeneraciones(oportunidadId);
  const [porFirmar, setPorFirmar] = useState<number | null>(null);
  const [todos, setTodos] = useState(false);
  const [editando, setEditando] = useState<AdjuntoDeOportunidad | null>(null);
  const firmando = generaciones?.firma?.estado === "procesando";
  const { data: postulacion = [] } = useQuery({
    queryKey: claveDeLaPostulacion(oportunidadId),
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });
  const sinFirma = sinFirmarDeLaUltimaVuelta(generaciones, postulacion);

  const firmar = useMutation({
    mutationFn: (adjuntos: number[]) =>
      firmarDocumentos(oportunidadId, adjuntos),
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
    onSettled: () => {
      setPorFirmar(null);
      setTodos(false);
    },
  });

  return (
    <>
      {editando && (
        <Suspense fallback={null}>
          <EditorDeWord
            oportunidadId={oportunidadId}
            adjunto={editando}
            onCerrar={() => setEditando(null)}
            onFirmar={(id) => firmar.mutate([id])}
            firmando={firmando}
          />
        </Suspense>
      )}
      <AdjuntosDeLaOportunidad
        oportunidadId={oportunidadId}
        seccion="postulacion"
        filtrar={sinLosWordYaFirmados}
        abrirAqui={(a) =>
          !congelada && sePuedeFirmar(a) ? () => setEditando(a) : undefined
        }
        accionesDeFila={(a) =>
          !sePuedeFirmar(a) ? null : porFirmar === a.id ? (
            <ConfirmInline
              question="¿Ya lo revisaste? Se le pone la foto de la firma, queda en PDF y el Word se borra."
              yesLabel="Sí, firmar"
              onYes={() => firmar.mutate([a.id])}
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
          <>
            {sinFirma.length > 1 &&
              !firmando &&
              (todos ? (
                <ConfirmInline
                  question={`¿Ya revisaste los ${sinFirma.length}? A cada uno se le pone la foto de la firma y queda en PDF; sus Word se borran.`}
                  yesLabel="Sí, firmar todos"
                  onYes={() => firmar.mutate(sinFirma)}
                  onNo={() => setTodos(false)}
                  busy={firmar.isPending}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setTodos(true)}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900"
                >
                  <PenLine size={14} /> Firmar todos ({sinFirma.length})
                </button>
              ))}
            {generaciones?.firma && (
              <div className="p-3 rounded-lg bg-gray-50">
                <EstadoDeGeneracion
                  tipo="firma"
                  generacion={generaciones.firma}
                />
              </div>
            )}
          </>
        }
      />
    </>
  );
}
