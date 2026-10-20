import type { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type {
  AdjuntosRepository,
  ParDeFirmado,
} from '../adjuntos/adjuntos.repository';
import { textoDeDocx } from '../analisis/docx';
import type { Plan } from './plan';

// SE FIRMA Y SE BORRA (decisión 58 del doc 17, 20-10). Felipe: "si firmo el
// Word, bórralo... no tiene sentido guardar Word editables de algo que no se
// volverá a editar jamás en la vida una vez postulado; cada postulación se
// hace, se sube y muere, el documento es solo historia". Y "la información
// permanece, solo cambia el formato": queda el PDF firmado. Antes de borrar
// el Word se guarda su texto en el trabajo de la firma, porque el ZIP busca
// ahí los números de los respaldos de la experiencia (decisión 44). Un Word
// que no se pudo leer no se borra.

export async function textosDeLoFirmado(
  pares: ParDeFirmado[],
  descargar: (ruta: string) => Promise<Buffer>,
): Promise<{ textos: Record<string, string>; pares: ParDeFirmado[] }> {
  const textos: Record<string, string> = {};
  const listos: ParDeFirmado[] = [];
  for (const par of pares) {
    const docx = await descargar(par.word.ruta).catch(() => null);
    const texto = docx ? textoDeDocx(docx) : '';
    if (!texto) continue;
    textos[par.firmado.ruta] = texto;
    listos.push(par);
  }
  return { textos, pares: listos };
}

/** Lo que se limpia cuando el trabajo quedó guardado (si algo no se puede
 *  borrar, queda): los borradores que reemplaza (decisión 49) y, al firmar,
 *  el Word de lo firmado (decisión 58). */
export async function limpiarDespues(
  adjuntos: AdjuntosRepository,
  logger: PinoLogger,
  d: {
    companyId: number;
    generacionId: number;
    plan: Plan;
    pares: ParDeFirmado[];
  },
): Promise<void> {
  const aviso = (que: string) => (e: unknown) =>
    logger.warn(
      `generación ${d.generacionId}: no se borraron ${que}: ${mensajeDe(e)}`,
    );
  if (d.pares.length > 0) {
    await adjuntos
      .dejarSoloElPdf(d.companyId, d.plan.oportunidadId, d.pares)
      .catch(aviso('los Word firmados'));
  }
  if (d.plan.reemplaza?.length) {
    await adjuntos
      .borrarBorradores(d.companyId, d.plan.oportunidadId, d.plan.reemplaza)
      .catch(aviso('los borradores de antes'));
  }
}
