import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { ClientContactsRepository } from 'src/clients/client-contacts.controller';
import { ClientsService } from 'src/clients/clients.service';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { escaparHtml } from 'src/email/templates/utils';
import { marcaDesdeFila } from 'src/marketing/marca';
import { plantillaCampana } from 'src/marketing/plantilla';
import {
  Brochure,
  ConfigDeConsulta,
  Consulta,
  ConsultasRepository,
} from './consultas.repository';
import { EventTypesService } from './event-types.service';

/**
 * EL EMBUDO DE CONSULTAS (05-09, doc 12). Las consultas masivas
 * (matrimonio, paseo de curso, graduación) dejan de crear
 * cotizaciones: quedan acá, reciben el brochure por correo 10 minutos
 * después (el reloj de consultas-cron; una respuesta instantánea
 * delata al robot), y solo las que CONTESTAN se convierten en
 * cotización — con un clic humano, nunca leyendo el buzón.
 *
 * El embudo se activa por configuración: un tipo de evento filtra
 * cuando tiene brochure(s) configurado(s). Sin brochure, el formulario
 * público sigue creando cotización como siempre.
 */

/** Días sin repetir el brochure al mismo correo (regla de una vez). */
const DIAS_SIN_REPETIR = 14;

/** El delay de la respuesta automática (Felipe, 05-09): 10 minutos
 *  entre que la consulta entra y el brochure sale. */
