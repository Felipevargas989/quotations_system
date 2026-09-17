import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { EmailService } from 'src/email/email.service';
import { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { MercadoPagoService } from '../mercadopago.service';
import { PagosRepository } from '../pagos.repository';
import { PagosService } from '../pagos.service';

/**
 * EL CAMBIO DE PLAN (18-09-2026). Decisión de Felipe del 17-09,
 * validada como el estándar de la industria:
 *  - SUBIR rige al instante y cobra hoy el proporcional de la
 *    diferencia por los días que quedan del mes pagado (mes de 30);
 *  - BAJAR rige cuando termina el mes ya pagado: nada se reembolsa,
 *    nada se borra, y el próximo cobro ya sale con el precio menor.
 */

const PRECIOS: Record<string, number> = {
  cotiza: 25000,
  gestiona: 60000,
  crece: 140000,
};

const HOY = new Date('2026-09-18T12:00:00.000Z');
const en = (dias: number) =>
  new Date(HOY.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();

const armar = (empresa?: Partial<Record<string, unknown>>) => {
  const base = {
    id: 42,
    name: 'Eventos del Sur',
    plan: 'cotiza',
    estado_plan: 'activo',
    pagado_hasta: en(20),
    pago_proveedor: 'mercadopago',
    pago_suscripcion_id: 'susc-1',
    plan_programado: null,
  };
  const fila = { ...base, ...(empresa ?? {}) };
  const mercadoPago = {
    configurado: jest.fn(() => true),
    precioDelPlan: jest.fn((plan: string) => Promise.resolve(PRECIOS[plan])),
    crearPagoUnico: jest.fn().mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.example/pago',
    }),
    actualizarMontoSuscripcion: jest.fn().mockResolvedValue(undefined),
    consultarPago: jest.fn(),
    consultarSuscripcion: jest.fn(),
    planDe: jest.fn(() => null),
  };
  const repo = {
    empresa: jest.fn().mockResolvedValue(fila),
    actualizarEmpresa: jest.fn().mockResolvedValue(undefined),
    avisoYaProcesado: jest.fn().mockResolvedValue(false),
    anotarAviso: jest.fn().mockResolvedValue(undefined),
  };
  const servicio = new PagosService(
    mercadoPago as unknown as MercadoPagoService,
    repo as unknown as PagosRepository,
    { findAll: jest.fn().mockResolvedValue([]) } as unknown as UsersService,
    { olvidar: jest.fn() } as unknown as DerechosService,
    { sendEmail: jest.fn() } as unknown as EmailService,
    {
      get: jest.fn((k: string) =>
        k === 'FRONTEND_URL' ? 'https://lab.eventi-app.com' : undefined,
      ),
    } as unknown as ConfigService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, mercadoPago, repo };
};

