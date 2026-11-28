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
import { pctDeAbono } from 'src/companies/abono-para-reservar';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { ChoquesDeFechaService } from '../choques/choques.service';
import { QuotationStatus, RequestType } from '../constants/constants';
import {
  fechaLargaDelEvento,
  primerNombre,
  reparosDelPortero,
} from '../correo-cotizacion';
import type { Quotation } from '../entities/quotation.entity';
import {
  EnvioCotizacionService,
  MARCA_DE_ENVIO,
} from '../envio-cotizacion.service';
import {
  costoEnDolares,
  esFallaDeLaCuenta,
  MODELO_POR_DEFECTO,
} from '../generar/generar.service';
import { QuotationsRepository } from '../quotations.repository';
import { copiasDelHilo, decidirRespuesta } from '../seguimiento/hilo';
import {
  aTexto,
  ErrorDeOutlook,
  limpiarHtml,
  type MensajeDelBuzon,
  type OutlookDeLaCasa,
} from '../seguimiento/outlook';
import type { Uso } from '../seguimiento/preguntar';
import { SeguimientoRepository } from '../seguimiento/seguimiento.repository';
import {
  BUZON_DE_ENSAYO,
  buzonesDelEntorno,
  SeguimientoConIAService,
} from '../seguimiento/seguimiento.service';
import { FIRMA_DE_CONTACTO } from './firma-de-contacto';
import {
  ESQUEMA_DEL_ENVIO,
  instruccionesDelEnvio,
  type RespuestaDelEnvio,
} from './instrucciones';
import { tablaEnTexto, tablaVerde, totalEnPesos } from './tabla';

// EL ENVÍO CON BELIA (doc 20 §19; Felipe, 27-11-2026: «que los envíe BelIA,
// pero que antes me muestre un detalle de qué le dirá a cada uno, y que
// salgan desde contacto@valledelsolquillon.cl, no desde hola@eventi-app»).
//
// Dos pasos, con la persona en medio:
// 1. `preparar`: lee el hilo del cliente en contacto@, le pide a la IA el
//    correo con la estructura de la casa, le pone la tabla verde con las
//    cifras de Eventia y la firma de contacto@, y lo deja como borrador en
//    ese hilo (o en un correo nuevo). Devuelve lo que la tarjeta muestra.
// 2. `enviar`: con el «Sí, enviar» de la persona, revisa que la cotización
//    siga solicitada y el borrador siga ahí, le adjunta el PDF (el mismo de
//    «Enviar cotización») y lo envía. Anota el envío con el mini resumen de
//    lo hablado y la pasa a Enviada, igual que el botón.
//
// En el laboratorio (y en cualquier motor que no sea el de producción) el
// buzón es el de ensayo y el correo va a ese mismo buzón: nunca a un
// cliente.

/** Desde dónde sale (Felipe, 27-11). */
export const BUZON_DEL_ENVIO = 'contacto@valledelsolquillon.cl';

/** Cuántos correos del hilo lee completos la IA (los más nuevos). */
const CORREOS_A_LEER = 4;

/** Lo que guarda la propuesta y ve la tarjeta. */
export type EnvioPreparado = {
  /** Qué correo es: la cotización (§19) o un seguimiento (§20). Sin esto,
   *  la cotización (las propuestas guardadas antes del 28-11). */
  clase?: 'cotizacion' | 'seguimiento';
  /** Solo el seguimiento: los seguimientos sin respuesta que ya había en
   *  el hilo antes de este, para el próximo contacto. */
  sin_respuesta?: number;
  quotation_id: string;
  numero: number;
  cliente: string;
  /** A quién va de verdad; en el laboratorio, el buzón de ensayo. */
  para: string;
  cc: string[];
  /** Solo en el laboratorio: a quién habría ido. */
  para_real: string | null;
  buzon: string;
  en_hilo: boolean;
  asunto: string;
  /** El identificador inmutable del borrador, para revisarlo y enviarlo. */
  borrador_id: string;
  enlace: string | null;
  /** El correo en texto, como lo leerá el cliente (sin la firma). */
  texto: string;
  resumen: string;
  nota: string;
  total: string;
  costo_usd: number | null;
};

export type EnvioSaltado = {
  quotation_id: string;
  numero: number;
  cliente: string;
  motivo: string;
};