export const RETRASO_DEL_CORREO_MS = 10 * 60_000;

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
  company_name?: string | null;
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
    private readonly tipos: EventTypesService,
    private readonly clients: ClientsService,
    private readonly contactos: ClientContactsRepository,
    private readonly companies: CompaniesRepository,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsultasService.name);
  }

  /** ¿Este tipo de evento entra como CONSULTA? La decide su categoría
   *  en el catálogo (segunda vuelta de Felipe, 05-09) — ya no la
   *  existencia de brochure. Devuelve solo el veredicto: la config del
   *  correo la relee el reloj al despachar (revisión 06-09 — antes se
   *  traía de la base para que nadie la usara).
   */
  async embudoPara(companyId: number, eventType: string): Promise<boolean> {
    const entrada = await this.tipos.entradaDe(companyId, eventType);
    return entrada === 'consulta';
  }

  /**
   * Registra la consulta y CITA el brochure para dentro de 10 minutos
   * (el reloj de consultas-cron lo despacha; la config del tipo se
   * relee recién al enviar). Si el mismo correo ya consultó este tipo
   * hace menos de 14 días, la consulta queda registrada igual (el
   * rastro sirve) pero sin cita — y si el envío del reloj falla, la
   * consulta sobrevive con correo_enviado en false, visible en la
   * lista.
   */
  async registrar(companyId: number, datos: DatosDeConsulta) {
    const desde = new Date(
      Date.now() - DIAS_SIN_REPETIR * 86_400_000,
    ).toISOString();
    const repetida = await this.repo.consultaReciente(
      companyId,
      datos.email.trim(),
      datos.event_type,
      desde,
    );
    // El delay del embudo (Felipe, 05-09: "un delay de 10 min para las
    // respuestas automáticas"): la consulta queda CITADA y el reloj del
    // motor la despacha — una respuesta instantánea delata al robot.
    const consulta = await this.repo.crear({
      company_id: companyId,
      name: datos.name,
      email: datos.email.trim(),
      phone: datos.phone,
      client_type: datos.client_type ?? null,
      company_name: datos.company_name?.trim() || null,
      event_type: datos.event_type,
      event_date: datos.event_date ?? null,
      people_count: datos.people_count ?? null,
      children_count: datos.children_count ?? null,
      observations: datos.observations ?? null,
      estado: 'respondida',
      correo_enviado: false,
      correo_programado_para: repetida
        ? null
        : new Date(Date.now() + RETRASO_DEL_CORREO_MS).toISOString(),
      client_id: null,
    });
    if (repetida) {
      this.logger.info(
        `consulta ${consulta.id}: ${datos.email} ya recibió este brochure hace poco — sin reenvío`,
      );
    }
    return consulta;
  }

  /**
   * El tick del reloj (consultas-cron): despacha las consultas cuya
   * hora citada llegó. La config del tipo se relee AL ENVIAR — si en
   * esos 10 minutos subieron un brochure nuevo, sale el bueno. El
   * candado atómico garantiza un solo despacho; si el envío falla,
   * queda visible como no-enviada con el error en el log (el patrón
   * del reloj de campañas: jamás reintentos infinitos silenciosos).
   */
  async despacharPendientes() {
    const pendientes = await this.repo.pendientesDeEnvio(
      new Date().toISOString(),
    );
    for (const c of pendientes) {
      const tomada = await this.repo.tomarEnvio(c.id, c.company_id);
      if (!tomada) continue; // otro reloj se la llevó
      try {
        const config = await this.repo.config(c.company_id, c.event_type);
        await this.enviarBrochure(c, config, c.company_id);
        await this.repo.actualizar(c.id, c.company_id, {
          correo_enviado: true,
        });
        this.logger.info(`consulta ${c.id}: brochure despachado por el reloj`);
      } catch (e) {
        this.logger.error(
          `consulta ${c.id}: el brochure no salió: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }

  private async enviarBrochure(
    consulta: Consulta,
    config: ConfigDeConsulta | null,
    companyId: number,
  ) {
    // LA MARCA COMPLETA de marketing (Felipe, 05-09: "aprovechemos esa
    // configuración que ya la hicimos"): banner si hay, pie con redes
    // y botón de WhatsApp — la misma plantilla de las campañas, sin
    // link de baja (esto es respuesta a SU consulta, no campaña) y
    // sin botón de cotizar (lo que se busca es que RESPONDA).
    const { data, error: errMarca } = await this.companies.findOne(companyId);
    if (errMarca && errMarca.code !== 'PGRST116') throw errMarca;
    const marca = data ? marcaDesdeFila(data) : marcaDesdeFila({});
    // Segundo cinturón del candado de dueño (el primero vive en
    // guardarConfig): jamás descargar una ruta que no sea de la
    // empresa, aunque la config venga de datos históricos.
    const propios = (config?.brochures ?? []).filter((b: Brochure) =>
      b.path.startsWith(`c${String(companyId)}/`),
    );
    const attachments = await Promise.all(
      propios.map(async (b: Brochure) => ({
        filename: b.nombre,
        content: (await this.repo.descargarBrochure(b.path)).toString('base64'),
      })),
    );
    const texto = (config?.texto?.trim() || TEXTO_DE_LA_CASA).replaceAll(
      '{nombre}',
      primerNombre(consulta.name),
    );
    const cuerpoHtml = texto
      .split(/\n+/)
      .filter((p) => p.trim())
      .map(
        (p) =>
          `<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px;">${escaparHtml(p.trim())}</p>`,
      )
      .join('');
    const iconosBase = (
      this.config.get<string>('FRONTEND_URL') ?? 'https://www.eventi-app.com'
    ).replace(/\/+$/, '');
    const titulo = `Valores para tu ${nombreNatural(consulta.event_type)}`;
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: `${marca.nombre} <hola@eventi-app.com>`,
      to: [consulta.email],
      subject: `${marca.nombre}: valores para tu ${nombreNatural(consulta.event_type)}`,
      html: plantillaCampana({ marca, titulo, cuerpoHtml, iconosBase }),
      attachments,
      ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
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
    // Candado de dueño (revisión 06-09): el path viaja como texto libre
    // en el body y el balde es COMPARTIDO entre empresas — sin este
    // prefijo, una ruta ajena haría que el correo del embudo adjuntara
    // archivos de otra empresa (misma regla que verificarDueno en
    // storage.service).
    for (const b of cambios.brochures ?? []) {
      if (!b.path.startsWith(`c${String(companyId)}/`)) {
        throw new BadRequestException(
          'El brochure no pertenece a esta empresa',
        );
      }
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
      return { consulta: c, client_id: c.client_id, contact_name: c.name };
    }
    // Match SOLO por correo (regla de Felipe, 05-09): el teléfono viaja
    // con la persona entre organizaciones; el correo no.
    const existente = await this.clients.findMatch(
      companyId,
      c.email,
      undefined,
    );
    let clientId: string;
    if (existente) {
      clientId = existente.id;
      // EL CONSULTANTE QUEDA COMO PERSONA DE CONTACTO (Felipe, 05-09:
      // "persona de contacto no me trajo a nadie"). El cliente NUEVO
      // nace con su persona principal (garantía del 31-07); acá se
      // cubre el cliente EXISTENTE: si el correo no está entre sus
      // contactos, se agrega — sin duplicar y sin tocar al principal.
      try {
        const contactos = await this.contactos.findByClient(
          companyId,
          clientId,
        );
        const correo = c.email.trim().toLowerCase();
        const yaEsta = (contactos as { email?: string | null }[]).some(
          (ct) => (ct.email ?? '').trim().toLowerCase() === correo,
        );
        if (!yaEsta) {
          await this.contactos.create(companyId, {
            client_id: clientId,
            name: c.name,
            email: c.email,
            phone: c.phone,
            is_primary: false,
          } as never);
        }
      } catch (e) {
        // Mejor esfuerzo, como la garantía de nacimiento: la persona
        // se puede completar a mano si esto falla.
        this.logger.error(
          `convertir ${id}: no se pudo asegurar el contacto: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    } else {
      const nuevo = await this.clients.create(
        {
          // La empresa nombra al cliente cuando la hay; la persona
          // queda como su contacto principal (mismo trato que el
          // formulario público, 05-09).
          name: c.company_name?.trim() || c.name,
          contact_person: c.name,
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
    // contact_name viaja para que el cotizador preseleccione a la
    // persona (el motor la vincula al guardar vía resolveContactId).
    return { consulta: actualizada, client_id: clientId, contact_name: c.name };
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
