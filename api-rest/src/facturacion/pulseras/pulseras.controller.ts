import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { EntregarPulserasDto } from './pulseras.dto';
import { PulserasService } from './pulseras.service';

// LAS PULSERAS (doc 19 §9.49). Un solo interruptor para ver y entregar: el
// de la pestaña, `facturacion_vendido` («Pulseras», antes «Lo vendido»), de
// fábrica operaciones y el administrador.
@Derecho('facturacion')
@Controller('facturacion/pulseras')
export class PulserasController {
  constructor(private readonly pulseras: PulserasService) {}

  @Permiso('facturacion_vendido')
  @Get()
  @Roles(...OPERATIONS_AND_UP)
  resumen(@CurrentUser() user: User) {
    return this.pulseras.resumen(user);
  }

  @Permiso('facturacion_vendido')
  @Post('entregas')
  @Roles(...OPERATIONS_AND_UP)
  entregar(@Body() dto: EntregarPulserasDto, @CurrentUser() user: User) {
    return this.pulseras.entregar(user, dto);
  }
}
