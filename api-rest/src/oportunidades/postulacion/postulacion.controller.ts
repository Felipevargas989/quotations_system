import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ArmarLaOfertaService } from './armar-la-oferta.service';
import { ArmarPostulacionService } from './armar-postulacion.service';
import { CotizacionDeLaPostulacionService } from './cotizacion-de-la-postulacion.service';
import { ElSetService } from './el-set.service';
import { LaExperienciaService } from './la-experiencia.service';
import {
  ArmarPostulacionDto,
  ConfirmarExperienciaDto,
  LlevarACotizacionDto,
  ProponerExperienciaDto,
  VincularCotizacionDto,
} from './postulacion.dto';

// La cotización de la postulación y «¿Calza el precio?» (decisión 29 del
// doc 17). Mismo candado que el resto de Oportunidades: administrador y el
// derecho `oportunidades`. Aparte del controlador grande para no engordarlo.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class PostulacionController {
  constructor(
    private readonly cotizacion: CotizacionDeLaPostulacionService,
    private readonly armar: ArmarLaOfertaService,
    private readonly postulacion: ArmarPostulacionService,
    private readonly elSet: ElSetService,
    private readonly experiencia: LaExperienciaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PostulacionController.name);
  }

  /** La oferta armada con IA (decisión 33): la matriz «especificación →
   *  qué se ofrece» y lo que falta en el catálogo. */
  @Get(':id/oferta')
  oferta(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.armar.ultimo(user.company_id, id);
  }

  /** La experiencia que se presenta (decisión 76): si las bases la piden
   *  y el último trabajo (la propuesta y lo que confirmó la empresa). */
  @Get(':id/experiencia')
  verExperiencia(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.experiencia.estado(user.company_id, id);
  }

  /** La IA propone la experiencia según las bases; responde al tiro con el
   *  trabajo en curso. */
  @Post(':id/experiencia')
  proponerExperiencia(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProponerExperienciaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/experiencia (empresa ${user.company_id})`,
    );
    return this.experiencia.proponer(user, id, dto.excluir ?? []);
  }

  /** La empresa confirma cuáles van: desde ahí se puede armar. */
  @Post(':id/experiencia/confirmar')
  confirmarExperiencia(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmarExperienciaDto,
    @CurrentUser() user: User,
  ) {
    return this.experiencia.confirmar(user, id, dto.quitar ?? []);
  }

  /** «Armar postulación» (decisión 35): con el precio, la oferta y, por
   *  detrás, los anexos, la propuesta técnica si va y la cotización
   *  vinculada igual a lo postulado. Responde con la oferta en curso. */
  @Post(':id/postulacion')
  armarPostulacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArmarPostulacionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/postulacion (empresa ${user.company_id})`,
    );
    return this.postulacion.armar(user, id, dto.total);
  }

  /** «Descargar para Mercado Público» (decisión 34): lo que va en el ZIP,
   *  en qué carpeta, y lo que falta. */
  @Get(':id/set')
  set(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.elSet.revisar(user.company_id, id);
  }

  @Get(':id/set/zip')
  async zip(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    this.logger.info(
      `GET /oportunidades/${id}/set/zip (empresa ${user.company_id})`,
    );
    const { nombre, datos } = await this.elSet.zip(user.company_id, id);
    const ascii = nombre
      .normalize('NFD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/"/g, '');
    return new StreamableFile(datos, {
      type: 'application/zip',
      disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      length: datos.length,
    });
  }

  @Get(':id/cotizacion')
  estado(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.cotizacion.estado(user.company_id, id);
  }

  @Post(':id/cotizacion')
  llevar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LlevarACotizacionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/cotizacion (empresa ${user.company_id})`,
    );
    return this.cotizacion.llevar(user, id, dto.total, {
      desde: dto.desde,
      hasta: dto.hasta,
    });
  }

  /** Vincular una cotización que ya existe, sin reescribirla (decisión 73). */
  @Post(':id/cotizacion/vincular')
  vincular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VincularCotizacionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/cotizacion/vincular (N° ${dto.numero}, empresa ${user.company_id})`,
    );
    return this.cotizacion.vincular(user, id, dto.numero);
  }
}
