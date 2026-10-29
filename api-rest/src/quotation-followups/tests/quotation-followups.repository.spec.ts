import { PinoLogger } from 'nestjs-pino';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { QuotationFollowupsRepository } from '../quotation-followups.repository';

// El semáforo (28-10-2026): solo la bitácora de lo vivo, y por páginas.
// Hasta ese día se leía todo de una vez y la base corta en 1.000 filas
// sin avisar: pasado ese número, las notas más viejas se perdían en
// silencio, con sus compromisos.
describe('QuotationFollowupsRepository.findMapRows', () => {
  const VIVOS = [QuotationStatus.ENVIADA, QuotationStatus.ACEPTADA];
  const nota = (i: number) => ({
    quotation_id: `q-${i}`,
    created_at: '2026-10-28T12:00:00Z',
    next_contact_date: null,
    next_contact_done_at: null,
  });

  const armar = (paginas: { data: unknown; error: unknown }[]) => {
    const range = jest.fn();
    for (const pagina of paginas) range.mockResolvedValueOnce(pagina);
    const consulta: Record<string, jest.Mock> = { range };
    for (const metodo of ['select', 'eq', 'in', 'order'])
      consulta[metodo] = jest.fn(() => consulta);
    const from = jest.fn(() => consulta);
    const repo = new QuotationFollowupsRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, consulta, from };
  };

  it('recorre las páginas hasta la corta: llegan las 1.001 notas', async () => {
    const { repo, consulta } = armar([
      { data: Array.from({ length: 1000 }, (_, i) => nota(i)), error: null },
      { data: [nota(1000)], error: null },
    ]);

    const filas = await repo.findMapRows(7, VIVOS);

    expect(filas).toHaveLength(1001);
    expect(consulta.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(consulta.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('solo la empresa, solo lo vivo y de la nota más nueva a la más vieja', async () => {
    const { repo, consulta, from } = armar([{ data: [nota(1)], error: null }]);

    await repo.findMapRows(7, VIVOS);

    expect(from).toHaveBeenCalledWith('quotation_followups');
    expect(consulta.select).toHaveBeenCalledWith(
      expect.stringContaining('quotations!inner(quotation_status)'),
    );
    expect(consulta.eq).toHaveBeenCalledWith('company_id', 7);
    expect(consulta.in).toHaveBeenCalledWith(
      'quotations.quotation_status',
      VIVOS,
    );
    expect(consulta.order).toHaveBeenNthCalledWith(1, 'created_at', {
      ascending: false,
    });
    // El id desempata: sin él, dos notas del mismo instante podrían
    // repetirse o saltarse entre una página y la siguiente.
    expect(consulta.order).toHaveBeenNthCalledWith(2, 'id', {
      ascending: false,
    });
  });

  it('si la base falla, avisa en vez de entregar un semáforo a medias', async () => {
    const { repo } = armar([{ data: null, error: { message: 'caída' } }]);

    await expect(repo.findMapRows(7, VIVOS)).rejects.toThrow('caída');
  });
});
