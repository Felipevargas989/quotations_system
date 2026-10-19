import { PDFDocument } from 'pdf-lib';

// SOLO LAS PÁGINAS DE LOS FORMULARIOS (19-10). El Día del Profesor traía sus
// formularios escaneados en las páginas 16 a 18 de un decreto de 18 páginas,
// y «Generar anexos» murió dos veces con "prompt is too long: 1036606 tokens
// > 1000000 maximum": el taller miraba el decreto entero, una y otra vez.
// Felipe tuvo que recortarlo a mano. Ahora el motor le pasa al taller solo
// las páginas donde el análisis encontró los formularios, y una más por si
// alguno sigue en la siguiente.

/** "16", "16-17", "16 a 18", "16, 18" o "16 y 17" → [16, 17, 18]. */
export const paginasDe = (texto: string): number[] => {
  const paginas = new Set<number>();
  for (const parte of texto.split(/[,;]| y /)) {
    const rango = /(\d+)\s*(?:-|–|a|al)\s*(\d+)/.exec(parte);
    if (rango) {
      const desde = Number(rango[1]);
      const hasta = Number(rango[2]);
      for (let p = desde; p <= hasta && p - desde < 50; p++) paginas.add(p);
      continue;
    }
    const una = /(\d+)/.exec(parte);
    if (una) paginas.add(Number(una[1]));
  }
  return [...paginas].filter((p) => p > 0).sort((a, b) => a - b);
};

/** Las páginas que van al taller: las de los formularios y una más. Vacío
 *  si el análisis no dijo dónde están (va el PDF entero). */
export const paginasParaElTaller = (textos: string[]): number[] => {
  const paginas = textos.flatMap(paginasDe);
  if (paginas.length === 0) return [];
  return [...new Set([...paginas, Math.max(...paginas) + 1])].sort(
    (a, b) => a - b,
  );
};

/** El PDF con solo esas páginas (1, 2, 3…), en orden. null si no hay nada
 *  que recortar o si no se pudo (cifrado o roto): entonces va entero. */
export async function recortarPdf(
  pdf: Buffer,
  paginas: number[],
): Promise<Buffer | null> {
  try {
    const original = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const total = original.getPageCount();
    const indices = paginas
      .filter((p) => p >= 1 && p <= total)
      .map((p) => p - 1);
    if (indices.length === 0 || indices.length === total) return null;
    const recortado = await PDFDocument.create();
    const copiadas = await recortado.copyPages(original, indices);
    copiadas.forEach((pagina) => recortado.addPage(pagina));
    return Buffer.from(await recortado.save());
  } catch {
    return null;
  }
}
