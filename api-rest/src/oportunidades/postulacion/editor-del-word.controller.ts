import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { EditorDelWordService } from './editor-del-word.service';
import { GuardarElWordDto } from './postulacion.dto';

// EL WORD SE EDITA EN EVENTIA (decisión 78 del doc 17). Mismo candado que
// el resto de Oportunidades: administrador y el derecho `oportunidades`.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class EditorDelWordController {
  constructor(
    private readonly editor: EditorDelWordService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EditorDelWordController.name);
  }

  /** El texto de un Word de «Mi postulación», párrafo por párrafo, para
   *  editarlo. */
  @Get(':id/adjuntos/:adjuntoId/editor')
  abrir(
    @Param('id', ParseIntPipe) id: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @CurrentUser() user: User,
  ) {
    return this.editor.abrir(user.company_id, id, adjuntoId);
  }

  /** Guarda lo editado en el mismo Word: solo los párrafos que cambiaron. */
  @Put(':id/adjuntos/:adjuntoId/editor')
  guardar(
    @Param('id', ParseIntPipe) id: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @Body() dto: GuardarElWordDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PUT /oportunidades/${id}/adjuntos/${adjuntoId}/editor (empresa ${user.company_id}, ${dto.parrafos.length} párrafos)`,
    );
    return this.editor.guardar(user.company_id, id, adjuntoId, dto);
  }
}
