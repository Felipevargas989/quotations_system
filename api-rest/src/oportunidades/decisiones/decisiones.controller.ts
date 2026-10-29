import {
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { DecisionesRepository } from './decisiones.repository';
import { MotivoDelDescarteDto } from './dto/motivo-del-descarte.dto';

// El porqué de un descarte (decisión 113 del doc 17). Mismo candado que el
// resto de Oportunidades. Descartar sigue siendo `PATCH :id` con el estado;
// esto se llama después, si la persona elige un motivo.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class DecisionesController {
  constructor(private readonly decisiones: DecisionesRepository) {}

  @Patch(':id/motivo')
  async motivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDelDescarteDto,
    @CurrentUser() user: User,
  ) {
    const guardado = await this.decisiones.ponerMotivo(
      user.company_id,
      id,
      dto.motivo,
    );
    if (!guardado) {
      throw new NotFoundException('No encontramos ese descarte.');
    }
    return guardado;
  }
}
