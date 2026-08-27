import type { EventStaffConPersona } from '../entities/person.entity';
import { consolidarPorRut } from '../people.service';

/**
 * CONSOLIDAR POR RUT (Felipe, 16-08).
 *
 * "Si tengo esa semana cinco eventos y diez días de restaurante y es la
 * misma gente, no puedo subir diez veces al banco."
 *
 * Este archivo fija las dos cosas que hacen que eso funcione: que la
 * misma persona quede en UNA línea aunque venga de varios orígenes, y
 * que dos fichas con el mismo RUT no produzcan dos transferencias.
 */
const fila = (
  p: Partial<EventStaffConPersona> & {
    person_id: number;
    rut?: string | null;
    nombre?: string;
  },
): EventStaffConPersona =>
  ({
    id: Math.random(),
    person_id: p.person_id,
    quotation_id: p.quotation_id ?? null,
    day: p.day ?? '2026-08-10',
    amount: p.amount ?? null,
    tip_amount: p.tip_amount ?? null,
    people: {
      id: p.person_id,
      name: p.nombre ?? `Persona ${p.person_id}`,
      rut: p.rut === undefined ? '11111111-1' : p.rut,
      bank_code: '012',
      account_type: 'corriente',
      account_number: '123456',
    },
  }) as unknown as EventStaffConPersona;

describe('consolidarPorRut', () => {
  it('junta en UNA línea lo de varios eventos y días de la misma persona', () => {
    const r = consolidarPorRut(
      [
        fila({ person_id: 1, amount: 30000, quotation_id: 'ev-a' }),
        fila({ person_id: 1, amount: 20000, quotation_id: 'ev-b' }),
        fila({ person_id: 1, amount: 25000, day: '2026-08-11' }),
      ],
      [fila({ person_id: 1, tip_amount: 5000 })],
    );

    expect(r).toHaveLength(1);
    expect(r[0].jornadas).toBe(75000);
    expect(r[0].propinas).toBe(5000);
    expect(r[0].total).toBe(80000);
  });

  it('dos fichas con el mismo RUT son un solo pago, y lo declaran', () => {
    // El caso del Excel: "Matias" y "Matías" cargados por separado.
    const r = consolidarPorRut(
      [
        fila({ person_id: 1, nombre: 'Matias Zapata', amount: 40000 }),
        fila({ person_id: 2, nombre: 'Matías Zapata', amount: 60000 }),
      ],
      [],
    );

    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100000);
    // Las dos fichas quedan a la vista para poder unificarlas después.
    expect(r[0].person_ids.sort()).toEqual([1, 2]);
  });

  it('personas distintas con RUT distinto no se mezclan', () => {
    const r = consolidarPorRut(
      [
        fila({ person_id: 1, rut: '11111111-1', amount: 10000 }),
        fila({ person_id: 2, rut: '22222222-2', amount: 20000 }),
      ],
      [],
    );

    expect(r).toHaveLength(2);
    expect(r.map((l) => l.total).sort((a, b) => a - b)).toEqual([10000, 20000]);
  });

  it('los SIN RUT nunca se juntan entre sí', () => {
    // Juntarlos sería meter a dos personas distintas en un mismo pago.
    const r = consolidarPorRut(
      [
        fila({ person_id: 1, rut: null, amount: 10000 }),
        fila({ person_id: 2, rut: '', amount: 20000 }),
      ],
      [],
    );

    expect(r).toHaveLength(2);
    expect(r.every((l) => l.rut === null)).toBe(true);
  });

  it('una fila en cero no inventa una línea de pago', () => {
    const r = consolidarPorRut([fila({ person_id: 1, amount: 0 })], []);
    expect(r).toHaveLength(0);
  });

  it('dice de dónde viene la plata, sin contar dos veces un día', () => {
    // El caso que Felipe quiere ver al pasar el mouse: "7 días de
    // restaurante, 3 días de tal evento".
    const r = consolidarPorRut(
      [
        fila({ person_id: 1, amount: 10000, day: '2026-08-10' }),
        fila({ person_id: 1, amount: 10000, day: '2026-08-11' }),
        fila({
          person_id: 1,
          amount: 30000,
          quotation_id: 'ev-a',
          day: '2026-08-12',
        }),
      ],
      [
        // Mismo día que ya trajo jornada: NO suma un día más.
        fila({ person_id: 1, tip_amount: 5000, day: '2026-08-10' }),
      ],
    );

    expect(r).toHaveLength(1);
    const restaurante = r[0].detalle.find((d) => d.quotation_id === null)!;
    const evento = r[0].detalle.find((d) => d.quotation_id === 'ev-a')!;

    expect(restaurante.dias).toBe(2);
    expect(restaurante.jornadas).toBe(20000);
    expect(restaurante.propinas).toBe(5000);
    expect(evento.dias).toBe(1);
    expect(evento.jornadas).toBe(30000);
    // El desglose suma exactamente el total de la línea.
    expect(r[0].detalle.reduce((t, d) => t + d.jornadas + d.propinas, 0)).toBe(
      r[0].total,
    );
  });

  it('ordena por nombre, que es como se revisa antes de subir al banco', () => {
    const r = consolidarPorRut(
      [
        fila({ person_id: 1, rut: '1-9', nombre: 'Zoila', amount: 1000 }),
        fila({ person_id: 2, rut: '2-7', nombre: 'Ana', amount: 1000 }),
      ],
      [],
    );
    expect(r.map((l) => l.nombre)).toEqual(['Ana', 'Zoila']);
  });
});

describe('el desglose día a día para el pinchazo (27-08)', () => {
  it('la fecha con jornada Y propina queda en UNA fila con ambos montos', () => {
    const filas = [
      fila({
        person_id: 1,
        day: '2026-08-20',
        amount: 50000,
        quotation_id: 'q1',
      }),
    ];
    const propinas = [
      fila({
        person_id: 1,
        day: '2026-08-20',
        tip_amount: 6542,
        quotation_id: 'q1',
      }),
    ];
    const [linea] = consolidarPorRut(filas, propinas);
    expect(linea.dias).toHaveLength(1);
    expect(linea.dias[0]).toMatchObject({
      day: '2026-08-20',
      quotation_id: 'q1',
      jornada: 50000,
      propina: 6542,
    });
  });

  it('trae el área del día cuando la consulta la incluye', () => {
    const filas = [
      {
        ...fila({ person_id: 1, day: '2026-08-21', amount: 30000 }),
        management_resources: { id: 7, name: 'Cocina' },
      },
    ];
    const [linea] = consolidarPorRut(filas, []);
    expect(linea.dias[0].area).toBe('Cocina');
  });
});
