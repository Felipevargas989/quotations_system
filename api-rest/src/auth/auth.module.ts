import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SesionOpcional } from './sesion-opcional.service';

@Module({
  imports: [],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SesionOpcional],
  exports: [AuthService, AuthGuard, SesionOpcional],
})
export class AuthModule {}
