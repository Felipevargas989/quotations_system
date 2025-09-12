import { Module } from '@nestjs/common';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { UsersRepository } from 'src/users/users.repository';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [SupabaseModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationsRepository, UsersRepository],
})
export class QuotationsModule {}
