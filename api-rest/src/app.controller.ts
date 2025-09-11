import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard, CurrentUser } from './auth';
import type { User } from './auth/interfaces/auth.interfaces';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): Promise<string> {
    return this.appService.getHello();
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  getProfile(@CurrentUser() user: User): User {
    return user;
  }
}
