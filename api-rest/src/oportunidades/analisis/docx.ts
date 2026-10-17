import { inflateRawSync } from 'node:zlib';

// EL TEXTO DE UN WORD (.docx), para la IA: la API de Claude lee PDF y
// texto, pero no Word. Un .docx es un ZIP con el documento en
// word/document.xml; esto lo abre con lo que trae Node, sin librerías.
// Solo lo necesario para leer un Word: sin ZIP64 ni cifrado.

/** Tope de lo descomprimido: un Word de bases no llega ni cerca. */
const MAX_DESCOMPRIMIDO = 20 * 1024 * 1024;

const FIN_DEL_DIRECTORIO = 0x06054b50;
const ENTRADA_DEL_DIRECTORIO = 0x02014b50;
const ENCABEZADO_LOCAL = 0x04034b50;

const finDelDirectorio = (zip: Buffer): number => {
  const tope = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= tope; i--) {
    if (zip.readUInt32LE(i) === FIN_DEL_DIRECTORIO) return i;
  }
  return -1;
};

/** Un archivo de adentro de un ZIP, o null si no está o no se puede leer. */
export const archivoDelZip = (zip: Buffer, nombre: string): Buffer | null => {
  try {
    const fin = finDelDirectorio(zip);
    if (fin < 0) return null;
    const total = zip.readUInt16LE(fin + 10);
    let p = zip.readUInt32LE(fin + 16);
    for (let i = 0; i < total; i++) {
      if (zip.readUInt32LE(p) !== ENTRADA_DEL_DIRECTORIO) return null;
      const metodo = zip.readUInt16LE(p + 10);
      const comprimido = zip.readUInt32LE(p + 20);
      const largoNombre = zip.readUInt16LE(p + 28);
      const largoExtra = zip.readUInt16LE(p + 30);
      const largoComentario = zip.readUInt16LE(p + 32);
      const local = zip.readUInt32LE(p + 42);
      const este = zip.toString('utf8', p + 46, p + 46 + largoNombre);
      if (este === nombre) {
        if (zip.readUInt32LE(local) !== ENCABEZADO_LOCAL) return null;
        const inicio =
          local +
          30 +
          zip.readUInt16LE(local + 26) +
          zip.readUInt16LE(local + 28);
        const datos = zip.subarray(inicio, inicio + comprimido);
        if (metodo === 0) return Buffer.from(datos);
        if (metodo === 8) {
          return inflateRawSync(datos, { maxOutputLength: MAX_DESCOMPRIMIDO });
        }
        return null;
      }
      p += 46 + largoNombre + largoExtra + largoComentario;
    }
    return null;
  } catch {
    return null;
  }
};

const ENTIDADES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};

/** El texto de un Word: un párrafo por línea, las celdas de una tabla
 *  separadas por " | ". null si no es un Word que se pueda abrir. */
export const textoDeDocx = (docx: Buffer): string | null => {
  const xml = archivoDelZip(docx, 'word/document.xml');
  if (!xml) return null;
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(lt|gt|quot|apos|amp);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
