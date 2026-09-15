import { Global, Module } from '@nestjs/common';
import { DerechosService } from './derechos.service';

// Global como el de Supabase: los derechos se preguntan desde las puertas
// públicas y desde los relojes, que viven en módulos muy distintos, y no
// vale la pena importar este módulo en cada uno (14-09-2026).
@Global()
@Module({
  providers: [DerechosService],
  exports: [DerechosService],
})
export class DerechosModule {}
