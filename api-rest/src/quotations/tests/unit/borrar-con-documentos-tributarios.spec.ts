import { ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';

// UNA COTIZACIÓN CON FACTURA NO SE BORRA (migración 184, doc 19 §9.5).
// `documentos_tributarios` apunta a la cotización sin cascada: un
// documento tributario no se borra nunca, se anula con una nota de
// crédito. La guardia lo dice con palabras, antes que el error crudo de
// la base.
describe('QuotationsRepository.remove — con documentos tributarios', () => {
  const armar = (documentos: number) => {
    const cotizacion: Record<string, jest.Mock> = {
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'q-1' },
        error: null,
      }),
      delete: jest.fn(),
    };
    for (const metodo of ['select', 'eq'])
      cotizacion[metodo] = jest.fn(() => cotizacion);
    cotizacion.delete.mockImplementation(() => cotizacion);

    const conteo = (count: number) => {
      const consulta: Record<string, jest.Mock> = {
        eq: jest.fn().mockResolvedValue({ count, error: null }),
      };
      consulta.select = jest.fn(() => consulta);
      return consulta;
    };
    const tablas: Record<string, unknown> = {
      quotations: cotizacion,
      documentos_tributarios: conteo(documentos),
      payment_transactions: conteo(0),
      refunds: conteo(0),
      payments: conteo(0),
      customer_satisfaction_survey_responses: conteo(0),
    };
    const from = jest.fn((tabla: string) => tablas[tabla]);
    const repo = new QuotationsRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, cotizacion, from };
  };

  it('con una factura no se borra, y dice por qué', async () => {
    const { repo, cotizacion } = armar(1);

    await expect(repo.remove('q-1', 1)).rejects.toThrow(ConflictException);
    await expect(repo.remove('q-1', 1)).rejects.toThrow(
      /documentos tributarios/,
    );
    expect(cotizacion.delete).not.toHaveBeenCalled();
  });

  it('sin documentos tributarios, sigue el camino de siempre', async () => {
    const { repo, cotizacion, from } = armar(0);

    await repo.remove('q-1', 1);

    expect(from).toHaveBeenCalledWith('documentos_tributarios');
    expect(cotizacion.delete).toHaveBeenCalled();
  });
});
