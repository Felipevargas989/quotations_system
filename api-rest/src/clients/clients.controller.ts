import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateClientTypeDto } from './dto/create-client-type.dto';
import { ReorderClientTypesDto } from './dto/reorder-client-types.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientsController.name);
  }

  // ---- Tipos de cliente ----
  // IMPORTANTE: estas rutas van ANTES de las rutas con :id para que
  // "types" no sea capturado como un id de cliente.

  @Get('types')
  findTypes(@CurrentUser() user: User) {
    this.logger.info(`GET /clients/types with user ${user.id}`);
    return this.clientsService.findTypes(user.company_id);
  }

  // Versión pública: los formularios sin login (cotización pública)
  // muestran los mismos tipos de la empresa.
  @Public()
  @Get('types/public/:company_id')
  findTypesPublic(@Param('company_id') companyId: string) {
    this.logger.info(`GET /clients/types/public/${companyId}`);
    return this.clientsService.findTypes(+companyId);
  }

  @Post('types')
  createType(
    @Body() createClientTypeDto: CreateClientTypeDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /clients/types with ${JSON.stringify(createClientTypeDto)}`,
    );
    return this.clientsService.createType(
      user.company_id,
      createClientTypeDto.name,
    );
  }

  @Delete('types/:id')
  removeType(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /clients/types/${id}`);
    return this.clientsService.removeType(+id, user.company_id);
  }

  // Reordenar tipos (flechas ↑↓): recibe los ids en el orden final.
  // Declarado antes de PATCH :id para que "types" no sea capturado.
  @Patch('types/reorder')
  reorderTypes(
    @Body() reorderDto: ReorderClientTypesDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /clients/types/reorder ${reorderDto.ids}`);
    return this.clientsService.reorderTypes(user.company_id, reorderDto.ids);
  }

  @Post()
  create(@Body() createClientDto: CreateClientDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /clients with createClientDto ${JSON.stringify(createClientDto)}`,
    );
    return this.clientsService.create(createClientDto, user.company_id);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /clients with user ${user.id}`);
    return this.clientsService.findAll(user.company_id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.clientsService.findOne(+id);
  // }

  // Ficha 360° del cliente: resumen comercial completo en una llamada.
  @Get(':id/summary')
  findSummary(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`GET /clients/${id}/summary`);
    return this.clientsService.findSummary(id, user.company_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /clients/${id} with updateClientDto ${JSON.stringify(updateClientDto)}`,
    );
    return this.clientsService.update(id, updateClientDto, user.company_id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /clients/${id}`);
    return this.clientsService.remove(id, user.company_id);
  }
}