describe('cotizar el cambio de plan', () => {
  it('subir: el proporcional de la diferencia por los días que quedan', async () => {
    const { servicio } = armar();
    const c = await servicio.cotizarCambio(42, 'gestiona', HOY);
    expect(c.modo).toBe('subir');
    expect(c.dias_restantes).toBe(20);
    // (60.000 − 25.000) × 20 / 30 = 23.333
    expect(c.proporcional).toBe(23333);
    expect(c.rige_desde).toBe(HOY.toISOString());
  });

  it('bajar: no cuesta nada hoy y rige cuando termine lo pagado', async () => {
    const { servicio } = armar({ plan: 'crece' });
    const c = await servicio.cotizarCambio(42, 'cotiza', HOY);
    expect(c.modo).toBe('bajar');
    expect(c.proporcional).toBe(0);
    expect(c.rige_desde).toBe(en(20));
  });

  it('el mismo plan es "igual", y cambiar a él se rechaza', async () => {
    const { servicio } = armar();
    const c = await servicio.cotizarCambio(42, 'cotiza', HOY);
    expect(c.modo).toBe('igual');
    await expect(
      servicio.cambiarPlan(42, 'cotiza', 'duena@sur.cl'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('en prueba, cortesía o activada a mano no se cambia de plan por acá', async () => {
    for (const empresa of [
      { estado_plan: 'prueba' },
      { estado_plan: 'gratis' },
      { pago_proveedor: null, pago_suscripcion_id: null },
    ]) {
      const { servicio } = armar(empresa);
      await expect(
        servicio.cotizarCambio(42, 'gestiona', HOY),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('cambiar de plan', () => {
  it('subir: crea el pago único del proporcional con la referencia cambio:empresa:plan', async () => {
    const { servicio, mercadoPago, repo } = armar();
    const r = await servicio.cambiarPlan(42, 'gestiona', 'duena@sur.cl');
    expect(r.modo).toBe('subir');
    expect(r).toMatchObject({ enlace: 'https://mp.example/pago' });
    expect(mercadoPago.crearPagoUnico).toHaveBeenCalledWith(
      expect.objectContaining({
        referencia: 'cambio:42:gestiona',
        correoDelPagador: 'duena@sur.cl',
        backUrl: 'https://lab.eventi-app.com/plans/confirmation?plan=gestiona',
      }),
    );
    // Hasta que llegue el aviso del pago, el plan NO cambia.
    expect(repo.actualizarEmpresa).not.toHaveBeenCalled();
  });

  it('bajar: agenda el plan menor y la suscripción ya cobra el precio menor', async () => {
    const { servicio, mercadoPago, repo } = armar({ plan: 'crece' });
    const r = await servicio.cambiarPlan(42, 'gestiona', 'duena@sur.cl');
    expect(r.modo).toBe('bajar');
    expect(mercadoPago.actualizarMontoSuscripcion).toHaveBeenCalledWith(
      'susc-1',
      60000,
    );
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(42, {
      plan_programado: 'gestiona',
    });
  });

  it('subir sin días que cobrar rige al tiro, sin pago', async () => {
    const { servicio, mercadoPago, repo } = armar({ pagado_hasta: en(-1) });
    const r = await servicio.cambiarPlan(42, 'crece', 'duena@sur.cl');
    expect(r).toMatchObject({ modo: 'subir', enlace: null, proporcional: 0 });
    expect(mercadoPago.crearPagoUnico).not.toHaveBeenCalled();
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ plan: 'crece', plan_programado: null }),
    );
    expect(mercadoPago.actualizarMontoSuscripcion).toHaveBeenCalledWith(
      'susc-1',
      140000,
    );
  });
});

describe('los avisos del cambio de plan', () => {
  it('el pago del proporcional aprobado aplica la subida al instante', async () => {
    const { servicio, mercadoPago, repo } = armar();
    mercadoPago.consultarPago.mockResolvedValue({
      id: 555,
      status: 'approved',
      external_reference: 'cambio:42:gestiona',
    });
    const accion = await servicio.procesarAviso('payment', '555', {});
    expect(accion).toBe('subida a gestiona aplicada');
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ plan: 'gestiona' }),
    );
    expect(mercadoPago.actualizarMontoSuscripcion).toHaveBeenCalledWith(
      'susc-1',
      60000,
    );
  });

  it('el pago del proporcional rechazado no cambia nada', async () => {
    const { servicio, mercadoPago, repo } = armar();
    mercadoPago.consultarPago.mockResolvedValue({
      id: 556,
      status: 'rejected',
      external_reference: 'cambio:42:gestiona',
    });
    const accion = await servicio.procesarAviso('payment', '556', {});
    expect(accion).toContain('sin cambios');
    expect(repo.actualizarEmpresa).not.toHaveBeenCalled();
  });

  it('el cobro mensual siguiente hace efectiva la bajada agendada', async () => {
    const { servicio, mercadoPago, repo } = armar({
      plan: 'crece',
      plan_programado: 'cotiza',
    });
    mercadoPago.consultarPago.mockResolvedValue({
      id: 777,
      status: 'approved',
      external_reference: '42:crece',
      metadata: { preapproval_id: 'susc-1' },
    });
    mercadoPago.consultarSuscripcion.mockResolvedValue({
      id: 'susc-1',
      status: 'authorized',
      next_payment_date: en(50),
    });
    const accion = await servicio.procesarAviso('payment', '777', {});
    expect(accion).toBe('pago aprobado: bajó a cotiza');
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        plan: 'cotiza',
        plan_programado: null,
        estado_plan: 'activo',
        pagado_hasta: en(50),
      }),
    );
  });
});
