import { PinoLogger } from 'nestjs-pino';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';

// LA LISTA DE COTIZACIONES, POR PÁGINAS (28-10-2026). La base corta en
// 1.000 filas sin avisar y la lista va por número ascendente: pasado el
// tope se habrían perdido las MÁS NUEVAS, los eventos que vienen en el
// calendario y las recién llegadas en el tablero (528 ese día, unas 120
// más al mes).
describe('QuotationsRepository.findAll — por páginas', () => {
  const cotizacion = (i: number) => ({ id: `q-${i}`, quotation_number: i });

  const armar = (paginas: { data: unknown; error: unknown }[]) => {
    const range = jest.fn();
    for (const pagina of paginas) range.mockResolvedValueOnce(pagina);
    const consulta: Record<string, jest.Mock> = { range };
    for (const metodo of ['select', 'eq', 'in', 'order', 'gte', 'lte'])
      consulta[metodo] = jest.fn(() => consulta);
    const from = jest.fn(() => consulta);
    const repo = new QuotationsRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, consulta };
  };

  it('junta todas las páginas: llegan las 1.001, también la más nueva', async () => {
    const { repo, consulta } = armar([
      {
        data: Array.from({ length: 1000 }, (_, i) => cotizacion(i + 1)),
        error: null,
      },
      { data: [cotizacion(1001)], error: null },
    ]);

    const lista = await repo.findAll({
      company_id: 1,
      request_type: RequestType.COTIZACION,
      sort_by: 'quotation_number',
      sort_order: 'asc',
    });

    expect(lista).toHaveLength(1001);
    expect(lista[1000].quotation_number).toBe(1001);
    expect(consulta.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(consulta.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('cada página lleva los filtros y el orden pedido, con el id de desempate', async () => {
    const { repo, consulta } = armar([{ data: [cotizacion(1)], error: null }]);

    await repo.findAll({
      company_id: 7,
      request_type: RequestType.COTIZACION,
      statuses: [QuotationStatus.ACEPTADA],
      sort_by: 'event_date',
      sort_order: 'desc',
    });

    expect(consulta.eq).toHaveBeenCalledWith('company_id', 7);
    expect(consulta.eq).toHaveBeenCalledWith('request_type', 'cotizacion');
    expect(consulta.in).toHaveBeenCalledWith('quotation_status', ['aceptada']);
    expect(consulta.order).toHaveBeenNthCalledWith(1, 'event_date', {
      ascending: false,
    });
    expect(consulta.order).toHaveBeenNthCalledWith(2, 'id', {
      ascending: true,
    });
  });

  it('sin orden pedido (el chequeo de choques, el resumen semanal), ordena por id', async () => {
    const { repo, consulta } = armar([{ data: [], error: null }]);

    await repo.findAll({
      company_id: undefined,
      statuses: [QuotationStatus.ENVIADA],
    });

    expect(consulta.order).toHaveBeenCalledTimes(1);
    expect(consulta.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(consulta.eq).not.toHaveBeenCalledWith(
      'company_id',
      expect.anything(),
    );
  });

  it('si la base falla, el error sube tal cual, sin una lista a medias', async () => {
    const error = { message: 'caída', code: '57014' };
    const { repo } = armar([{ data: null, error }]);

    await expect(repo.findAll({ company_id: 1 })).rejects.toBe(error);
  });
});
