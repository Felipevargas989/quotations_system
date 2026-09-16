import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Plan } from 'src/auth/derechos';

// EL QUE HABLA CON MERCADO PAGO (16-09-2026, sprint B del paso 4+5).
//
// Sin SDK, a propósito: son tres llamadas HTTP y el SDK oficial
// arrastra un fallo abierto en el enlace de activación (issue 480,
// anotado en el plan §2). fetch nativo de Node 20 y listo.
//
// El token vive en Railway (MP_ACCESS_TOKEN), jamás en el código ni en
// el chat. Los identificadores de los tres planes son públicos —van en
// la URL del checkout— así que llevan su valor real como respaldo,
// pero Railway puede pisarlos (para probar con planes de mentira en el
// laboratorio, por ejemplo).

const API = 'https://api.mercadopago.com';

/** Los tres planes que Felipe creó en su cuenta el 16-09-2026. */
const PLANES_POR_DEFECTO: Record<Exclude<Plan, null>, string> = {
  cotiza: 'd8142aa2a86c4fe8a65487a35ab1a1c5',
  gestiona: 'f0703e38787e40949e02a92c9c9a1b61',
  crece: 'a6d5856f4fc34ffdb6bae68f962e4d20',
};

export type SuscripcionCreada = {
  id: string;
  init_point: string;
};

export type SuscripcionEnMercadoPago = {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  preapproval_plan_id?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
};

export type PagoEnMercadoPago = {
  id: number | string;
  status: string; // approved | rejected | ...
  external_reference?: string;
  metadata?: { preapproval_id?: string };
};

@Injectable()
export class MercadoPagoService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MercadoPagoService.name);
  }

  /** ¿Está el token puesto en Railway? Sin él, el cobro no existe. */
  configurado(): boolean {
    return Boolean(this.config.get<string>('MP_ACCESS_TOKEN'));
  }

  get secretoDelWebhook(): string | undefined {
    return this.config.get<string>('MP_WEBHOOK_SECRET');
  }

  planId(plan: Exclude<Plan, null>): string {
    const porVariable = {
      cotiza: this.config.get<string>('MP_PLAN_COTIZA'),
      gestiona: this.config.get<string>('MP_PLAN_GESTIONA'),
      crece: this.config.get<string>('MP_PLAN_CRECE'),
    }[plan];
    return porVariable || PLANES_POR_DEFECTO[plan];
  }

  /** El plan de la casa al que corresponde un plan_id del proveedor. */
  planDe(preapprovalPlanId: string | undefined): Exclude<Plan, null> | null {
    if (!preapprovalPlanId) return null;
    for (const plan of ['cotiza', 'gestiona', 'crece'] as const) {
      if (this.planId(plan) === preapprovalPlanId) return plan;
    }
    return null;
  }

  /**
   * Pide a Mercado Pago la suscripción PROPIA de una empresa (plan §2:
   * un enlace fijo no identifica quién pagó). El external_reference
   * lleva el id de la empresa: cuando llegue el aviso, el sistema sabe
   * exactamente a quién activar.
   */
  async crearSuscripcion(
    plan: Exclude<Plan, null>,
    companyId: number,
    correoDelPagador: string,
    backUrl: string,
  ): Promise<SuscripcionCreada> {
    const respuesta = await this.llamar('POST', '/preapproval', {
      preapproval_plan_id: this.planId(plan),
      payer_email: correoDelPagador,
      external_reference: String(companyId),
      back_url: backUrl,
      status: 'pending',
    });
    const { id, init_point } = respuesta as SuscripcionCreada;
    if (!id || !init_point) {
      throw new Error(
        `Mercado Pago no devolvió la suscripción completa: ${JSON.stringify(respuesta).slice(0, 200)}`,
      );
    }
    return { id, init_point };
  }

  /** La verdad de una suscripción. El webhook JAMÁS confía en el cuerpo
   *  del aviso: siempre se consulta acá (plan §3.2 punto 10). */
  async consultarSuscripcion(id: string): Promise<SuscripcionEnMercadoPago> {
    return (await this.llamar(
      'GET',
      `/preapproval/${encodeURIComponent(id)}`,
    )) as SuscripcionEnMercadoPago;
  }

  /** La verdad de un pago puntual (aviso `payment`). */
  async consultarPago(id: string): Promise<PagoEnMercadoPago> {
    return (await this.llamar(
      'GET',
      `/v1/payments/${encodeURIComponent(id)}`,
    )) as PagoEnMercadoPago;
  }

  private async llamar(
    metodo: 'GET' | 'POST',
    ruta: string,
    cuerpo?: Record<string, unknown>,
  ): Promise<unknown> {
    const token = this.config.get<string>('MP_ACCESS_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'El cobro automático aún no está configurado',
      );
    }
    const respuesta = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await respuesta.text();
    if (!respuesta.ok) {
      this.logger.error(
        `Mercado Pago ${metodo} ${ruta} respondió ${respuesta.status}: ${texto.slice(0, 300)}`,
      );
      throw new Error(`Mercado Pago respondió ${respuesta.status}`);
    }
    try {
      return JSON.parse(texto) as unknown;
    } catch {
      throw new Error(`Mercado Pago devolvió algo que no es JSON`);
    }
  }
}
