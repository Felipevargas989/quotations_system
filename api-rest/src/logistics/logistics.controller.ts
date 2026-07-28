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
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
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
}
