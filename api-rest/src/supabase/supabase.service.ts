import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * EL TOPE DE TIEMPO HACIA LA BASE (22-09-2026, seguro 2 tras la caída del
 * 21/22-09). Antes ninguna consulta se rendía: cuando la puerta de datos
 * de Supabase se trabó, cada petición esperó 60-123 s y la aplicación
 * entera se colgó durante 27 horas sin que nadie lo notara. Ahora toda
 * llamada a la base tiene un tope (10 s por defecto, `TOPE_BASE_MS` en
 * Railway para ajustarlo): pasado el tope, falla rápido con un error
 * claro y el resto del motor sigue vivo para avisar.
 */
const TOPE_POR_DEFECTO_MS = 10_000;

/** La excepción, para lo que la base hace de una sola vez y de noche, como
 *  resumir un mes del mercado (decisión 109, 29-10): un mes grande tardó
 *  más de 10 s en el laboratorio y el motor lo cortaba. La función de la
 *  base lleva su propio tope de 60 s; el motor espera un poco más, para que
 *  el error, si llega, sea el de la base. */
const TOPE_DE_LOS_TRABAJOS_LARGOS_MS = 75_000;

@Injectable()
export class SupabaseService {
  private readonly supabase: SupabaseClient;
  private readonly largo: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.',
      );
    }

    const tope =
      Number(this.configService.get<string>('TOPE_BASE_MS')) ||
      TOPE_POR_DEFECTO_MS;

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { fetch: conTope(tope) },
    });
    this.largo = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        fetch: conTope(Math.max(tope, TOPE_DE_LOS_TRABAJOS_LARGOS_MS)),
      },
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  /** Solo para un trabajo largo que la base hace de una vez y de noche:
   *  tope de 75 s en vez de 10. Todo lo demás usa `client`. */
  get clientParaTrabajosLargos(): SupabaseClient {
    return this.largo;
  }
}

/** Un fetch que se rinde a los `ms` milisegundos. Si la llamada ya traía
 *  su propia señal de cancelación, se respetan las dos. */
export const conTope =
  (ms: number): typeof fetch =>
  (entrada: RequestInfo | URL, init?: RequestInit) => {
    const reloj = AbortSignal.timeout(ms);
    const propia: AbortSignal | null | undefined = init?.signal;
    const senal = propia ? AbortSignal.any([propia, reloj]) : reloj;
    return fetch(entrada, { ...init, signal: senal });
  };
