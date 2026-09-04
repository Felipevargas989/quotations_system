import {
  cambiosParaRevivir,
  faltaElMontoDelFreelance,
} from '../utils/alta-de-jornada';

describe('la pregunta del día extra (04-09)', () => {
  const planta = { default_kind: 'planta' };

  it('freelance elegido sin monto: no se guarda', () => {
    expect(
      faltaElMontoDelFreelance({ kind: 'freelance', amount: null }, planta),
    ).toBe(true);
    expect(
      faltaElMontoDelFreelance({ kind: 'freelance', amount: 0 }, planta),
    ).toBe(true);
  });

  it('freelance con monto pasa; planta no necesita monto', () => {
    expect(
      faltaElMontoDelFreelance({ kind: 'freelance', amount: 30000 }, planta),
    ).toBe(false);
    expect(faltaElMontoDelFreelance({ kind: 'planta' }, planta)).toBe(false);
  });

  it('en un evento no aplica: la silla trae el valor', () => {
    expect(
      faltaElMontoDelFreelance(
        { quotation_id: 'ev-1', kind: 'freelance', amount: null },
        planta,
      ),
    ).toBe(false);
  });

  it('una persona freelance de siempre no pasa por la pregunta', () => {
    expect(
      faltaElMontoDelFreelance(
        { kind: 'freelance', amount: null },
        { default_kind: 'freelance' },
      ),
    ).toBe(false);
  });

  it('revivir como planta: sin monto y confirmada (es su jornada)', () => {
    const c = cambiosParaRevivir({ kind: 'planta', amount: 99000 });
    expect(c.amount).toBeNull();
    expect(c.status).toBe('confirmado');
    expect(c.ajuste).toBeNull();
  });

  it('revivir como freelance: con su monto y por confirmar', () => {
    const c = cambiosParaRevivir({ kind: 'freelance', amount: 30000 });
    expect(c.amount).toBe(30000);
    expect(c.status).toBe('por_confirmar');
  });
});
