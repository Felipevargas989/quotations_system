import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { fechaLegible } from '../generar/fechas';
import {
  costoEnDolares,
  esFallaDeLaCuenta,
  MODELO_POR_DEFECTO,
} from '../generar/generar.service';
import { mensajeDelSeguimiento } from './contexto';
import {
  compromisoVivo,
  esCorreoUtil,
  fechaEnChile,
  porQueNoEntra,
} from './elegibles';
import { copiasDelHilo, decidirHilo } from './hilo';
import {
  APLICACION_POR_DEFECTO,
  type BorradorCreado,
  ErrorDeOutlook,
  INQUILINO_POR_DEFECTO,
  limpiarHtml,
  type MensajeDelBuzon,
  OutlookDeLaCasa,
} from './outlook';
import { instruccionesDeCorreo } from './reglas-de-correo';
import { SeguimientoRepository } from './seguimiento.repository';
import { ESQUEMA_DEL_SEGUIMIENTO, type RespuestaDelSeguimiento } from './tipos';

// EL BOTÓN «✉ GENERAR SEGUIMIENTO» (doc 18; Felipe, 17-10-2026).
//
// Toma una cotización enviada o en negociación cuyo próximo contacto venció
// y es por correo, busca el hilo con el cliente en los buzones de la casa,
// le pide a Claude el correo con las reglas de la skill de correos y lo deja
// como BORRADOR en ese hilo (o en un correo nuevo si no hay hilo). Nunca
// envía: Felipe lo lee, lo ajusta y lo envía desde Outlook.

/** Los buzones de Valle del Sol, en el orden en que se busca el hilo (los
 *  de la skill). Cuando otra empresa tenga el módulo, irán en la empresa. */
export const BUZONES_DE_LA_CASA = [
  'contacto@valledelsolquillon.cl',
  'felipe@valledelsolquillon.cl',
  'camila@valledelsolquillon.cl',
  'reservas@valledelsolquillon.cl',
  'recepcion@valledelsolquillon.cl',
];

/** Fuera de producción, el único buzón que se toca: los clientes del
 *  laboratorio son de prueba y no deben llenar contacto@ de borradores. */
export const BUZON_DE_ENSAYO = 'felipe@valledelsolquillon.cl';

/** Solo el motor de producción (servicio `api-rest` de Railway, sin el
 *  silenciador de correos) toca los buzones de verdad. El laboratorio, las
 *  pruebas y un motor local usan el de ensayo: si algo falla, falla del
 *  lado seguro. */
export const buzonesDelEntorno = (
  env: NodeJS.ProcessEnv = process.env,
): string[] =>
  env.RAILWAY_SERVICE_NAME === 'api-rest' && env.EMAILS_SILENCED !== '1'
    ? BUZONES_DE_LA_CASA
    : [BUZON_DE_ENSAYO];

/** Cuántos correos del hilo lee completos la IA (los más nuevos). */
const CORREOS_A_LEER = 3;

export type Pendiente = {
  id: string;
  quotation_number: number;
  estado: string;
  cliente: string;
  tipo_evento: string | null;
  /** AAAA-MM-DD del compromiso vencido. */
  proximo: string;
  dias_vencido: number;
  nota: string;
};

export type ResultadoDelSeguimiento = {
  quotation_number: number;
  accion: 'borrador' | 'saltada';
  /** Por qué se saltó, en una línea. */
  motivo: string | null;
  buzon: string | null;
  modo: 'seguimiento' | 'responder' | 'nuevo' | null;
  /** Para abrir el borrador en Outlook web. */
  enlace: string | null;
  angulo: string | null;
  segundos: number;
  costo_usd: number | null;
};

type Uso = {
  entrada: number;
  escrituraCache: number;
  lecturaCache: number;
  salida: number;
};

@Injectable()
export class SeguimientoConIAService {
  private clienteAnthropic: Anthropic | null = null;
  private outlookDeLaCasa: OutlookDeLaCasa | null = null;

