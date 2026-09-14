import { HttpException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { PlansController } from '../plans.controller';

/**
 * LA PUERTA QUE MARCABA PREMIUM SIN PAGO ESTÁ APAGADA (14-09-2026, paso 2
 * del roadmap de venta). Cualquier sesión que la abriera dejaba su
 * empresa en is_premium = true. Responde 410 hasta que llegue el cobro
 * automático del paso 5.
 */
describe('POST /plans/confirmation', () => {
  it('responde 410 y no toca la empresa', async () => {
    const service = { confirmPlan: jest.fn() };
    const controller = new PlansController(
      service as never,
      mockPinoLogger() as never,
    );
    const e = await Promise.resolve()
      .then(() => controller.confirmPlan({ id: 'u', company_id: 1 } as never))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(410);
    expect(service.confirmPlan).not.toHaveBeenCalled();
  });
});
