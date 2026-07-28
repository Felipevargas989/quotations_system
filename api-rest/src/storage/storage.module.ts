import { Module } from '@nestjs/common';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [SupabaseModule],
  controllers: [StorageController],
  providers: [StorageService],
})
export class StorageModule {}
