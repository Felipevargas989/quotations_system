import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { gzipSync } from 'zlib';
import { SupabaseService } from 'src/supabase/supabase.service';

/**
 * RESPALDO AUTOMÁTICO DIARIO (23-07-2026, pedido por Felipe).
 *
 * Antes los respaldos eran manuales (solo cuando había una sesión de
 * trabajo). Este cron vuelca TODAS las tablas públicas a un JSON.gz y lo
 * sube al bucket privado "backups" del propio proyecto Supabase:
 *   backups/eventia_YYYY-MM-DD.json.gz
 *
 * - Corre todos los días a las 07:00 UTC (03:00/04:00 en Chile).
 * - Además, al arrancar el servidor verifica si existe el respaldo de
 *   HOY y si falta lo genera — cada deploy garantiza un respaldo fresco
 *   y permite verificar el mecanismo sin esperar a la madrugada.
 * - Retención: 30 días (los más antiguos se eliminan solos).
 * - La lista de tablas sale de get_backup_tables() (pg_tables), así que
 *   las tablas nuevas entran solas al respaldo.
 *
 * Restaurar: descargar el .json.gz del bucket (Storage → backups) y
 * reinsertar las tablas necesarias; el formato es
 * { generated_at, tables: { <tabla>: [filas...] } }.
 */
@Injectable()
export class BackupCronService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BackupCronService.name);
  }

  private get enabled(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private todayName(): string {
    return `eventia_${new Date().toISOString().split('T')[0]}.json.gz`;
  }

  onModuleInit() {
    if (!this.enabled) return;
    // No bloquear el arranque: verificar/backupear a los 20 segundos.
    setTimeout(() => {
      void this.backupIfMissingToday();
    }, 20_000);
  }

  @Cron('0 7 * * *') // 07:00 UTC = madrugada en Chile
  async dailyBackup() {
    if (!this.enabled) return;
    await this.runBackup('cron diario');
  }

  private async backupIfMissingToday() {
    try {
      const { data } = await this.supabase.client.storage
        .from('backups')
        .list('', { limit: 100 });
      const exists = (data || []).some((f) => f.name === this.todayName());
      if (exists) {
        this.logger.info('Backup de hoy ya existe; no se repite.');
        return;
      }
      await this.runBackup('arranque sin respaldo de hoy');
    } catch (error) {
      this.logger.error(`Backup al arranque falló: ${error}`);
    }
  }

  private async runBackup(reason: string) {
    const started = Date.now();
    try {
      const { data: tables, error: tablesError } =
        await this.supabase.client.rpc('get_backup_tables');
      if (tablesError) throw tablesError;

      const dump: Record<string, unknown[]> = {};
      let totalRows = 0;
      for (const t of (tables || []) as { table_name: string }[]) {
        const name = t.table_name;
        const rows: unknown[] = [];
        // paginado: supabase-js entrega máximo 1000 filas por consulta
        for (let from = 0; ; from += 1000) {
          const { data: page, error } = await this.supabase.client
            .from(name)
            .select('*')
            .range(from, from + 999);
          if (error) {
            this.logger.error(`Backup: tabla ${name} falló: ${error.message}`);
            break;
          }
          rows.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
        dump[name] = rows;
        totalRows += rows.length;
      }

      const payload = gzipSync(
        Buffer.from(
          JSON.stringify({
            generated_at: new Date().toISOString(),
            reason,
            tables: dump,
          }),
        ),
      );

      const { error: uploadError } = await this.supabase.client.storage
        .from('backups')
        .upload(this.todayName(), payload, {
          contentType: 'application/gzip',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      this.logger.info(
        `BACKUP OK (${reason}): ${totalRows} filas, ${Math.round(payload.length / 1024)} KB en ${Date.now() - started} ms → ${this.todayName()}`,
      );

      await this.cleanupOld();
    } catch (error) {
      this.logger.error(`BACKUP FALLÓ (${reason}): ${error}`);
    }
  }

  // Retención: se conservan 30 días de respaldos.
  private async cleanupOld() {
    try {
      const { data } = await this.supabase.client.storage
        .from('backups')
        .list('', { limit: 200 });
      const cutoff = new Date(Date.now() - 30 * 86_400_000)
        .toISOString()
        .split('T')[0];
      const old = (data || [])
        .filter((f) => {
          const m = f.name.match(/^eventia_(\d{4}-\d{2}-\d{2})\.json\.gz$/);
          return m && m[1] < cutoff;
        })
        .map((f) => f.name);
      if (old.length > 0) {
        await this.supabase.client.storage.from('backups').remove(old);
        this.logger.info(`Backup: ${old.length} respaldos antiguos eliminados`);
      }
    } catch (error) {
      this.logger.error(`Backup: limpieza falló: ${error}`);
    }
  }
}
