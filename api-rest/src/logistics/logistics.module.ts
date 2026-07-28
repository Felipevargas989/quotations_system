import { Module } from '@nestjs/common';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { LogisticsController } from './logistics.controller';
import { LogisticsRepository } from './logistics.repository';
import { LogisticsService } from './logistics.service';

// Mudanza #2 de "una sola puerta" (28-07): casa nueva del módulo
// Logística en el backend. Hoy: proveedores. Próximas sesiones:
// insumos, compras, recursos, mobiliario y recetas.
@Module({
  imports: [SupabaseModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsRepository],
  exports: [LogisticsService],
})
export class LogisticsModule {}
