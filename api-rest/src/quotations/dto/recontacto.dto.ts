import { IsBoolean } from 'class-validator';

// El cuerpo de POST /quotations/:id/recontactado. Existe por el
// ValidationPipe global (whitelist + forbidNonWhitelisted): sin DTO, el
// cuerpo se rechaza entero.
export class RecontactoDto {
  // true = quedó marcado como "ya lo llamé"; false = se quita la marca.
  @IsBoolean()
  marcado: boolean;
}
