import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from '../../testing/mocks';
import { MercadoPagoService } from '../mercadopago.service';

/**
 * LA SUSCRIPCIÓN "CON PAGO PENDIENTE" (17-09-2026).
 *
 * Medido, no supuesto: crear la suscripción colgando del plan
 * (preapproval_plan_id) exige la tarjeta al tiro — Mercado Pago
 * respondió "card_token_id is required" en la primera prueba real del
 * laboratorio. El modelo documentado para que el cliente ponga su
 * tarjeta DESPUÉS va sin plan en la llamada, con el monto copiado del
 * plan real (única fuente de la verdad) y el plan de la casa viajando
 * dentro del external_reference.
 */

const armar = () => {
  const config = {
    get: jest.fn((clave: string) =>
      clave === 'MP_ACCESS_TOKEN' ? 'token-de-prueba' : undefined,
    ),
  };
  const servicio = new MercadoPagoService(
    config as unknown as ConfigService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return servicio;
};

const respuestas = (plan: unknown, creada: unknown) => {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const falso = jest.fn((url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const cuerpo = url.includes('/preapproval_plan/') ? plan : creada;
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
    });
  });
  global.fetch = falso as unknown as typeof fetch;
  return llamadas;
};

describe('crear la suscripción de una empresa', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('copia el monto del plan real, amarra empresa:plan y va SIN plan en la llamada', async () => {
    const llamadas = respuestas(
      {
        reason: 'Plan Cotiza',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 25000,
          currency_id: 'CLP',
        },
      },
      { id: 'susc-9', init_point: 'https://mp.example/checkout?x=1' },
    );
    const servicio = armar();
    const r = await servicio.crearSuscripcion(
      'cotiza',
      55,
      'duena@sur.cl',
      'https://www.eventi-app.com/plans/confirmation',
    );
    expect(r).toEqual({
      id: 'susc-9',
      init_point: 'https://mp.example/checkout?x=1',
    });
    const alta = llamadas.find((l) => l.url.endsWith('/preapproval'));
    const cuerpo = JSON.parse(alta?.init?.body as string) as Record<
      string,
      unknown
    >;
    expect(cuerpo.preapproval_plan_id).toBeUndefined();
    expect(cuerpo.external_reference).toBe('55:cotiza');
    expect(cuerpo.status).toBe('pending');
    expect(cuerpo.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 25000,
      currency_id: 'CLP',
    });
  });

  it('le quita al enlace el activation=true roto (issue 480 del proveedor)', async () => {
    respuestas(
      {
        auto_recurring: { transaction_amount: 60000 },
      },
      {
        id: 'susc-9',
        init_point:
          'https://mp.example/checkout/congrats?preapproval_id=susc-9&activation=true',
      },
    );
    const servicio = armar();
    const r = await servicio.crearSuscripcion(
      'gestiona',
      55,
      'duena@sur.cl',
      'https://volver',
    );
    expect(r.init_point).toBe(
      'https://mp.example/checkout/congrats?preapproval_id=susc-9',
    );
  });

  it('si el plan real no tiene monto, grita en vez de cobrar cualquier cosa', async () => {
    respuestas({ auto_recurring: {} }, { id: 'x', init_point: 'y' });
    const servicio = armar();
    await expect(
      servicio.crearSuscripcion('crece', 55, 'a@b.cl', 'https://volver'),
    ).rejects.toThrow('no tiene monto');
  });
});
