import { cerebroPara, VALLE_DEL_SOL } from '../cerebro';

// EL CEREBRO COMÚN (doc 20 §15, etapa 2; Felipe, 04-11-2026: «una sola IA
// que conoce todo el sistema de operación del complejo»). Cada IA lee lo
// que le toca, y una empresa nunca lee lo de otra.

const CASA = '# Lo que sabe toda la IA de Eventia';
const COMPLEJO = '# Valle del Sol Quillón';
const ARMA = '# Cómo se arma una cotización en Valle del Sol';
const ESCRIBE = '# Cómo se escribe un correo de seguimiento en Valle del Sol';

describe('cerebroPara', () => {
  it('«Crear con IA»: lo común, lo de Valle del Sol y cómo se arma', () => {
    const t = cerebroPara(VALLE_DEL_SOL, 'armar');
    expect(t.indexOf(CASA)).toBe(0);
    expect(t.indexOf(COMPLEJO)).toBeGreaterThan(0);
    expect(t.indexOf(ARMA)).toBeGreaterThan(t.indexOf(COMPLEJO));
    expect(t).not.toContain(ESCRIBE);
  });

  it('«Generar seguimiento»: lo común, lo de Valle del Sol y cómo se escribe', () => {
    const t = cerebroPara(VALLE_DEL_SOL, 'escribir');
    expect(t).toContain(CASA);
    expect(t).toContain(COMPLEJO);
    expect(t).toContain(ESCRIBE);
    expect(t).not.toContain(ARMA);
  });

  it('BelIA lo lee todo', () => {
    const t = cerebroPara(VALLE_DEL_SOL, 'conversar');
    for (const parte of [CASA, COMPLEJO, ARMA, ESCRIBE]) {
      expect(t).toContain(parte);
    }
  });

  it('otra empresa lee solo lo común: nada de las reglas de Valle del Sol', () => {
    const t = cerebroPara(52, 'conversar');
    expect(t).toContain(CASA);
    expect(t).not.toContain('Valle del Sol Quillón:');
    expect(t).not.toContain(ARMA);
    expect(t).not.toContain('Tour operadores: 15%');
    expect(cerebroPara(null, 'armar')).toBe(cerebroPara(52, 'armar'));
  });

  it('las reglas que repetía cada IA están una sola vez', () => {
    const t = cerebroPara(VALLE_DEL_SOL, 'conversar');
    const veces = (frase: string) => t.split(frase).length - 1;
    expect(veces('Los precios del catálogo ya traen IVA.')).toBe(1);
    expect(veces('El precio no se mueve')).toBe(1);
    expect(veces('No inventes hechos.')).toBe(1);
    expect(veces('Tour operadores: 15%.')).toBe(1);
    expect(veces('Sernatur no se ofrece: va por contrato.')).toBe(1);
  });
});

describe('postular (Oportunidades, doc 20 §17)', () => {
  it('lee lo común y lo del complejo, sin las guías de armar ni de escribir', () => {
    const t = cerebroPara(VALLE_DEL_SOL, 'postular');
    expect(t).toContain('# Lo que sabe toda la IA de Eventia');
    expect(t).toContain('# Valle del Sol Quillón');
    expect(t).not.toContain('# Cómo se arma una cotización en Valle del Sol');
    expect(t).not.toContain(
      '# Cómo se escribe un correo de seguimiento en Valle del Sol',
    );
  });
});
