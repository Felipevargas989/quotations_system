import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// El aviso de cierre al rechazar (Felipe, 04-11-2026): el texto viaja
// EDITADO desde el pop-up. El destino no viaja: lo calcula el motor con
// la misma regla del envío de la cotización.
export class AvisoDeCierreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  asunto: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  cuerpo: string;
}
