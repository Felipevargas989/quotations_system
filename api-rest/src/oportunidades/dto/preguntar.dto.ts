import { IsString, MaxLength, MinLength } from 'class-validator';

/** Una pregunta a la IA sobre las bases de una oportunidad (decisión 67). */
export class PreguntarDto {
  @IsString()
  @MinLength(3)
  @MaxLength(600)
  pregunta!: string;
}
