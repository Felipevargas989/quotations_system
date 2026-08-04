import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Bitácora comercial (03-08): company_id y el autor NO viajan en el
// body — salen de la sesión (mismo aislamiento que proveedores).
export class CreateQuotationFollowupDto {
  @IsString()
  @IsNotEmpty()
  quotation_id: string;

  // El largo real lo corta acá; el service además hace trim y rechaza
  // notas que son puro espacio (el @IsNotEmpty no las ve).
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;

  @IsOptional()
  @IsIn(['llamada', 'correo', 'reunion', 'whatsapp', 'otro'])
  tipo?: string;

  // Fecha ISO yyyy-mm-dd (columna date, sin hora).
  @IsOptional()
  @IsString()
  next_contact_date?: string;
}
