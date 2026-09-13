import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { RefundsRepository } from '../refunds.repository';

/**
 * AISLAMIENTO DE LOS REEMBOLSOS (11-09-2026, sprint 2).
 *
 * `findAll` filtraba `quotations.company_id` sobre un embebido sin
 * `!inner`: cualquier sesión veía los reembolsos de todas las empresas.
 */
const armarCliente = (respuesta: { data: unknown; error: unknown }) => {
  const selects: string[] = [];
  const cadena: Record<string, unknown> = {};
  for (const m of [
    'select',
    'eq',
    'in',
    'order',
    'limit',
    'delete',
    'insert',
  ]) {
    cadena[m] = jest.fn((arg: unknown) => {
      if (m === 'select' && typeof arg === 'string') selects.push(arg);
      return cadena;
    });
  }
  (cadena as { then?: unknown }).then = (resolver: (v: unknown) => void) =>
    resolver(respuesta);
  (cadena as { single?: unknown }).single = jest
    .fn()
    .mockResolvedValue(respuesta);
  const client = { from: jest.fn(() => cadena) };
  return { client, selects, cadena };
};

describe('Reembolsos: el listado filtra por empresa de verdad', () => {
  it('findAll usa quotations!inner', async () => {
    const { client, selects } = armarCliente({ data: [], error: null });
    const repo = new RefundsRepository(
      { client } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await repo.findAll(1);
    expect(selects.join(' ')).toContain('quotations!inner');
  });
});
