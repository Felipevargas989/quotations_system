import { IsIn } from 'class-validator';
import type { DecisionDelChoque } from '../choques/choques';

// La decisión sobre un choque de fecha (mapa 02 §5.6): «puede seguir» o
// «hay que gestionar». Nada más viaja: la empresa y quién sale de la sesión.
export class DecisionDeChoqueDto {
  @IsIn(['puede_seguir', 'gestionar'])
  decision: DecisionDelChoque;
}
