import { PDFDocument } from 'pdf-lib';

// UN SOLO PDF CON SUS RESPALDOS (19-10). Felipe: "que el anexo de
// experiencia adjunte los mismos respaldos, sea un solo PDF, un solo
// documento con los respaldos adjuntos, no tres documentos, para que sea
// más simple". El anexo va primero y detrás cada respaldo: un PDF con sus
// páginas, una foto (JPG o PNG) en una página tamaño carta.

const CARTA: [number, number] = [612, 792];

export type ParaUnir = { nombre: string; datos: Buffer };

/** null si el principal no se puede abrir (va como estaba). Lo que no se
 *  puede pegar (un Word, un PDF cifrado o roto) queda en `saltados`, para
 *  que vaya aparte. */
export async function unirPdf(
  principal: Buffer,
  adjuntos: ParaUnir[],
): Promise<{ datos: Buffer; saltados: string[] } | null> {
  let salida: PDFDocument;
  try {
    salida = await PDFDocument.load(principal);
  } catch {
    return null;
  }
  const saltados: string[] = [];
  for (const a of adjuntos) {
    const ext = a.nombre.split('.').pop()?.toLowerCase() ?? '';
    try {
      if (ext === 'pdf') {
        const doc = await PDFDocument.load(a.datos);
        const paginas = await salida.copyPages(doc, doc.getPageIndices());
        for (const p of paginas) salida.addPage(p);
      } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        const imagen =
          ext === 'png'
            ? await salida.embedPng(a.datos)
            : await salida.embedJpg(a.datos);
        const escala = Math.min(
          1,
          (CARTA[0] - 72) / imagen.width,
          (CARTA[1] - 72) / imagen.height,
        );
        const ancho = imagen.width * escala;
        const alto = imagen.height * escala;
        salida.addPage(CARTA).drawImage(imagen, {
          x: (CARTA[0] - ancho) / 2,
          y: (CARTA[1] - alto) / 2,
          width: ancho,
          height: alto,
        });
      } else {
        saltados.push(a.nombre);
      }
    } catch {
      // Cifrado o roto: pdf-lib no lo abre sin la clave; va aparte.
      saltados.push(a.nombre);
    }
  }
  return { datos: Buffer.from(await salida.save()), saltados };
}
