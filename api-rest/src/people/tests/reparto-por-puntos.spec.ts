import { BadRequestException } from '@nestjs/common';
import { repartirPorPuntos } from '../people.service';

/**
 * EL REPARTO POR PUNTOS (Felipe, 21-08): el porcentaje de un cargo es
 * el valor de su hora, no su tajada del pozo. Estos son los ejemplos
 * exactos con los que se decidió, para que nadie los mueva sin querer.
 */
const fila = (
  id: number,
  role_id: number | null,
  horas: number,
): {
  id: number;
  role_id: number | null;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
} => ({
  id,
  role_id,
  starts_at: '08:00',
  ends_at: `${String(8 + horas).padStart(2, '0')}:00`,
  break_minutes: 0,
});

const COCINA = 1;
const GARZON = 2;
const ASEO = 3;

describe('repartirPorPuntos', () => {
  it('1 cocinera y 3 garzones al 50/50, mismas horas: los cuatro ganan lo mismo', () => {
    const r = repartirPorPuntos(
      100_000,
      [
        fila(1, COCINA, 9),
        fila(2, GARZON, 9),
        fila(3, GARZON, 9),
        fila(4, GARZON, 9),
      ],
      [
        { role_id: COCINA, pct: 50 },
        { role_id: GARZON, pct: 50 },
      ],
    );
    expect([...r.values()]).toEqual([25_000, 25_000, 25_000, 25_000]);
  });

  it('el ejemplo del equipo: 60/30/10 con $104.000 da $48.000 / $24.000 / $24.000 / $8.000', () => {
    const r = repartirPorPuntos(
      104_000,
      [
        fila(1, GARZON, 8), // Luis
        fila(2, GARZON, 4), // Carla, medio turno
        fila(3, COCINA, 8), // Ana
        fila(4, ASEO, 8), // Pedro
      ],
      [
        { role_id: GARZON, pct: 60 },
        { role_id: COCINA, pct: 30 },
        { role_id: ASEO, pct: 10 },
      ],
    );
    expect(r.get(1)).toBe(48_000);
    expect(r.get(2)).toBe(24_000);
    expect(r.get(3)).toBe(24_000);
    expect(r.get(4)).toBe(8_000);
  });

  it('60/40 con 1 cocinera y 3 garzones: cada garzón gana 1,5 veces la cocinera', () => {
    const r = repartirPorPuntos(
      100_000,
      [
        fila(1, COCINA, 9),
        fila(2, GARZON, 9),
        fila(3, GARZON, 9),
        fila(4, GARZON, 9),
      ],
      [
        { role_id: GARZON, pct: 60 },
        { role_id: COCINA, pct: 40 },
      ],
    );
    const suma = [...r.values()].reduce((t, m) => t + m, 0);
    expect(suma).toBe(100_000);
    expect(r.get(1)).toBe(18_182);
    expect([r.get(2), r.get(3), r.get(4)].sort()).toEqual([
      27_272, 27_273, 27_273,
    ]);
  });

  it('la #423 (Joker): cocina y garzón al 45/45 valen la misma hora aunque los garzones sumen más horas', () => {
    // Cocina: 34 + 26 + 18 = 78 h. Garzón: 36 + 48 = 84 h. Aseo: 24 + 18 = 42 h.
    const r = repartirPorPuntos(
      133_000,
      [
        fila(1, COCINA, 9),
        fila(2, GARZON, 9),
        fila(3, COCINA, 8),
        fila(4, GARZON, 12),
        fila(5, ASEO, 8),
      ],
      [
        { role_id: COCINA, pct: 45 },
        { role_id: GARZON, pct: 45 },
        { role_id: ASEO, pct: 20 },
      ],
    );
    // Mismas 9 horas, cargos distintos, misma propina.
    expect(r.get(1)).toBe(r.get(2));
    // 12 horas de garzón contra 9: un tercio más (±$1 del reparto sin
    // sobrantes, que pone el peso que falta donde corresponde).
    expect(Math.abs(r.get(4)! - (r.get(2)! * 12) / 9)).toBeLessThanOrEqual(1);
    // 8 horas de aseo a 20 puntos contra 8 de cocina a 45: 20/45.
    expect(Math.abs(r.get(5)! - (r.get(3)! * 20) / 45)).toBeLessThanOrEqual(1);
    // Y todo el pozo repartido.
    expect([...r.values()].reduce((t, m) => t + m, 0)).toBe(133_000);
  });

  it('nunca deja pesos en el aire ni reparte de más', () => {
    const r = repartirPorPuntos(
      100_001,
      [fila(1, COCINA, 7), fila(2, GARZON, 11), fila(3, ASEO, 5)],
      [
        { role_id: COCINA, pct: 33.3 },
        { role_id: GARZON, pct: 33.3 },
        { role_id: ASEO, pct: 33.4 },
      ],
    );
    expect([...r.values()].reduce((t, m) => t + m, 0)).toBe(100_001);
  });

  it('un cargo en 0% no junta puntos y queda fuera', () => {
    const r = repartirPorPuntos(
      90_000,
      [fila(1, COCINA, 9), fila(2, GARZON, 9), fila(3, ASEO, 9)],
      [
        { role_id: COCINA, pct: 50 },
        { role_id: GARZON, pct: 50 },
        { role_id: ASEO, pct: 0 },
      ],
    );
    expect(r.has(3)).toBe(false);
    expect(r.get(1)).toBe(45_000);
  });

  it('un porcentaje a un cargo sin nadie puesto es un error', () => {
    expect(() =>
      repartirPorPuntos(
        90_000,
        [fila(1, COCINA, 9)],
        [
          { role_id: COCINA, pct: 90 },
          { role_id: GARZON, pct: 10 },
        ],
      ),
    ).toThrow(BadRequestException);
  });
});
