// Fase 2 (Bloque B): utilidades compartidas para las pruebas unitarias.
//
// Los archivos de prueba de esqueleto ("should be defined") quedaron
// obsoletos cuando los servicios ganaron dependencias (Repository,
// PinoLogger, ConfigService). Este helper entrega los mocks mínimos
// para armar el módulo de prueba sin instanciar nada real.

import { InjectionToken, Provider } from '@nestjs/common';

// PinoLogger de mentira: mismos métodos que usan los servicios.
export const mockPinoLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
});

// Un provider vacío para dependencias que la prueba no ejercita.
// Si una prueba llama de verdad a un método, debe mockearlo explícito.
export const provideMock = (
  token: InjectionToken,
  value: Record<string, unknown> = {},
): Provider => ({
  provide: token,
  useValue: value,
});
