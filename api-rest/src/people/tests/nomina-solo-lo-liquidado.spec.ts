import { estaLiquidado } from '../people.service';

/**
 * A LA NÓMINA SOLO ENTRA LO LIQUIDADO (Felipe, 16-08).
 *
 * La nómina es el destino de lo que ya se liquidó, no la bandeja de
 * todo lo que existe. Antes bastaba con tener monto y no estar pagado:
 * medido en laboratorio el 16-08, eso metía $100.000 en 4 filas de
 * eventos a medio liquidar.
 *
 * "Liquidado" es distinto según de dónde venga la fila, y eso es
 * exactamente lo que fija este archivo.
 */
describe('estaLiquidado', () => {
  const fichasCerradas = new Set(['evento-cerrado']);
  const diasLiquidados = new Set(['2026-08-08']);
  const mirar = (fila: { quotation_id?: string | null; day?: string | null }) =>
    estaLiquidado(fila, fichasCerradas, diasLiquidados);

  it('deja pasar la jornada de un evento con la ficha cerrada', () => {
    expect(mirar({ quotation_id: 'evento-cerrado', day: '2026-08-01' })).toBe(
      true,
    );
  });

  it('deja fuera la jornada de un evento sin liquidar', () => {
    expect(mirar({ quotation_id: 'evento-abierto', day: '2026-08-01' })).toBe(
      false,
    );
  });

  it('deja pasar el día de restaurante con la propina resuelta', () => {
    expect(mirar({ quotation_id: null, day: '2026-08-08' })).toBe(true);
  });

  it('deja fuera el día de restaurante que nadie ha liquidado', () => {
    expect(mirar({ quotation_id: null, day: '2026-08-09' })).toBe(false);
  });

  it('el día liquidado no salva a un evento abierto que cayó ese día', () => {
    // Si mandara la fecha y no la ficha, cerrar el restaurante del 8
    // arrastraría a la nómina el evento del 8 todavía a medio armar.
    expect(mirar({ quotation_id: 'evento-abierto', day: '2026-08-08' })).toBe(
      false,
    );
  });

  it('la marca del día ignora la hora que traiga la fecha', () => {
    expect(mirar({ quotation_id: null, day: '2026-08-08T00:00:00Z' })).toBe(
      true,
    );
  });

  it('una fila sin evento y sin día no entra', () => {
    expect(mirar({ quotation_id: null, day: null })).toBe(false);
  });
});
