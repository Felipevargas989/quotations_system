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
 * "CANCELAR MI PLAN" (18-09-2026, términos §9). Felipe aceptó la
 * recomendación: dar de baja por el mismo medio por el que se contrató
 * (ley 21.398). Lo que estas pruebas juran:
 *  - se cancela la suscripción en Mercado Pago y la empresa conserva su
 *    plan hasta lo ya pagado (nada se borra, nada se bloquea hoy);
 *  - la marca que queda es la MISMA que deja el aviso `cancelled` del
 *    proveedor, así el reloj de las 11:10 la pausa al vencer;
 *  - gratis no se toca NUNCA, y sin suscripción no hay nada que cancelar.
 */
const armar = (empresa?: Partial<Record<string, unknown>>) => {
  const fila = {
    id: 42,
    name: 'Eventos del Sur',
    plan: 'gestiona',
    estado_plan: 'activo',
    pagado_hasta: '2026-10-08T12:00:00.000Z',
    pago_proveedor: 'mercadopago',
    pago_suscripcion_id: 'susc-1',
    plan_programado: 'cotiza',
    ...(empresa ?? {}),
  };
  const mercadoPago = {
    configurado: jest.fn(() => true),
    cancelarSuscripcion: jest.fn().mockResolvedValue(undefined),
  };
  const repo = {
    empresa: jest.fn().mockResolvedValue(fila),
    actualizarEmpresa: jest
      .fn<Promise<void>, [number, Record<string, unknown>]>()
      .mockResolvedValue(undefined),
  };
  const servicio = new PagosService(
    mercadoPago as unknown as MercadoPagoService,
    repo as unknown as PagosRepository,
    { findAll: jest.fn().mockResolvedValue([]) } as unknown as UsersService,
    { olvidar: jest.fn() } as unknown as DerechosService,
    { sendEmail: jest.fn() } as unknown as EmailService,
    { get: jest.fn() } as unknown as ConfigService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, mercadoPago, repo };
};

describe('cancelar mi plan', () => {
  it('cancela en Mercado Pago y conserva el plan hasta lo pagado', async () => {
    const { servicio, mercadoPago, repo } = armar();

    const r = await servicio.cancelar(42);

    expect(mercadoPago.cancelarSuscripcion).toHaveBeenCalledWith('susc-1');
    // La misma marca que deja el aviso `cancelled`: suscripción en NULL
    // con el proveedor puesto. Ni el plan ni el estado se tocan hoy; la
    // bajada agendada se va con la suscripción.
    expect(repo.actualizarEmpresa).toHaveBeenCalledWith(42, {
      pago_suscripcion_id: null,
      plan_programado: null,
    });
    const cambios = repo.actualizarEmpresa.mock.calls[0][1];
    expect(cambios).not.toHaveProperty('estado_plan');
    expect(cambios).not.toHaveProperty('plan');
    expect(r).toEqual({ sigue_hasta: '2026-10-08T12:00:00.000Z' });
  });

  it('gratis no se toca nunca: ni siquiera para cancelar', async () => {
    const { servicio, mercadoPago, repo } = armar({ estado_plan: 'gratis' });

    await expect(servicio.cancelar(42)).rejects.toThrow(BadRequestException);
    expect(mercadoPago.cancelarSuscripcion).not.toHaveBeenCalled();
    expect(repo.actualizarEmpresa).not.toHaveBeenCalled();
  });

  it('sin suscripción viva (activada a mano) no hay nada que cancelar', async () => {
    const { servicio, mercadoPago } = armar({
      pago_proveedor: null,
      pago_suscripcion_id: null,
    });

    await expect(servicio.cancelar(42)).rejects.toThrow(
      'No tienes una suscripción activa que cancelar',
    );
    expect(mercadoPago.cancelarSuscripcion).not.toHaveBeenCalled();
  });

  it('una morosa también puede cancelar (el reloj la pausa al vencer su gracia)', async () => {
    const { servicio, mercadoPago } = armar({ estado_plan: 'moroso' });

    await servicio.cancelar(42);

    expect(mercadoPago.cancelarSuscripcion).toHaveBeenCalledWith('susc-1');
  });

  it('el estado dice si hay suscripción viva y si ya canceló', async () => {
    const viva = await armar().servicio.estado(42);
    expect(viva).toMatchObject({ suscripcion_viva: true, cancelada: false });

    const cancelada = await armar({
      pago_suscripcion_id: null,
    }).servicio.estado(42);
    expect(cancelada).toMatchObject({
      suscripcion_viva: false,
      cancelada: true,
    });

    // Activada a mano por Felipe: sin proveedor no es "cancelada".
    const aMano = await armar({
      pago_proveedor: null,
      pago_suscripcion_id: null,
    }).servicio.estado(42);
    expect(aMano).toMatchObject({ suscripcion_viva: false, cancelada: false });
  });
});
