import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';

// LO QUE LA TORRE DE CONTROL PUEDE CAMBIARLE A UNA EMPRESA (paso 3.2,
// 14-09-2026). Mientras no exista el cobro automático (paso 5), este es el
// lugar donde Felipe vende: le pone el plan a la empresa que le pagó y la
// deja activa. El estado y el plan son los dos únicos textos que la base
// acepta, y acá se validan antes de llegar a ella.
export class ActualizarEmpresaDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsIn(['cotiza', 'gestiona', 'crece'])
  @IsOptional()
  plan?: 'cotiza' | 'gestiona' | 'crece';

  // `gratis` (migración 113) es cortesía: usa todo su plan y el cobro
  // automático no lo persigue. Solo se pone desde acá.
  @IsIn(['prueba', 'activo', 'gratis', 'moroso', 'bloqueado'])
  @IsOptional()
  estado_plan?: 'prueba' | 'activo' | 'gratis' | 'moroso' | 'bloqueado';

  // Null para sacarle el vencimiento a una empresa que ya contrató.
  @IsISO8601()
  @IsOptional()
  prueba_vence?: string | null;
}
