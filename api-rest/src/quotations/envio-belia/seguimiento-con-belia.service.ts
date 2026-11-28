import Anthropic from '@anthropic-ai/sdk';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { esGestion } from 'src/quotation-followups/cambio-de-estado';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { ChoquesDeFechaService } from '../choques/choques.service';
import { pesos } from '../generar/catalogo';
import { fechaLegible } from '../generar/fechas';
import { costoEnDolares, MODELO_POR_DEFECTO } from '../generar/generar.service';
import { mensajeDelSeguimiento } from '../seguimiento/contexto';
import {
  compromisoVivo,
  ESTADOS_CON_SEGUIMIENTO,
  fechaEnChile,
  porQueNoEntraAPedido,
  type NotaDeBitacora,
} from '../seguimiento/elegibles';
import { notaDelEnvio, proximoTrasElEnvio } from '../seguimiento/envio';
import {
  copiasDelHilo,
  decidirHilo,
  seguimientosSinRespuesta,
} from '../seguimiento/hilo';
import {
  aTexto,
  ErrorDeOutlook,
  limpiarHtml,
  type MensajeDelBuzon,
  type OutlookDeLaCasa,
} from '../seguimiento/outlook';
import { preguntarALaIA, type Uso } from '../seguimiento/preguntar';
import { SeguimientoRepository } from '../seguimiento/seguimiento.repository';
import { SeguimientoConIAService } from '../seguimiento/seguimiento.service';
import { correosDeLaCotizacion } from '../seguimiento/ultimo-correo';
import {
  BUZON_DEL_ENVIO,
  EnvioConBeliaService,
  type EnvioPreparado,
  type EnvioSaltado,
} from './envio-con-belia.service';
import { FIRMA_DE_CONTACTO } from './firma-de-contacto';
import {
  ESQUEMA_DEL_SEGUIMIENTO_PARA_ENVIAR,
  instruccionesDelSeguimientoParaEnviar,
  type RespuestaDelSeguimientoParaEnviar,
} from './instrucciones-del-seguimiento';

// EL SEGUIMIENTO QUE ENVÍA BELIA (doc 20 §20; Felipe, 28-11-2026: «Sí,
// prepáralo» y, al preguntarle qué hacer cuando el hilo está en otro
// buzón: «Siempre desde contacto@»).
//
// Lo mismo que el envío de las solicitadas (§19), con el correo de
// «✉ Generar seguimiento»:
// 1. `preparar`: busca el hilo del cliente SOLO en contacto@ (si estaba en
//    otro buzón, va como correo nuevo desde contacto@), la IA escribe el
//    seguimiento con las reglas de la casa y lo deja listo para salir, sin
//    aviso ámbar y con la firma de contacto@. Devuelve lo que ve la tarjeta.
// 2. `enviar`: con el «Sí, enviar», revisa que la cotización siga enviada o
//    en negociación y que el borrador siga ahí, y lo envía. Anota en la
//    bitácora el envío, lo hablado y el próximo contacto (14 días por
//    correo, o una llamada en 7 cuando ya van dos sin respuesta), igual que
//    cuando sale un borrador del botón.
//
// No adjunta el PDF: la cotización ya salió. En el laboratorio el correo va
// al buzón de ensayo y nunca a un cliente.

/** Cuántos correos del hilo lee completos la IA (los más nuevos). */
const CORREOS_A_LEER = 3;

/** Un borrador del botón que lleva más de un mes esperando ya no cuenta. */
const DIAS_EN_ESPERA = 30;

/** En la tanda («envía los seguimientos»), las que van por otro medio se
 *  saltan con su porqué; a pedido de una persona entra cualquier enviada o
 *  en negociación (como `proponer_seguimiento`). */
export function porQueNoVaEnLaTanda(
  estado: string,
  notas: NotaDeBitacora[],
): string | null {
  const no = porQueNoEntraAPedido(estado);
  if (no) return no;
  const compromiso = compromisoVivo(notas);
  if (compromiso && compromiso.tipo && compromiso.tipo !== 'correo') {
    return `su próximo contacto es por ${compromiso.tipo}, no por correo.`;
  }
  return null;
}

