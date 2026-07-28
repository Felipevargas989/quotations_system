import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from '../../testing/mocks';
import { AuthService } from '../auth.service';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa: el
// constructor LEE la configuración y crea el cliente de Supabase, así
// que el mock de ConfigService debe entregar valores con forma válida.
describe('AuthService', () => {
  it('should be defined', () => {
    const config = {
      get: jest.fn((clave: string) =>
        clave === 'SUPABASE_URL' ? 'https://prueba.supabase.co' : 'clave',
      ),
    } as unknown as ConfigService;

    const service = new AuthService(
      config,
      mockPinoLogger() as unknown as PinoLogger,
    );
    expect(service).toBeDefined();
  });

  it('sin configuración de Supabase, se niega a construirse', () => {
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    expect(
      () => new AuthService(config, mockPinoLogger() as unknown as PinoLogger),
    ).toThrow(/Missing Supabase configuration/);
  });
});
