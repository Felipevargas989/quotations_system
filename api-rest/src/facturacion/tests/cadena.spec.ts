import {
  Cadena,
  estadoCorto,
  estadoEnPalabras,
  plazoDelSii,
  quedaDe,
  type DocumentoDeLaCadena,
} from '../notas/cadena';

/**
 * LA CADENA DE ANULACIONES (doc 19 §9.5, paso 4): el estado de cada
 * documento según las notas que lo modifican, y el estado corto de la lista
 * (§9.22, 07-11). Puro: no lee la base. Salió de `notas.spec.ts` el 07-11,
 * cuando ese archivo pasó las 800 líneas del portero.
 */

const doc = (
  d: Partial<DocumentoDeLaCadena> & Pick<DocumentoDeLaCadena, 'id' | 'tipo'>,
): DocumentoDeLaCadena => ({
  folio: d.id,
  estado: 'emitido',
  total: 1000000,
  fecha_emision: '2026-11-04',
  modifica_id: null,
  codigo_referencia: null,
  ...d,
});

describe('La cadena', () => {
  it('una NC que anula deja la factura anulada; la ND que anula esa NC la devuelve', () => {
    const factura = doc({ id: 1, tipo: 33 });
    const nc = doc({ id: 2, tipo: 61, modifica_id: 1, codigo_referencia: 1 });
    let c = new Cadena([factura, nc]);
    expect(estadoEnPalabras(c.estado(1))).toBe('Anulada por NC 2');
    expect(c.facturado(1)).toBe(0);

    const nd = doc({ id: 3, tipo: 56, modifica_id: 2, codigo_referencia: 1 });
    c = new Cadena([factura, nc, nd]);
    expect(estadoEnPalabras(c.estado(2))).toBe('Anulada por ND 3');
    expect(c.estado(1)).toEqual({ como: 'vigente' });
    expect(c.facturado(1)).toBe(1000000);
  });

  it('una rebaja deja lo que queda; una corrección de texto no cambia el monto', () => {
    const c = new Cadena([
      doc({ id: 1, tipo: 33 }),
      doc({
        id: 2,
        tipo: 61,
        modifica_id: 1,
        codigo_referencia: 3,
        total: 300000,
      }),
      doc({ id: 3, tipo: 33 }),
      doc({ id: 4, tipo: 61, modifica_id: 3, codigo_referencia: 2, total: 0 }),
    ]);
    expect(estadoEnPalabras(c.estado(1))).toBe('Rebajada: queda $700.000');
    expect(c.saldo(1)).toBe(700000);
    expect(estadoEnPalabras(c.estado(3))).toBe('Corregida por NC 4');
    expect(c.saldo(3)).toBe(1000000);
  });

  it('en la lista, el estado en una palabra y abajo lo que lo cambió (§9.22, 07-11)', () => {
    const c = new Cadena([
      doc({ id: 1, tipo: 33 }),
      doc({
        id: 2,
        tipo: 61,
        modifica_id: 1,
        codigo_referencia: 3,
        total: 300000,
      }),
      doc({ id: 3, tipo: 33 }),
      doc({ id: 4, tipo: 61, modifica_id: 3, codigo_referencia: 2, total: 0 }),
      doc({ id: 5, tipo: 33 }),
      doc({ id: 6, tipo: 61, modifica_id: 5, codigo_referencia: 1 }),
      doc({ id: 7, tipo: 33 }),
    ]);
    expect(estadoCorto(c.estado(1), 1000000)).toEqual({
      texto: 'Rebajada',
      detalle: '−$300.000',
    });
    // La corregida vale entera: vigente, con la nota abajo.
    expect(estadoCorto(c.estado(3), 1000000)).toEqual({
      texto: 'Vigente',
      detalle: 'Corregida por NC 4',
    });
    expect(estadoCorto(c.estado(5), 1000000)).toEqual({
      texto: 'Anulada',
      detalle: 'Por NC 6',
    });
    expect(estadoCorto(c.estado(7), 1000000)).toEqual({
      texto: 'Vigente',
      detalle: null,
    });
  });

  it('una nota rechazada no salió: no cuenta', () => {
    const c = new Cadena([
      doc({ id: 1, tipo: 33 }),
      doc({
        id: 2,
        tipo: 61,
        modifica_id: 1,
        codigo_referencia: 1,
        estado: 'rechazado',
      }),
    ]);
    expect(c.vigente(1)).toBe(true);
  });

  it('los plazos del SII: anular, el mes siguiente; rebajar, 6 meses', () => {
    expect(plazoDelSii('2026-11-04', 'anular')).toBe('2026-12-31');
    expect(plazoDelSii('2026-12-15', 'corregir')).toBe('2027-01-31');
    expect(plazoDelSii('2026-11-04', 'rebajar')).toBe('2027-05-04');
  });
});

describe('Lo que le queda a la rebajada (§9.42)', () => {
  it('lo emitido menos sus rebajas vigentes; si la ND anula la rebaja, vale entera', () => {
    // La 9999839219 del paso 0: $107.100 rebajada en $1.000.
    const factura = {
      ...doc({ id: 1, tipo: 33, total: 107100 }),
      neto: 90000,
      iva: 17100,
    };
    const rebaja = {
      ...doc({ id: 2, tipo: 61, total: 1000 }),
      modifica_id: 1,
      codigo_referencia: 3,
      neto: 840,
      iva: 160,
    };
    const todos = [factura, rebaja];
    const e = new Cadena(todos).estado(1);
    if (e.como !== 'rebajado') throw new Error(`quedó ${e.como}`);
    const rebajas = e.por.map((n) => todos.find((x) => x.id === n.id));
    expect(quedaDe(factura, rebajas)).toEqual({
      neto: 89160,
      iva: 16940,
      total: 106100,
    });
    const nd = doc({ id: 3, tipo: 56, modifica_id: 2, codigo_referencia: 1 });
    expect(new Cadena([...todos, nd]).estado(1)).toEqual({ como: 'vigente' });
  });
});
