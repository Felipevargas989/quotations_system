import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { CreatePersonDto } from './dto/create-person.dto';
import { CreateJobRoleDto, UpdateJobRoleDto } from './dto/job-role.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PeopleService } from './people.service';

@Controller('people')
export class PeopleController {
  constructor(
    private readonly peopleService: PeopleService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PeopleController.name);
  }

  // ---- Cargos ----
  // Van ANTES de las rutas con :id para que "roles" no se lea como un id.

  @Get('roles')
  findRoles(@CurrentUser() user: User, @Query('todos') todos?: string) {
    this.logger.info(`GET /people/roles with user ${user.id}`);
    return this.peopleService.findRoles(user.company_id, todos === 'true');
  }

  @Post('roles')
  createRole(@Body() dto: CreateJobRoleDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/roles ${dto.name}`);
    return this.peopleService.createRole(
      user.company_id,
      dto.name,
      dto.sort_order,
    );
  }

  @Patch('roles/:id')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateJobRoleDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /people/roles/${id}`);
    return this.peopleService.updateRole(+id, dto, user.company_id);
  }

  // Un cargo se APAGA, no se borra: si alguien lo tiene como cargo por
  // defecto, borrarlo dejaría esa ficha apuntando a la nada.
  @Delete('roles/:id')
  deactivateRole(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /people/roles/${id} (apagar)`);
    return this.peopleService.deactivateRole(+id, user.company_id);
  }

  // ---- Personas ----

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /people with user ${user.id}`);
    return this.peopleService.findAll(user.company_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`GET /people/${id}`);
    return this.peopleService.findOne(+id, user.company_id);
  }

  @Post()
  create(@Body() dto: CreatePersonDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people with ${logSafe(dto)}`);
    return this.peopleService.create(dto, user.company_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /people/${id} with ${logSafe(dto)}`);
    return this.peopleService.update(+id, dto, user.company_id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /people/${id}`);
    return this.peopleService.remove(+id, user.company_id);
  }
}
