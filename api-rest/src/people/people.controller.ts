import {
  BadRequestException,
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
import {
  CerrarFichaDto,
  CreateDayNoteDto,
  CreatePayrollDto,
  CreatePoolDto,
  CreateReviewDto,
  PagoDto,
  PreviaPreliminarDto,
  ReabrirLiquidacionDto,
  RepartirDto,
  SeleccionPayrollDto,
  UpdateDayNoteDto,
  UpdatePoolDto,
  UpsertSheetDto,
} from './dto/etapas.dto';
import {
  CreateEventStaffDto,
  UpdateEventStaffDto,
} from './dto/event-staff.dto';
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
    return this.peopleService.createRole(user.company_id, dto.name);
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

  // ---- Quién trabaja cada día ----
  // Antes de las rutas con :id, para que "staff" no se lea como un id.

  @Get('staff')
  findStaff(
    @Query('evento') evento: string | undefined,
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @CurrentUser() user: User,
  ) {
    // Por evento (la ficha) o por rango (la planificación semanal).
    if (evento) {
      this.logger.info(`GET /people/staff evento ${evento}`);
      return this.peopleService.findStaff(user.company_id, evento);
    }
    if (desde && hasta) {
      this.logger.info(`GET /people/staff ${desde} a ${hasta}`);
      return this.peopleService.findStaffRange(user.company_id, desde, hasta);
    }
    throw new BadRequestException('Falta el evento o el rango de fechas');
  }

  @Post('staff')
  addStaff(@Body() dto: CreateEventStaffDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/staff ${logSafe(dto)}`);
    return this.peopleService.addStaff(dto, user.company_id);
  }

  // La sábana lo llama UNA vez al abrirse: deja el año de toda la
  // planta proyectado. Desplazarse por los meses ya no carga nada.
  @Post('staff/proyectar-planta')
  proyectarPlanta(@CurrentUser() user: User) {
    this.logger.info('POST /people/staff/proyectar-planta');
    return this.peopleService.proyectarTodaLaPlanta(user.company_id);
  }

  @Patch('staff/:id')
  updateStaff(
    @Param('id') id: string,
    @Body() dto: UpdateEventStaffDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /people/staff/${id}`);
    return this.peopleService.updateStaff(+id, dto, user.company_id);
  }

  @Delete('staff/:id')
  removeStaff(
    @Param('id') id: string,
    @Query('liberar') liberar: string | undefined,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `DELETE /people/staff/${id}${liberar ? ' (liberar)' : ''}`,
    );
    return this.peopleService.removeStaff(
      +id,
      user.company_id,
      liberar === '1',
    );
  }

  /** El costo de personal por evento y cargo, desde las sillas. */
  @Get('costo-personal')
  costoPersonal(@CurrentUser() user: User) {
    return this.peopleService.costoPersonal(user.company_id);
  }

  /** La planta con turno los días del evento entra a su ficha. */
  @Post('sheets/:quotationId/traer-planta')
  traerPlanta(
    @Param('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.peopleService.traerPlantaAlEvento(quotationId, user.company_id);
  }

  // ---- El ciclo de la ficha ----

  @Get('sheets')
  findSheets(@CurrentUser() user: User) {
    return this.peopleService.findSheets(user.company_id);
  }

  @Post('sheets')
  upsertSheet(@Body() dto: UpsertSheetDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/sheets ${dto.quotation_id} ${dto.status}`);
    return this.peopleService.upsertSheet(dto, user.company_id);
  }

  @Post('sheets/cerrar')
  cerrarFicha(@Body() dto: CerrarFichaDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/sheets/cerrar ${dto.quotation_id}`);
    return this.peopleService.cerrarFicha(dto, user.company_id);
  }

  // ---- Los pozos y el reparto ----

  @Get('pools')
  findPools(@CurrentUser() user: User) {
    return this.peopleService.findPools(user.company_id);
  }

  @Post('pools')
  createPool(@Body() dto: CreatePoolDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/pools ${logSafe(dto)}`);
    return this.peopleService.createPool(dto, user.company_id);
  }

  @Patch('pools/:id')
  updatePool(
    @Param('id') id: string,
    @Body() dto: UpdatePoolDto,
    @CurrentUser() user: User,
  ) {
    return this.peopleService.updatePool(+id, dto, user.company_id);
  }

  @Delete('pools/:id')
  removePool(@Param('id') id: string, @CurrentUser() user: User) {
    return this.peopleService.removePool(+id, user.company_id);
  }

  @Post('pools/:id/sin-propina')
  sinPropina(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /people/pools/${id}/sin-propina`);
    return this.peopleService.marcarSinPropina(+id, user.company_id);
  }

  @Post('pools/:id/repartir')
  repartir(
    @Param('id') id: string,
    @Body() dto: RepartirDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /people/pools/${id}/repartir`);
    return this.peopleService.repartir(+id, dto, user.company_id);
  }

  // ---- Las estrellas ----

  @Get('reviews')
  findReviews(@CurrentUser() user: User, @Query('persona') persona?: string) {
    return this.peopleService.findReviews(
      user.company_id,
      persona ? +persona : undefined,
    );
  }

  @Post('reviews')
  createReview(@Body() dto: CreateReviewDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/reviews persona ${dto.person_id}`);
    return this.peopleService.createReview(dto, user.company_id);
  }

  // ---- La nómina y el pago ----

  @Get('payrolls')
  findPayrolls(@CurrentUser() user: User) {
    return this.peopleService.findPayrolls(user.company_id);
  }

  /** El día de restaurante más viejo con gente: el piso de la ventana. */
  @Get('dias/mas-viejo')
  async diaMasViejo(@CurrentUser() user: User) {
    return {
      day: await this.peopleService.diaMasViejoDeRestaurante(user.company_id),
    };
  }

  /** Devuelve una liquidación a Liquidación (solo si nada está pagado). */
  @Post('payrolls/reabrir')
  reabrirLiquidacion(
    @Body() dto: ReabrirLiquidacionDto,
    @CurrentUser() user: User,
  ) {
    return this.peopleService.reabrirLiquidacion(dto, user.company_id);
  }

  /** Lo liquidado que todavía no entró a ninguna nómina. */
  @Get('payrolls/pendientes')
  liquidacionesPendientes(@CurrentUser() user: User) {
    return this.peopleService.liquidacionesPendientes(user.company_id);
  }

  /** Lo que se va a pagar, consolidado, ANTES de generar la nómina. */
  /** La misma revisión, para un evento aún abierto: qué quedaría por pagar. */
  @Post('payrolls/previa-preliminar')
  previaPreliminar(
    @Body() dto: PreviaPreliminarDto,
    @CurrentUser() user: User,
  ) {
    return this.peopleService.previaPreliminar(dto, user.company_id);
  }

  @Post('payrolls/previa')
  previaPayroll(@Body() dto: SeleccionPayrollDto, @CurrentUser() user: User) {
    return this.peopleService.previaPayroll(dto, user.company_id);
  }

  @Post('payrolls')
  createPayroll(@Body() dto: CreatePayrollDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/payrolls ${logSafe(dto)}`);
    return this.peopleService.createPayroll(dto, user.company_id);
  }

  @Get('payrolls/:id')
  getPayroll(@Param('id') id: string, @CurrentUser() user: User) {
    return this.peopleService.getPayroll(+id, user.company_id);
  }

  @Patch('payrolls/:id/pago')
  marcarPago(
    @Param('id') id: string,
    @Body() dto: PagoDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /people/payrolls/${id}/pago persona ${dto.person_id}`,
    );
    return this.peopleService.marcarPago(+id, dto, user.company_id);
  }

  // ---- El historial de una persona (su pestaña de Pagos) ----
  // Va antes de las rutas con :id sueltas.

  @Get(':id/historial')
  findHistorial(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`GET /people/${id}/historial`);
    return this.peopleService.findHistorial(user.company_id, +id);
  }

  // ---- Las notas del día ----
  // Van antes de las rutas con :id de personas, para que
  // "day-notes" no se lea como el id de una persona.

  @Get('day-notes')
  findDayNotes(
    @CurrentUser() user: User,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    // El formato se revisa acá: sin esto, una fecha mal escrita llega a
    // Postgres y sale un 500 en vez de un "está mal escrito".
    const DIA = /^\d{4}-\d{2}-\d{2}$/;
    if (!DIA.test(desde ?? '') || !DIA.test(hasta ?? '')) {
      throw new BadRequestException('El rango va como 2026-08-14');
    }
    return this.peopleService.findDayNotes(user.company_id, desde, hasta);
  }

  @Post('day-notes')
  createDayNote(@Body() dto: CreateDayNoteDto, @CurrentUser() user: User) {
    this.logger.info(`POST /people/day-notes ${dto.day}`);
    return this.peopleService.createDayNote(dto, user.company_id);
  }

  @Patch('day-notes/:id')
  updateDayNote(
    @Param('id') id: string,
    @Body() dto: UpdateDayNoteDto,
    @CurrentUser() user: User,
  ) {
    return this.peopleService.updateDayNote(+id, dto, user.company_id);
  }

  @Delete('day-notes/:id')
  removeDayNote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.peopleService.removeDayNote(+id, user.company_id);
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
