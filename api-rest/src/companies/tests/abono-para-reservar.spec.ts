import { pctDeAbono } from '../abono-para-reservar';

// EL ABONO PARA RESERVAR LA FECHA (Felipe, 22-10-2026; migración 160).
// Supabase entrega numeric como texto: la hoja tiene que recibir un número,
// y nada que no sea un % válido mayor que cero.
describe('pctDeAbono', () => {
  it('lee el numeric que llega como texto', () => {
    expect(pctDeAbono('30.00')).toBe(30);
    expect(pctDeAbono('12.5')).toBe(12.5);
    expect(pctDeAbono(50)).toBe(50);
  });

  it('vacío, cero o fuera de rango: la línea no sale', () => {
    expect(pctDeAbono(null)).toBeNull();
    expect(pctDeAbono(undefined)).toBeNull();
    expect(pctDeAbono('')).toBeNull();
    expect(pctDeAbono(0)).toBeNull();
    expect(pctDeAbono('0.00')).toBeNull();
    expect(pctDeAbono(120)).toBeNull();
    expect(pctDeAbono('abc')).toBeNull();
  });
});
