import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ComprasService } from './compras.service';

// La pestaña «Stock» de Proveedores (doc 25): subir compras, revisar y
// aplicar costos con check y los cortes y marcas equivalentes. La bodega
// salió el 23-11-2026 (doc 25 D16).
// Misma puerta que Compras: operaciones y administración, sección
// Proveedores, plan con logística.

export class CambiarLineaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supply_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cantidad_base?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number | null;

  @IsOptional()
  @IsBoolean()
  no_es_insumo?: boolean;
}

export class AplicarCompraDto {
  @IsArray()
  @ArrayMaxSize(300)
  @IsInt({ each: true })
  lineas!: number[];
}

export class EquivalenteDto {
  @Type(() => Number)
  @IsInt()
  supply_id!: number;

  @IsString()
  @MaxLength(80)
  nombre!: string;

  @IsIn(['corte', 'marca'])
  tipo!: 'corte' | 'marca';
}

@Derecho('logistica')
@Roles(...OPERATIONS_AND_UP)
@Permiso('proveedores')
@Controller('logistics/stock')
export class ComprasController {
  constructor(private readonly servicio: ComprasService) {}

  @Get()
  estado(@CurrentUser() user: User) {
    return this.servicio.estado(user.company_id);
  }

  @Post('compras')
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  subir(
    @CurrentUser() user: User,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    return this.servicio.subir(user.company_id, user.id ?? null, archivo);
  }

  @Patch('compras/lineas/:id')
  cambiarLinea(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarLineaDto,
  ) {
    return this.servicio.cambiarLinea(user.company_id, id, dto);
  }

  @Post('compras/:id/aplicar')
  aplicar(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AplicarCompraDto,
  ) {
    return this.servicio.aplicar(user.company_id, id, dto.lineas);
  }

  @Post('compras/:id/descartar')
  descartar(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.descartar(user.company_id, id);
  }

  @Post('equivalentes')
  agregarEquivalente(@CurrentUser() user: User, @Body() dto: EquivalenteDto) {
    return this.servicio.agregarEquivalente(
      user.company_id,
      dto.supply_id,
      dto.nombre,
      dto.tipo,
    );
  }

  @Delete('equivalentes/:id')
  borrarEquivalente(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.servicio.borrarEquivalente(user.company_id, id);
  }
}
