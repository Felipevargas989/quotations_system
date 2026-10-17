import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { gunzipSync } from 'zlib';
import { BackupCronService, FUERA_DEL_RESPALDO } from '../backup-cron.service';

/**
 * El respaldo diario deja fuera las licitaciones públicas de Mercado
 * Público (doc 17, riesgo 9) y respalda todo lo demás, también lo de cada
 * empresa en Oportunidades.
 */
describe('BackupCronService — lo que queda fuera del respaldo', () => {
  it('mp_procesos no se lee ni se guarda; lo de cada empresa sí', async () => {
    const leidas: string[] = [];
    const subidas: Buffer[] = [];
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          { table_name: 'quotations' },
          { table_name: 'mp_procesos' },
          { table_name: 'oportunidades' },
        ],
        error: null,
      }),
      from: jest.fn((tabla: string) => {
        leidas.push(tabla);
        const cadena = {
          select: () => cadena,
          range: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
        };
        return cadena;
      }),
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn((_nombre: string, archivo: Buffer) => {
            subidas.push(archivo);
            return Promise.resolve({ error: null });
          }),
          list: jest.fn().mockResolvedValue({ data: [] }),
          remove: jest.fn().mockResolvedValue({ error: null }),
        })),
      },
    };
    const servicio = new BackupCronService(
      { client } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );

    await (
      servicio as unknown as { runBackup(motivo: string): Promise<void> }
    ).runBackup('prueba');

    expect(FUERA_DEL_RESPALDO.has('mp_procesos')).toBe(true);
    expect(leidas).toEqual(['quotations', 'oportunidades']);
    const respaldo = JSON.parse(gunzipSync(subidas[0]).toString()) as {
      tables: Record<string, unknown[]>;
    };
    expect(Object.keys(respaldo.tables)).toEqual([
      'quotations',
      'oportunidades',
    ]);
  });
});
