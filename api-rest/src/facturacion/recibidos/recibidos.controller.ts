import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsString, Matches, Min } from 'class-validator';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { BoletasService } from '../boletas/boletas.service';
import { RecibidosService } from './recibidos.service';

export class PeriodoDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes va como AAAA-MM' })
  periodo: string;
}

// «RECIBIDOS» (doc 19 §9.28): las facturas de los proveedores, del Libro de
// Compras de facturacion.cl. Lo ve y lo trae quien ve «Documentos»
// (`facturacion_documentos`: operaciones y el administrador, de fábrica).
// Desde el 08-11 (§9.30), «Aceptar» y «Reclamar»: solo el administrador,
// dentro de «Documentos» (`@DentroDe`), porque tiene efecto legal.

/** «Aceptar» o «Reclamar» un documento recibido (§9.30). */
export class AcuseDto {
  @IsString()
  @Matches(/^\d{6,8}-[\dkK]$/, {
    message: 'El RUT del emisor va sin puntos y con guion',
  })
  rut_emisor: string;

  @IsInt()
  @Min(1)
  tipo: number;

  @IsInt()
  @Min(1)
  folio: number;

  @IsIn(['aceptar', 'reclamar'])
  accion: 'aceptar' | 'reclamar';
}

@Derecho('facturacion')
@Controller('facturacion/recibidos')
export class RecibidosController {
  constructor(
    private readonly recibidos: RecibidosService,
    private readonly boletas: BoletasService,
  ) {}

  @Permiso('facturacion_documentos')
  @Get()
  @Roles(...OPERATIONS_AND_UP)
  delMes(@Query() q: PeriodoDto, @CurrentUser() user: User) {
    return this.recibidos.delMes(user.company_id, q.periodo);
  }

  @Permiso('facturacion_documentos')
  @Post('traer')
  @Roles(...OPERATIONS_AND_UP)
  traer(@Body() dto: PeriodoDto, @CurrentUser() user: User) {
    return this.recibidos.traer(user.company_id, dto.periodo);
  }

  @Permiso('facturacion_documentos')
  @Get('pendientes')
  @Roles(...OPERATIONS_AND_UP)
  pendientes(@CurrentUser() user: User) {
    return this.recibidos.pendientes(user.company_id);
  }

  @DentroDe('facturacion_documentos')
  @Post('acuse')
  @Roles(...ADMIN_ONLY)
  async acuse(@Body() dto: AcuseDto, @CurrentUser() user: User) {
    return this.recibidos.acuse(user.company_id, dto, {
      id: user.id ?? null,
      nombre: await this.boletas.nombreDe(user),
    });
  }
}
