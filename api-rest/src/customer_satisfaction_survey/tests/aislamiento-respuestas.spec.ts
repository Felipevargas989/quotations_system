import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { CustomerSatisfactionSurveyController } from '../controller';
import { CustomerSatisfactionSurveyRepository } from '../repository';

/**
 * AISLAMIENTO DE LAS ENCUESTAS (11-09-2026, sprint 2).
 *
 * Dos puertas: la lectura de respuestas filtraba la empresa sobre una
 * tabla embebida SIN `!inner`, que en PostgREST no acota las filas; y la
 * creación de la plantilla tomaba la empresa del query string, así que
 * un administrador de otra empresa podía sobrescribir el cuestionario
 * ajeno.
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

describe('Encuestas: el filtro de empresa filtra de verdad', () => {
  it('la lectura de respuestas usa quotations!inner', async () => {
    const { client, selects } = armarCliente({ data: [], error: null });
    const repo = new CustomerSatisfactionSurveyRepository(
      { client } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await repo.findAllAnswersFromCompany(1);
    expect(selects.join(' ')).toContain('quotations!inner');
  });
});

describe('Encuestas: la plantilla se crea para la empresa de la sesión', () => {
  it('no lee la empresa del query string', async () => {
    const service = { createTemplate: jest.fn().mockResolvedValue(undefined) };
    const controller = new CustomerSatisfactionSurveyController(
      service as never,
      mockPinoLogger() as never,
    );
    await controller.createTemplate({ id: 'u-1', company_id: 7 } as never);
    expect(service.createTemplate).toHaveBeenCalledWith(7);
  });
});
