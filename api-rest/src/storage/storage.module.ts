import { Module } from '@nestjs/common';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [SupabaseModule],
  controllers: [StorageController],
  providers: [StorageService],
  // El portal del mandante (Fase 2b) sube comprobantes por su propia
  // puerta pública validada por token — necesita el servicio.
  exports: [StorageService],
})
export class StorageModule {}
