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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import {
  AdjuntosService,
  MAX_BYTES_ADJUNTO,
} from './adjuntos/adjuntos.service';
import { AnalisisService } from './analisis/analisis.service';
import { ValidacionService } from './analisis/validacion.service';
import { ActualizarOportunidadDto } from './dto/actualizar-oportunidad.dto';
import { GuardarConfigOportunidadesDto } from './dto/guardar-config.dto';
import { ListarOportunidadesDto } from './dto/listar-oportunidades.dto';
import { GuardarOferenteDto, SubirDocumentoDto } from './dto/oferente.dto';
import { SeccionDto } from './dto/seccion.dto';
import {
  MAX_BYTES_DOCUMENTO,
  MAX_BYTES_FIRMA,
  OferenteService,
} from './oferente/oferente.service';
import { OportunidadesRepository } from './oportunidades.repository';
import { OportunidadesService } from './oportunidades.service';
import { RadarService } from './radar.service';

// La pantalla de Oportunidades (doc 17, sprint 2) y el radar.
//
// Solo administrador (Felipe, 17-10: "solo el administrador y Camila, que es
// perfil administrador"), y solo empresas con el derecho `oportunidades`
// (módulo propio de Valle del Sol, migración 122).
//
// Las rutas fijas van ANTES de las que llevan :id, o Nest intentaría leer
// "config" como un número.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class OportunidadesController {
  constructor(
    private readonly servicio: OportunidadesService,
    private readonly adjuntos: AdjuntosService,
    private readonly analisis: AnalisisService,
    private readonly validacion: ValidacionService,
    private readonly oferente: OferenteService,
    private readonly repo: OportunidadesRepository,
    private readonly radar: RadarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OportunidadesController.name);
  }

  /** La bandeja de la empresa de la sesión. */
  @Get()
  listar(@Query() filtros: ListarOportunidadesDto, @CurrentUser() user: User) {
    return this.servicio.listar(user.company_id, filtros);
  }

  @Get('config')
  config(@CurrentUser() user: User) {
    return this.servicio.config(user.company_id);
  }

  @Patch('config')
  guardarConfig(
    @Body() dto: GuardarConfigOportunidadesDto,
    @CurrentUser() user: User,
  ) {
    return this.servicio.guardarConfig(user.company_id, dto);
  }

  /** Corre el radar ahora. Responde al tiro: la corrida sigue sola y queda
   *  en la bitácora (GET radar/corridas). */
  @Post('radar')
  async correrRadar(@CurrentUser() user: User) {
    this.logger.info(`POST /oportunidades/radar (empresa ${user.company_id})`);
    const corrida = await this.radar.iniciar('manual');
    return corrida === null
      ? { iniciada: false, motivo: 'Ya hay una corrida del radar en marcha.' }
      : { iniciada: true, corrida };
  }

  /** Las últimas corridas del radar: cuándo, qué trajo y qué falló. */
  @Get('radar/corridas')
  corridas() {
    return this.repo.ultimasCorridas(10);
  }

  /** "Se viene": lo que se repite cada año y todavía no sale. */
  @Get('calendario')
  calendario(@CurrentUser() user: User) {
    return this.servicio.calendario(user.company_id);
  }

  /** Quién gana en las regiones de la empresa. */
  @Get('competidores')
  competidores(@CurrentUser() user: User) {
    return this.servicio.competidores(user.company_id);
  }

  @Get('competidores/:rut')
  competidor(@Param('rut') rut: string, @CurrentUser() user: User) {
    return this.servicio.competidor(user.company_id, rut);
  }

  // LA EMPRESA COMO OFERENTE (sprint 3, paso 2; migración 126): sus datos,
  // la foto de la firma y la carpeta de documentos con vencimiento.

  @Get('oferente')
  verOferente(@CurrentUser() user: User) {
    return this.oferente.ver(user.company_id);
  }

  @Patch('oferente')
  guardarOferente(@Body() dto: GuardarOferenteDto, @CurrentUser() user: User) {
    return this.oferente.guardar(user.company_id, dto);
  }

  @Post('oferente/firma')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES_FIRMA },
      defParamCharset: 'utf8',
    }),
  )
  subirFirma(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/oferente/firma (empresa ${user.company_id})`,
    );
    return this.oferente.subirFirma(user.company_id, archivo);
  }

  @Delete('oferente/firma')
  borrarFirma(@CurrentUser() user: User) {
    return this.oferente.borrarFirma(user.company_id);
  }

  @Post('oferente/documentos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES_DOCUMENTO },
      defParamCharset: 'utf8',
    }),
  )
  subirDocumentoDeEmpresa(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() dto: SubirDocumentoDto,
    @CurrentUser() user: User,
  ) {
    return this.oferente.subirDocumento(user.company_id, user.id, archivo, dto);
  }

  @Delete('oferente/documentos/:documentoId')
  borrarDocumentoDeEmpresa(
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @CurrentUser() user: User,
  ) {
    return this.oferente.borrarDocumento(user.company_id, documentoId);
  }

  @Get(':id')
  ficha(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.servicio.ficha(user.company_id, id);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarOportunidadDto,
    @CurrentUser() user: User,
  ) {
    return this.servicio.actualizar(user.company_id, id, dto);
  }

  /** Las bases y anexos que subió la empresa (migración 124). */
  @Get(':id/adjuntos')
  listarAdjuntos(
    @Param('id', ParseIntPipe) id: number,
    @Query() { seccion }: SeccionDto,
    @CurrentUser() user: User,
  ) {
    return this.adjuntos.listar(user.company_id, id, seccion ?? 'bases');
  }

  /** Un archivo por pedido, en el campo `file`. `defParamCharset`: el
   *  nombre llega en UTF-8 ("Día del Profesor.pdf"), no en latin1. */
  @Post(':id/adjuntos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES_ADJUNTO },
      defParamCharset: 'utf8',
    }),
  )
  subirAdjunto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() { seccion }: SeccionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/adjuntos (empresa ${user.company_id}, ${seccion ?? 'bases'})`,
    );
    return this.adjuntos.subir(
      user.company_id,
      user.id,
      id,
      archivo,
      seccion ?? 'bases',
    );
  }

  /** El último análisis de las bases (migración 125); null si no hay. */
  @Get(':id/analisis')
  analisisDeBases(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.analisis.ultimo(user.company_id, id);
  }

  /** Pide que Opus lea las bases: responde al tiro con el análisis
   *  "procesando"; la pantalla pregunta hasta que termine. */
  @Post(':id/analisis')
  analizarBases(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/analisis (empresa ${user.company_id})`,
    );
    return this.analisis.pedir(user.company_id, user.id, id);
  }

  /** La última validación de documentos (migración 127); null si no hay. */
  @Get(':id/validacion')
  validacionDeDocumentos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.validacion.ultima(user.company_id, id);
  }

  /** Pide que Opus revise lo que se va a presentar contra el checklist de
   *  las bases: responde al tiro; la pantalla pregunta hasta que termine. */
  @Post(':id/validacion')
  validarDocumentos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/validacion (empresa ${user.company_id})`,
    );
    return this.validacion.pedir(user.company_id, user.id, id);
  }

  @Delete(':id/adjuntos/:adjuntoId')
  borrarAdjunto(
    @Param('id', ParseIntPipe) id: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @CurrentUser() user: User,
  ) {
    return this.adjuntos.borrar(user.company_id, id, adjuntoId);
  }
}
