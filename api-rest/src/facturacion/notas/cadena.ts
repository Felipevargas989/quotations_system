/**
 * LA CADENA DE ANULACIONES (doc 19 §9.5, paso 4)
 *
 * Felipe, 04-11: *"Cuando una factura se anule, debería quedar anulada y
 * también debería quedar como vinculada a su crédito, cosa de poder ver
 * cuál va con cuál en caso de algún reporte"*. Nada se borra (L6): cada nota
 * modifica UN documento (`modifica_id`) y dice cómo (`codigo_referencia`: 1
 * anula, 2 corrige un texto, 3 rebaja o corrige montos). El estado de cada
 * documento sale de la cadena:
 * - una factura queda vigente, rebajada (con lo que le queda), corregida o
 *   anulada por la NC N° …;
 * - una nota queda vigente o anulada por la nota que la anula (la ND anula
 *   una NC; la NC anula una ND).
 *
 * Una nota anulada no cuenta: si la ND anula la NC que rebajaba una factura,
 * la factura vuelve a quedar entera. Puro: no lee la base.
 */

export interface DocumentoDeLaCadena {
  id: number;
  tipo: number;
  folio: number | null;
  /** emitido, por_confirmar, enviando, rechazado… */
  estado: string;
  total: number;
  fecha_emision: string | null;
  modifica_id: number | null;
  codigo_referencia: number | null;
}

/** Lo que pesa en la cadena: lo emitido y lo que puede haber salido (L5).
 *  Lo rechazado no salió. */
const CUENTA = new Set(['emitido', 'por_confirmar', 'enviando']);

export type EstadoEnLaCadena =
  | { como: 'vigente' }
  | { como: 'anulado'; por: DocumentoDeLaCadena }
  | { como: 'rebajado'; queda: number; por: DocumentoDeLaCadena[] }
  | { como: 'corregido'; por: DocumentoDeLaCadena[] };

export const NOMBRE_CORTO: Record<number, string> = {
  33: 'Factura',
  34: 'Factura exenta',
  39: 'Boleta',
  41: 'Boleta exenta',
  56: 'ND',
  61: 'NC',
};

export class Cadena {
  private readonly porId = new Map<number, DocumentoDeLaCadena>();
  private readonly hijos = new Map<number, DocumentoDeLaCadena[]>();
  private readonly memo = new Map<number, boolean>();

  constructor(documentos: DocumentoDeLaCadena[]) {
    for (const d of documentos) {
      if (!CUENTA.has(d.estado)) continue;
      this.porId.set(d.id, d);
      if (d.modifica_id != null) {
        const lista = this.hijos.get(d.modifica_id) ?? [];
        lista.push(d);
        this.hijos.set(d.modifica_id, lista);
      }
    }
  }

  /** Las notas que modifican un documento, de la más vieja a la más nueva. */
  notasDe(id: number): DocumentoDeLaCadena[] {
    return [...(this.hijos.get(id) ?? [])].sort((a, b) => a.id - b.id);
  }

  /** ¿Cuenta? Un documento deja de contar si lo anula una nota que cuenta. */
  vigente(id: number): boolean {
    const guardado = this.memo.get(id);
    if (guardado != null) return guardado;
    // Mientras se calcula, se supone vigente: corta un ciclo imposible.
    this.memo.set(id, true);
    const anulado = this.notasDe(id).some(
      (n) => n.codigo_referencia === 1 && this.vigente(n.id),
    );
    this.memo.set(id, !anulado);
    return !anulado;
  }

  /** Lo que le queda a un documento después de sus rebajas vigentes. */
  saldo(id: number): number {
    const d = this.porId.get(id);
    if (!d || !this.vigente(id)) return 0;
    const rebajas = this.notasDe(id)
      .filter((n) => n.codigo_referencia === 3 && this.vigente(n.id))
      .reduce((s, n) => s + n.total, 0);
    return Math.max(0, d.total - rebajas);
  }

  estado(id: number): EstadoEnLaCadena {
    const notas = this.notasDe(id).filter((n) => this.vigente(n.id));
    const anula = notas.find((n) => n.codigo_referencia === 1);
    if (anula) return { como: 'anulado', por: anula };
    const rebajas = notas.filter((n) => n.codigo_referencia === 3);
    if (rebajas.length)
      return { como: 'rebajado', queda: this.saldo(id), por: rebajas };
    const corrigen = notas.filter((n) => n.codigo_referencia === 2);
    if (corrigen.length) return { como: 'corregido', por: corrigen };
    return { como: 'vigente' };
  }

  /** El efecto de un documento en lo facturado: una factura vale lo que le
   *  queda; una nota, nada (su efecto ya está en el saldo de lo que
   *  modifica). */
  facturado(id: number): number {
    const d = this.porId.get(id);
    if (!d) return 0;
    if (d.tipo === 56 || d.tipo === 61) return 0;
    return this.saldo(id);
  }
}

/** «NC 88», «Factura 1235», «Boleta 1021». */
export const nombreDe = (d: Pick<DocumentoDeLaCadena, 'tipo' | 'folio'>) =>
  `${NOMBRE_CORTO[d.tipo] ?? `Documento ${d.tipo}`} ${d.folio ?? 's/n'}`;

/** Cómo lo dice la lista: «Anulada por NC 88», «Rebajada: queda $1.800.000». */
export const estadoEnPalabras = (e: EstadoEnLaCadena, femenino = true) => {
  const a = femenino ? 'a' : 'o';
  if (e.como === 'anulado') return `Anulad${a} por ${nombreDe(e.por)}`;
  if (e.como === 'rebajado')
    return `Rebajad${a}: queda $${Math.round(e.queda).toLocaleString('es-CL')}`;
  if (e.como === 'corregido')
    return `Corregid${a} por ${e.por.map(nombreDe).join(', ')}`;
  return 'Vigente';
};

/**
 * Los plazos del SII (§9.5) para la nota que se quiere emitir:
 * - anular o corregir un error propio: el mismo mes o el siguiente (Res.
 *   Ex. 45 de 2003); después, el débito ya pagado solo se recupera con el
 *   formulario 2117;
 * - rebajar por devolución o término del contrato: hasta 6 meses (Ley
 *   21.398); después, la nota sale sin derecho a rebajar el débito.
 * `emision` y `hoy` son AAAA-MM-DD; devuelve el último día del plazo.
 */
export const plazoDelSii = (
  emision: string,
  accion: 'anular' | 'corregir' | 'rebajar',
): string => {
  const [a, m, d] = emision.slice(0, 10).split('-').map(Number);
  if (accion === 'rebajar') {
    const fin = new Date(Date.UTC(a, m - 1 + 6, d));
    return fin.toISOString().slice(0, 10);
  }
  // El último día del mes siguiente: el día 0 del mes subsiguiente.
  const fin = new Date(Date.UTC(a, m - 1 + 2, 0));
  return fin.toISOString().slice(0, 10);
};
