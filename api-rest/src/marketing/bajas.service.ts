import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { MarketingRepository } from './marketing.repository';

/**
 * LA PUERTA PÚBLICA DEL MARKETING: la baja firmada (HMAC, sin sesión)
 * y el webhook de Resend (sellos + supresión de rebotes).
 *
 * Nació el 27-08 cuando la cerca de tamaño pilló a marketing.service
 * cruzando las 800 líneas: esta es la pieza extraída (higuera, no
 * reescritura). Todo lo que entra por acá viene de INTERNET sin
 * sesión — por eso vive junto: firma, validación y proceso.
 */
@Injectable()
export class BajasService {
  constructor(
    private readonly repo: MarketingRepository,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BajasService.name);
  }

  // ---- La baja firmada: HMAC del correo, sin sesión ----
  private secreto(): string {
    return (
      this.config.get<string>('MARKETING_BAJA_SECRET') ??
      (this.config.get<string>('RESEND_API_KEY') as string)
    );
  }

  firmaDeBaja(companyId: number, email: string): string {
    return createHmac('sha256', this.secreto())
      .update(`${companyId}|${email.toLowerCase()}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** La dirección pública de ESTE backend. La lección del 26-08: el
   *  respaldo apuntaba a producción y el enlace de baja del laboratorio
   *  llevaba a una puerta inexistente. Railway inyecta el dominio
   *  propio del servicio: cada ambiente apunta a sí mismo. */
  private baseApi(): string {
    const configurada = this.config.get<string>('PUBLIC_API_URL');
    if (configurada) return configurada.replace(/\/+$/, '');
    const dominio = this.config.get<string>('RAILWAY_PUBLIC_DOMAIN');
    if (dominio) return `https://${dominio}`;
    return 'https://api-rest-production-d404.up.railway.app';
  }

  urlDeBaja(companyId: number, email: string, campaignId?: number): string {
    const e = Buffer.from(email.toLowerCase()).toString('base64url');
    // ca va FUERA de la firma: es atribución (de qué campaña vino la
    // baja), no seguridad — así los links viejos siguen siendo válidos.
    const ca = campaignId ? `&ca=${String(campaignId)}` : '';
    return `${this.baseApi()}/marketing/baja?c=${String(companyId)}&e=${e}&t=${this.firmaDeBaja(companyId, email)}${ca}`;
  }

  /** Valida el enlace de baja SIN ejecutarla. Endurecido (revisión
   *  26-08): parámetros ausentes o basura devuelven null, nunca 500 —
   *  es la ruta que la ley exige que funcione. */
  bajaValida(
    c?: string,
    e?: string,
    t?: string,
  ): { companyId: number; email: string } | null {
    if (
      typeof c !== 'string' ||
      typeof e !== 'string' ||
      typeof t !== 'string'
    ) {
      return null;
    }
    const companyId = Number(c);
    let email = '';
    try {
      email = Buffer.from(e, 'base64url').toString('utf8');
    } catch {
      return null;
    }
    if (!companyId || !email.includes('@')) return null;
    const esperada = Buffer.from(this.firmaDeBaja(companyId, email));
    const dada = Buffer.from(t);
    if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) {
      return null;
    }
    return { companyId, email };
  }

  async procesarBaja(
    c?: string,
    e?: string,
    t?: string,
    ca?: string,
  ): Promise<boolean> {
    const valida = this.bajaValida(c, e, t);
    if (!valida) return false;
    const campaignId = ca && /^\d+$/.test(ca) ? Number(ca) : undefined;
    await this.repo.suprimir(
      valida.companyId,
      valida.email,
      'baja',
      campaignId,
    );
    this.logger.info(`baja de marketing: ${valida.email}`);
    return true;
  }

  /** El estándar de baja de los grandes: Gmail/Outlook muestran su
   *  propio botón "Darse de baja" leyendo estas cabeceras, y el POST
   *  de un clic cae en la misma ruta firmada. */
  cabecerasDeBaja(companyId: number, email: string, campaignId?: number) {
    return {
      'List-Unsubscribe': `<${this.urlDeBaja(companyId, email, campaignId)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  /**
   * El webhook de Resend (abierto/click/rebote/queja). Con
   * RESEND_WEBHOOK_SECRET configurado se verifica la firma Svix; sin
   * él se procesa igual (el evento solo marca sellos por resend_id) y
   * queda avisado en el log.
   */
  verificarFirmaSvix(
    payload: string,
    headers: { id?: string; timestamp?: string; firma?: string },
  ): boolean {
    const secreto = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secreto) {
      // FAIL-CLOSED en producción (revisión 26-08): sin secreto no se
      // acepta nada — antes procesaba igual y cualquiera podía marcar
      // aperturas o suprimir correos a punta de rebotes falsos.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('webhook sin RESEND_WEBHOOK_SECRET: RECHAZADO');
        return false;
      }
      this.logger.warn('webhook sin RESEND_WEBHOOK_SECRET: sin verificar');
      return true;
    }
    if (!headers.id || !headers.timestamp || !headers.firma) return false;
    // Tolerancia ±5 minutos: una notificación capturada no sirve para
    // siempre (anti-replay, igual que el verificador oficial de Svix).
    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return false;
    }
    const llave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64');
    const esperada = createHmac('sha256', llave)
      .update(`${headers.id}.${headers.timestamp}.${payload}`)
      .digest();
    return headers.firma.split(' ').some((f) => {
      const dada = Buffer.from(f.replace(/^v1,/, ''), 'base64');
      return dada.length === esperada.length && timingSafeEqual(dada, esperada);
    });
  }

  async procesarEventoResend(evento: {
    type?: string;
    data?: { email_id?: string };
  }) {
    const resendId = evento.data?.email_id;
    if (!resendId || !evento.type) return { ok: true };
    const ahora = new Date().toISOString();
    const sello: Record<string, unknown> | null =
      evento.type === 'email.opened'
        ? { opened_at: ahora }
        : evento.type === 'email.clicked'
          ? { clicked_at: ahora, opened_at: ahora }
          : evento.type === 'email.bounced' ||
              evento.type === 'email.complained'
            ? { bounced_at: ahora }
            : null;
    if (!sello) return { ok: true };
    const fila = await this.repo.marcarEvento(resendId, sello);
    // EL REBOTE DURO SE SUPRIME SOLO (regla de la Fase 2): no se le
    // insiste nunca más a una casilla que no existe o que reclamó.
    if (fila && sello.bounced_at) {
      await this.repo.suprimir(
        fila.company_id,
        fila.email,
        'rebote',
        fila.campaign_id,
      );
      this.logger.info(`rebote suprimido: ${fila.email}`);
    }
    return { ok: true };
  }
}
