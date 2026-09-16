import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { MercadoPagoService } from '../mercadopago.service';
import { PagosRepository } from '../pagos.repository';
import { PagosService } from '../pagos.service';

/**
 * LA MÁQUINA DE COBROS (16-09-2026, sprint B del paso 4+5).
 *
 * Lo que estas pruebas juran (plan §7.3, punto 10):
 *  - un aviso repetido se procesa UNA sola vez;
 *  - el pago autorizado activa (y el plan rige al instante);
 *  - el pago rechazado deja morosa con su gracia y su correo;
 *  - `gratis` NO SE TOCA NUNCA — Valle del Sol no entra a esta máquina.
 */

const armar = (opciones?: {
  empresa?: Record<string, unknown> | null;
  suscripcion?: Record<string, unknown>;
  pago?: Record<string, unknown> | null;
  yaProcesado?: boolean;
  configurado?: boolean;
}) => {
  const mercadoPago = {
    configurado: jest.fn(() => opciones?.configurado ?? true),
    crearSuscripcion: jest.fn().mockResolvedValue({
      id: 'susc-1',
      init_point: 'https://mp.example/susc-1',
    }),
    consultarSuscripcion: jest
      .fn()
      .mockResolvedValue(
        opciones?.suscripcion ?? {
          id: 'susc-1',
          status: 'authorized',
          preapproval_plan_id: 'plan-gestiona',
          external_reference: '42',
          next_payment_date: '2026-10-16T12:00:00.000Z',
        },
      ),
    consultarPago: jest.fn().mockImplementation(() => {
      if (opciones && 'pago' in opciones && opciones.pago === null) {
        return Promise.reject(new Error('no existe'));
      }
      return Promise.resolve(
        opciones?.pago ?? {
          id: 777,
          status: 'approved',
          external_reference: '42',
          metadata: { preapproval_id: 'susc-1' },
        },
      );
    }),
    planDe: jest.fn((id: string) =>
      id === 'plan-gestiona' ? 'gestiona' : null,
    ),
  };
  const repo = {
    empresa: jest.fn().mockResolvedValue(
      opciones && 'empresa' in opciones
        ? opciones.empresa
        : {
            id: 42,
            name: 'Eventos del Sur',
            plan: 'cotiza',
            estado_plan: 'prueba',
            pagado_hasta: null,
          },
    ),
    actualizarEmpresa: jest.fn().mockResolvedValue(undefined),
    avisoYaProcesado: jest.fn().mockResolvedValue(opciones?.yaProcesado ?? false),
    anotarAviso: jest.fn().mockResolvedValue(undefined),
  };
  const usersService = {
    findAll: jest.fn().mockResolvedValue([
      { user_id: 'u-1', role: 'administrador', email: 'duena@sur.cl' },
      { user_id: 'u-2', role: 'vendedor', email: 'vende@sur.cl' },
    ]),
  };
  const derechosService = { olvidar: jest.fn() };
  const emailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((clave: string) =>
      clave === 'FRONTEND_URL' ? 'https://lab.eventi-app.com' : undefined,
    ),
  };
  const servicio = new PagosService(
    mercadoPago as unknown as MercadoPagoService,
    repo as unknown as PagosRepository,
    usersService as unknown as UsersService,
    derechosService as unknown as DerechosService,
    emailService as unknown as EmailService,
    config as unknown as ConfigService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return {
    servicio,
    mercadoPago,
    repo,
    usersService,
    derechosService,
    emailService,
  };
};

