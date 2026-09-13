import { NotFoundException } from '@nestjs/common';
import { LogisticsService } from '../logistics.service';

/**
 * RECETAS Y COSTOS: LAS PIEZAS SON DE LA PROPIA EMPRESA (11-09-2026,
 * sprint 1). Antes se podía colgar una línea de receta propia de un
 * servicio ajeno, o usar un insumo, mobiliario o recurso de otra empresa,
 * porque todos esos id son correlativos.
 */
const armar = (propios: Record<string, number[]>) => {
  const repo = {
    idsDeLaEmpresa: jest
      .fn()
      .mockImplementation((tabla: string, ids: number[]) =>
        Promise.resolve(
          ids.filter((id) => (propios[tabla] ?? []).includes(id)),
        ),
      ),
    addRecipeItem: jest.fn().mockResolvedValue({ added: true }),
    addCostItem: jest.fn().mockResolvedValue({ added: true }),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
  const service = new LogisticsService(repo as never, logger as never);
  return { service, repo };
};

const receta = {
  service_type: 'variable',
  service_id: 5,
  item_kind: 'insumo',
  supply_id: 8,
  qty_per_person: 1,
  unit: 'un',
} as never;

describe('Logística: las piezas de la receta son de la empresa', () => {
  it('deja pasar una receta con servicio e insumo propios', async () => {
    const { service, repo } = armar({
      variable_services: [5],
      supplies: [8],
    });
    await service.addRecipeItem(1, receta);
    expect(repo.addRecipeItem).toHaveBeenCalled();
  });

  it('rechaza el insumo de otra empresa y no inserta', async () => {
    const { service, repo } = armar({ variable_services: [5], supplies: [] });
    await expect(service.addRecipeItem(1, receta)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.addRecipeItem).not.toHaveBeenCalled();
  });

  it('rechaza el servicio de otra empresa y no inserta', async () => {
    const { service, repo } = armar({ variable_services: [], supplies: [8] });
    await expect(service.addRecipeItem(1, receta)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.addRecipeItem).not.toHaveBeenCalled();
  });

  it('la línea de costo exige que el fijo y el recurso sean propios', async () => {
    const bueno = armar({ fixed_services: [2], management_resources: [4] });
    await bueno.service.addCostItem(1, {
      fixed_service_id: 2,
      resource_id: 4,
      quantity: 1,
    } as never);
    expect(bueno.repo.addCostItem).toHaveBeenCalled();

    const malo = armar({ fixed_services: [2], management_resources: [] });
    await expect(
      malo.service.addCostItem(1, {
        fixed_service_id: 2,
        resource_id: 99,
        quantity: 1,
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(malo.repo.addCostItem).not.toHaveBeenCalled();
  });
});
