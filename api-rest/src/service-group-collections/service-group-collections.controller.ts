import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CreateServiceGroupCollectionDto } from './dto/create-service-group-collection.dto';
import {
  ActualizarPaqueteDto,
  NombreDeGrupoDto,
  OrdenDeGruposDto,
} from './dto/grupos-de-paquetes.dto';
import { ServiceGroupCollection } from './entities/service-group-collection.entity';
import { ServiceGroupCollectionsService } from './service-group-collections.service';

@Controller('service-group-collections')
export class ServiceGroupCollectionsController {
  constructor(
    private readonly service: ServiceGroupCollectionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupCollectionsController.name);
  }

  @Roles(...SALES_AND_UP)
  @Post()
  create(
    @Body() createDto: CreateServiceGroupCollectionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `create service group collection with dto ${JSON.stringify(createDto)}`,
    );
    return this.service.create(createDto, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`findAll service group collections with user ${user.id}`);
    return this.service.findAll(user.company_id);
  }

  // ---------- GRUPOS DE PAQUETES (12-10-2026, migración 120) ----------
  // OJO con el orden: 'grupos/orden' va ANTES de 'grupos/:id'. Express
  // calza en el orden en que se declaran y "orden" no es un número.

  @Roles(...SALES_AND_UP)
  @Get('grupos')
  listarGrupos(@CurrentUser() user: User) {
    this.logger.info(`listarGrupos de paquetes with user ${user.id}`);
    return this.service.listarGrupos(user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Post('grupos')
  crearGrupo(@Body() dto: NombreDeGrupoDto, @CurrentUser() user: User) {
    this.logger.info(`crearGrupo de paquetes with user ${user.id}`);
    return this.service.crearGrupo(dto.name, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Patch('grupos/orden')
  ordenarGrupos(@Body() dto: OrdenDeGruposDto, @CurrentUser() user: User) {
    this.logger.info(`ordenarGrupos de paquetes with user ${user.id}`);
    return this.service.ordenarGrupos(dto.ids, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Patch('grupos/:id')
  renombrarGrupo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NombreDeGrupoDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`renombrarGrupo ${id} with user ${user.id}`);
    return this.service.renombrarGrupo(id, dto.name, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Delete('grupos/:id')
  borrarGrupo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`borrarGrupo ${id} with user ${user.id}`);
    return this.service.borrarGrupo(id, user.company_id);
  }

  /** Renombrar un paquete y/o cambiarlo de grupo (12-10-2026). */
  @Roles(...SALES_AND_UP)
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPaqueteDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`actualizar paquete ${id} with user ${user.id}`);
    return this.service.actualizar(id, dto, user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Delete(':id')
  remove(
    @Param('id') id: ServiceGroupCollection['id'],
    @CurrentUser() user: User,
  ) {
    this.logger.info(`remove service group collection with id ${id}`);
    return this.service.remove(+id, user.company_id);
  }
}
