import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { EventiaRepository } from '../eventia/eventia.repository';

/** Lo que la empresa tiene en Eventia, contra una base falsa que anota cada
 *  consulta. Lo que fija: todo es de UNA empresa, la carta va sin precios y
 *  la agenda solo cuenta lo confirmado de ese día. */
type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = ['select', 'eq', 'gte', 'lte', 'or', 'order', 'limit'];

function armar(datos: Record<string, unknown[]> = {}) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const cadena: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.then = (
      bien: (v: unknown) => unknown,
      mal?: (e: unknown) => unknown,
    ) =>
      Promise.resolve({ data: datos[tabla] ?? [], error: null }).then(
        bien,
        mal,
      );
    return cadena;
  });
  const repo = new EventiaRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas };
}

const deLaEmpresa = (c: Consulta, id: number) =>
  c.pasos.some(([m, col, v]) => m === 'eq' && col === 'company_id' && v === id);

describe('EventiaRepository', () => {
  it('la carta: fijos activos con su sección, menús con sus platos y paquetes, sin precios', async () => {
    const { repo, consultas } = armar({
      fixed_services: [
        { name: 'Salón principal', seccion: { name: 'Salones' } },
      ],
      service_groups: [
        {
          name: 'Plateada',
          category: 'Cena',
          items: [
            { servicio: { name: 'Plateada al jugo' } },
            { servicio: null },
          ],
        },
      ],
      service_group_collections: [{ name: 'Matrimonio' }, { name: null }],
    });
    await expect(repo.carta(52)).resolves.toEqual({
      fijos: [{ nombre: 'Salón principal', seccion: 'Salones' }],
      menus: [
        { categoria: 'Cena', nombre: 'Plateada', platos: ['Plateada al jugo'] },
      ],
      paquetes: ['Matrimonio'],
    });
    expect(consultas.map((c) => c.tabla)).toEqual([
      'fixed_services',
      'service_groups',
      'service_group_collections',
    ]);
    for (const c of consultas) expect(deLaEmpresa(c, 52)).toBe(true);
    for (const c of consultas) {
      const [, columnas] = c.pasos.find(([m]) => m === 'select') ?? [];
      expect(String(columnas)).not.toMatch(/price/);
    }
    expect(consultas[0].pasos).toContainEqual(['eq', 'is_active', true]);
  });

  it('los eventos realizados: de la empresa, desde la fecha, del más nuevo al más viejo', async () => {
    const { repo, consultas } = armar({
      quotations: [
        {
          quotation_number: 455,
          event_type: 'Celebraciones',
          event_date: '2025-12-12T00:00:00+00:00',
          people_count: 150,
          total_amount: 9_800_000,
          items: { fixed_services: [{ nombre: 'Salón principal' }] },
          cliente: { name: 'Municipalidad de Bulnes' },
        },
      ],
    });
    await expect(repo.eventosRealizados(52, '2022-10-17')).resolves.toEqual([
      {
        numero: 455,
        tipo: 'Celebraciones',
        fecha: '2025-12-12',
        personas: 150,
        monto: 9_800_000,
        cliente: 'Municipalidad de Bulnes',
        fijos: ['Salón principal'],
      },
    ]);
    const [c] = consultas;
    expect(deLaEmpresa(c, 52)).toBe(true);
    expect(c.pasos).toContainEqual(['eq', 'quotation_status', 'realizada']);
    expect(c.pasos).toContainEqual(['gte', 'event_date', '2022-10-17']);
    expect(c.pasos).toContainEqual([
      'order',
      'event_date',
      { ascending: false },
    ]);
  });

  it('la agenda del día: solo lo aceptado de la empresa que cae ese día (también lo de varios días)', async () => {
    const { repo, consultas } = armar();
    await repo.agendaDelDia(52, '2026-10-30');
    const [c] = consultas;
    expect(deLaEmpresa(c, 52)).toBe(true);
    expect(c.pasos).toContainEqual(['eq', 'quotation_status', 'aceptada']);
    expect(c.pasos).toContainEqual([
      'lte',
      'event_date',
      '2026-10-30T23:59:59.999Z',
    ]);
    expect(c.pasos).toContainEqual([
      'or',
      'event_end_date.gte."2026-10-30T00:00:00.000Z",and(event_end_date.is.null,event_date.gte."2026-10-30T00:00:00.000Z")',
    ]);
  });
});
