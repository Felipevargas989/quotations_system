import { Controller, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly logger: PinoLogger,
  ) {}

  @Post('confirmation')
  confirmPlan(@CurrentUser() user: User) {
    this.logger.info(`POST /plans/confirmation with user ${user.id}`);
    return this.plansService.confirmPlan(user.company_id);
  }
}
