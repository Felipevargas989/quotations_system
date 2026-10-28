import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';

// LOS PDF QUE NO CABEN EN EL PEDIDO (decisión 103 del doc 17, 28-10).
// Felipe: "el analizar bases solo lee hasta 22 mb es muy poco... puedes
// poner ese tope un poco más arriba". Dentro del pedido, en base64, los PDF
// crecen un tercio y el pedido no pasa de 32 MB: por ahí no caben más de
// 22 MB. Lo que pasa de eso se sube antes a la Files API, como en el
// taller, y el pedido lleva solo el `file_id`. No se borra al terminar:
// vence solo a las 2 horas, y mientras tanto «Pregúntale a la IA» usa el
// mismo `file_id`, para que el comienzo del pedido siga idéntico y lea la
// caché de 1 hora que dejó el análisis (decisión 67).

/** Lo que vive el PDF en Anthropic: la hora de la caché y un margen. */
export const VENCE_EN_SEGUNDOS = 2 * 60 * 60;

/** Hasta cuándo se vuelve a usar el mismo: que no venza a mitad de un
 *  pedido, que puede tardar 10 minutos. */
const SE_REUSA_POR_MS = 90 * 60 * 1000;

/** Lo ya subido, por contenido: el mismo PDF da el mismo `file_id`. */
const subidos = new Map<string, { id: string; hasta: number }>();

/** La Files API no acepta < > : " | ? * \ / en el nombre, ni más de 255
 *  letras. */
const nombreParaSubir = (nombre: string): string =>
  nombre.replace(/[<>:"|?*\\/]/g, '_').slice(-200) || 'bases.pdf';

/** El `file_id` de este PDF: el que se subió en la última hora y media, o
 *  uno nuevo que vence solo. */
export const idDelPdf = async (
  cliente: Anthropic,
  datos: Buffer,
  nombre: string,
  ahora = Date.now(),
): Promise<string> => {
  const huella = createHash('sha256').update(datos).digest('hex');
  const ya = subidos.get(huella);
  if (ya && ya.hasta > ahora) return ya.id;
  for (const [clave, s] of subidos) {
    if (s.hasta <= ahora) subidos.delete(clave);
  }
  const subido = await cliente.files.upload({
    file: await toFile(datos, nombreParaSubir(nombre), {
      type: 'application/pdf',
    }),
    expires_in_seconds: VENCE_EN_SEGUNDOS,
  });
  subidos.set(huella, { id: subido.id, hasta: ahora + SE_REUSA_POR_MS });
  return subido.id;
};
