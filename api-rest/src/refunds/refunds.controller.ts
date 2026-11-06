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
import { Derecho } from 'src/auth/derecho.decorator';
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { DelEvento } from 'src/clients/del-evento.decorator';
import type { User } from 'src/users/entities/user.entity';
import { RegisterRefundDto } from './dto/register-refund.dto';
import { RegistrarReembolsoDto } from './dto/registrar-reembolso.dto';
import { RefundsService } from './refunds.service';

// Mudanza #7 (28-07): Post-Venta deja el acceso directo. Reembolsos son
// terreno de operaciones y administración.
// Los reembolsos son parte del ciclo de cobro: Gestiona y Cobra
// (paso 3.2, 14-09-2026).
// Los tipos de cliente de cada cargo (doc 22 §9, tanda 2): cada puerta que
// toca un evento dice con @DelEvento de cuál es, y las listas de toda la
// empresa traen solo los eventos que el cargo ve.
@Derecho('post_venta')
@Roles(...OPERATIONS_AND_UP)
@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
    private readonly logger: PinoLogger,
    private readonly alcance: AlcanceDeRecepcion,
  ) {}

  @Permiso('postventa', 'dashboard')
  @DentroDe('cotizaciones')
  @DelEvento({ query: 'quotationId' })
  @Get('by-quotation')
  findByQuotation(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`GET /refunds/by-quotation ${quotationId}`);
    return this.refundsService.findByQuotation(user.company_id, quotationId);
  }

  @Permiso('postventa')
  @Get('paid-map')
  async paidMap(@CurrentUser() user: User) {
    this.logger.info(`GET /refunds/paid-map company ${user.company_id}`);
    return this.alcance.soloLasClavesQueVe(
      user,
      await this.refundsService.paidMapByCompany(user.company_id),
    );
  }

  @Permiso('postventa')
  @DelEvento({ tabla: 'refunds', param: 'id' })
  @Patch(':id/register')
  register(
    @Param('id') id: string,
    @Body() dto: RegisterRefundDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /refunds/${id}/register`);
    // Desde el 20-10-2026 edita un registro y mueve la diferencia a lo
    // pendiente; sobre una fila pendiente registra (ya no pisa el monto).
    return this.refundsService.editarRegistro(user.company_id, id, dto);
  }

  // REEMBOLSOS POR PARTES (20-10-2026): registrar contra lo que falta por
  // devolver de la cotización, y eliminar un registro (vuelve a lo que falta).
  @Permiso('postventa')
  @DelEvento({ body: 'quotation_id' })
  @Post('registrar')
  registrar(@Body() dto: RegistrarReembolsoDto, @CurrentUser() user: User) {
    this.logger.info(`POST /refunds/registrar ${dto.quotation_id}`);
    const { quotation_id, ...campos } = dto;
    return this.refundsService.registrar(user.company_id, quotation_id, campos);
  }

  @Permiso('postventa')
  @DelEvento({ tabla: 'refunds', param: 'id' })
  @Delete(':id')
  eliminar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /refunds/${id}`);
    return this.refundsService.eliminarRegistro(user.company_id, id);
  }

  // @Post()
  // create(@Body() createRefundDto: CreateRefundDto) {
  //   return this.refundsService.create(createRefundDto);
  // }

  @Permiso('postventa')
  @Get()
  async findAll(@CurrentUser() user: User) {
    this.logger.info(
      `GET /refunds with user ${user.id} and companyId ${user.company_id}`,
    );
    const r = await this.refundsService.findAll(user.company_id);
    return {
      ...r,
      data: await this.alcance.soloLasQueVe(
        user,
        (r.data ?? []) as { quotation_id?: string | null }[],
        (f) => f.quotation_id,
      ),
    };
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.refundsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateRefundDto: UpdateRefundDto) {
  //   return this.refundsService.update(+id, updateRefundDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.refundsService.remove(+id);
  // }
}
