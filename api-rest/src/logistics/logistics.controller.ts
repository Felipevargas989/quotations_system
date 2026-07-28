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
  OPERATIONS_AND_UP,
  Roles,
  SALES_AND_UP,
} from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';
import {
  CreateFurnitureItemDto,
  CreateManagementResourceDto,
  UpdateFurnitureItemDto,
  UpdateManagementResourceDto,
} from './dto/create-catalog-items.dto';
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
    this.logger.info(`GET /logistics/supplies/usage company ${user.company_id}`);
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
}
