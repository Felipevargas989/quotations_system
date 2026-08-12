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
import { RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CreateQuotationFollowupDto } from './dto/create-quotation-followup.dto';
import { UpdateQuotationFollowupDto } from './dto/update-quotation-followup.dto';
import { QuotationFollowupsService } from './quotation-followups.service';

// Bitácora comercial (03-08): el seguimiento es de quien atiende al
// cliente. Desde el 12-08 eso INCLUYE a recepción: llamar y anotar en
// qué quedó la conversación es literalmente su pega, y esta es la
// única pestaña que ve de la ficha. Sin esto, la abría en un 403.
// Escribir su nota sí; tocar las de otros no — de eso se encarga la
// regla de autoría del servicio, que no distingue rangos.
@Roles(...RECEPTION_AND_UP)
@Controller('quotation-followups')
export class QuotationFollowupsController {
  constructor(
    private readonly followupsService: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationFollowupsController.name);
  }

  // OJO: las rutas estáticas van ANTES que las paramétricas — si :id
  // se declara primero, "map" cae en el ParseIntPipe y muere en 400.
  @Get('map')
  map(@CurrentUser() user: User) {
    this.logger.info(`GET /quotation-followups/map company ${user.company_id}`);
    return this.followupsService.mapByCompany(user.company_id);
  }

  @Get('by-quotation/:quotationId')
  findByQuotation(
    @Param('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`GET /quotation-followups/by-quotation/${quotationId}`);
    return this.followupsService.findByQuotation(user.company_id, quotationId);
  }

  @Post()
  create(@Body() dto: CreateQuotationFollowupDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /quotation-followups company ${user.company_id} (nota redactada)`,
    );
    return this.followupsService.create(user, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuotationFollowupDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /quotation-followups/${id}`);
    return this.followupsService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(`DELETE /quotation-followups/${id}`);
    return this.followupsService.remove(user, id);
  }
}
