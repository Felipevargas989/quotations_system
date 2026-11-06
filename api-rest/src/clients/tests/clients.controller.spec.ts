import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { ClientsController } from '../clients.controller';
import { ClientsService } from '../clients.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('ClientsController', () => {
  let controller: ClientsController;
  let servicio: { update: jest.Mock; remove: jest.Mock };
  // Un cliente de un tipo que su cargo no trabaja (doc 22 §9.8).
  const exigirElTipoDelCliente = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        // Lo que ve recepción (doc 21).
        {
          provide: AlcanceDeRecepcion,
          useValue: {
            veLaCotizacion: jest.fn().mockResolvedValue(true),
            veLosMontos: jest.fn().mockResolvedValue(true),
            exigirElTipoDelCliente,
          },
        },
        provideMock(ClientsService, {
          update: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue({}),
        }),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
    servicio = module.get(ClientsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('un cliente de un tipo que su cargo no trabaja no se edita ni se borra', async () => {
    const vendedor = { id: 'u1', company_id: 1, role: 'vendedor' } as never;
    exigirElTipoDelCliente.mockRejectedValueOnce(new Error('«Empresas»'));
    await expect(
      controller.update('c1', { name: 'Otro' } as never, vendedor),
    ).rejects.toThrow('«Empresas»');
    expect(servicio.update).not.toHaveBeenCalled();
    exigirElTipoDelCliente.mockRejectedValueOnce(new Error('«Empresas»'));
    await expect(controller.remove('c1', vendedor)).rejects.toThrow(
      '«Empresas»',
    );
    expect(servicio.remove).not.toHaveBeenCalled();
    // El de un tipo que trabaja, sí.
    await controller.update('c2', { name: 'Otro' } as never, vendedor);
    expect(exigirElTipoDelCliente).toHaveBeenLastCalledWith(vendedor, 'c2');
    expect(servicio.update).toHaveBeenCalled();
  });
});
