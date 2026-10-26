import { Loader2 } from "lucide-react";
import type {
  AdjuntoDeOportunidad,
  ValidacionDeDocumentos,
} from "../../services/oportunidades.service";
import { formatMomento } from "../../utils/dates";
import { avisosVigentes } from "./reglasDeLosAvisos";
import { notasDeLaPostulacion } from "./notasDeLaPostulacion";
import { useGeneraciones } from "./useGeneraciones";

// LOS AVISOS DE ESTE FORMULARIO, ARRIBA DEL DOCUMENTO (26-10). Felipe, con
// la validación de toda la postulación arriba del N°5 (hablaba del N°3, del
// N°4 y del F30): "¿esta validación que llegó acá al formulario 5?", y
// "que se actualicen los avisos: si son cosas que se corrigieron se deben
// eliminar, si no solo generan bulla". Reemplaza al resumen de la
// validación general: van solo las notas de este formulario, las mismas de
// «Tus documentos», y se van apenas se corrige lo que citaban
// (reglasDeLosAvisos.ts). Lo que es de antes de tus cambios y no se puede
// comprobar aquí se cuenta, para volver a validar.

export default function AvisosDelFormulario({
  oportunidadId,
  adjunto,
  validacion,
  pidiendo,
  texto,
  quedan,
}: {
  readonly oportunidadId: number;
  readonly adjunto: AdjuntoDeOportunidad;
  readonly validacion: ValidacionDeDocumentos | null | undefined;
  /** Se acaba de pedir «Volver a validar». */
  readonly pidiendo: boolean;
  /** El texto como se abrió y como está en pantalla. */
  readonly texto: { base: string; ahora: string };
  /** Los [COMPLETAR] que quedan. */
  readonly quedan: number;
}) {
  const { data: generaciones } = useGeneraciones(oportunidadId);

  if (pidiendo || validacion?.estado === "procesando") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Validando tus documentos contra las bases. Tarda un par de minutos.
      </p>
    );
  }
  if (validacion?.estado === "error") {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        La última validación no terminó. Vuelve a validar.
      </p>
    );
  }

  const { porDocumento } = notasDeLaPostulacion(
    [adjunto],
    generaciones,
    validacion,
  );
  const { notas, porRevisar } = avisosVigentes(
    porDocumento.get(adjunto.id),
    texto,
    quedan,
  );
  const validada = validacion?.estado === "listo";
  if (notas.length === 0 && porRevisar === 0 && !validada) return null;
  const clases =
    notas.length === 0 && porRevisar === 0
      ? "border-green-200 bg-green-50 text-green-900"
      : notas.some((n) => n.tono === "completar")
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-gray-200 bg-white text-gray-800";

  return (
    <div className={`space-y-1 rounded-lg border px-3 py-2 ${clases}`}>
      <p className="text-sm font-semibold">
        {notas.length > 0
          ? `Avisos de este formulario (${notas.length})`
          : porRevisar > 0
            ? "Avisos de este formulario"
            : "Sin avisos para este formulario"}
      </p>
      {notas.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {notas.map((n) => (
            <li key={n.texto}>{n.texto}</li>
          ))}
        </ul>
      )}
      {porRevisar > 0 && (
        <p className="text-xs">
          Cambiaste el documento después de la última validación:{" "}
          {porRevisar === 1
            ? "1 aviso no se puede comprobar aquí"
            : `${porRevisar} avisos no se pueden comprobar aquí`}
          . «Volver a validar» los revisa.
        </p>
      )}
      {validada && validacion && (
        <p className="text-xs">
          De la validación del{" "}
          {formatMomento(
            validacion.terminado_en ?? validacion.creado_en,
            "diaHora",
          )}
          . Lo citado se va de la lista apenas lo corriges; lo demás, al volver
          a validar.
        </p>
      )}
    </div>
  );
}
