import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import {
  RECEPTION_AND_UP,
  Roles,
  SALES_AND_UP,
} from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CrearRazonSocialDto, EditarRazonSocialDto } from './razon-social.dto';
import { RazonesSocialesService } from './razones-sociales.service';

// Las razones sociales de un cliente (migración 184, doc 19 §9.12). Las ve
// cualquier cargo, como la ficha; las escriben los mismos que editan la
// ficha (PATCH /clients/:id). La empresa sale SIEMPRE de la sesión.
@Controller('clients/:clientId/razones-sociales')
export class RazonesSocialesController {
  constructor(
    private readonly razonesSociales: RazonesSocialesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RazonesSocialesController.name);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get()
  deCliente(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: User,
  ) {
    return this.razonesSociales.deCliente(clientId, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Post()
  crear(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CrearRazonSocialDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /clients/${clientId}/razones-sociales`);
    return this.razonesSociales.crear(
      clientId,
      user.company_id,
      dto,
      user.id ?? null,
    );
  }

  @Roles(...SALES_AND_UP)
  @Patch(':id')
  editar(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarRazonSocialDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /clients/${clientId}/razones-sociales/${id}`);
    return this.razonesSociales.editar(clientId, user.company_id, id, dto);
  }

  @Roles(...SALES_AND_UP)
  @Delete(':id')
  borrar(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`DELETE /clients/${clientId}/razones-sociales/${id}`);
    return this.razonesSociales.borrar(clientId, user.company_id, id);
  }
}
