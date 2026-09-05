import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { ClientsService } from 'src/clients/clients.service';
import { EmailService } from 'src/email/email.service';
import { brandEmailTemplate } from 'src/email/templates/brandLayout';
import { escaparHtml } from 'src/email/templates/utils';
import {
  Brochure,
  ConfigDeConsulta,
  Consulta,
  ConsultasRepository,
} from './consultas.repository';

/**
 * EL EMBUDO DE CONSULTAS (05-09, doc 12). Las consultas masivas
 * (matrimonio, paseo de curso, graduación) dejan de crear
 * cotizaciones: quedan acá, reciben el brochure por correo al tiro, y
 * solo las que CONTESTAN se convierten en cotización — con un clic
 * humano, nunca leyendo el buzón.
 *
 * El embudo se activa por configuración: un tipo de evento filtra
 * cuando tiene brochure(s) configurado(s). Sin brochure, el formulario
 * público sigue creando cotización como siempre.
 */

/** Días sin repetir el brochure al mismo correo (regla de una vez). */
const DIAS_SIN_REPETIR = 14;

/** El texto de la casa: cálido, del día, invita a responder. Se usa
 *  cuando el tipo no tiene texto propio configurado. */
const TEXTO_DE_LA_CASA = `Hola {nombre}, ¡gracias por escribirnos!

Nos alegra mucho que estén pensando en celebrar con nosotros. Te adjuntamos el detalle de nuestros programas y valores para que lo revisen con calma.

Si la fecha que tienen en mente les acomoda y quieren que armemos una propuesta a la medida de su grupo, respóndenos este mismo correo y lo vemos de inmediato.

¡Nos encantaría recibirlos!`;

/** El tipo de evento en lenguaje natural, para el asunto. */
const nombreNatural = (eventType: string): string => {
  const mapa: Record<string, string> = {
    Matrimonios: 'matrimonio',
    'Paseo de Curso': 'paseo de curso',
    Graduación: 'graduación',
    'Paseo fin de año': 'paseo de fin de año',
    Celebraciones: 'celebración',
  };
  return mapa[eventType] ?? eventType.toLowerCase();
};

const primerNombre = (nombre: string) =>
  nombre.trim().split(/\s+/)[0] || nombre.trim();

export interface DatosDeConsulta {
  name: string;
  email: string;
  phone: string;
  client_type?: string | null;
  event_type: string;
  event_date?: string | null;
  people_count?: number | null;
  children_count?: number | null;
  observations?: string | null;
}

