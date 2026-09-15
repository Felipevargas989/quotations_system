import { Module } from '@nestjs/common';
import { PlanCronService } from './plan-cron.service';
import { PlansController } from './plans.controller';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlansRepository, PlanCronService],
})
export class PlansModule {}
