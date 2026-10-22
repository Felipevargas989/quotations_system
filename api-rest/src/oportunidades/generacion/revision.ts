import { nombresDelZip, textoDeDocx } from '../analisis/docx';

// LO QUE ENTREGA LA IA SE REVISA ANTES DE GUARDARSE (doc 17, sprint 3, paso
// 4): que sea un Word que se abre; el firmado, además, con el MISMO texto
// que el que se firmó y una imagen más (la firma). Desde el 19-10 la firma
// también entrega el PDF de cada documento (Felipe: "tiene que ser un solo
// documento tipo PDF, cosa que yo lo pueda descargar y subir"): se guarda
// solo si su Word firmado pasó la revisión, y el Word queda sin guardar.
// Aparte del servicio, que está en el tope de 800 líneas del portero.

/** Sin espacios: lo que importa es que no cambie ni una letra. */
const letras = (docx: Buffer): string | null =>
  textoDeDocx(docx)?.replace(/\s+/g, '') ?? null;

const imagenes = (docx: Buffer): number =>
  (nombresDelZip(docx) ?? []).filter((n) => n.startsWith('word/media/')).length;

/** Por qué no se guarda lo que entregó la IA; null = se guarda. */
export const problemaDelDocumento = (
  hecho: Buffer,
  antes?: Buffer,
): string | null => {
  const texto = letras(hecho);
  if (texto === null) return 'no es un Word que se pueda abrir';
  if (!antes) return null;
  if (texto !== letras(antes)) {
    return 'la IA cambió el texto además de firmar: se descartó';
  }
  if (imagenes(hecho) <= imagenes(antes)) return 'no trae la firma';
  return null;
};

/** ¿Es un PDF? Lo convierte el taller desde el Word ya revisado. */
export const esPdf = (datos: Buffer): boolean =>
  datos.subarray(0, 5).toString('latin1') === '%PDF-';

/** Lo que se revisa de cada cosa que entrega la IA. `siPasa`: el PDF de un
 *  Word firmado se guarda solo si ese Word pasó la revisión. */
export const problemaDeLaSalida = (
  salida: { siPasa?: string },
  hecho: Buffer,
  antes: Buffer | undefined,
  pasaron: ReadonlySet<string>,
): string | null => {
  if (salida.siPasa === undefined) return problemaDelDocumento(hecho, antes);
  if (!pasaron.has(salida.siPasa)) {
    return 'su Word firmado no pasó la revisión: se descartó';
  }
  return esPdf(hecho) ? null : 'no es un PDF que se pueda abrir';
};

/** Por qué un trabajo terminó sin ningún documento, en palabras. */
export const porQueNoEntrego = (
  motivo: string | null,
  descartados: number,
): string => {
  if (descartados > 0) {
    return 'Lo que entregó la IA no pasó la revisión: mira el detalle.';
  }
  if (motivo === 'max_tokens' || motivo === 'pause_turn') {
    return 'El trabajo era muy largo y la IA no alcanzó a terminar: vuelve a intentar con menos documentos.';
  }
  if (motivo === 'refusal') return 'La IA no quiso hacer este trabajo.';
  return 'La IA no entregó ningún documento.';
};

/** Lo que se espera de la firma: de cada Word, su Word firmado (solo se
 *  revisa: que no cambió el texto y trae la firma) y su PDF, que es lo que
 *  se guarda y se sube a Mercado Público. */
export const salidasDeLaFirma = (
  documentos: Array<{
    adjunto: { id: number; nombre: string };
    enElTaller: string;
  }>,
) =>
  documentos.flatMap((d) => {
    const base = d.adjunto.nombre
      .replace(/\.docx$/i, '')
      .replace(/ - lleno$/i, '');
    const word = `firmado_${d.adjunto.id}.docx`;
    return [
      {
        enElTaller: word,
        nombre: `${base} - firmado.docx`,
        origen: 'firmado' as const,
        viene_de: d.adjunto.id,
        comparaCon: d.enElTaller,
        soloRevisar: true as const,
      },
      {
        enElTaller: `firmado_${d.adjunto.id}.pdf`,
        nombre: `${base} - firmado.pdf`,
        origen: 'firmado' as const,
        viene_de: d.adjunto.id,
        siPasa: word,
      },
    ];
  });
