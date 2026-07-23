import { Module } from '@nestjs/common';
import { BackupCronService } from './backup-cron.service';

// Respaldo automático diario de la base (ver backup-cron.service.ts).
@Module({
  providers: [BackupCronService],
})
export class BackupModule {}
