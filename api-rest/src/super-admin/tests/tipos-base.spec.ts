import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { SuperAdminRepository } from '../super-admin.repository';
import { SuperAdminService } from '../super-admin.service';

/**
 * LOS TIPOS BASE (Felipe, 02-10-2026: "deja para todos los nuevos
 * clientes por defecto los míos, sin perjuicio que se puedan editar").
 * Toda empresa nueva —por el registro o desde la Torre— nace con los
 * tipos de cliente y de evento de Valle del Sol. Lo que se jura acá:
 *  - se siembra desde la plantilla (empresa 1 por defecto);
 *  - un fallo al sembrar NUNCA rompe el alta.
 */
describe('Los tipos base de una empresa nueva', () => {
  const armar = (sembrar: jest.Mock) => {
    const companies = {
      create: jest.fn().mockResolvedValue({
        data: { id: 77, name: 'Banquetería La Prueba' },
        error: null,
      }),
      deleteById: jest.fn(),
    };
    const repo = {
      sembrarTiposBase: sembrar,
      createCompanyOnly: jest.fn().mockResolvedValue({ id: 78, name: 'X' }),
    };
    const service = new SuperAdminService(
      mockPinoLogger() as unknown as PinoLogger,
      { get: jest.fn().mockReturnValue('') } as unknown as ConfigService,
      {
        create: jest
          .fn()
          .mockResolvedValue({ data: { id: 'u1' }, error: null }),
      } as unknown as UsersService,
      companies as unknown as CompaniesRepository,
      repo as unknown as SuperAdminRepository,
      {
        createTemplate: jest.fn().mockResolvedValue(undefined),
      } as unknown as CustomerSatisfactionSurveyService,
      {
        sendEmail: jest.fn().mockResolvedValue(undefined),
      } as unknown as EmailService,
      { olvidar: jest.fn() } as never,
    );
    return { service };
  };
  const dto = {
    admin_email: 'duena@banqueteria.cl',
    admin_password: 'una-clave-larga',
    admin_full_name: 'La Dueña',
    company_name: 'Banquetería La Prueba',
    currency: 'CLP',
  };

  it('el registro siembra desde la empresa plantilla (1)', async () => {
    const sembrar = jest.fn().mockResolvedValue({ clientes: 8, eventos: 8 });
    const { service } = armar(sembrar);
    await service.createSuscription(dto);
    expect(sembrar).toHaveBeenCalledWith(77, 1);
  });

  it('crear una empresa desde la Torre también siembra', async () => {
    const sembrar = jest.fn().mockResolvedValue({ clientes: 8, eventos: 8 });
    const { service } = armar(sembrar);
    await service.createCompanyOnly('X');
    expect(sembrar).toHaveBeenCalledWith(78, 1);
  });

  it('si sembrar falla, la empresa nace igual', async () => {
    const sembrar = jest.fn().mockRejectedValue(new Error('base caída'));
    const { service } = armar(sembrar);
    const r = await service.createSuscription(dto);
    expect(r.companyData).toMatchObject({ id: 77 });
  });
});
