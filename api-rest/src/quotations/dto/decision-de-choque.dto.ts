import { IsIn } from 'class-validator';
import type { DecisionDelChoque } from '../choques/choques';

// La decisión sobre un tope de calendario (mapa 02 §5.6): solo «Sí, puede
// seguir» (el botón «Hay que gestionar» se quitó el 18-10: el tope mismo es
// la marca). Nada más viaja: la empresa y quién salen de la sesión.
export class DecisionDeChoqueDto {
  @IsIn(['puede_seguir'])
  decision: DecisionDelChoque;
}
