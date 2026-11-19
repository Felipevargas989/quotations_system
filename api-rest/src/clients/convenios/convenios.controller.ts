import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Permiso } from 'src/auth/permiso.decorator';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import {
  AgregarDocumentoDto,
  EnviarConvenioDto,
  FirmadoEnPapelDto,
} from './convenio.dto';
import { ConveniosService } from './convenios.service';

// El convenio del cliente y sus documentos (doc 24). Los ven los mismos que
// ven la ficha 360 (sección Clientes: vendedor, operaciones y administrador);
// enviar, subir y borrar, desde vendedor. Sin permiso nuevo. La empresa sale
// SIEMPRE de la sesión.
@Roles(...SALES_AND_UP)
@Permiso('clientes')
@Controller('clients/:clientId')
export class ConveniosController {
  constructor(
    private readonly convenios: ConveniosService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConveniosController.name);
  }

  @Get('convenio')
  estado(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: User,
  ) {
    return this.convenios.estado(clientId, user);
  }

  @Post('convenio/enviar')
  @HttpCode(200)
  enviar(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: EnviarConvenioDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /clients/${clientId}/convenio/enviar`);
    return this.convenios.enviar(clientId, dto.contact_id, user);
  }

  @Post('convenio/firmado-en-papel')
  @HttpCode(200)
  firmadoEnPapel(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: FirmadoEnPapelDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /clients/${clientId}/convenio/firmado-en-papel`);
    return this.convenios.firmadoEnPapel(clientId, dto, user);
  }

  @Post('convenio/generar-pdf')
  @HttpCode(200)
  regenerarPdf(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /clients/${clientId}/convenio/generar-pdf`);
    return this.convenios.regenerarPdf(clientId, user);
  }

  @Get('documentos')
  documentos(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: User,
  ) {
    return this.convenios.documentos(clientId, user);
  }

  @Post('documentos')
  agregarDocumento(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: AgregarDocumentoDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /clients/${clientId}/documentos`);
    return this.convenios.agregarDocumento(clientId, dto, user);
  }

  @Delete('documentos/:id')
  borrarDocumento(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`DELETE /clients/${clientId}/documentos/${id}`);
    return this.convenios.borrarDocumento(clientId, id, user);
  }
}
