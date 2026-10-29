import { NotFoundException } from '@nestjs/common';
import type { SupabaseService } from 'src/supabase/supabase.service';
import type { User } from 'src/users/entities/user.entity';
import { DecisionesController } from '../decisiones/decisiones.controller';
import { DecisionesRepository } from '../decisiones/decisiones.repository';

// EL PORQUÉ DE UN DESCARTE (decisión 113): va al último descarte de esa
// oportunidad, solo de la empresa de la sesión. Las decisiones las anotan
// los triggers de la migración 175.

type Paso = unknown[];

function armar(ultimos: Array<{ id: number }>) {
  const consultas: { tabla: string; pasos: Paso[] }[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta = { tabla, pasos: [] as Paso[] };
    consultas.push(consulta);
    const cadena: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'update']) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.then = (bien: (v: unknown) => unknown) =>
      Promise.resolve({
        data: consulta.pasos.some(([m]) => m === 'update') ? null : ultimos,
        error: null,
      }).then(bien);
    return cadena;
  });
  const repo = new DecisionesRepository({
    client: { from },
  } as unknown as SupabaseService);
  return { repo, consultas };
}

describe('El porqué de un descarte (decisión 113)', () => {
  it('va al último descarte de esa oportunidad y de la empresa', async () => {
    const { repo, consultas } = armar([{ id: 41 }]);
    await expect(repo.ponerMotivo(1, 9, 'muy_lejos')).resolves.toEqual({
      motivo: 'muy_lejos',
    });
    const [busca, guarda] = consultas;
    expect(busca.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'oportunidad_id', 9],
        ['eq', 'decision', 'descartada'],
        ['order', 'creado_en', { ascending: false }],
        ['limit', 1],
      ]),
    );
    expect(guarda.pasos).toEqual(
      expect.arrayContaining([
        ['update', { motivo: 'muy_lejos' }],
        ['eq', 'id', 41],
        ['eq', 'company_id', 1],
      ]),
    );
  });

  it('si no hay descarte de esa empresa, no guarda nada y la ruta responde 404', async () => {
    const { repo, consultas } = armar([]);
    await expect(repo.ponerMotivo(2, 9, 'otro')).resolves.toBeNull();
    expect(consultas).toHaveLength(1);
    const controlador = new DecisionesController(repo);
    await expect(
      controlador.motivo(9, { motivo: 'otro' }, { company_id: 2 } as User),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
