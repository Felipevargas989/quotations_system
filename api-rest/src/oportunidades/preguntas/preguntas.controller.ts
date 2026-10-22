import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { PreguntarDto } from '../dto/preguntar.dto';
import { PreguntasService } from './preguntas.service';

// Pregúntale a la IA sobre estas bases (decisión 67 del doc 17). Mismo
// candado que el resto de Oportunidades.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class PreguntasController {
  constructor(
    private readonly preguntas: PreguntasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PreguntasController.name);
  }

  /** El hilo de preguntas y respuestas de la oportunidad, de la más vieja
   *  a la más nueva. */
  @Get(':id/preguntas')
  listar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.preguntas.listar(user.company_id, id);
  }

  /** Una pregunta nueva: responde al tiro con la fila "procesando"; la
   *  pantalla pregunta hasta que llegue la respuesta. */
  @Post(':id/preguntas')
  preguntar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PreguntarDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/preguntas (empresa ${user.company_id})`,
    );
    return this.preguntas.preguntar(user.company_id, user.id, id, dto.pregunta);
  }
}
