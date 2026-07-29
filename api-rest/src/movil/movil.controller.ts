import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { MovilService } from './movil.service';

class RegistrarDispositivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  auth: string;
}

// Puertas de Eventia Móvil (aditivas). Todas exigen sesión.
@Controller('movil')
export class MovilController {
  constructor(
    private readonly movilService: MovilService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MovilController.name);
  }

  @Get('push/clave-publica')
  clavePublica() {
    return this.movilService.clavePublica();
  }

  @Post('push/dispositivos')
  registrar(@Body() dto: RegistrarDispositivoDto, @CurrentUser() user: User) {
    this.logger.info(`POST /movil/push/dispositivos user ${user.id}`);
    return this.movilService.registrarDispositivo(
      user.id,
      user.company_id,
      dto,
    );
  }

  @Post('push/probar')
  probar(@CurrentUser() user: User) {
    this.logger.info(`POST /movil/push/probar user ${user.id}`);
    return this.movilService.probar(user.id);
  }
}
