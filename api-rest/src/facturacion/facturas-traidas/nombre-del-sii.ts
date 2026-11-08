import { LARGO_MAXIMO } from '../datos-del-receptor';

/**
 * EL NOMBRE QUE facturacion.cl CORTA (doc 19 §9.36). Su PDF deja la razón
 * social en un solo renglón y lo que no cabe se pierde. Medido el 08-11 con
 * la N° 375 de producción: «CORPORACION CENTRO DE FORMACION TECNICA SANTO»,
 * sin el «TOMAS» que trae la nómina del SII para ese RUT. Felipe eligió
 * traerla «con el nombre del SII»: la nota de crédito copia el nombre de la
 * factura que anula.
 *
 * Si el SII tiene, para el mismo RUT, un nombre que empieza con las
 * palabras del PDF y sigue, vale el del SII. Si no (el mismo nombre, u
 * otro), nulo: queda el del PDF.
 */

const comparable = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export const nombreCompletoDelSii = (
  delPdf: string,
  delSii: string | null | undefined,
): string | null => {
  if (!delSii?.trim()) return null;
  const pdf = comparable(delPdf);
  const sii = comparable(delSii);
  if (!pdf || !sii.startsWith(`${pdf} `)) return null;
  return Array.from(delSii.replace(/\s+/g, ' ').trim())
    .slice(0, LARGO_MAXIMO.razon_social)
    .join('')
    .trim();
};

/** «65175242-6» → 65175242, el número con que la nómina guarda el RUT. */
export const numeroDelRut = (rut: string): number | null => {
  const numero = Number(rut.split('-')[0]?.replace(/\D/g, ''));
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
};
