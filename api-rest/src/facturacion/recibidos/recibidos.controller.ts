import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { RecibidosService } from './recibidos.service';

export class PeriodoDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes va como AAAA-MM' })
  periodo: string;
}

// «RECIBIDOS» (doc 19 §9.28): las facturas de los proveedores, del Libro de
// Compras de facturacion.cl. Lo ve y lo trae quien ve «Documentos»
// (`facturacion_documentos`: operaciones y el administrador, de fábrica).
// Solo lee: aceptar o rechazar es el paso 3, con otro OK.
@Derecho('facturacion')
@Controller('facturacion/recibidos')
export class RecibidosController {
  constructor(private readonly recibidos: RecibidosService) {}

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
}
