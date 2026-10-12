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
import { CreateServiceGroupDto } from './dto/create-service-group.dto';
import {
  AsignarGrupoDeMenuDto,
  CrearGrupoDeMenusDto,
  NombreDeGrupoDeMenusDto,
  OrdenDeGruposDeMenusDto,
} from './dto/grupos-de-menus.dto';
import { RenameServiceGroupDto } from './dto/rename-service-group.dto';
import { ServiceGroup } from './entities/service-group.entity';
import { ServiceGroupsService } from './service-groups.service';

@Controller('service-groups')
export class ServiceGroupsController {
  constructor(
    private readonly serviceGroupsService: ServiceGroupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupsController.name);
  }

  @Roles(...SALES_AND_UP)
  @Post()
  create(
    @Body() createServiceGroupDto: CreateServiceGroupDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `create service group with dto ${JSON.stringify(createServiceGroupDto)}`,
    );
    return this.serviceGroupsService.create(
      createServiceGroupDto,
      user.company_id,
    );
  }

  @Roles(...SALES_AND_UP)
  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`findAll service groups with user ${user.id}`);
    return this.serviceGroupsService.findAll(user.company_id);
  }

  // ---------- GRUPOS DE MENÚS GUARDADOS (12-10-2026, migración 121) ----------
  // OJO con el orden: 'grupos/orden' va ANTES de 'grupos/:id', y todas
  // las de 'grupos' antes de las de ':id'. Express calza en el orden en
  // que se declaran.

  @Roles(...SALES_AND_UP)
  @Get('grupos')
  listarGrupos(@CurrentUser() user: User) {
    this.logger.info(`listarGrupos de menús with user ${user.id}`);
    return this.serviceGroupsService.listarGrupos(user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Post('grupos')
  crearGrupo(@Body() dto: CrearGrupoDeMenusDto, @CurrentUser() user: User) {
    this.logger.info(
      `crearGrupo de menús ${dto.category} with user ${user.id}`,
    );
    return this.serviceGroupsService.crearGrupo(
      dto.category,
      dto.name,
      user.company_id,
    );
  }

  @Roles(...SALES_AND_UP)
  @Patch('grupos/orden')
  ordenarGrupos(
    @Body() dto: OrdenDeGruposDeMenusDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `ordenarGrupos de menús ${dto.category} with user ${user.id}`,
    );
    return this.serviceGroupsService.ordenarGrupos(
      dto.category,
      dto.ids,
      user.company_id,
    );
  }

  @Roles(...SALES_AND_UP)
  @Patch('grupos/:id')
  renombrarGrupo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NombreDeGrupoDeMenusDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`renombrarGrupo de menús ${id} with user ${user.id}`);
    return this.serviceGroupsService.renombrarGrupo(
      id,
      dto.name,
      user.company_id,
    );
  }

  @Roles(...SALES_AND_UP)
  @Delete('grupos/:id')
  borrarGrupo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`borrarGrupo de menús ${id} with user ${user.id}`);
    return this.serviceGroupsService.borrarGrupo(id, user.company_id);
  }

  /** Cambiar un menú de grupo (12-10-2026); null lo deja sin grupo. */
  @Roles(...SALES_AND_UP)
  @Patch(':id/grupo')
  asignarGrupo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarGrupoDeMenuDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`asignarGrupo menú ${id} with user ${user.id}`);
    return this.serviceGroupsService.asignarGrupo(
      id,
      dto.menu_group_id,
      user.company_id,
    );
  }

  @Roles(...SALES_AND_UP)
  @Patch(':id')
  rename(
    @Param('id') id: ServiceGroup['id'],
    @Body() dto: RenameServiceGroupDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`rename service group ${id}`);
    return this.serviceGroupsService.rename(+id, user.company_id, dto.name);
  }

  @Roles(...SALES_AND_UP)
  @Delete(':id')
  remove(@Param('id') id: ServiceGroup['id'], @CurrentUser() user: User) {
    this.logger.info(`remove service group with id ${id}`);
    return this.serviceGroupsService.remove(+id, user.company_id);
  }
}
