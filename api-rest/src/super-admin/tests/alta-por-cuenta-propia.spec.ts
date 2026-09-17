import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { SignupDto } from 'src/users/dto/signup.dto';
import { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { SuperAdminService } from '../super-admin.service';

/**
 * EL ALTA POR CUENTA PROPIA (16-09-2026, paso 4 del roadmap de venta).
 *
 * La landing promete "empieza gratis" y el registro vuelve a crear la
 * empresa de verdad. Estas pruebas cuidan las dos cosas que más duelen en
 * una puerta pública:
 *
 *  1. LA COMPENSACIÓN: si la empresa nace pero su administrador no pudo
 *     crearse (lo típico: el correo ya tiene cuenta), la empresa recién
 *     creada SE BORRA. Sin eso, cada intento fallido del visitante dejaba
 *     una empresa huérfana en la base.
 *  2. EL MENSAJE: el visitante recibe algo que una persona entiende, no
 *     el "[object Object]" que ya nos mordió una vez en el embudo.
 */
describe('El alta por cuenta propia', () => {
  const dto = {
    admin_email: 'duena@banqueteria.cl',
    admin_password: 'una-clave-larga',
    admin_full_name: 'La Dueña',
    company_name: 'Banquetería La Prueba',
    currency: 'CLP',
  };

  const armar = ({ userCreate }: { userCreate: jest.Mock }) => {
    const companies = {
      create: jest.fn().mockResolvedValue({
        data: { id: 77, name: dto.company_name },
        error: null,
      }),
      deleteById: jest.fn().mockResolvedValue({ error: null }),
    };
    const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const encuesta = { createTemplate: jest.fn().mockResolvedValue(undefined) };
    const service = new SuperAdminService(
      mockPinoLogger() as unknown as PinoLogger,
      { get: jest.fn().mockReturnValue('') } as unknown as ConfigService,
      { create: userCreate } as unknown as UsersService,
      companies as unknown as CompaniesRepository,
      {} as never,
      encuesta as unknown as CustomerSatisfactionSurveyService,
      email as unknown as EmailService,
      { olvidar: jest.fn() } as never,
    );
    return { service, companies, email };
  };

  it('cuando todo sale bien: empresa en prueba de 7 días y bienvenida con datos', async () => {
    const userCreate = jest
      .fn()
      .mockResolvedValue({ data: { id: 'u1' }, error: null });
    const { service, companies, email } = armar({ userCreate });

    const r = await service.createSuscription(dto);

    expect(r.companyData).toMatchObject({ id: 77 });
    // La empresa nace en el plan más chico pero probando TODO.
    const llamadas = companies.create.mock.calls as unknown as [
      [{ plan?: string; estado_plan?: string; prueba_vence?: string }],
    ];
    const empresaCreada = llamadas[0][0];
    expect(empresaCreada.plan).toBe('cotiza');
    expect(empresaCreada.estado_plan).toBe('prueba');
    expect(empresaCreada.prueba_vence).toBeTruthy();
    // Y la bienvenida viaja con el nombre y el vencimiento.
    expect(email.sendEmail).toHaveBeenCalledWith(
      dto.admin_email,
      expect.anything(),
      expect.objectContaining({
        companyName: dto.company_name,
        pruebaVence: empresaCreada.prueba_vence,
      }),
    );
    expect(companies.deleteById).not.toHaveBeenCalled();
  });

  it('correo ya registrado: aviso claro Y la empresa huérfana se borra', async () => {
    const userCreate = jest
      .fn()
      .mockRejectedValue(new Error('User already registered'));
    const { service, companies } = armar({ userCreate });

    await expect(service.createSuscription(dto)).rejects.toThrow(
      ConflictException,
    );
    // La compensación: la empresa 77 recién creada no queda huérfana.
    expect(companies.deleteById).toHaveBeenCalledWith(77);
  });

  it('el error PLANO de la base (PostgrestError) también habla claro', async () => {
    // El caso real del 16-09 en el laboratorio: user_profiles rechazó el
    // insert y el error llegó como objeto plano, no como Error. La
    // primera versión hacía String(objeto) → "[object Object]".
    const userCreate = jest.fn().mockResolvedValue({
      data: null,
      error: {
        message:
          'duplicate key value violates unique constraint "user_profiles_email_key"',
        code: '23505',
      },
    });
    const { service, companies } = armar({ userCreate });

    await expect(service.createSuscription(dto)).rejects.toThrow(
      ConflictException,
    );
    expect(companies.deleteById).toHaveBeenCalledWith(77);
  });

  it('si la compensación no puede borrar, queda gritado en el registro', async () => {
    const userCreate = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied for schema public', code: '42501' },
    });
    const companies = {
      create: jest.fn().mockResolvedValue({
        data: { id: 77, name: dto.company_name },
        error: null,
      }),
      deleteById: jest.fn().mockResolvedValue({
        error: { message: 'permission denied for schema public' },
      }),
    };
    const logger = mockPinoLogger();
    const service = new SuperAdminService(
      logger as unknown as PinoLogger,
      { get: jest.fn().mockReturnValue('') } as unknown as ConfigService,
      { create: userCreate } as unknown as UsersService,
      companies as unknown as CompaniesRepository,
      {} as never,
      {} as CustomerSatisfactionSurveyService,
      { sendEmail: jest.fn() } as unknown as EmailService,
      { olvidar: jest.fn() } as never,
    );

    await expect(service.createSuscription(dto)).rejects.toThrow();
    const llamadasDeError = (
      logger.error as unknown as jest.Mock<void, [unknown]>
    ).mock.calls;
    const gritos = llamadasDeError
      .map((c) => String(c[0]))
      .filter((m) => m.includes('no pudo borrar la empresa 77'));
    expect(gritos).toHaveLength(1);
    expect(gritos[0]).toContain('permission denied');
  });

  it('otro error del alta: mensaje real, nunca "[object Object]"', async () => {
    const userCreate = jest
      .fn()
      .mockRejectedValue(new Error('Password should be at least 6 characters'));
    const { service, companies } = armar({ userCreate });

    try {
      await service.createSuscription(dto);
      fail('tenía que rechazar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toContain('Password');
      expect((e as BadRequestException).message).not.toContain(
        '[object Object]',
      );
    }
    expect(companies.deleteById).toHaveBeenCalledWith(77);
  });

  // ── DE DÓNDE LLEGÓ (migración 116, 18-09-2026) ────────────────────
  const empresaCreadaEn = (companies: { create: jest.Mock }) =>
    (
      companies.create.mock.calls as unknown as [
        [{ origen?: string | null; origen_detalle?: unknown }],
      ]
    )[0][0];

  it('con huella de Google en la dirección, la empresa nace como "Google Ads"', async () => {
    const userCreate = jest
      .fn()
      .mockResolvedValue({ data: { id: 'u1' }, error: null });
    const { service, companies } = armar({ userCreate });

    await service.createSuscription({
      ...dto,
      origen_detalle: {
        gclid: 'abc123',
        utm_campaign: 'lanzamiento',
        // El navegador no decide qué entra a la base: esto se descarta.
        inventado: 'MENTIRA',
      },
    });

    const creada = empresaCreadaEn(companies);
    expect(creada.origen).toBe('Google Ads');
    expect(creada.origen_detalle).toEqual({
      gclid: 'abc123',
      utm_campaign: 'lanzamiento',
    });
  });

  it('sin ninguna huella, la empresa nace como "Directo" (no como NULL)', async () => {
    const userCreate = jest
      .fn()
      .mockResolvedValue({ data: { id: 'u1' }, error: null });
    const { service, companies } = armar({ userCreate });

    await service.createSuscription(dto);

    const creada = empresaCreadaEn(companies);
    // NULL queda para las anteriores a la 116 y las creadas a mano.
    expect(creada.origen).toBe('Directo');
    expect(creada.origen_detalle).toBeNull();
  });
});

