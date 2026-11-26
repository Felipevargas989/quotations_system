import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  LARGO_DE_PALABRA,
  TOPE_DE_FAMILIAS,
  TOPE_DE_PALABRAS,
} from '../rubro/rubro-de-la-empresa';

/** El rubro de la empresa, solo en una instalación de rubro «general»
 *  (Licita, 25-11): se guarda entero, editado o tal como lo propuso la IA. */
export class GuardarRubroDto {
  /** Prefijos de código ONU de 4, 6 u 8 dígitos. */
  @IsArray()
  @ArrayMaxSize(TOPE_DE_FAMILIAS)
  @IsString({ each: true })
  @Matches(/^(\d{4}|\d{6}|\d{8})$/, {
    each: true,
    message: 'Cada familia ONU tiene que tener 4, 6 u 8 dígitos.',
  })
  onu_familias!: string[];

  @IsArray()
  @ArrayMaxSize(TOPE_DE_PALABRAS)
  @IsString({ each: true })
  @MaxLength(LARGO_DE_PALABRA, { each: true })
  palabras!: string[];

  @IsArray()
  @ArrayMaxSize(TOPE_DE_PALABRAS)
  @IsString({ each: true })
  @MaxLength(LARGO_DE_PALABRA, { each: true })
  palabras_no!: string[];
}
