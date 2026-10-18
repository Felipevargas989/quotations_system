import type { PinoLogger } from 'nestjs-pino';
import type { DerechosService } from 'src/auth/derechos.service';
import type { EmailService } from 'src/email/email.service';
import type { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../../testing/mocks';
import type { ChoquesDeFechaService } from '../../choques/choques.service';
import { QuotationsCronService } from '../../quotations-cron.service';
import type { QuotationsRepository } from '../../quotations.repository';

// Los correos automáticos al cliente (día 7 y 14 desde el envío) se pausan
// mientras la cotización tiene tope de calendario (Felipe, 18-10-2026;
// mapa 02 §5.4 y §5.6): "no tiene sentido generar un seguimiento
// insistiéndole a la gente con una fecha que quizás no le podamos
// respetar". Datos de prueba.

const fila = (id: string, n: number, companyId = 1) => ({
  id,
  quotation_number: n,
  event_type: 'Paseo fin de año',
  event_date: '2099-12-08T00:00:00+00:00',
  company_id: companyId,
  client_contact_id: 10,
  companies: { name: 'Empresa de prueba' },
});

const armar = (topes: Promise<Set<string>>) => {
  const repositorio = {
    // Primero los del día 7; después, ninguno del día 14.
    findFollowUps: jest
      .fn()
      .mockResolvedValueOnce([fila('q1', 601), fila('q2', 602)])
      .mockResolvedValue([]),
    findContactById: jest.fn().mockResolvedValue({
      email: 'cliente@ejemplo.cl',
      name: 'Cliente de Prueba',
      portal_token: 'token',
    }),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const derechos = {
    deEmpresa: jest
      .fn()
      .mockResolvedValue({ derechos: ['correos_automaticos'] }),
  };
  const choques = { cotizacionesConTope: jest.fn().mockReturnValue(topes) };
  const reloj = new QuotationsCronService(
    repositorio as unknown as QuotationsRepository,
    {} as UsersService,
    email as unknown as EmailService,
    mockPinoLogger() as unknown as PinoLogger,
    derechos as unknown as DerechosService,
    choques as unknown as ChoquesDeFechaService,
  );
  return { reloj, email, choques };
};

describe('QuotationsCronService.sendQuotationFollowUps y los topes de calendario', () => {
  it('a la que tiene tope no le escribe; a la otra, sí', async () => {
    const { reloj, email, choques } = armar(Promise.resolve(new Set(['q2'])));

    await reloj.sendQuotationFollowUps();

    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const [, , datos] = email.sendEmail.mock.calls[0] as unknown[];
    expect(datos).toMatchObject({
      quotationNumber: 601,
      toque: 1,
    });
    // Los topes se calculan una vez por empresa en la corrida.
    expect(choques.cotizacionesConTope).toHaveBeenCalledTimes(1);
  });

  it('si no se pueden revisar los topes, no insiste a nadie de esa empresa', async () => {
    const { reloj, email } = armar(Promise.reject(new Error('sin base')));

    await reloj.sendQuotationFollowUps();

    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});
