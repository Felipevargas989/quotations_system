import { PinoLogger } from 'nestjs-pino';
import { SuperAdminService } from 'src/super-admin/super-admin.service';
import { mockPinoLogger } from '../../testing/mocks';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa porque la
// dependencia de SuperAdminService es circular (forwardRef) y el módulo
// de prueba de Nest no la resuelve con mocks simples.
describe('UsersService', () => {
  it('should be defined', () => {
    const service = new UsersService(
      {} as UsersRepository,
      mockPinoLogger() as unknown as PinoLogger,
      {} as SuperAdminService,
    );
    expect(service).toBeDefined();
  });
});
