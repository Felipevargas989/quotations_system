import { Injectable } from '@nestjs/common';
import type { User } from 'src/users/entities/user.entity';

// LO QUE BELIA YA LEYÓ EN LA CONVERSACIÓN (Felipe, 04-11-2026: «que no
// vuelva a leer lo mismo»: en la conversación de la 739 leyó cotizaciones 16
// veces en 10 preguntas).
//
// A la IA solo le viajan los textos de la conversación, no lo que leyó, y por
// eso volvía a pedir cada ficha. Ahora el motor anota qué cotizaciones
// revisó y, en las preguntas que siguen, se las trae al día desde la base,
// sin pasar por la IA: ella se ahorra la vuelta y nunca trabaja con una
// ficha vieja.
//
// Vive en la memoria del motor, por persona: un reinicio la borra y BelIA
// las vuelve a leer, como antes. «Nueva conversación» también la borra.

/** Cuántas fichas viajan como mucho, y por cuánto tiempo desde que BelIA
 *  las leyó. */
export const MAX_FICHAS_AL_DIA = 3;
export const MINUTOS_AL_DIA = 20;

/** Con más personas que esto en la memoria, se limpian las vencidas. */
const MAX_PERSONAS = 500;

type Persona = Pick<User, 'company_id' | 'id'>;
type Leida = { numero: number; leida: number };

@Injectable()
export class LoLeido {
  private readonly porPersona = new Map<string, Leida[]>();

  private llave(u: Persona): string {
    return `${u.company_id}:${u.id}`;
  }

  /** BelIA leyó esta cotización (la más nueva va primero). */
  anotar(u: Persona, numero: number, ahora = Date.now()): void {
    if (this.porPersona.size >= MAX_PERSONAS) this.limpiar(ahora);
    const k = this.llave(u);
    const lista = (this.porPersona.get(k) ?? []).filter(
      (x) => x.numero !== numero,
    );
    lista.unshift({ numero, leida: ahora });
    this.porPersona.set(k, lista.slice(0, MAX_FICHAS_AL_DIA));
  }

  /** Las que leyó hace menos de MINUTOS_AL_DIA, la más nueva primero. */
  recientes(u: Persona, ahora = Date.now()): number[] {
    const k = this.llave(u);
    const vivas = (this.porPersona.get(k) ?? []).filter(
      (x) => ahora - x.leida <= MINUTOS_AL_DIA * 60_000,
    );
    if (vivas.length > 0) this.porPersona.set(k, vivas);
    else this.porPersona.delete(k);
    return vivas.map((x) => x.numero);
  }

  /** «Nueva conversación», o le cambiaron el cargo. */
  olvidar(u: Persona): void {
    this.porPersona.delete(this.llave(u));
  }

  private limpiar(ahora: number): void {
    for (const [k, lista] of this.porPersona) {
      if (lista.every((x) => ahora - x.leida > MINUTOS_AL_DIA * 60_000)) {
        this.porPersona.delete(k);
      }
    }
  }
}