@Injectable()
export class ConsultasService {
  constructor(
    private readonly repo: ConsultasRepository,
    private readonly clients: ClientsService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsultasService.name);
  }

  /** ¿Este tipo de evento está en el embudo? (tiene brochures) */
  async embudoPara(companyId: number, eventType: string) {
    const c = await this.repo.config(companyId, eventType);
    return c && (c.brochures ?? []).length > 0 ? c : null;
  }

  /**
   * Registra la consulta y manda el brochure al tiro. Si el mismo
   * correo ya consultó este tipo hace menos de 14 días, la consulta
   * queda registrada igual (el rastro sirve) pero sin re-enviar — y
   * si el correo falla, la consulta sobrevive con correo_enviado en
   * false, visible en la lista para reintentar a mano.
   */
  async registrar(
    companyId: number,
    datos: DatosDeConsulta,
    config: ConfigDeConsulta,
  ) {
    const desde = new Date(
      Date.now() - DIAS_SIN_REPETIR * 86_400_000,
    ).toISOString();
    const repetida = await this.repo.consultaReciente(
      companyId,
      datos.email.trim(),
      datos.event_type,
      desde,
    );
    const consulta = await this.repo.crear({
      company_id: companyId,
      name: datos.name,
      email: datos.email.trim(),
      phone: datos.phone,
      client_type: datos.client_type ?? null,
      event_type: datos.event_type,
      event_date: datos.event_date ?? null,
      people_count: datos.people_count ?? null,
      children_count: datos.children_count ?? null,
      observations: datos.observations ?? null,
      estado: 'respondida',
      correo_enviado: false,
      client_id: null,
    });
    if (!repetida) {
      try {
        await this.enviarBrochure(consulta, config, companyId);
        await this.repo.actualizar(consulta.id, companyId, {
          correo_enviado: true,
        });
        consulta.correo_enviado = true;
      } catch (e) {
        this.logger.error(
          `consulta ${consulta.id}: el brochure no salió: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    } else {
      this.logger.info(
        `consulta ${consulta.id}: ${datos.email} ya recibió este brochure hace poco — sin reenvío`,
      );
    }
    return consulta;
  }

  private async enviarBrochure(
    consulta: Consulta,
    config: ConfigDeConsulta,
    companyId: number,
  ) {
    const branding = await this.email.getBranding(companyId);
    const attachments = await Promise.all(
      (config.brochures ?? []).map(async (b: Brochure) => ({
        filename: b.nombre,
        content: (await this.repo.descargarBrochure(b.path)).toString('base64'),
      })),
    );
    const texto = (config.texto?.trim() || TEXTO_DE_LA_CASA).replaceAll(
      '{nombre}',
      primerNombre(consulta.name),
    );
    const bodyHtml = texto
      .split(/\n+/)
      .filter((p) => p.trim())
      .map(
        (p) =>
          `<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px;">${escaparHtml(p.trim())}</p>`,
      )
      .join('');
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: `${branding.companyName} <hola@eventi-app.com>`,
      to: [consulta.email],
      subject: `${branding.companyName}: valores para tu ${nombreNatural(consulta.event_type)}`,
      html: brandEmailTemplate({ branding, bodyHtml }),
      attachments,
      ...(branding.replyTo ? { replyTo: branding.replyTo } : {}),
    });
    if (error) throw new Error(error.message);
  }

  listar(companyId: number) {
    return this.repo.listar(companyId);
  }

  configs(companyId: number) {
    return this.repo.configs(companyId);
  }

  async guardarConfig(
    companyId: number,
    eventType: string,
    cambios: { texto?: string | null; brochures?: Brochure[] },
  ) {
    if ((cambios.brochures ?? []).length > 2) {
      throw new BadRequestException('Máximo 2 brochures por tipo de evento');
    }
    return this.repo.guardarConfig(companyId, eventType, cambios);
  }

  /**
   * CONVERTIR EN COTIZACIÓN: el clic humano cuando el interesado
   * contestó. Matchea o crea el CLIENTE (la misma lógica
   * anti-duplicados del formulario público) y devuelve su id; la
   * pantalla abre el cotizador con todo precargado. Idempotente: una
   * consulta ya convertida devuelve su cliente sin duplicar nada.
   */
  async convertir(id: number, companyId: number) {
    const c = await this.repo.una(id, companyId);
    if (!c) throw new NotFoundException('No existe esa consulta');
    if (c.estado === 'convertida' && c.client_id) {
      return { consulta: c, client_id: c.client_id };
    }
    const existente = await this.clients.findMatch(companyId, c.email, c.phone);
    let clientId: string;
    if (existente) {
      clientId = existente.id;
    } else {
      const nuevo = await this.clients.create(
        {
          name: c.name,
          email: c.email,
          phone: c.phone,
          // El formulario público siempre manda el tipo; si una
          // consulta vieja no lo trajera, Particulares es el neutro.
          client_type: c.client_type ?? 'Particulares',
        },
        companyId,
      );
      clientId = nuevo.id;
    }
    const actualizada = await this.repo.actualizar(id, companyId, {
      estado: 'convertida',
      client_id: clientId,
    });
    this.logger.info(`consulta ${id} convertida: cliente ${clientId}`);
    return { consulta: actualizada, client_id: clientId };
  }

  async descartar(id: number, companyId: number) {
    const c = await this.repo.una(id, companyId);
    if (!c) throw new NotFoundException('No existe esa consulta');
    if (c.estado === 'convertida') {
      throw new BadRequestException('Una consulta convertida no se descarta');
    }
    return this.repo.actualizar(id, companyId, { estado: 'descartada' });
  }
}
