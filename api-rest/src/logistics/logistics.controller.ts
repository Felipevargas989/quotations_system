import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import {
  ADMIN_ONLY,
  OPERATIONS_AND_UP,
  Roles,
  SALES_AND_UP,
} from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import {
  CreateFurnitureItemDto,
  CreateManagementResourceDto,
  UpdateFurnitureItemDto,
  UpdateManagementResourceDto,
} from './dto/create-catalog-items.dto';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';
import {
  AddCostItemDto,
  AddEventResourcesDto,
  AddKitchenNoteDto,
  AddRecipeItemDto,
  ClearProvisionedDto,
  DeleteSupplyProvisionsDto,
  MarkDaysPrintedDto,
  MarkProvisionedDto,
  SetServiceTimeDto,
  UpdateCostItemDto,
  UpdateEventResourceDto,
  UpdateFixedCostsDto,
  UpdateRecipeItemDto,
  UpsertSupplyProvisionsDto,
} from './dto/event-operations.dto';
import { LogisticsService } from './logistics.service';

// Mudanza #2 de "una sola puerta" (28-07): PROVEEDORES por el backend.
// La regla que antes era de pantalla acá es de servidor: logística es
// de operaciones y administración (confirmado por Felipe), y cada
// empresa toca SOLO lo suyo (company_id sale de la sesión).
@Roles(...OPERATIONS_AND_UP)
@Controller('logistics')
export class LogisticsController {
  constructor(
    private readonly logisticsService: LogisticsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogisticsController.name);
  }

  // LEER proveedores es más amplio que la sección Logística: lo usan
  // el cotizador (vendedores), el Dashboard y Post-Venta — medido en 8
  // pantallas (28-07). Por eso vendedor+; las ESCRITURAS siguen con la
  // regla del controller (operaciones y administración).
  // ------------- VELOCIDAD 2.0 (28-07): paquetes por pantalla -------
  // Antes el navegador pedía estas listas por separado (6 llamadas el
  // catálogo, 2 el estado de compras) y hacían fila de a 6 conexiones.
  // Ahora pide UN paquete y el backend junta todo EN PARALELO al lado
  // de la base (misma región desde hoy). Mismos permisos que las
  // lecturas sueltas (vendedor+, medido en pantallas el 28-07).
  @Roles(...SALES_AND_UP)
  @Get('base-catalogo')
  async baseCatalogo(@CurrentUser() user: User) {
    this.logger.info(`GET /logistics/base-catalogo company ${user.company_id}`);
    const cid = user.company_id;
    const [recipes, supplies, furniture, suppliers, nameIds, fixedCosts] =
      await Promise.all([
        this.logisticsService.findAllRecipeItems(cid),
        this.logisticsService.findAllSupplies(cid),
        this.logisticsService.findAllFurniture(cid),
        this.logisticsService.findAllSuppliers(cid),
        this.logisticsService.catalogServiceNames(cid),
        this.logisticsService.fixedServiceCosts(cid),
      ]);
    return { recipes, supplies, furniture, suppliers, nameIds, fixedCosts };
  }

  @Roles(...SALES_AND_UP)
  @Get('estado-compras')
  async estadoCompras(@CurrentUser() user: User) {
    this.logger.info(
      `GET /logistics/estado-compras company ${user.company_id}`,
    );
    const [events, provisions] = await Promise.all([
      this.logisticsService.findAcceptedEvents(user.company_id),
      this.logisticsService.findSupplyProvisions(user.company_id),
    ]);
    return { events, provisions };
  }

  @Roles(...SALES_AND_UP)
  @Get('suppliers')
  findAllSuppliers(@CurrentUser() user: User) {
    this.logger.info(`GET /logistics/suppliers company ${user.company_id}`);
    return this.logisticsService.findAllSuppliers(user.company_id);
  }

  @Get('suppliers/usage')
  suppliersUsage(@CurrentUser() user: User) {
    this.logger.info(
      `GET /logistics/suppliers/usage company ${user.company_id}`,
    );
    return this.logisticsService.suppliersUsage(user.company_id);
  }

  @Post('suppliers')
  createSupplier(
    @Body() createSupplierDto: CreateSupplierDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /logistics/suppliers company ${user.company_id} (datos redactados)`,
    );
    return this.logisticsService.createSupplier(
      user.company_id,
      createSupplierDto,
    );
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /logistics/suppliers/${id} company ${user.company_id}`,
    );
    return this.logisticsService.updateSupplier(
      user.company_id,
      id,
      updateSupplierDto,
    );
  }

  @Delete('suppliers/:id')
  deleteSupplier(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `DELETE /logistics/suppliers/${id} company ${user.company_id}`,
    );
    return this.logisticsService.deleteSupplier(user.company_id, id);
  }

  // ---------- Insumos (mudanza #3, 28-07) ----------

  // Los insumos los leen 9 pantallas, incluido el cotizador → vendedor+.
  @Roles(...SALES_AND_UP)
  @Get('supplies')
  findAllSupplies(@CurrentUser() user: User) {
    this.logger.info(`GET /logistics/supplies company ${user.company_id}`);
    return this.logisticsService.findAllSupplies(user.company_id);
  }

  // ids separados por coma: /logistics/supplies/usage?ids=1,2,3
  @Get('supplies/usage')
  suppliesUsage(@Query('ids') ids: string, @CurrentUser() user: User) {
    this.logger.info(
      `GET /logistics/supplies/usage company ${user.company_id}`,
    );
    const lista = (ids || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n));
    return this.logisticsService.suppliesUsage(user.company_id, lista);
  }

  @Post('supplies')
  createSupply(
    @Body() createSupplyDto: CreateSupplyDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /logistics/supplies company ${user.company_id} (datos redactados)`,
    );
    return this.logisticsService.createSupply(user.company_id, createSupplyDto);
  }

  @Patch('supplies/:id')
  updateSupply(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSupplyDto: UpdateSupplyDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /logistics/supplies/${id} company ${user.company_id}`,
    );
    return this.logisticsService.updateSupply(
      user.company_id,
      id,
      updateSupplyDto,
    );
  }

  @Delete('supplies/:id')
  deleteSupply(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `DELETE /logistics/supplies/${id} company ${user.company_id}`,
    );
    return this.logisticsService.deleteSupply(user.company_id, id);
  }

  // ---------- Mobiliario (mudanza #4, 28-07) ----------

  // El mobiliario lo leen 7 pantallas, cotizador incluido → vendedor+.
  @Roles(...SALES_AND_UP)
  @Get('furniture')
  findAllFurniture(@CurrentUser() user: User) {
    this.logger.info(`GET /logistics/furniture company ${user.company_id}`);
    return this.logisticsService.findAllFurniture(user.company_id);
  }

  @Get('furniture/usage')
  furnitureUsage(@CurrentUser() user: User) {
    this.logger.info(
      `GET /logistics/furniture/usage company ${user.company_id}`,
    );
    return this.logisticsService.furnitureUsage(user.company_id);
  }

  @Post('furniture')
  createFurniture(
    @Body() dto: CreateFurnitureItemDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /logistics/furniture company ${user.company_id}`);
    return this.logisticsService.createFurniture(user.company_id, dto);
  }

  @Patch('furniture/:id')
  updateFurniture(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFurnitureItemDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /logistics/furniture/${id} company ${user.company_id}`,
    );
    return this.logisticsService.updateFurniture(user.company_id, id, dto);
  }

  @Delete('furniture/:id')
  deleteFurniture(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `DELETE /logistics/furniture/${id} company ${user.company_id}`,
    );
    return this.logisticsService.deleteFurniture(user.company_id, id);
  }

  // ---------- Recursos de gestión (mudanza #5, 28-07) ----------
  // Solo pantallas de operaciones/admin los usan: hereda la regla del
  // controller (OPERATIONS_AND_UP) en lecturas y escrituras.

  @Get('resources')
  findAllResources(@CurrentUser() user: User) {
    this.logger.info(`GET /logistics/resources company ${user.company_id}`);
    return this.logisticsService.findAllResources(user.company_id);
  }

  @Get('resources/usage')
  resourcesUsage(@CurrentUser() user: User) {
    this.logger.info(
      `GET /logistics/resources/usage company ${user.company_id}`,
    );
    return this.logisticsService.resourcesUsage(user.company_id);
  }

  @Post('resources')
  createResource(
    @Body() dto: CreateManagementResourceDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /logistics/resources company ${user.company_id}`);
    return this.logisticsService.createResource(user.company_id, dto);
  }

  @Patch('resources/:id')
  updateResource(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManagementResourceDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /logistics/resources/${id} company ${user.company_id}`,
    );
    return this.logisticsService.updateResource(user.company_id, id, dto);
  }

  @Delete('resources/:id')
  deleteResource(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `DELETE /logistics/resources/${id} company ${user.company_id}`,
    );
    return this.logisticsService.deleteResource(user.company_id, id);
  }

  // ---------- Compras multi-evento (mudanza #6) — operaciones+ ----------

  @Get('purchasing/accepted-events')
  acceptedEvents(@CurrentUser() user: User) {
    return this.logisticsService.findAcceptedEvents(user.company_id);
  }

  @Get('purchasing/won-events')
  wonEvents(@Query('from') from: string, @CurrentUser() user: User) {
    return this.logisticsService.findWonEventsSince(user.company_id, from);
  }

  @Post('purchasing/mark-provisioned')
  markProvisioned(@Body() dto: MarkProvisionedDto, @CurrentUser() user: User) {
    return this.logisticsService.markProvisioned(user.company_id, dto);
  }

  @Post('purchasing/clear-provisioned')
  clearProvisioned(
    @Body() dto: ClearProvisionedDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.clearProvisioned(user.company_id, dto.ids);
  }

  @Get('purchasing/provisioning/:quotationId')
  quotationProvisioning(
    @Param('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.quotationProvisioning(
      user.company_id,
      quotationId,
    );
  }

  @Get('purchasing/supply-provisions')
  supplyProvisions(@CurrentUser() user: User) {
    return this.logisticsService.findSupplyProvisions(user.company_id);
  }

  @Post('purchasing/supply-provisions')
  upsertSupplyProvisions(
    @Body() dto: UpsertSupplyProvisionsDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.upsertSupplyProvisions(user.company_id, dto);
  }

  @Post('purchasing/supply-provisions/delete')
  deleteSupplyProvisions(
    @Body() dto: DeleteSupplyProvisionsDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.deleteSupplyProvisions(
      user.company_id,
      dto.quotationIds,
      dto.supplyIds,
    );
  }

  // ---------- Recursos de un evento — operaciones+ ----------

  @Get('event-resources')
  eventResources(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return quotationId
      ? this.logisticsService.findEventResources(user.company_id, quotationId)
      : this.logisticsService.findAllEventResources(user.company_id);
  }

  @Post('event-resources')
  addEventResources(
    @Body() dto: AddEventResourcesDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.addEventResources(user.company_id, dto);
  }

  @Patch('event-resources/:id')
  updateEventResource(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventResourceDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.updateEventResource(user.company_id, id, dto);
  }

  @Delete('event-resources/:id')
  deleteEventResource(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.deleteEventResource(user.company_id, id);
  }

  // ---------- Ficha de cocina — operaciones+ ----------

  @Get('kitchen/times')
  serviceTimes(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.findServiceTimes(user.company_id, quotationId);
  }

  @Post('kitchen/times')
  setServiceTime(@Body() dto: SetServiceTimeDto, @CurrentUser() user: User) {
    return this.logisticsService.setServiceTime(user.company_id, dto);
  }

  @Get('kitchen/notes')
  kitchenNotes(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.findKitchenNotes(user.company_id, quotationId);
  }

  @Post('kitchen/notes')
  addKitchenNote(@Body() dto: AddKitchenNoteDto, @CurrentUser() user: User) {
    return this.logisticsService.addKitchenNote(user.company_id, dto);
  }

  @Delete('kitchen/notes/:id')
  deleteKitchenNote(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.deleteKitchenNote(user.company_id, id);
  }

  @Get('kitchen/day-prints')
  dayPrints(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.findDayPrints(user.company_id, quotationId);
  }

  @Post('kitchen/day-prints')
  markDaysPrinted(@Body() dto: MarkDaysPrintedDto, @CurrentUser() user: User) {
    return this.logisticsService.markDaysPrinted(
      user.company_id,
      dto.quotation_id,
      dto.days,
    );
  }

  // ---------- Recetas y costos — reglas medidas 28-07 ----------

  // Lecturas que usa el COTIZADOR (vendedor+): catálogo de nombres,
  // costos cacheados de fijos y todas las líneas de receta.
  @Roles(...SALES_AND_UP)
  @Get('catalog/service-names')
  catalogServiceNames(@CurrentUser() user: User) {
    return this.logisticsService.catalogServiceNames(user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Get('catalog/fixed-costs')
  fixedServiceCosts(@CurrentUser() user: User) {
    return this.logisticsService.fixedServiceCosts(user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Get('recipes/all')
  allRecipeItems(@CurrentUser() user: User) {
    return this.logisticsService.findAllRecipeItems(user.company_id);
  }

  // La edición de recetas y costos vive en el Catálogo (administrador).
  @Roles(...ADMIN_ONLY)
  @Get('recipes')
  recipeItems(
    @Query('serviceType') serviceType: string,
    @Query('serviceId', ParseIntPipe) serviceId: number,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.findRecipeItems(
      user.company_id,
      serviceType,
      serviceId,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Post('recipes')
  addRecipeItem(@Body() dto: AddRecipeItemDto, @CurrentUser() user: User) {
    return this.logisticsService.addRecipeItem(user.company_id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Patch('recipes/:id')
  updateRecipeItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecipeItemDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.updateRecipeItem(user.company_id, id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Delete('recipes/:id')
  deleteRecipeItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.deleteRecipeItem(user.company_id, id);
  }

  // Líneas de costo: las lee Post-Venta (operaciones+, regla del
  // controller); las escrituras y el caché de costos son del Catálogo.
  @Get('fixed-cost-items')
  fixedServiceCostItems(
    @Query('fixedServiceId') fixedServiceId: string,
    @CurrentUser() user: User,
  ) {
    const id = fixedServiceId ? parseInt(fixedServiceId, 10) : undefined;
    return this.logisticsService.findFixedServiceCostItems(
      user.company_id,
      Number.isInteger(id) ? id : undefined,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('fixed-costs/:id')
  updateFixedServiceCosts(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFixedCostsDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.updateFixedServiceCosts(
      user.company_id,
      id,
      dto,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Post('fixed-cost-items')
  addCostItem(@Body() dto: AddCostItemDto, @CurrentUser() user: User) {
    return this.logisticsService.addCostItem(user.company_id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Patch('fixed-cost-items/:id')
  updateCostItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCostItemDto,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.updateCostItem(user.company_id, id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Delete('fixed-cost-items/:id')
  deleteCostItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.logisticsService.deleteCostItem(user.company_id, id);
  }
}
