import { Module } from '@nestjs/common';
import { EmailModule } from 'src/email/email.module';
import { PlanCronService } from './plan-cron.service';
import { PlansController } from './plans.controller';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';

@Module({
  imports: [EmailModule],
  controllers: [PlansController],
  providers: [PlansService, PlansRepository, PlanCronService],
})
export class PlansModule {}
