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
import { LicifyService } from './adjuntos/licify.service';
import { AnalisisService } from './analisis/analisis.service';
import { ValidacionService } from './analisis/validacion.service';
import { ActualizarOportunidadDto } from './dto/actualizar-oportunidad.dto';
import { DescartarSerieDto } from './dto/descartar-serie.dto';
import { FirmarDocumentosDto, GenerarAnexosDto } from './dto/generacion.dto';
import { GuardarConfigOportunidadesDto } from './dto/guardar-config.dto';
import { ListarOportunidadesDto } from './dto/listar-oportunidades.dto';
import { MarcarExigenciaDto } from './dto/marcar-exigencia.dto';
import {
  GuardarOferenteDto,
  MarcarNoUsarDto,
  SubirDocumentoDto,
} from './dto/oferente.dto';
import { SeccionDto, SubirAdjuntoDto } from './dto/seccion.dto';
import { GeneracionService } from './generacion/generacion.service';
import { SeVieneService } from './historia/se-viene.service';
import { MisLicitacionesService } from './mias/mis-licitaciones.service';
import { LeerRespaldoService } from './oferente/leer-respaldo.service';
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
    private readonly generacion: GeneracionService,
    private readonly misLicitaciones: MisLicitacionesService,
    private readonly oferente: OferenteService,
    private readonly leerRespaldo: LeerRespaldoService,
    private readonly repo: OportunidadesRepository,
    private readonly radar: RadarService,
    private readonly seViene: SeVieneService,
    private readonly licify: LicifyService,
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

  /** "Mis licitaciones": las que la empresa marcó, con el avance de cada
   *  una (bases, análisis, anexos, firma, validación). */
  @Get('mias')
  mias(@CurrentUser() user: User) {
    return this.misLicitaciones.mias(user.company_id);
  }

  /** "Se viene": lo que se repite cada año y todavía no sale. */
  @Get('calendario')
  calendario(@CurrentUser() user: User) {
    return this.servicio.calendario(user.company_id);
  }

  /** Cómo va la lectura de «Se viene» (decisión 62): la pantalla pregunta
   *  mientras la IA lee y vuelve a pedir el calendario al terminar. */
  @Get('calendario/lectura')
  lecturaDelCalendario(@CurrentUser() user: User) {
    return this.seViene.estado(user.company_id);
  }

  /** «Descartar» una serie de «Se viene» (decisión 63), o recuperarla: el
   *  código es el de la última vez que salió. */
  @Patch('calendario/:codigo')
  descartarSerie(
    @Param('codigo') codigo: string,
    @Body() dto: DescartarSerieDto,
    @CurrentUser() user: User,
  ) {
    return this.seViene.descartar(user.company_id, codigo, dto.descartada);
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

  /** Lee una orden de compra o una factura con Haiku (decisión 34): sus
   *  datos para el respaldo, sin guardar nada; la empresa revisa y guarda. */
  @Post('oferente/respaldos/leer')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES_DOCUMENTO },
      defParamCharset: 'utf8',
    }),
  )
  leerUnRespaldo(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @CurrentUser() user: User,
  ) {
    return this.leerRespaldo.leer(user.company_id, archivo);
  }

  @Get('oferente/orden-de-compra/:codigo')
  ordenDeCompra(@Param('codigo') codigo: string, @CurrentUser() user: User) {
    return this.oferente.ordenDeCompra(user.company_id, codigo);
  }

  /** «No usar» (decisión 56): marca o desmarca un respaldo de experiencia
   *  que la empresa no quiere mostrar. */
  @Patch('oferente/documentos/:documentoId/no-usar')
  marcarNoUsar(
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @Body() dto: MarcarNoUsarDto,
    @CurrentUser() user: User,
  ) {
    return this.oferente.marcarNoUsar(
      user.company_id,
      documentoId,
      dto.no_usar,
    );
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
    return this.servicio.actualizar(user.company_id, id, dto, user.id);
  }

  /** «Exigencias de la licitación»: lo tengo / no puedo (migración 152). */
  @Patch(':id/exigencias')
  marcarExigencia(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarcarExigenciaDto,
    @CurrentUser() user: User,
  ) {
    return this.servicio.marcarExigencia(
      user.company_id,
      id,
      dto.clave,
      dto.marca ?? null,
    );
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

  /** «Traer los documentos» (decisión 65): lo que Licify tiene del
   *  proceso, a «Bases y anexos». */
  @Post(':id/adjuntos/traer')
  traerAdjuntos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/adjuntos/traer (empresa ${user.company_id})`,
    );
    return this.licify.traer(user.company_id, user.id, id);
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
    @Body() { seccion, competidor }: SubirAdjuntoDto,
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
      competidor,
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

  // LA IA HACE DOCUMENTOS (sprint 3, paso 4; migración 129): llena los
  // anexos del comprador SIN firma, los firma cuando la empresa ya los
  // revisó, y escribe la propuesta técnica. Cada uno responde al tiro con
  // el trabajo "procesando"; la pantalla pregunta hasta que termine.

  /** El último trabajo de cada tipo: `{ anexos, firma, propuesta }`. */
  @Get(':id/generaciones')
  generaciones(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.generacion.ultimas(user.company_id, id);
  }

  @Post(':id/generaciones/anexos')
  generarAnexos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerarAnexosDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/generaciones/anexos (empresa ${user.company_id})`,
    );
    return this.generacion.generarAnexos(user.company_id, user.id, id, dto);
  }

  @Post(':id/generaciones/firma')
  firmarDocumentos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FirmarDocumentosDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/generaciones/firma (empresa ${user.company_id})`,
    );
    return this.generacion.firmar(user.company_id, user.id, id, dto.adjuntos);
  }

  @Post(':id/generaciones/propuesta')
  crearPropuesta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/generaciones/propuesta (empresa ${user.company_id})`,
    );
    return this.generacion.crearPropuesta(user.company_id, user.id, id);
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