  constructor(
    private readonly repositorio: SeguimientoRepository,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SeguimientoConIAService.name);
  }

  /** Se crea al primer uso y lee ANTHROPIC_API_KEY (la misma cuenta de
   *  «Crear con IA» y del radar: paciente con los 429). */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  /** Outlook con la llave de la empresa. Sin MS_CLIENT_SECRET, 503 claro. */
  protected outlook(): OutlookDeLaCasa {
    const secreto = process.env.MS_CLIENT_SECRET?.trim();
    if (!secreto) {
      throw new ServiceUnavailableException(
        'Falta la llave de Outlook en el motor (MS_CLIENT_SECRET): no se pueden dejar borradores.',
      );
    }
    if (!this.outlookDeLaCasa) {
      const buzones = buzonesDelEntorno();
      this.logger.info(`seguimiento con IA: buzones ${buzones.join(', ')}`);
      this.outlookDeLaCasa = new OutlookDeLaCasa({
        secreto,
        inquilino: process.env.MS_TENANT_ID?.trim() || INQUILINO_POR_DEFECTO,
        aplicacion: process.env.MS_CLIENT_ID?.trim() || APLICACION_POR_DEFECTO,
        buzones,
        empresa: 'Valle del Sol',
      });
    }
    return this.outlookDeLaCasa;
  }

  get modelo(): string {
    return process.env.MODELO_SEGUIMIENTO?.trim() || MODELO_POR_DEFECTO;
  }

  /** Las que piden seguimiento por correo hoy, las más vencidas primero. */
  async pendientes(user: User): Promise<Pendiente[]> {
    const companyId = user.company_id;
    const [vivas, compromisos] = await Promise.all([
      this.repositorio.vivas(companyId),
      this.repositorio.compromisosAbiertos(companyId),
    ]);
    const hoy = fechaEnChile();
    const porCotizacion = new Map<string, typeof compromisos>();
    for (const n of compromisos) {
      const lista = porCotizacion.get(n.quotation_id) ?? [];
      lista.push(n);
      porCotizacion.set(n.quotation_id, lista);
    }
    const pendientes: Pendiente[] = [];
    for (const q of vivas) {
      const notas = porCotizacion.get(q.id) ?? [];
      if (porQueNoEntra(q.quotation_status, notas, hoy)) continue;
      const compromiso = compromisoVivo(notas);
      const proximo = (compromiso?.next_contact_date ?? '').slice(0, 10);
      pendientes.push({
        id: q.id,
        quotation_number: q.quotation_number,
        estado: q.quotation_status,
        cliente: q.clients?.name ?? '',
        tipo_evento: q.event_type,
        proximo,
        dias_vencido: Math.round(
          (Date.parse(hoy) - Date.parse(proximo)) / 86_400_000,
        ),
        nota: (compromiso?.note ?? '').trim(),
      });
    }
    return pendientes.sort(
      (a, b) =>
        b.dias_vencido - a.dias_vencido ||
        a.quotation_number - b.quotation_number,
    );
  }

  async generar(id: string, user: User): Promise<ResultadoDelSeguimiento> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Falta la llave de Anthropic en el motor: el seguimiento no se puede escribir.',
      );
    }
    const outlook = this.outlook();
    const inicio = Date.now();
    const companyId = user.company_id;

    const q = await this.repositorio.cotizacion(id, companyId);
    if (!q) throw new NotFoundException('Cotización no encontrada.');
    const notas = await this.repositorio.bitacora(id, companyId);
    const hoy = fechaEnChile();
    const noEntra = porQueNoEntra(q.quotation_status, notas, hoy);
    if (noEntra) {
      throw new ConflictException(
        `La N° ${q.quotation_number} no necesita seguimiento por correo: ${noEntra}`,
      );
    }

    const saltada = (motivo: string, costo: number | null = null) => {
      this.logger.info(
        `N° ${q.quotation_number}: seguimiento saltado: ${motivo}`,
      );
      return {
        quotation_number: q.quotation_number,
        accion: 'saltada' as const,
        motivo,
        buzon: null,
        modo: null,
        enlace: null,
        angulo: null,
        segundos: Math.round((Date.now() - inicio) / 1000),
        costo_usd: costo,
      };
    };

    const fecha = q.event_date ? q.event_date.slice(0, 10) : null;
    const fin = q.event_end_date ? q.event_end_date.slice(0, 10) : fecha;
    if (fin && fin < hoy) return saltada('el evento ya pasó.');

    const contacto =
      q.clients?.client_contacts?.find((c) => c.id === q.client_contact_id) ??
      null;
    const correos = [
      ...new Set(
        [contacto?.email, q.clients?.email]
          .filter(esCorreoUtil)
          .map((c) => c.trim().toLowerCase()),
      ),
    ];
    if (correos.length === 0) {
      return saltada(
        'el cliente no tiene un correo útil: el seguimiento va por otro canal.',
      );
    }

    // El hilo: los buzones en orden; se queda el primero que tenga algo con
    // el cliente (contacto@ recibe la copia oculta de cada envío).
    let decision: ReturnType<typeof decidirHilo>;
    let delHilo: Array<MensajeDelBuzon & { texto: string }> = [];
    try {
      const encontrados: Array<{ buzon: string; mensajes: MensajeDelBuzon[] }> =
        [];
      for (const buzon of outlook.buzones) {
        const mensajes = (
          await Promise.all(correos.map((c) => outlook.buscar(buzon, c)))
        ).flat();
        const unicos = [...new Map(mensajes.map((m) => [m.id, m])).values()];
        encontrados.push({ buzon, mensajes: unicos });
        if (unicos.length > 0) break;
      }
      decision = decidirHilo({
        encontrados,
        esDeLaCasa: (c) => outlook.esDeLaCasa(c),
        ultimaGestion: notas.length ? notas[notas.length - 1].created_at : null,
        buzonParaNuevo: outlook.buzones[0],
      });
      if (decision.modo === 'seguimiento' || decision.modo === 'responder') {
        const { buzon } = decision;
        delHilo = await Promise.all(
          decision.hilo
            .filter((m) => !m.borrador)
            .slice(0, CORREOS_A_LEER)
            .map(async (m) => ({
              ...m,
              texto: await outlook.leerTexto(buzon, m.id),
            })),
        );
      }
    } catch (error) {
      throw this.errorDeOutlook(error, q.quotation_number);
    }
    if (decision.modo === 'saltar') return saltada(decision.motivo);

    const uso: Uso = {
      entrada: 0,
      escrituraCache: 0,
      lecturaCache: 0,
      salida: 0,
    };
    const respuesta = await this.preguntar(
      mensajeDelSeguimiento({
        numero: q.quotation_number,
        estado: q.quotation_status,
        tipoEvento: q.event_type ?? '',
        fecha,
        fin,
        personas: Number(q.people_count) || 0,
        ninos: Number(q.children_count) || 0,
        total: Number(q.total_amount) || 0,
        enviada: q.sent_at,
        cliente: q.clients?.name ?? '',
        tipoCliente: q.clients?.client_type ?? null,
        contacto: contacto?.name ?? q.contact_name,
        correo: correos[0],
        observaciones: q.observations,
        comentarioInterno: q.comentario_interno,
        notas,
        hoy,
        modo: decision.modo,
        buzon: decision.buzon,
        hilo: delHilo,
      }),
      uso,
    );
    const costo = costoEnDolares(this.modelo, uso);
    if (respuesta.accion === 'saltar') {
      return saltada(
        respuesta.motivo.trim() ||
          'la IA decidió no escribir este seguimiento.',
        costo,
      );
    }
    const html = limpiarHtml(respuesta.cuerpo_html).trim();
    if (!html) {
      throw new UnprocessableEntityException(
        'La IA devolvió un correo vacío. Vuelve a intentarlo.',
      );
    }

    // Justo antes de dejar el borrador, de nuevo la regla: alguien pudo
    // anotar una gestión mientras la IA escribía (Felipe trabaja en paralelo).
    const ahora = await this.repositorio.cotizacion(id, companyId);
    const notasAhora = await this.repositorio.bitacora(id, companyId);
    if (
      !ahora ||
      porQueNoEntra(ahora.quotation_status, notasAhora, hoy) ||
      notasAhora.length !== notas.length
    ) {
      return saltada(
        'alguien anotó una gestión mientras se escribía: revisa la bitácora antes de volver a intentarlo.',
        costo,
      );
    }

    let borrador: BorradorCreado;
    try {
      if (decision.modo === 'seguimiento') {
        borrador = await outlook.borradorDeSeguimiento(
          decision.buzon,
          decision.mensaje.id,
          html,
          correos[0],
          copiasDelHilo(decision.mensaje, correos, (c) =>
            outlook.esDeLaCasa(c),
          ),
        );
      } else if (decision.modo === 'responder') {
        borrador = await outlook.borradorRespuestaATodos(
          decision.buzon,
          decision.mensaje.id,
          html,
        );
      } else {
        borrador = await outlook.borradorNuevo(
          decision.buzon,
          html,
          correos[0],
          respuesta.asunto.trim() ||
            `Cotización N° ${q.quotation_number}${fecha ? `: ${fechaLegible(fecha)}` : ''}`,
        );
      }
    } catch (error) {
      throw this.errorDeOutlook(error, q.quotation_number);
    }

    const angulo = respuesta.angulo.trim();
    const donde =
      decision.modo === 'nuevo'
        ? `en ${decision.buzon} (correo nuevo: no había hilo)`
        : `en el hilo de ${decision.buzon}`;
    await this.bitacora
      .create(user, {
        quotation_id: id,
        tipo: 'correo',
        note: `Borrador de seguimiento con IA listo ${donde}${angulo ? `: ${angulo}` : ''}. Revísalo en Outlook y envíalo desde ahí.`,
      })
      .catch((e: unknown) =>
        this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
      );

    const segundos = Math.round((Date.now() - inicio) / 1000);
    this.logger.info(
      `N° ${q.quotation_number}: borrador de seguimiento (${decision.modo}) en ${decision.buzon} con ${this.modelo} en ${segundos} s · entrada ${uso.entrada} · caché ${uso.escrituraCache}/${uso.lecturaCache} · salida ${uso.salida}${costo != null ? ` · US$ ${costo.toFixed(3)}` : ''}`,
    );
    return {
      quotation_number: q.quotation_number,
      accion: 'borrador',
      motivo: null,
      buzon: decision.buzon,
      modo: decision.modo,
      enlace: borrador.enlace,
      angulo: angulo || null,
      segundos,
      costo_usd: costo,
    };
  }

  /** Un error de Outlook se explica sin mostrar la llave. */
  private errorDeOutlook(error: unknown, numero: number): Error {
    if (error instanceof ErrorDeOutlook) {
      this.logger.error(`N° ${numero}: Outlook falló: ${error.message}`);
      return new ServiceUnavailableException(
        error.status === 401 || error.status === 400
          ? 'Outlook no aceptó la llave de la empresa: revisa MS_CLIENT_SECRET en el motor.'
          : `Outlook no respondió bien (${error.status}). Vuelve a intentarlo en un rato.`,
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private async preguntar(
    mensaje: string,
    uso: Uso,
  ): Promise<RespuestaDelSeguimiento> {
    try {
      const respuesta = await this.cliente().messages.parse({
        model: this.modelo,
        max_tokens: 4000,
        output_config: {
          format: jsonSchemaOutputFormat(ESQUEMA_DEL_SEGUIMIENTO),
        },
        // Las reglas van como instrucciones fijas, en caché: «Generar
        // seguimientos» las lee mucho más barato desde el segundo.
        system: [
          {
            type: 'text',
            text: instruccionesDeCorreo(),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: mensaje }],
      });
      uso.entrada += respuesta.usage.input_tokens ?? 0;
      uso.escrituraCache += respuesta.usage.cache_creation_input_tokens ?? 0;
      uso.lecturaCache += respuesta.usage.cache_read_input_tokens ?? 0;
      uso.salida += respuesta.usage.output_tokens ?? 0;
      if (respuesta.stop_reason === 'refusal') {
        throw new UnprocessableEntityException(
          'La IA no quiso escribir este seguimiento. Escríbelo a mano.',
        );
      }
      if (respuesta.stop_reason === 'max_tokens' || !respuesta.parsed_output) {
        throw new UnprocessableEntityException(
          'La respuesta de la IA llegó incompleta. Vuelve a intentarlo.',
        );
      }
      return respuesta.parsed_output as RespuestaDelSeguimiento;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      if (esFallaDeLaCuenta(error)) {
        this.logger.error(`la cuenta de Anthropic falló: ${mensajeDe(error)}`);
        throw new ServiceUnavailableException(
          'La IA no está disponible ahora (cuenta de Anthropic sin cupo o con la llave mala). Prueba en un rato.',
        );
      }
      this.logger.error(`la IA falló: ${mensajeDe(error)}`);
      throw new ServiceUnavailableException(
        'La IA no respondió. Vuelve a intentarlo en un rato.',
      );
    }
  }
}
