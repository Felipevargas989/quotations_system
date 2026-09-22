import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { CreateQuotationPublicDto } from './dto/create-quotation-public.dto';

/**
 * LA RED BAJO EL FORMULARIO PÚBLICO (22-09-2026, seguro 1 tras la caída
 * del 21/22-09).
 *
 * Ese día el Hospital San Agustín de Florida intentó cotizar tres veces
 * (80 personas, $1.250.000) mientras la base estaba caída. Las tres
 * fallaron y sus datos de contacto se perdieron para siempre: el
 * registro del motor los tapa por seguridad y la base nunca los recibió.
 *
 * Desde ahora, si el guardado de una solicitud pública falla por lo que
 * sea, este servicio manda un correo de emergencia con TODOS los datos,
 * sin tapar nada, a los super-administradores (SUPER_ADMIN_EMAILS). Va
 * por Resend directo, sin pasar por EmailService, porque EmailService
 * necesita la base para vestir el correo con la marca — y la base es
 * justamente lo que puede estar muerto. Si el correo sale, el visitante
 * ve el mismo "gracias" de siempre: su solicitud llegó a manos humanas.
 * Si ni el correo sale, se rinde con honestidad y el visitante ve el
 * error, como antes.
 *
 * Respeta el silenciador del laboratorio (EMAILS_SILENCED=1): ahí no
 * manda nada, pero deja los datos completos en el registro del motor
 * para poder probarlo.
 */
@Injectable()
export class RescateDelFormularioService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RescateDelFormularioService.name);
  }

  /** Devuelve true si el lead quedó a salvo (correo enviado o silenciado
   *  a propósito en el laboratorio); false si tampoco se pudo. */
  async rescatar(
    dto: CreateQuotationPublicDto,
    companyId: number,
    causa: unknown,
  ): Promise<boolean> {
    const destinatarios = (this.config.get<string>('SUPER_ADMIN_EMAILS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const asunto = `🚨 Cotización rescatada: ${dto.company_name?.trim() || dto.name} · ${dto.event_type} · ${dto.event_date}`;
    const html = this.armarCorreo(dto, companyId, causa);

    if (process.env.EMAILS_SILENCED === '1') {
      this.logger.warn(
        `RESCATE (silenciado en este entorno) empresa ${companyId}: ${JSON.stringify(dto)}`,
      );
      return true;
    }
    if (!destinatarios.length) {
      this.logger.error(
        'RESCATE imposible: SUPER_ADMIN_EMAILS vacío. Datos del lead: ' +
          JSON.stringify(dto),
      );
      return false;
    }
    try {
      const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
      const { error } = await resend.emails.send({
        from: 'Eventia <hola@eventi-app.com>',
        to: destinatarios,
        subject: asunto,
        html,
        ...(dto.email ? { replyTo: dto.email } : {}),
      });
      if (error) throw new Error(mensajeDe(error));
      this.logger.warn(
        `RESCATE: solicitud pública de la empresa ${companyId} enviada por correo a ${destinatarios.length} destinatario(s) porque el guardado falló (${mensajeDe(causa)})`,
      );
      return true;
    } catch (e) {
      // Último recurso: que al menos quede en el registro, sin tapar.
      this.logger.error(
        `RESCATE FALLÓ (${mensajeDe(e)}). Datos del lead: ${JSON.stringify(dto)}`,
      );
      return false;
    }
  }

  private armarCorreo(
    dto: CreateQuotationPublicDto,
    companyId: number,
    causa: unknown,
  ): string {
    const fila = (k: string, v: string | number | undefined | null) =>
      v === undefined || v === null || v === ''
        ? ''
        : `<tr><td style="padding:6px 10px;color:#555;white-space:nowrap">${k}</td><td style="padding:6px 10px"><strong>${escapar(String(v))}</strong></td></tr>`;
    const filas = [
      fila('Empresa u organización', dto.company_name),
      fila('Contacto', dto.name),
      fila('Correo', dto.email),
      fila('Teléfono', dto.phone),
      fila('Tipo de cliente', dto.client_type),
      fila('Tipo de evento', dto.event_type),
      fila('Fecha del evento', dto.event_date),
      fila('Adultos', dto.people_count),
      fila('Niños', dto.children_count),
      fila(
        'Presupuesto estimado',
        dto.budget_estimate != null
          ? `$${Number(dto.budget_estimate).toLocaleString('es-CL')}`
          : undefined,
      ),
      fila('Observaciones', dto.observations),
      fila('Empresa dueña del formulario (id)', companyId),
    ].join('');
    return `<html><body style="font-family:sans-serif;color:#222">
<h2 style="color:#b45309">Una persona cotizó y el sistema no pudo guardarlo</h2>
<p>El formulario público recibió esta solicitud, pero el guardado en la base de datos falló
(<code>${escapar(mensajeDe(causa))}</code>). Estos son los datos completos, para que no se pierda el cliente:</p>
<table style="border-collapse:collapse;border:1px solid #ddd">${filas}</table>
<p style="margin-top:16px">Qué hacer: cuando el sistema vuelva, crea el requerimiento a mano en Eventia y contacta a la persona.
Puedes responder este correo y le llega directo a ella.</p>
<p style="color:#888;font-size:12px">Red de rescate del formulario público · ${new Date().toISOString()}</p>
</body></html>`;
  }
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
