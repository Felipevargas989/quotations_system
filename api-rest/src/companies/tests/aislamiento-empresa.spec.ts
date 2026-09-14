import { NotFoundException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { CompaniesController } from '../companies.controller';

/**
 * LA FICHA DE EMPRESA SOLO DE LA PROPIA (14-09-2026, paso 2 del roadmap de
 * venta). Los id de empresa son correlativos y la ficha trae los datos de
 * cobro: con cualquier login se leía la de otra empresa probando 1, 2, 3.
 */
const armar = () => {
  const service = {
    findOne: jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
  };
  const controller = new CompaniesController(
    service as never,
    mockPinoLogger() as never,
  );
  return { controller, service };
};

describe('GET /companies/:id', () => {
  it('entrega la ficha de la propia empresa', async () => {
    const { controller, service } = armar();
    await controller.findOne('1', { id: 'u', company_id: 1 } as never);
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

  it('la ficha de otra empresa es 404 y no se consulta', () => {
    const { controller, service } = armar();
    // El controller lanza antes de devolver una promesa.
    expect(() =>
      controller.findOne('52', { id: 'u', company_id: 1 } as never),
    ).toThrow(NotFoundException);
    expect(service.findOne).not.toHaveBeenCalled();
  });
});
