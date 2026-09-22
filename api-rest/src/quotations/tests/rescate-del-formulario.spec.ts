import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from '../../testing/mocks';
import { RescateDelFormularioService } from '../rescate-del-formulario.service';

const enviar = jest.fn<
  Promise<{ error: unknown }>,
  [Record<string, unknown>]
>();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: enviar } })),
}));

/**
 * LA RED BAJO EL FORMULARIO PÚBLICO (22-09-2026). Lo que se jura:
 *  - con la base caída, el lead viaja COMPLETO por correo a los
 *    super-administradores (sin [REDACTADO]) y el visitante ve "gracias";
 *  - si el correo tampoco sale, se rinde con honestidad (false);
 *  - en el laboratorio (EMAILS_SILENCED=1) no manda pero deja los datos
 *    completos en el registro.
 */
const dto = {
  email: 'contacto@hospital.cl',
  phone: '+56912345678',
  name: 'Juana Pérez',
  company_name: 'Hospital San Agustín de Florida',
  client_type: 'Empresas Publicas',
  event_type: 'Celebraciones',
  event_date: '2026-10-16',
  people_count: 80,
  children_count: 0,
  budget_estimate: 1250000,
  observations: 'Almuerzo de aniversario',
} as never;

const armar = (env: Record<string, string | undefined>) => {
  const logger = mockPinoLogger();
  const servicio = new RescateDelFormularioService(
    { get: jest.fn((k: string) => env[k]) } as unknown as ConfigService,
    logger as unknown as PinoLogger,
  );
  return { servicio, logger };
};

describe('la red bajo el formulario público', () => {
  const silenciado = process.env.EMAILS_SILENCED;
  beforeEach(() => {
    enviar.mockReset();
    delete process.env.EMAILS_SILENCED;
  });
  afterAll(() => {
    if (silenciado !== undefined) process.env.EMAILS_SILENCED = silenciado;
  });

  it('con la base caída, el lead viaja completo por correo y el visitante ve gracias', async () => {
    enviar.mockResolvedValue({ error: null });
    const { servicio } = armar({
      SUPER_ADMIN_EMAILS: 'felipe@eventi-app.com, socio@eventi-app.com',
      RESEND_API_KEY: 'x',
    });

    const aSalvo = await servicio.rescatar(dto, 1, {
      code: 'PGRST003',
      message: 'Timed out acquiring connection from connection pool.',
    });

    expect(aSalvo).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
    const correo = enviar.mock.calls[0][0] as unknown as {
      to: string[];
      subject: string;
      html: string;
      replyTo?: string;
    };
    expect(correo.to).toEqual([
      'felipe@eventi-app.com',
      'socio@eventi-app.com',
    ]);
    expect(correo.subject).toContain('Hospital San Agustín de Florida');
    // Nada tapado: correo, teléfono y nombre van enteros.
    expect(correo.html).toContain('contacto@hospital.cl');
    expect(correo.html).toContain('+56912345678');
    expect(correo.html).toContain('Juana Pérez');
    expect(correo.html).toContain('$1.250.000');
    expect(correo.html).toContain('PGRST003');
    expect(correo.html).not.toContain('REDACTADO');
    // Responder el correo le llega a la persona.
    expect(correo.replyTo).toBe('contacto@hospital.cl');
  });

  it('si el correo tampoco sale, se rinde con honestidad', async () => {
    enviar.mockRejectedValue(new Error('Resend caído'));
    const { servicio, logger } = armar({
      SUPER_ADMIN_EMAILS: 'felipe@eventi-app.com',
      RESEND_API_KEY: 'x',
    });

    const aSalvo = await servicio.rescatar(dto, 1, new Error('fetch failed'));

    expect(aSalvo).toBe(false);
    // Y los datos quedan al menos en el registro, sin tapar.
    const gritos = (
      logger.error as unknown as jest.Mock<void, [unknown]>
    ).mock.calls.map((c) => String(c[0]));
    expect(gritos.join(' ')).toContain('contacto@hospital.cl');
  });

  it('sin destinatarios configurados no puede rescatar y lo dice', async () => {
    const { servicio } = armar({ RESEND_API_KEY: 'x' });
    expect(await servicio.rescatar(dto, 1, new Error('x'))).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('en el laboratorio (EMAILS_SILENCED) no manda, pero deja los datos completos en el registro', async () => {
    process.env.EMAILS_SILENCED = '1';
    const { servicio, logger } = armar({
      SUPER_ADMIN_EMAILS: 'f@e.com',
      RESEND_API_KEY: 'x',
    });
    expect(await servicio.rescatar(dto, 1, new Error('x'))).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
    const avisos = (
      logger.warn as unknown as jest.Mock<void, [unknown]>
    ).mock.calls.map((c) => String(c[0]));
    expect(avisos.join(' ')).toContain('+56912345678');
  });
});
