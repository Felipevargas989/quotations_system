import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { RegisterLeadDto } from '../dto/register-lead.dto';
import { SuperAdminRepository } from '../super-admin.repository';
import { SuperAdminService } from '../super-admin.service';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa por las
// dependencias circulares (forwardRef a UsersService y a la encuesta).
describe('SuperAdminService', () => {
  it('should be defined', () => {
    const service = new SuperAdminService(
      mockPinoLogger() as unknown as PinoLogger,
      { get: jest.fn() } as unknown as ConfigService,
      {} as UsersService,
      {} as CompaniesRepository,
      {} as SuperAdminRepository,
      {} as CustomerSatisfactionSurveyService,
      {} as EmailService,
    );
    expect(service).toBeDefined();
  });
});

// ---------- Torre de Control (tanda 1, 05-08) ----------
describe('SuperAdminService — Torre de Control', () => {
  const config = (emails: string) =>
    ({
      get: jest.fn((clave: string) =>
        clave === 'SUPER_ADMIN_EMAILS' ? emails : undefined,
      ),
    }) as unknown as ConfigService;

  const armar = ({
    repo = {},
    email = {},
    emails = 'torre@eventia.cl, dueno@eventia.cl',
  }: {
    repo?: Record<string, unknown>;
    email?: Record<string, unknown>;
    emails?: string;
  } = {}) =>
    new SuperAdminService(
      mockPinoLogger() as unknown as PinoLogger,
      config(emails),
      {} as UsersService,
      {} as CompaniesRepository,
      repo as unknown as SuperAdminRepository,
      {} as CustomerSatisfactionSurveyService,
      email as unknown as EmailService,
    );

  const dtoLead: RegisterLeadDto = {
    nombre: 'Rosa',
    telefono: '+56 9 1234 5678',
    email: 'rosa@x.cl',
    nombre_empresa: 'Cabañas del Lago',
  };

  it('getTorre cruza auth↔perfiles POR EMAIL, ordena por último inicio (nulls al final) y arma las tarjetas', async () => {
    const ahora = new Date();
    const esteMes = ahora.toISOString();
    const mesPasado = new Date(
      ahora.getFullYear(),
      ahora.getMonth() - 1,
      15,
    ).toISOString();
    const repo = {
      getTorreBase: jest.fn().mockResolvedValue({
        authUsers: [
          {
            email: 'ana@x.cl',
            last_sign_in_at: '2026-08-01T10:00:00Z',
            created_at: mesPasado,
          },
          // En MAYÚSCULAS a propósito: el cruce por email no es
          // sensible a la caja.
          {
            email: 'BETO@x.cl',
            last_sign_in_at: '2026-08-04T10:00:00Z',
            created_at: esteMes,
          },
          { email: 'cata@x.cl', last_sign_in_at: null, created_at: mesPasado },
        ],
        profiles: [
          {
            email: 'beto@x.cl',
            full_name: 'Beto',
            role: 'vendedor',
            company_id: 2,
          },
          {
            email: 'ana@x.cl',
            full_name: 'Ana',
            role: 'administrador',
            company_id: 1,
          },
        ],
        companies: [
          { id: 1, name: 'Cabañas', created_at: mesPasado },
          { id: 2, name: 'Eventos Sur', created_at: esteMes },
        ],
      }),
      countLeads: jest.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(3),
    };

    const torre = await armar({ repo }).getTorre();

    expect(torre.usuarios.map((u) => u.email)).toEqual([
      'BETO@x.cl',
      'ana@x.cl',
      'cata@x.cl',
    ]);
    expect(torre.usuarios[0]).toMatchObject({
      nombre: 'Beto',
      empresa: 'Eventos Sur',
      rol: 'vendedor',
    });
    expect(torre.usuarios[2].ultimo_inicio_sesion).toBeNull();
    expect(torre.tarjetas).toEqual({
      empresas_total: 2,
      empresas_mes: 1,
      usuarios_total: 3,
      usuarios_mes: 1,
      leads_total: 7,
      leads_mes: 3,
    });
  });

  it('registerLead guarda y manda la alerta 🔔 a la allowlist del ConfigService', async () => {
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const repo = { registerLead: jest.fn().mockResolvedValue({ id: 'L1' }) };

    const res = await armar({ repo, email: { sendEmail } }).registerLead(
      dtoLead,
    );

    expect(res).toEqual({ success: true, id: 'L1' });
    expect(sendEmail).toHaveBeenCalledWith(
      ['torre@eventia.cl', 'dueno@eventia.cl'],
      EmailStructure.SUPER_ADMIN_NEW_LEAD,
      expect.objectContaining({
        nombre: 'Rosa',
        nombre_empresa: 'Cabañas del Lago',
      }),
    );
  });

  it('si Resend falla, el lead queda guardado igual (la alerta jamás rompe el flujo)', async () => {
    const repo = { registerLead: jest.fn().mockResolvedValue({ id: 'L2' }) };
    const email = {
      sendEmail: jest.fn().mockRejectedValue(new Error('Resend caído')),
    };

    await expect(armar({ repo, email }).registerLead(dtoLead)).resolves.toEqual(
      { success: true, id: 'L2' },
    );
  });

  it('createCompanyOnly crea y manda la alerta 🏢; el correo caído no bota la empresa', async () => {
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const repo = {
      createCompanyOnly: jest
        .fn()
        .mockResolvedValue({ id: 9, name: 'Fundo Norte' }),
    };

    const creada = await armar({
      repo,
      email: { sendEmail },
    }).createCompanyOnly('Fundo Norte');

    expect(creada).toEqual({ id: 9, name: 'Fundo Norte' });
    expect(sendEmail).toHaveBeenCalledWith(
      ['torre@eventia.cl', 'dueno@eventia.cl'],
      EmailStructure.SUPER_ADMIN_NEW_COMPANY,
      { name: 'Fundo Norte' },
    );

    const caido = armar({
      repo: {
        createCompanyOnly: jest.fn().mockResolvedValue({ id: 10, name: 'X' }),
      },
      email: { sendEmail: jest.fn().mockRejectedValue(new Error('sin red')) },
    });
    await expect(caido.createCompanyOnly('X')).resolves.toEqual({
      id: 10,
      name: 'X',
    });
  });

  it('sin SUPER_ADMIN_EMAILS configurado no intenta enviar nada', async () => {
    const sendEmail = jest.fn();
    const repo = { registerLead: jest.fn().mockResolvedValue({ id: 'L3' }) };

    await armar({ repo, email: { sendEmail }, emails: '' }).registerLead(
      dtoLead,
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
