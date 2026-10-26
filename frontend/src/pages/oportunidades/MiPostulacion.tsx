import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  type AdjuntoDeOportunidad,
  firmarDocumentos,
  type Generacion,
  type GeneracionesDeOportunidad,
  getAdjuntos,
  getValidacion,
} from "../../services/oportunidades.service";
import { getOfertaDeLaPostulacion } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import AdjuntosDeLaOportunidad from "./AdjuntosDeLaOportunidad";
import { sinFirmarDeLaUltimaVuelta, sinLosWordYaFirmados } from "./firmarTodos";
import {
  cuantosFirmados,
  type DetalleDelDocumento,
  enOrden,
  type EstadoDelDocumento,
  notasDeLaPostulacion,
} from "./notasDeLaPostulacion";
import { sePuedeFirmar, TEXTOS_DE_GENERACION } from "./oportunidades.utils";
import TituloDeBloque from "./TituloDeBloque";
import {
  claveDeGeneraciones,
  claveDeLaPostulacion,
  useGeneraciones,
} from "./useGeneraciones";
import {
  claveDeLaOferta,
  vueltaDeLaPostulacion,
} from "./vueltaDeLaPostulacion";

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
//
// Desde el 26-10 (decisión 79) es el paso 2, «Tus documentos». Felipe:
// "bajo cada formulario podría estar como el detalle de qué es lo que falta
// completar... si es que hubiese algo que revisar". Cada formulario con su
// estado (firmado, por completar, por firmar) y, debajo, lo que dijeron la
// IA al llenarlo, la firma y la última validación (notasDeLaPostulacion.ts).

// La pantalla se baja recién al abrir el primer documento.
const EditorDeWord = lazy(() => import("./EditorDeWord"));

const ESTADOS: Record<
  EstadoDelDocumento,
  { readonly label: string; readonly clases: string }
> = {
  firmado: { label: "firmado", clases: "bg-green-100 text-green-800" },
  por_completar: {
    label: "por completar",
    clases: "bg-amber-100 text-amber-800",
  },
  por_revisar: {
    label: "por revisar",
    clases: "bg-yellow-100 text-yellow-800",
  },
  por_firmar: { label: "por firmar", clases: "bg-sky-100 text-sky-800" },
  subido: { label: "subido", clases: "bg-gray-100 text-gray-600" },
};

function DetalleDelArchivo({
  detalle,
}: {
  readonly detalle: DetalleDelDocumento | undefined;
}) {
  if (!detalle || (detalle.notas.length === 0 && !detalle.aviso)) return null;
  return (
    <div className="mt-0.5 space-y-0.5">
      {detalle.notas.length > 0 && (
        <ul className="list-disc pl-4 text-xs space-y-0.5">
          {detalle.notas.map((n) => (
            <li
              key={n.texto}
              className={
                n.tono === "completar" ? "text-amber-800" : "text-gray-600"
              }
            >
              {n.texto}
            </li>
          ))}
        </ul>
      )}
      {detalle.aviso && (
        <p className="text-xs italic text-gray-500">{detalle.aviso}</p>
      )}
    </div>
  );
}

/** Solo lo que no se ve en las filas: firmando, o por qué no resultó. */
function EstadoDeLaFirma({
  firma,
}: {
  readonly firma: Generacion | null | undefined;
}) {
  if (!firma) return null;
  if (firma.estado === "procesando") {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <Loader2 size={14} className="animate-spin" />{" "}
        {TEXTOS_DE_GENERACION.firma.trabajando}
      </p>
    );
  }
  if (firma.estado === "error") {
    return (
      <p className="text-sm text-red-600">
        La firma del{" "}
        {formatMomento(firma.terminado_en ?? firma.creado_en, "diaHora")} no
        resultó: {firma.error}
      </p>
    );
  }
  const descartados = firma.resultado?.descartados ?? [];
  return descartados.length > 0 ? (
    <ul className="list-disc pl-5 text-xs text-red-700 space-y-0.5">
      {descartados.map((d) => (
        <li key={d.nombre}>
          {d.nombre}: {d.motivo}
        </li>
      ))}
    </ul>
  ) : null;
}

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
  // La misma consulta que «Validar todo»: al terminar, las notas se ponen
  // al día solas.
  const { data: validacion } = useQuery({
    queryKey: ["oportunidades", "validacion", oportunidadId],
    queryFn: () => getValidacion(oportunidadId),
  });
  const { data: oferta } = useQuery({
    queryKey: claveDeLaOferta(oportunidadId),
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
  });
  const sinFirma = sinFirmarDeLaUltimaVuelta(generaciones, postulacion);
  const aLaVista = enOrden(sinLosWordYaFirmados(postulacion));
  const { porDocumento } = notasDeLaPostulacion(
    aLaVista,
    generaciones,
    validacion,
  );
  const { firmados, total } = cuantosFirmados(aLaVista);
  const sinPropuesta =
    vueltaDeLaPostulacion(oferta, generaciones)?.propuesta.estado === "no_va";

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
        titulo={<TituloDeBloque numero={2}>Tus documentos</TituloDeBloque>}
        descripcion={
          total === 0
            ? "Lo que vas a presentar: los anexos que llena la IA al armar la postulación y lo que subas tú. Bajo cada uno, lo que falta o hay que revisar."
            : `${
                firmados === total
                  ? total === 1
                    ? "Firmado."
                    : `Los ${total} firmados.`
                  : `${firmados} de ${total} firmados.`
              }${sinPropuesta ? " La propuesta técnica no va aparte: el detalle va en el anexo de calidad de la oferta." : ""}`
        }
        filtrar={(todosLosArchivos) =>
          enOrden(sinLosWordYaFirmados(todosLosArchivos))
        }
        estadoDeFila={(a) =>
          ESTADOS[porDocumento.get(a.id)?.estado ?? "subido"]
        }
        detalleDeFila={(a) => (
          <DetalleDelArchivo detalle={porDocumento.get(a.id)} />
        )}
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
            <EstadoDeLaFirma firma={generaciones?.firma} />
          </>
        }
      />
    </>
  );
}