// ── El DTO de la puerta pública: cada campo con su tope y su forma. ────
describe('SignupDto, la puerta pública endurecida', () => {
  const base = {
    admin_email: 'duena@banqueteria.cl',
    admin_password: 'una-clave-larga',
    admin_full_name: 'La Dueña',
    company_name: 'Banquetería La Prueba',
    currency: 'CLP',
  };
  const errores = (cambios: Partial<typeof base>) =>
    validateSync(plainToInstance(SignupDto, { ...base, ...cambios }));

  it('el completo pasa', () => {
    expect(errores({})).toHaveLength(0);
  });

  it('un correo que no es correo, rechazado', () => {
    expect(errores({ admin_email: 'esto-no-es-un-correo' })).not.toHaveLength(
      0,
    );
  });

  it('una contraseña de juguete, rechazada', () => {
    expect(errores({ admin_password: 'corta' })).not.toHaveLength(0);
  });

  it('un nombre de empresa kilométrico, rechazado', () => {
    expect(errores({ company_name: 'x'.repeat(121) })).not.toHaveLength(0);
  });

  it('las huellas de origen entran como objeto y se rechazan como texto', () => {
    expect(
      validateSync(
        plainToInstance(SignupDto, {
          ...base,
          origen_detalle: { gclid: 'abc' },
        }),
      ),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(SignupDto, { ...base, origen_detalle: 'gclid=abc' }),
      ),
    ).not.toHaveLength(0);
  });
});
