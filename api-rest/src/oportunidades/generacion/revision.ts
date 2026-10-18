import { nombresDelZip, textoDeDocx } from '../analisis/docx';

// LO QUE ENTREGA LA IA SE REVISA ANTES DE GUARDARSE (doc 17, sprint 3, paso
// 4): que sea un Word que se abre; el firmado, además, con el MISMO texto
// que el que se firmó y una imagen más (la firma). Aparte del servicio, que
// está en el tope de 800 líneas del portero (18-10).

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
