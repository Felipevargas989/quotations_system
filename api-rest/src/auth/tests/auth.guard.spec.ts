import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { Reflector } from '@nestjs/core';
import { UsersRepository } from 'src/users/users.repository';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { AuthGuard } from '../auth.guard';

// Esqueleto reparado (Fase 2 Bloque B): arma el módulo con las
// dependencias REALES de la clase, todas mockeadas. Verifica que la
// clase se pueda construir; las pruebas de comportamiento se agregan
// cuando se toque este módulo.
describe('AuthGuard', () => {
  let service: AuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        provideMock(AuthService),
        provideMock(UsersRepository),
        provideMock(Reflector),
      ],
    }).compile();

    service = module.get<AuthGuard>(AuthGuard);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
