import { Module } from '@nestjs/common';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { MovilController } from './movil.controller';
import { MovilService } from './movil.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MovilController],
  providers: [MovilService],
})
export class MovilModule {}
