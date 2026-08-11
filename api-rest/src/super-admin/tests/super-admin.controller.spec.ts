import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { SuperAdminController } from '../super-admin.controller';
import { SuperAdminService } from '../super-admin.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('SuperAdminController', () => {
  let controller: SuperAdminController;
  let servicio: { assertSuperAdmin: jest.Mock; getTorre: jest.Mock };

  beforeEach(async () => {
    servicio = {
      assertSuperAdmin: jest.fn(),
      getTorre: jest.fn().mockResolvedValue({ usuarios: [], tarjetas: {} }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        provideMock(SuperAdminService, servicio),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<SuperAdminController>(SuperAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Torre de Control (tanda 1, 05-08): mismo escudo del área.
  it('GET torre pasa por assertSuperAdmin y delega en getTorre', async () => {
    const usuario = { email: 'torre@eventia.cl' } as Parameters<
      SuperAdminController['getTorre']
    >[0];

    await controller.getTorre(usuario);

    expect(servicio.assertSuperAdmin).toHaveBeenCalledWith('torre@eventia.cl');
    expect(servicio.getTorre).toHaveBeenCalled();
  });
});