@Injectable()
export class SeguimientoConBeliaService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly lecturas: SeguimientoRepository,
    private readonly seguimiento: SeguimientoConIAService,
    private readonly envio: EnvioConBeliaService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly choques: ChoquesDeFechaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SeguimientoConBeliaService.name);
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

  private outlook(): OutlookDeLaCasa {
    return this.seguimiento.llaveDeOutlook();
  }

  /** Paso 1: el seguimiento listo para salir, o por qué no. `aPedido`: la
   *  persona nombró la cotización; si no, viene de la tanda. */
  async preparar(
    quotationId: string,
    user: User,
    aPedido: boolean,
  ): Promise<EnvioPreparado | EnvioSaltado> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Falta la llave de Anthropic en el motor: el seguimiento no se puede escribir.',
      );
    }
    const companyId = user.company_id;
    const q = await this.lecturas.cotizacion(quotationId, companyId);
    if (!q) throw new NotFoundException('Cotización no encontrada.');
    const cliente = q.clients?.name?.trim() || 'sin cliente';
    const saltada = (motivo: string): EnvioSaltado => ({
      quotation_id: q.id,
      numero: q.quotation_number,
      cliente,
      motivo,
    });
    const notas = await this.lecturas.bitacora(q.id, companyId);
    const no = aPedido
      ? porQueNoEntraAPedido(q.quotation_status)
      : porQueNoVaEnLaTanda(q.quotation_status, notas);
    if (no) return saltada(no);
    if ((await this.choques.cotizacionesConTope(companyId)).has(q.id)) {
      return saltada(
        'tiene tope de calendario con una aceptada: decide primero si sigue con su fecha.',
      );
    }
    // Un borrador de «✉ Generar seguimiento» que espera en Outlook: no se
    // escribe otro encima.
    const desde = new Date(
      Date.now() - DIAS_EN_ESPERA * 86_400_000,
    ).toISOString();
    const enEspera = await this.lecturas
      .borradoresEnEspera(companyId, desde, q.id)
      .catch(() => []);
    if (enEspera.length > 0) {
      return saltada(
        `ya hay un borrador de seguimiento esperando en Outlook (${enEspera[0].buzon.split('@')[0]}@): envíalo o bórralo desde ahí.`,
      );
    }
    const hoy = fechaEnChile();
    const fecha = q.event_date ? q.event_date.slice(0, 10) : null;
    const fin = q.event_end_date ? q.event_end_date.slice(0, 10) : fecha;
    if (fin && fin < hoy) return saltada('el evento ya pasó.');
    const correos = correosDeLaCotizacion(q);
    if (correos.length === 0) {
      return saltada(
        'el cliente no tiene un correo útil: el seguimiento va por otro canal.',
      );
    }

    const { buzon, ensayo } = this.envio.buzon();
    const outlook = this.outlook();
    const casa = {
      esDeLaCasa: (c: string) => outlook.esDeLaCasa(c),
      esDeEventia: (c: string) => outlook.esDeEventia(c),
    };

    // El hilo, solo en contacto@ (Felipe, 28-11: «siempre desde
    // contacto@»): si la conversación estaba en otro buzón, va como correo
    // nuevo desde contacto@.
    let decision: ReturnType<typeof decidirHilo>;
    let delHilo: Array<MensajeDelBuzon & { texto: string }> = [];
    let sinRespuesta = 0;
    try {
      const mensajes = (
        await Promise.all(correos.map((c) => outlook.buscar(buzon, c)))
      ).flat();
      const unicos = [...new Map(mensajes.map((m) => [m.id, m])).values()];
      decision = decidirHilo({
        encontrados: [{ buzon, mensajes: unicos }],
        ...casa,
        ultimaGestion: notas.filter(esGestion).at(-1)?.created_at ?? null,
        buzonParaNuevo: buzon,
        numero: q.quotation_number,
        creada: q.created_at,
      });
      if (decision.modo === 'seguimiento' || decision.modo === 'responder') {
        sinRespuesta = seguimientosSinRespuesta({
          mensajes: decision.hilo,
          ...casa,
        });
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
    } catch (e) {
      throw this.errorDeOutlook(e, q.quotation_number);
    }
    if (decision.modo === 'saltar') return saltada(decision.motivo);

    const contacto =
      q.clients?.client_contacts?.find((c) => c.id === q.client_contact_id) ??
      null;
    const uso: Uso = {
      entrada: 0,
      escrituraCache: 0,
      lecturaCache: 0,
      salida: 0,
    };
    const r = (await preguntarALaIA(
      this.cliente(),
      this.modelo,
      this.logger,
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
        // La voz es la de contacto@ también en el laboratorio, donde el
        // buzón de ensayo es felipe@.
        buzon: BUZON_DEL_ENVIO,
        hilo: delHilo,
      }),
      uso,
      {
        esquema: ESQUEMA_DEL_SEGUIMIENTO_PARA_ENVIAR,
        instrucciones: instruccionesDelSeguimientoParaEnviar,
      },
    )) as RespuestaDelSeguimientoParaEnviar;
    const costo = costoEnDolares(this.modelo, uso);
    if (r.accion === 'saltar') {
      return saltada(r.motivo.trim() || 'la IA decidió no escribirlo.');
    }
    const html = limpiarHtml(r.cuerpo_html).trim();
    if (!html) {
      throw new UnprocessableEntityException(
        `La IA devolvió vacío el seguimiento de la N° ${q.quotation_number}. Vuelve a pedirlo.`,
      );
    }
    // Alguien pudo anotar una gestión mientras la IA escribía.
    const notasAhora = await this.lecturas.bitacora(q.id, companyId);
    if (notasAhora.length !== notas.length) {
      return saltada(
        'alguien anotó una gestión mientras se escribía: revisa la bitácora y pídemelo de nuevo.',
      );
    }

    const idMensaje = decision.modo === 'nuevo' ? null : decision.mensaje.id;
    const cc =
      decision.modo === 'nuevo' || ensayo
        ? []
        : copiasDelHilo(decision.mensaje, correos, casa.esDeLaCasa);
    const asunto =
      r.asunto.trim() ||
      `Cotización N° ${q.quotation_number}${fecha ? `: ${fechaLegible(fecha)}` : ''}`;
    const para = ensayo ? buzon : correos[0];
    let borrador: { id: string; enlace: string | null };
    try {
      const creado = await outlook.borradorParaEnviar({
        buzon,
        idMensaje,
        html,
        para,
        cc,
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
      `N° ${q.quotation_number}: seguimiento listo en ${buzon} (${decision.modo})${costo != null ? ` · US$ ${costo.toFixed(3)}` : ''}`,
    );
    return {
      clase: 'seguimiento',
      sin_respuesta: sinRespuesta,
      quotation_id: q.id,
      numero: q.quotation_number,
      cliente,
      para,
      cc,
      para_real: ensayo ? correos[0] : null,
      buzon,
      en_hilo: Boolean(idMensaje),
      asunto: idMensaje ? (delHilo[0]?.asunto ?? asunto) : asunto,
      borrador_id: borrador.id,
      enlace: borrador.enlace,
      texto: aTexto(html),
      resumen: r.angulo.trim(),
      nota: r.nota.trim(),
      total: pesos(Number(q.total_amount) || 0),
      costo_usd: costo,
    };
  }

  /** Paso 2, con el «Sí, enviar». */
  async enviar(
    e: EnvioPreparado,
    user: User,
  ): Promise<{ enviado_a: string; aviso: string }> {
    const companyId = user.company_id;
    const q = await this.lecturas.cotizacion(e.quotation_id, companyId);
    if (!q) throw new NotFoundException('La cotización ya no existe.');
    if (!ESTADOS_CON_SEGUIMIENTO.includes(q.quotation_status)) {
      throw new ConflictException(
        `La N° ${q.quotation_number} ya no está enviada ni en negociación (está ${q.quotation_status}): no envié el seguimiento.`,
      );
    }
    const outlook = this.outlook();
    try {
      const estado = await outlook.estadoDelBorrador(e.buzon, e.borrador_id);
      if (estado.estado !== 'borrador') {
        throw new ConflictException(
          `El seguimiento de la N° ${q.quotation_number} ya no está en Outlook (${estado.estado === 'enviado' ? 'ya salió' : 'lo borraron'}). Pídemelo de nuevo.`,
        );
      }
      await outlook.enviar(e.buzon, e.borrador_id);
    } catch (error) {
      throw this.errorDeOutlook(error, q.quotation_number);
    }

    // Ya salió: lo que sigue no lo rompe. El próximo contacto, con la misma
    // regla que cuando sale un borrador del botón (doc 18 §9).
    const enviado = new Date().toISOString();
    const sinRespuesta = (e.sin_respuesta ?? 0) + 1;
    const proximo = proximoTrasElEnvio(enviado, sinRespuesta);
    const desde = `${e.buzon.split('@')[0]}@`;
    await this.bitacora
      .crearComoBeliaAPedidoDe(user, {
        quotation_id: q.id,
        tipo: proximo.tipo,
        next_contact_date: proximo.fecha,
        note: `${notaDelEnvio({
          buzon: e.buzon,
          enviado,
          conElBorrador: true,
          sinRespuesta,
          proximo,
        })}${e.en_hilo ? '' : ' Fue como correo nuevo (no había hilo en contacto@).'}${e.nota ? ` Lo hablado: ${e.nota}` : ''}`,
      })
      .catch((err: unknown) =>
        this.logger.warn(`no pude anotar el seguimiento: ${mensajeDe(err)}`),
      );
    this.logger.info(
      `N° ${q.quotation_number}: seguimiento enviado por BelIA a ${e.para} desde ${e.buzon}; próximo contacto ${proximo.tipo} el ${proximo.fecha}`,
    );
    return {
      enviado_a: e.para,
      aviso: `Seguimiento enviado a ${e.para} desde ${desde}${e.en_hilo ? ', en su hilo' : ''}. Próximo contacto: ${proximo.tipo === 'llamada' ? 'llamada' : 'correo'} el ${proximo.fecha.slice(8, 10)}-${proximo.fecha.slice(5, 7)}.`,
    };
  }

  private errorDeOutlook(error: unknown, numero: number): Error {
    if (error instanceof ErrorDeOutlook) {
      this.logger.error(`N° ${numero}: Outlook falló: ${error.message}`);
      return new ServiceUnavailableException(
        error.status === 401 || error.status === 400
          ? `Outlook no aceptó el seguimiento de la N° ${numero} (${error.message.slice(0, 160)}).`
          : `Outlook no respondió bien con la N° ${numero} (${error.status}). Vuelve a intentarlo en un rato.`,
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
