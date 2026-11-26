import { readdirSync, readFileSync } from 'fs';
import type { PinoLogger } from 'nestjs-pino';
import { join } from 'path';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { BackupCronService, FUERA_DEL_RESPALDO } from '../backup-cron.service';

// LICITA NO CORRE EL RESPALDO DE EVENTIA (25-11). El respaldo que se dispara
// a los 20 segundos de arrancar no es un @Cron: los relojes de la
// instalación no lo apagan. Una línea con esLicita() en onModuleInit.

const antes = {
  instalacion: process.env.INSTALACION,
  entorno: process.env.NODE_ENV,
};
afterEach(() => {
  jest.useRealTimers();
  if (antes.instalacion === undefined) delete process.env.INSTALACION;
  else process.env.INSTALACION = antes.instalacion;
  process.env.NODE_ENV = antes.entorno;
});

const programados = () => {
  jest.useFakeTimers();
  const servicio = new BackupCronService(
    { client: {} } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  servicio.onModuleInit();
  return jest.getTimerCount();
};

describe('el respaldo de los 20 segundos', () => {
  it('en Eventia (producción) se programa como siempre', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INSTALACION;
    expect(programados()).toBe(1);
  });

  it('en Licita no se programa', () => {
    process.env.NODE_ENV = 'production';
    process.env.INSTALACION = 'licita';
    expect(programados()).toBe(0);
  });
});

// Las tablas del mercado de todo Chile no entran al respaldo diario de
// Eventia (decisión 101), tampoco las dos del rubro de cada empresa
// (`mercado_productos_onu` y `mercado_marcas`, Licita 25-11): toda
// `mercado_*` que cree una migración, numerada o borrador, va en la lista.
describe('las tablas del mercado quedan fuera del respaldo', () => {
  it('toda mercado_* creada en docs/migrations está en FUERA_DEL_RESPALDO', () => {
    const carpeta = join(__dirname, '../../../../docs/migrations');
    const creadas = new Set<string>();
    for (const archivo of readdirSync(carpeta)) {
      if (!archivo.endsWith('.sql')) continue;
      const sql = readFileSync(join(carpeta, archivo), 'utf8');
      for (const m of sql.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(mercado_[a-z0-9_]+)/gi,
      ))
        creadas.add(m[1].toLowerCase());
    }
    expect(creadas.has('mercado_marcas')).toBe(true);
    expect(creadas.has('mercado_productos_onu')).toBe(true);
    expect([...creadas].filter((t) => !FUERA_DEL_RESPALDO.has(t))).toEqual([]);
  });
});