@Injectable()
export class EnvioConBeliaService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly cotizaciones: QuotationsRepository,
    private readonly lecturas: SeguimientoRepository,
    private readonly envio: EnvioCotizacionService,
    private readonly seguimiento: SeguimientoConIAService,
    private readonly companies: CompaniesRepository,
    private readonly bitacora: QuotationFollowupsService,
    private readonly choques: ChoquesDeFechaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EnvioConBeliaService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  get modelo(): string {
    return process.env.MODELO_SEGUIMIENTO?.trim() || MODELO_POR_DEFECTO;
  }

  /** El buzón de este motor: contacto@ en producción, el de ensayo en los
   *  demás. */
  buzon(): { buzon: string; ensayo: boolean } {
    const buzones = buzonesDelEntorno();
    return buzones.includes(BUZON_DEL_ENVIO)
      ? { buzon: BUZON_DEL_ENVIO, ensayo: false }
      : { buzon: BUZON_DE_ENSAYO, ensayo: true };
  }

  private outlook(): OutlookDeLaCasa {
    return this.seguimiento.llaveDeOutlook();
  }

  /** Paso 1: el borrador listo para salir, o por qué no. */
  async preparar(
    quotationId: string,
    user: User,
  ): Promise<EnvioPreparado | EnvioSaltado> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Falta la llave de Anthropic en el motor: el correo no se puede escribir.',
      );
    }
    const companyId = user.company_id;
    const { data: q } = await this.cotizaciones.findOne(quotationId);
    if (!q || q.company_id !== companyId) {
      throw new NotFoundException('Cotización no encontrada.');
    }
    const cliente = q.clients?.name?.trim() || 'sin cliente';
    const saltada = (motivo: string): EnvioSaltado => ({
      quotation_id: q.id,
      numero: q.quotation_number,
      cliente,
      motivo,
    });
    if (q.quotation_status !== QuotationStatus.SOLICITADA) {
      return saltada(`ya no está solicitada (está ${q.quotation_status}).`);
    }
    if (q.request_type !== RequestType.COTIZACION) {
      return saltada('es un requerimiento: primero hay que armarla.');
    }
    const destino = await this.envio.correoDeDestino(q);
    const reparos = reparosDelPortero(q, destino.correo);
    if (reparos.length) return saltada(reparos.join(' '));
    if ((await this.choques.cotizacionesConTope(companyId)).has(q.id)) {
      return saltada(
        'tiene tope de calendario con una aceptada: decide primero si sigue con su fecha.',
      );
    }

    const { buzon, ensayo } = this.buzon();
    const outlook = this.outlook();
    const fila = await this.lecturas.cotizacion(q.id, companyId);
    const notas = await this.lecturas.bitacora(q.id, companyId);
    const correos = [
      ...new Set(
        [destino.correo as string, fila?.clients?.email ?? '']
          .map((c) => c.trim().toLowerCase())
          .filter((c) => c.includes('@')),
      ),
    ];

    // El hilo, solo en el buzón desde donde sale (contacto@): el de la
    // cotización o, si no hay, el último correo del cliente.
    let idMensaje: string | null = null;
    let cc: string[] = [];
    let delHilo: Array<MensajeDelBuzon & { texto: string }> = [];
    try {
      const mensajes = (
        await Promise.all(correos.map((c) => outlook.buscar(buzon, c)))
      ).flat();
      const unicos = [...new Map(mensajes.map((m) => [m.id, m])).values()];
      const decision = decidirRespuesta({
        encontrados: [{ buzon, mensajes: unicos }],
        esDeLaCasa: (c) => outlook.esDeLaCasa(c),
        esDeEventia: (c) => outlook.esDeEventia(c),
        buzonParaNuevo: buzon,
        numero: q.quotation_number,
        creada: q.created_at ? new Date(q.created_at).toISOString() : null,
      });
      if (decision.modo === 'saltar') return saltada(decision.motivo);
      if (decision.modo === 'responder' || decision.modo === 'seguimiento') {
        idMensaje = decision.mensaje.id;
        cc = copiasDelHilo(decision.mensaje, correos, (c) =>
          outlook.esDeLaCasa(c),
        );
        delHilo = await Promise.all(
          decision.hilo
            .filter((m) => !m.borrador)
            .slice(0, CORREOS_A_LEER)
            .map(async (m) => ({
              ...m,
              texto: await outlook.leerTexto(buzon, m.id, 3000),
            })),
        );
      }
    } catch (e) {
      throw this.errorDeOutlook(e, q.quotation_number);
    }

    const { data: empresa } = await this.companies.findOne(companyId);
    const abono = pctDeAbono(
      (empresa as { abono_reserva_pct?: unknown } | null)?.abono_reserva_pct,
    );
    const uso: Uso = {
      entrada: 0,
      escrituraCache: 0,
      lecturaCache: 0,
      salida: 0,
    };
    const r = await this.preguntar(
      this.mensajeParaLaIA(q, {
        contacto: destino.nombre,
        tipoCliente: q.clients?.client_type ?? null,
        notas: notas.map(
          (n) =>
            `${n.created_at.slice(0, 10)} (${n.tipo ?? 'nota'}): ${(n.note ?? '').trim()}`,
        ),
        hilo: delHilo,
        enHilo: Boolean(idMensaje),
        abono,
      }),
      uso,
    );
    const costo = costoEnDolares(this.modelo, uso);
    if (r.accion === 'saltar') {
      return saltada(r.motivo.trim() || 'la IA decidió no escribirlo.');
    }
    const antes = limpiarHtml(r.antes_de_la_tabla).trim();
    const despues = limpiarHtml(r.despues_de_la_tabla).trim();
    if (!antes || !despues) {
      throw new UnprocessableEntityException(
        `La IA devolvió el correo de la N° ${q.quotation_number} incompleto. Vuelve a pedirlo.`,
      );
    }
    const fecha = fechaLargaDelEvento(q.event_date);
    const asunto =
      r.asunto.trim() ||
      `Cotización ${q.event_type || 'evento'} ${cliente}: ${fecha}`;
    const para = ensayo ? buzon : (destino.correo as string);

    let borrador: { id: string; enlace: string | null };
    try {
      const creado = await outlook.borradorParaEnviar({
        buzon,
        idMensaje,
        html: antes + tablaVerde(q) + despues,
        para,
        cc: ensayo ? [] : cc,
        asunto,
        firma: FIRMA_DE_CONTACTO,
        ensayo,
      });
      const inmutable = await outlook.idInmutable(buzon, creado.id);
      borrador = { id: inmutable.id, enlace: creado.enlace };
    } catch (e) {
      throw this.errorDeOutlook(e, q.quotation_number);
    }
    this.logger.info(
      `N° ${q.quotation_number}: correo de la cotización listo en ${buzon}${idMensaje ? ' (en su hilo)' : ' (nuevo)'}${costo != null ? ` · US$ ${costo.toFixed(3)}` : ''}`,
    );
    return {
      quotation_id: q.id,
      numero: q.quotation_number,
      cliente,
      para,
      cc: ensayo ? [] : cc,
      para_real: ensayo ? (destino.correo as string) : null,
      buzon,
      en_hilo: Boolean(idMensaje),
      asunto: idMensaje ? (delHilo[0]?.asunto ?? asunto) : asunto,
      borrador_id: borrador.id,
      enlace: borrador.enlace,
      texto: aTexto(`${antes}<p>[tabla de valores]</p>${despues}`).replace(
        '[tabla de valores]',
        tablaEnTexto(q),
      ),
      resumen: r.resumen.trim(),
      nota: r.nota.trim(),
      total: totalEnPesos(q),
      costo_usd: costo,
    };
  }

  /** Paso 2, con el «Sí, enviar»: el PDF adjunto y el envío. */
  async enviar(
    e: EnvioPreparado,
    user: User,
  ): Promise<{ enviado_a: string; aviso: string }> {
    const companyId = user.company_id;
    const { data: q } = await this.cotizaciones.findOne(e.quotation_id);
    if (!q || q.company_id !== companyId) {
      throw new NotFoundException('La cotización ya no existe.');
    }
    if (q.quotation_status !== QuotationStatus.SOLICITADA) {
      throw new ConflictException(
        `La N° ${q.quotation_number} ya no está solicitada (está ${q.quotation_status}): no la envié.`,
      );
    }
    const outlook = this.outlook();
    try {
      const estado = await outlook.estadoDelBorrador(e.buzon, e.borrador_id);
      if (estado.estado !== 'borrador') {
        throw new ConflictException(
          `El borrador de la N° ${q.quotation_number} ya no está en Outlook (${estado.estado === 'enviado' ? 'ya salió' : 'lo borraron'}). Pídemelo de nuevo.`,
        );
      }
      const pdf = await this.envio.generarPdf(q.id);
      await outlook.adjuntar(e.buzon, e.borrador_id, {
        name: `Cotizacion_N${String(q.quotation_number)}_ValleDelSol.pdf`,
        contentType: 'application/pdf',
        contentBytes: pdf.toString('base64'),
      });
      await outlook.enviar(e.buzon, e.borrador_id);
    } catch (error) {
      throw this.errorDeOutlook(error, q.quotation_number);
    }

    // El envío ya salió: lo que sigue no lo rompe. La nota empieza con la
    // marca del botón para que cuente como envío (versión 2 al reenviar).
    const desde = `${e.buzon.split('@')[0]}@`;
    await this.bitacora
      .crearComoBeliaAPedidoDe(user, {
        quotation_id: q.id,
        tipo: 'correo',
        next_contact_date: null,
        note: `${MARCA_DE_ENVIO} a ${e.para} desde ${desde}${e.en_hilo ? ', en su hilo' : ''}, con el PDF adjunto.${e.nota ? ` Lo hablado: ${e.nota}` : ''}`,
      })
      .catch((err: unknown) =>
        this.logger.warn(`no pude anotar el envío: ${mensajeDe(err)}`),
      );
    await this.envio.marcarEnviada(q, user);
    this.logger.info(
      `N° ${q.quotation_number}: cotización enviada por BelIA a ${e.para} desde ${e.buzon}`,
    );
    return {
      enviado_a: e.para,
      aviso: `Enviada a ${e.para} desde ${desde}${e.en_hilo ? ', en su hilo' : ''}, con el PDF. Quedó en Enviada.`,
    };
  }

  /** El «No» de la persona: el borrador que dejó BelIA se bota. */
  async botar(e: Pick<EnvioPreparado, 'buzon' | 'borrador_id'>) {
    await this.outlook()
      .botarBorrador(e.buzon, e.borrador_id)
      .catch((err: unknown) =>
        this.logger.warn(`no pude botar el borrador: ${mensajeDe(err)}`),
      );
  }

  private mensajeParaLaIA(
    q: Quotation & { clients?: { name?: string | null } | null },
    o: {
      contacto: string | null;
      tipoCliente: string | null;
      notas: string[];
      hilo: Array<MensajeDelBuzon & { texto: string }>;
      enHilo: boolean;
      abono: number | null;
    },
  ): string {
    const personas = Number(q.people_count || 0);
    const ninos = Number(q.children_count || 0);
    const hilo = o.hilo.length
      ? o.hilo
          .map(
            (m) =>
              `--- ${m.fecha.slice(0, 10)} · de ${m.de} · «${m.asunto}»\n${m.texto}`,
          )
          .join('\n\n')
      : '(sin hilo: va como correo nuevo)';
    return [
      `COTIZACIÓN N° ${q.quotation_number}`,
      `Cliente: ${q.clients?.name ?? ''} (tipo: ${o.tipoCliente ?? 'sin tipo'})`,
      `Contacto: ${o.contacto ?? ''}${o.contacto ? ` (saludo: «Hola ${primerNombre(o.contacto)}»)` : ''}`,
      `Evento: ${q.event_type ?? ''}`,
      `Fecha: ${fechaLargaDelEvento(q.event_date)}${q.event_end_date && String(q.event_end_date).slice(0, 10) !== String(q.event_date).slice(0, 10) ? ` hasta el ${fechaLargaDelEvento(q.event_end_date)}` : ''}`,
      `Personas: ${personas}${ninos ? ` (${personas - ninos} adultos y ${ninos} niños)` : ''}`,
      `Abono para reservar la fecha: ${o.abono ? `${o.abono}%` : 'no definido (di solo «con el abono de reserva»)'}`,
      '',
      'LA TABLA QUE PONE EVENTIA (no la repitas):',
      tablaEnTexto(q),
      '',
      `Observaciones de la cotización (lo que va en el documento): ${(q.observations ?? '').trim() || '(ninguna)'}`,
      `Comentario interno (no se cita): ${(q.comentario_interno ?? '').trim() || '(ninguno)'}`,
      '',
      'BITÁCORA (de la más vieja a la más nueva):',
      o.notas.length ? o.notas.join('\n') : '(vacía)',
      '',
      `HILO CON EL CLIENTE EN contacto@ (del más nuevo al más viejo)${o.enHilo ? '; el correo va DENTRO de este hilo, sin asunto' : ''}:`,
      hilo,
    ].join('\n');
  }

  private async preguntar(
    mensaje: string,
    uso: Uso,
  ): Promise<RespuestaDelEnvio> {
    try {
      const r = await this.cliente().messages.parse({
        model: this.modelo,
        max_tokens: 4000,
        output_config: { format: jsonSchemaOutputFormat(ESQUEMA_DEL_ENVIO) },
        system: [
          {
            type: 'text',
            text: instruccionesDelEnvio(),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: mensaje }],
      });
      uso.entrada += r.usage.input_tokens ?? 0;
      uso.escrituraCache += r.usage.cache_creation_input_tokens ?? 0;
      uso.lecturaCache += r.usage.cache_read_input_tokens ?? 0;
      uso.salida += r.usage.output_tokens ?? 0;
      if (r.stop_reason === 'max_tokens' || !r.parsed_output) {
        throw new UnprocessableEntityException(
          'La respuesta de la IA llegó incompleta. Vuelve a pedirlo.',
        );
      }
      return r.parsed_output as RespuestaDelEnvio;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      if (esFallaDeLaCuenta(error)) {
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

  private errorDeOutlook(error: unknown, numero: number): Error {
    if (error instanceof ErrorDeOutlook) {
      this.logger.error(`N° ${numero}: Outlook falló: ${error.message}`);
      return new ServiceUnavailableException(
        error.status === 401 || error.status === 400
          ? `Outlook no aceptó el correo de la N° ${numero} (${error.message.slice(0, 160)}).`
          : `Outlook no respondió bien con la N° ${numero} (${error.status}). Vuelve a intentarlo en un rato.`,
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
