import { normalizeText } from "../../utils/searchMatch";
import {
  type DetalleDelDocumento,
  FALTA_LA_FIRMA,
  type NotaDelDocumento,
} from "./notasDeLaPostulacion";

// LOS AVISOS DE UN FORMULARIO, AL DÍA (26-10). Felipe, con la validación de
// toda la postulación arriba del N°5: "que se actualicen los avisos: si son
// cosas que se corrigieron se deben eliminar, si no solo generan bulla".
// Arriba del documento van solo las notas de ESE formulario (las mismas de
// «Tus documentos», notasDeLaPostulacion.ts) y se comprueban contra el
// texto que tiene ahora: la que cita un texto ('Adwards') se va cuando ese
// texto ya no está; la de un [COMPLETAR], cuando ya no queda ninguno. Lo
// que es de antes de tus cambios y no se puede comprobar no se muestra: se
// cuenta, y se pide validar de nuevo.

const plano = (t: string) => normalizeText(t).replace(/\s+/g, " ").trim();

/** El primer texto citado de una nota: 'así', «así» o "así"; null si no
 *  cita nada (o cita algo de menos de 4 letras). */
export const citaDe = (nota: string): string | null => {
  const m = /['‘"“«]([^'’"”»]{4,})['’"”»]/.exec(nota);
  return m ? m[1].trim() : null;
};

// Solo la marca entre corchetes: «hay que completar el plazo» no es una.
const DE_COMPLETAR = /\[\s*(completar|ilegible)/i;

/** ¿Sigue vigente? true: sí; false: ya se corrigió; null: no se puede
 *  saber con el texto. */
function sigue(
  nota: NotaDelDocumento,
  texto: { base: string; ahora: string },
  quedan: number,
  deAntes: boolean,
): boolean | null {
  if (DE_COMPLETAR.test(nota.texto)) return quedan > 0;
  const cita = citaDe(nota.texto);
  if (!cita) return null;
  const c = plano(cita);
  if (plano(texto.ahora).includes(c)) return true;
  // Una nota al día que cita algo que nunca estuvo en el documento (un
  // texto de las bases, por ejemplo) no se puede comprobar aquí.
  return !deAntes && !plano(texto.base).includes(c) ? null : false;
}

/** Lo que sigue vigente de un formulario y cuántos avisos de antes de tus
 *  cambios no se pueden comprobar sin volver a validar. `texto.base`: como
 *  se abrió; `texto.ahora`: como está en pantalla. */
export function avisosVigentes(
  detalle: DetalleDelDocumento | undefined,
  texto: { base: string; ahora: string },
  quedan: number,
): { notas: NotaDelDocumento[]; porRevisar: number } {
  if (!detalle) return { notas: [], porRevisar: 0 };
  // La firma se pone desde aquí mismo: no hace falta repetirla.
  const notas = detalle.notas.filter(
    (n) =>
      n.texto !== FALTA_LA_FIRMA && sigue(n, texto, quedan, false) !== false,
  );
  let porRevisar = 0;
  for (const n of detalle.ocultas) {
    const vigente = sigue(n, texto, quedan, true);
    if (vigente) notas.push(n);
    else if (vigente === null) porRevisar += 1;
  }
  return { notas, porRevisar };
}
