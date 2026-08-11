import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { SuperAdminRepository } from '../super-admin.repository';

// Cura 05-08: Supabase entrega 1000 filas/usuarios por página — las
// lecturas grandes recorren TODAS las páginas hasta la página corta.
describe('SuperAdminRepository — paginación', () => {
  const armarRepo = (supabase: unknown) =>
    new SuperAdminRepository(
      mockPinoLogger() as unknown as PinoLogger,
      supabase as SupabaseService,
    );

  it('getTorreBase junta auth.users a través de página llena + corta', async () => {
    const usuario = (i: number) => ({
      email: `u${i}@x.cl`,
      last_sign_in_at: null,
      created_at: '2026-08-01T00:00:00.000Z',
    });
    const paginaLlena = Array.from({ length: 1000 }, (_, i) => usuario(i));
    const paginaCorta = [usuario(1000), usuario(1001)];
    const listUsers = jest
      .fn()
      .mockResolvedValueOnce({ data: { users: paginaLlena }, error: null })
      .mockResolvedValueOnce({ data: { users: paginaCorta }, error: null });
    const supabase = {
      client: {
        auth: { admin: { listUsers } },
        from: jest.fn(() => ({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    };

    const base = await armarRepo(supabase).getTorreBase();

    expect(base.authUsers).toHaveLength(1002);
    expect(listUsers).toHaveBeenCalledTimes(2);
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
  });

  it('getStatsLastMonth recorre las cotizaciones con .range() hasta la página corta', async () => {
    // Fila del momento actual: siempre cae dentro de la ventana de 6
    // meses y del corte de 30 días, sin depender del reloj de pared.
    const fila = {
      created_at: new Date().toISOString(),
      company_id: 1,
      total_amount: 10,
    };
    const range = jest
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => fila),
        error: null,
      })
      .mockResolvedValueOnce({ data: [fila], error: null });
    const quotationsBuilder: Record<string, unknown> = {};
    quotationsBuilder.select = jest.fn(() => quotationsBuilder);
    quotationsBuilder.gte = jest.fn(() => quotationsBuilder);
    quotationsBuilder.order = jest.fn(() => quotationsBuilder);
    quotationsBuilder.range = range;
    const companiesBuilder = {
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({
          data: [{ id: 1, name: 'Cabañas' }],
          error: null,
        }),
      })),
    };
    const supabase = {
      client: {
        from: jest.fn((tabla: string) =>
          tabla === 'companies' ? companiesBuilder : quotationsBuilder,
        ),
      },
    };

    const { data, error } = await armarRepo(supabase).getStatsLastMonth();

    expect(error).toBeNull();
    expect(range).toHaveBeenCalledTimes(2);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
    // Las 1001 filas quedan contadas (antes el tope de 1000 las cortaba).
    expect(data?.[0].total_quotations).toBe(1001);
    expect(data?.[0].monthly.reduce((s, m) => s + m.cantidad, 0)).toBe(1001);
  });
});
