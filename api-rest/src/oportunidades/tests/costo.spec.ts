import { costoDelUso, costoEnDolares } from '../analisis/comun';

// LO QUE CUESTA CADA MODELO (precios de Anthropic al 17-10-2026, en US$ por
// millón de tokens). El costo queda anotado en cada trabajo de la IA.

describe('el costo de la IA', () => {
  it('Opus 5.5: 4 de entrada y 20 de salida (lo de siempre)', () => {
    // 100.000 de entrada y 5.000 de salida = 0,40 + 0,10.
    expect(costoEnDolares(100_000, 5_000)).toBe(0.5);
    expect(costoEnDolares(100_000, 5_000, 'claude-opus-5-5')).toBe(0.5);
  });

  it('Sonnet 5.5 cuesta la mitad y Haiku 5.5, cuarenta veces menos', () => {
    expect(costoEnDolares(100_000, 5_000, 'claude-sonnet-5-5')).toBe(0.25);
    expect(costoEnDolares(1_000_000, 100_000, 'claude-haiku-5-5')).toBe(0.15);
  });

  it('la caché: escribirla cuesta 1,25 veces la entrada; leerla, 0,05 en Opus y Sonnet y 0,1 en Haiku', () => {
    const uso = {
      entrada: 0,
      salida: 0,
      cacheEscrita: 1_000_000,
      cacheLeida: 1_000_000,
    };
    expect(costoDelUso(uso, 'claude-opus-5-5')).toBe(5.2);
    expect(costoDelUso(uso, 'claude-sonnet-5-5')).toBe(2.6);
    expect(costoDelUso(uso, 'claude-haiku-5-5')).toBe(0.135);
  });

  it('un modelo que no está en la tabla se cobra como Opus (lo más caro, para no quedarse corto)', () => {
    expect(costoEnDolares(100_000, 5_000, 'claude-raro')).toBe(0.5);
  });
});