describe('suscribir: la empresa pide su enlace', () => {
  it('crea la suscripción con la empresa adentro y guarda la pendiente', async () => {
    const { servicio, mercadoPago, repo } = armar();
    const r = await servicio.suscribir('gestiona', 42, 'duena@sur.cl');
    expect(r.enlace).toBe('https://mp.example/susc-1');
    expect(mercadoPago.crearSuscripcion).toHaveBeenCalledWith(
      'gestiona',
      42,
      'duena@sur.cl',
      'https://lab.eventi-app.com/plans/confirmation',
    );
    // La pendiente queda anotada; el PLAN todavía no se toca — eso lo
    // hace el aviso con la verdad del proveedor.
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(42, {
      pago_proveedor: 'mercadopago',
      pago_suscripcion_id: 'susc-1',
    });
  });

  it('sin el token configurado responde 503, no un error mudo', async () => {
    const { servicio } = armar({ configurado: false });
    await expect(
      servicio.suscribir('cotiza', 42, 'duena@sur.cl'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('una cortesía no contrata: gratis no entra a la máquina', async () => {
    const { servicio, mercadoPago } = armar({
      empresa: {
        id: 1,
        name: 'Valle del Sol',
        plan: 'crece',
        estado_plan: 'gratis',
        pagado_hasta: null,
      },
    });
    await expect(
      servicio.suscribir('crece', 1, 'felipe@valledelsol.cl'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mercadoPago.crearSuscripcion).not.toHaveBeenCalled();
  });
});

describe('procesarAviso: la suscripción', () => {
  it('autorizada → activa con su plan, su fecha, y rige al instante', async () => {
    const { servicio, repo, derechosService } = armar();
    const accion = await servicio.procesarAviso(
      'subscription_preapproval',
      'susc-1',
      { algo: true },
    );
    expect(accion).toBe('activada en gestiona');
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        plan: 'gestiona',
        estado_plan: 'activo',
        pago_suscripcion_id: 'susc-1',
        pagado_hasta: '2026-10-16T12:00:00.000Z',
        gracia_hasta: null,
      }),
    );
    expect(derechosService.olvidar).toHaveBeenCalledWith(42);
    expect(repo.anotarAviso).toHaveBeenCalledWith(
      expect.objectContaining({
        aviso_id: 'subscription_preapproval:susc-1',
        company_id: 42,
      }),
    );
  });

  it('repetido → una sola vez: ni consulta ni toca nada', async () => {
    const { servicio, mercadoPago, repo } = armar({ yaProcesado: true });
    const accion = await servicio.procesarAviso(
      'subscription_preapproval',
      'susc-1',
      {},
    );
    expect(accion).toContain('repetido');
    expect(mercadoPago.consultarSuscripcion).not.toHaveBeenCalled();
    expect(repo.actualizarEmpresa).not.toHaveBeenCalled();
  });

  it('cancelada → conserva el plan y solo apaga la suscripción (decisión 5)', async () => {
    const { servicio, repo } = armar({
      suscripcion: {
        id: 'susc-1',
        status: 'cancelled',
        external_reference: '42',
      },
    });
    const accion = await servicio.procesarAviso(
      'subscription_preapproval',
      'susc-1',
      {},
    );
    expect(accion).toContain('cancelada');
    expect(repo.actualizarEmpresa).toHaveBeenCalledTimes(1);
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(42, {
      pago_suscripcion_id: null,
    });
  });

  it('GRATIS NO SE TOCA NUNCA: el aviso a una cortesía se ignora entero', async () => {
    const { servicio, repo, derechosService, emailService } = armar({
      empresa: {
        id: 1,
        name: 'Valle del Sol',
        plan: 'crece',
        estado_plan: 'gratis',
        pagado_hasta: null,
      },
      suscripcion: {
        id: 'susc-x',
        status: 'authorized',
        preapproval_plan_id: 'plan-gestiona',
        external_reference: '1',
      },
    });
    const accion = await servicio.procesarAviso(
      'subscription_preapproval',
      'susc-x',
      {},
    );
    expect(accion).toContain('cortesía');
    expect(repo.actualizarEmpresa).not.toHaveBeenCalled();
    expect(derechosService.olvidar).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});

describe('procesarAviso: el pago mensual', () => {
  it('aprobado → al día, con el "pagado hasta" que dice la suscripción', async () => {
    const { servicio, repo } = armar();
    const accion = await servicio.procesarAviso('payment', '777', {});
    expect(accion).toContain('al día');
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(42, {
      estado_plan: 'activo',
      pagado_hasta: '2026-10-16T12:00:00.000Z',
      gracia_hasta: null,
    });
  });

  it('rechazado → morosa con 7 días de gracia y correo al administrador (y solo a él)', async () => {
    const { servicio, repo, emailService } = armar({
      pago: { id: 777, status: 'rejected', external_reference: '42' },
    });
    const antes = Date.now();
    const accion = await servicio.procesarAviso('payment', '777', {});
    expect(accion).toContain('morosa');
    const campos = repo.actualizarEmpresa.mock.calls[0][1] as {
      estado_plan: string;
      gracia_hasta: string;
    };
    expect(campos.estado_plan).toBe('moroso');
    const dias =
      (new Date(campos.gracia_hasta).getTime() - antes) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'duena@sur.cl',
      EmailStructure.PAGO_FALLIDO,
      expect.objectContaining({ companyName: 'Eventos del Sur' }),
    );
  });

  it('un aviso que no es un pago consultable se ignora sin drama', async () => {
    const { servicio, repo } = armar({ pago: null });
    const accion = await servicio.procesarAviso(
      'subscription_authorized_payment',
      'factura-9',
      {},
    );
    expect(accion).toContain('ignorado');
    expect(repo.actualizarEmpresa).not.toHaveBeenCalled();
  });
});
