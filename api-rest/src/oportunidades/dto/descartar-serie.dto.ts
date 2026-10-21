import { IsBoolean } from 'class-validator';

/** «Descartar» una serie de «Se viene» (decisión 63), o recuperarla. */
export class DescartarSerieDto {
  @IsBoolean()
  descartada!: boolean;
}
