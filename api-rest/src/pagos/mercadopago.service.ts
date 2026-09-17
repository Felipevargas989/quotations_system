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

export type PlanEnMercadoPago = {
  reason?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  };
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

  /** El plan real, tal como está en la cuenta de Felipe: su nombre y
   *  su recurrencia (monto, moneda, frecuencia). Mercado Pago es la
   *  única fuente de la verdad de los precios. */
  async leerPlan(plan: Exclude<Plan, null>): Promise<PlanEnMercadoPago> {
    const delPlan = (await this.llamar(
      'GET',
      `/preapproval_plan/${encodeURIComponent(this.planId(plan))}`,
    )) as PlanEnMercadoPago;
    if (!delPlan.auto_recurring?.transaction_amount) {
      throw new Error(
        `el plan ${plan} no tiene monto en Mercado Pago: no puedo armar la suscripción`,
      );
    }
    return delPlan;
  }

  /** El precio mensual de un plan, leído del plan real. */
  async precioDelPlan(plan: Exclude<Plan, null>): Promise<number> {
    const delPlan = await this.leerPlan(plan);
    return delPlan.auto_recurring!.transaction_amount!;
  }

  /**
   * Pide a Mercado Pago la suscripción PROPIA de una empresa (plan §2:
   * un enlace fijo no identifica quién pagó). El external_reference
   * lleva `empresa:plan`: cuando llegue el aviso, el sistema sabe
   * exactamente a quién activar y en qué plan.
   *
   * MEDIDO EL 17-09-2026, no supuesto: crear la suscripción COLGANDO
   * del plan (`preapproval_plan_id`) exige `card_token_id` — o sea la
   * tarjeta al tiro, sin checkout. El modelo documentado para que el
   * cliente ponga su tarjeta DESPUÉS es la suscripción "con pago
   * pendiente", que va sin plan en la llamada. Para no duplicar los
   * precios, el monto y la frecuencia SE LEEN del plan real de Felipe
   * (GET /preapproval_plan): Mercado Pago sigue siendo la única fuente
   * de la verdad de los montos.
   */
  async crearSuscripcion(
    plan: Exclude<Plan, null>,
    companyId: number,
    correoDelPagador: string,
    backUrl: string,
  ): Promise<SuscripcionCreada> {
    const delPlan = await this.leerPlan(plan);
    const recurrencia = delPlan.auto_recurring!;
    // El payer_email es OBLIGATORIO (medido el 17-09: sin él,
    // "payer_email is required") y el proveedor VETA los dominios
    // desechables (con mailinator respondió "User bad request"). Al
    // autorizar en el checkout, Mercado Pago asocia al que se loguea;
    // a la empresa la amarra el external_reference, no el correo.
    const respuesta = await this.llamar('POST', '/preapproval', {
      payer_email: correoDelPagador,
      reason: delPlan.reason || `Eventia · plan ${plan}`,
      auto_recurring: {
        frequency: recurrencia.frequency ?? 1,
        frequency_type: recurrencia.frequency_type ?? 'months',
        transaction_amount: recurrencia.transaction_amount,
        currency_id: recurrencia.currency_id ?? 'CLP',
      },
      external_reference: `${companyId}:${plan}`,
      back_url: backUrl,
      status: 'pending',
    });
    const { id, init_point } = respuesta as SuscripcionCreada;
    if (!id || !init_point) {
      throw new Error(
        `Mercado Pago no devolvió la suscripción completa: ${JSON.stringify(respuesta).slice(0, 200)}`,
      );
    }
    // El fallo abierto del proveedor (issue 480, anotado en el plan §2
    // desde el 15-09): el enlace del flujo "pago pendiente" viene con
    // `&activation=true` y esa dirección muestra "esta página no
    // existe". El arreglo documentado es quitarle el parámetro.
    const enlace = init_point
      .replace(/[?&]activation=true/, (m) => (m.startsWith('?') ? '?' : ''))
      .replace(/\?&/, '?')
      .replace(/\?$/, '');
    return { id, init_point: enlace };
  }

  /**
   * El monto mensual de una suscripción viva cambia (cambio de plan,
   * 18-09-2026): el próximo cobro sale con el precio nuevo. La fecha
   * del cobro no se mueve.
   */
  async actualizarMontoSuscripcion(
    preapprovalId: string,
    monto: number,
  ): Promise<void> {
    await this.llamar(
      'PUT',
      `/preapproval/${encodeURIComponent(preapprovalId)}`,
      {
        auto_recurring: { transaction_amount: monto, currency_id: 'CLP' },
      },
    );
  }

  /**
   * Un pago ÚNICO (no recurrente): el proporcional de una subida de
   * plan (18-09-2026). Va por Checkout Pro con la referencia
   * `cambio:empresa:plan`, y su aviso llega por el mismo webhook como
   * `payment`.
   */
  async crearPagoUnico(datos: {
    monto: number;
    titulo: string;
    referencia: string;
    correoDelPagador: string;
    backUrl: string;
  }): Promise<{ id: string; init_point: string }> {
    const respuesta = (await this.llamar('POST', '/checkout/preferences', {
      items: [
        {
          title: datos.titulo,
          quantity: 1,
          unit_price: datos.monto,
          currency_id: 'CLP',
        },
      ],
      payer: { email: datos.correoDelPagador },
      external_reference: datos.referencia,
      back_urls: {
        success: datos.backUrl,
        pending: datos.backUrl,
        failure: datos.backUrl,
      },
      auto_return: 'approved',
    })) as { id?: string; init_point?: string };
    if (!respuesta.id || !respuesta.init_point) {
      throw new Error(
        `Mercado Pago no devolvió el pago único completo: ${JSON.stringify(respuesta).slice(0, 200)}`,
      );
    }
    return { id: respuesta.id, init_point: respuesta.init_point };
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
    metodo: 'GET' | 'POST' | 'PUT',
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
