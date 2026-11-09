import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Public } from 'src/auth/public.decorator';
import { RobotOcService } from './robot-oc.service';

/** Lo que manda la rutina de correo (multipart: estos campos + `archivo`). */
export class OcDelCorreoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  numero: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  total: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string;

  /** Del que la mandó y del comprador que nombra la OC, separados por coma. */
  @Transform(({ value }: { value: unknown }) =>
    (Array.isArray(value)
      ? (value as unknown[])
      : typeof value === 'string'
        ? value.split(',')
        : []
    )
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter(Boolean),
  )
  @IsArray()
  @IsEmail({}, { each: true })
  correos: string[];

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'si',
  )
  @IsBoolean()
  probar?: boolean;
}

/**
 * LA PUERTA DEL ROBOT DE ÓRDENES DE COMPRA (doc 23). Sin sesión de
 * persona: la abre la llave del robot (`x-robot-key`), que solo sirve para
 * esto y solo para la empresa de `ROBOT_OC_EMPRESA`.
 */
@Public()
@Controller('robot/ordenes-de-compra')
export class RobotOcController {
  constructor(private readonly servicio: RobotOcService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  recibir(
    @Headers('x-robot-key') llave: string | undefined,
    @Body() dto: OcDelCorreoDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    const empresa = this.servicio.revisarLlave(llave);
    return this.servicio.recibir(
      empresa,
      { ...dto, probar: dto.probar === true },
      archivo,
    );
  }
}
