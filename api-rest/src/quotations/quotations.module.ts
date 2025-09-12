import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { UsersRepository } from 'src/users/users.repository';
import { SupabaseModule } from 'src/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationsRepository, UsersRepository],
})
export class QuotationsModule {}
