import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import {
  RECEPTION_AND_UP,
  Roles,
  SALES_AND_UP,
} from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { ClientsService } from './clients.service';
import { CreateClientTypeDto } from './dto/create-client-type.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { ReorderClientTypesDto } from './dto/reorder-client-types.dto';
import { RevisarClienteDto } from './dto/revisar-cliente.dto';
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

  @Roles(...RECEPTION_AND_UP)
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

  @Derecho('clientes_360')
  @Roles(...SALES_AND_UP)
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

  @Derecho('clientes_360')
  @Roles(...SALES_AND_UP)
  @Delete('types/:id')
  removeType(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /clients/types/${id}`);
    return this.clientsService.removeType(+id, user.company_id);
  }

  // Reordenar tipos (flechas ↑↓): recibe los ids en el orden final.
  // Declarado antes de PATCH :id para que "types" no sea capturado.
  @Derecho('clientes_360')
  @Roles(...SALES_AND_UP)
  @Patch('types/reorder')
  reorderTypes(
    @Body() reorderDto: ReorderClientTypesDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /clients/types/reorder ${reorderDto.ids.join(',')}`,
    );
    return this.clientsService.reorderTypes(user.company_id, reorderDto.ids);
  }

  // El aviso mientras se escribe (16-10-2026, Felipe: "mejor cuando apenas
  // termine de escribir"): las mismas coincidencias que revisa el portero
  // de POST /clients, sin crear nada. POST para que el correo y el teléfono
  // no viajen en la dirección (quedarían en los registros).
  @Roles(...RECEPTION_AND_UP)
  @Post('coincidencias')
  @HttpCode(200)
  revisar(@Body() dto: RevisarClienteDto, @CurrentUser() user: User) {
    this.logger.info(`POST /clients/coincidencias with user ${user.id}`);
    return this.clientsService.coincidencias(dto, user.company_id);
  }

  // Con portero (16-10-2026): si el cliente se parece a uno que ya
  // existe, responde 409 CLIENTE_PARECIDO y la pantalla pregunta.
  @Roles(...RECEPTION_AND_UP)
  @Post()
  create(@Body() createClientDto: CreateClientDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /clients with createClientDto ${logSafe(createClientDto)}`,
    );
    return this.clientsService.crearDesdePantalla(
      createClientDto,
      user.company_id,
    );
  }

  @Roles(...RECEPTION_AND_UP)
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
  @Roles(...RECEPTION_AND_UP)
  @Get(':id/summary')
  findSummary(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`GET /clients/${id}/summary`);
    return this.clientsService.findSummary(id, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /clients/${id} with updateClientDto ${logSafe(updateClientDto)}`,
    );
    return this.clientsService.update(id, updateClientDto, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /clients/${id}`);
    return this.clientsService.remove(id, user.company_id);
  }
}
