import type { ElSet } from './el-set';

// UNA COMPRA ÁGIL EN UNA SOLA CARPETA (decisión 118 del doc 17, 07-11).
// Aparte de `el-set.ts`, que roza las 800 líneas del portero; solo lee sus
// tipos, así no se importan en círculo.

/** Una compra ágil va en una sola carpeta, «Compra ágil», sin subcarpetas
 *  (decisión 118, 07-11). Felipe: "1 zip 1 carpeta que se llame (Compra
 *  agil) solo lo que soliciten las bases y lo que la ley pida en compra agil
 *  nada más". La ley no pide adjuntar nada (arts. 97 y 98 del DS 661/2024):
 *  basta estar hábil en el Registro de Proveedores y con su declaración
 *  jurada firmada, y eso vive en ChileProveedores, no en el ZIP. Lo que va
 *  ya lo decidió `armarElSet` (sin «4. Otros» con `compraAgil`). */
export function enUnaSolaCarpeta(set: ElSet): ElSet {
  return {
    ...set,
    piezas: set.piezas.map((p) => {
      const sinSubcarpeta = { ...p };
      delete sinSubcarpeta.subcarpeta;
      return { ...sinSubcarpeta, carpetas: ['compra_agil'] };
    }),
  };
}
