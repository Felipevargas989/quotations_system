import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
})
export class PlansModule {}
