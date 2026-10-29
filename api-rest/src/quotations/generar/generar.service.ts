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
import type { UpdateQuotationDto } from '../dto/update-quotation.dto';
import { QuotationsService } from '../quotations.service';
import { computeMoney } from '../utils/money';
import { armarFoto, type ResultadoDelArmado } from './armar-foto';
import { type Catalogo, catalogoComoTexto, pesos } from './catalogo';
import { type HistoriaDelMomento, mensajeDelRequerimiento } from './contexto';
import { sumarDias } from './fechas';
import {
  type FilaDelRequerimiento,
  GenerarRepository,
} from './generar.repository';
import { type CotizacionVendida, loMasVendido, masParecidas } from './historia';
import {
  esTourOperador,
  instrucciones,
  ofrecible,
} from './reglas-valle-del-sol';
import { ESQUEMA_DEL_PLAN, type PlanDeLaIA } from './tipos';

// EL BOTÓN «✨ CREAR CON IA» (doc 16, sección 6; Felipe, 17-10).
//
// Toma un requerimiento sin servicios, le cuenta a Claude el pedido, el
// comentario interno, el catálogo de hoy y la historia de este momento, y
// guarda la cotización que vuelve, en solicitada. La IA solo elige ids:
// nombres y precios salen del catálogo, la cuenta es la del cotizador
// (`computeMoney`) y el guardado pasa por la misma puerta que el cotizador
// (`QuotationsService.update`, con su verificación al peso). Nunca envía.

/** El modelo se cambia en Railway sin tocar código (doc 16 §6). */
export const MODELO_POR_DEFECTO = 'claude-opus-5-5';

/** USD por millón de tokens de Claude Opus 5.5 (skill claude-api, 17-10). */
const PRECIOS_OPUS_5_5 = {
  entrada: 4,
  escrituraCache: 5,
  lecturaCache: 0.2,
  salida: 20,
};

/** Tope del comentario interno: el mismo del formulario (DTO, 5.000). */
const TOPE_COMENTARIO = 5000;

/** Si el total se pasa del presupuesto más que esto, va la nota (regla 13). */
const HOLGURA_DEL_PRESUPUESTO = 0.1;

export type ResultadoDeGenerar = {
  quotation_number: number;
  total_amount: number;
  value_per_person: number;
  nota: string;
  segundos: number;
  costo_usd: number | null;
};

type ArmadoValido = Extract<ResultadoDelArmado, { ok: true }>;

type Uso = {
  entrada: number;
  escrituraCache: number;
  lecturaCache: number;
  salida: number;
};

const sinServicios = (r: FilaDelRequerimiento): boolean =>
  (r.items?.variable_services?.length ?? 0) === 0 &&
  (r.items?.fixed_services?.length ?? 0) === 0;

/** La falla es de la cuenta o del pedido, no de este requerimiento. La
 *  usa también el seguimiento con IA (misma cuenta de Anthropic). */
export const esFallaDeLaCuenta = (error: unknown): boolean =>
  error instanceof Anthropic.AuthenticationError ||
  error instanceof Anthropic.PermissionDeniedError ||
  error instanceof Anthropic.RateLimitError ||
  error instanceof Anthropic.NotFoundError ||
  (error instanceof Anthropic.BadRequestError &&
    /credit balance/i.test(error.message));

export const costoEnDolares = (modelo: string, uso: Uso): number | null => {
  if (modelo !== MODELO_POR_DEFECTO) return null;
  const p = PRECIOS_OPUS_5_5;
  return (
    (uso.entrada * p.entrada +
      uso.escrituraCache * p.escrituraCache +
      uso.lecturaCache * p.lecturaCache +
      uso.salida * p.salida) /
    1_000_000
  );
};

/** La línea del presupuesto (regla 13): solo si se pasa de verdad. */
export function notaDelPresupuesto(
  presupuesto: PlanDeLaIA['presupuesto_cliente'],
  total: number,
  porPersona: number,
): string | null {
  const monto = Math.round(presupuesto?.monto ?? 0);
  if (monto <= 0) return null;
  const real = presupuesto.por === 'persona' ? porPersona : total;
  if (real <= monto * (1 + HOLGURA_DEL_PRESUPUESTO)) return null;
  const como = presupuesto.por === 'persona' ? 'por persona' : 'en total';
  return `Se excede el presupuesto: el cliente habla de ${pesos(monto)} ${como} y la cotización suma ${pesos(real)} ${como}.`;
}

@Injectable()
export class GenerarCotizacionService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repositorio: GenerarRepository,
    private readonly quotationsService: QuotationsService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerarCotizacionService.name);
  }

  /** Se crea al primer uso y lee ANTHROPIC_API_KEY. Paciente con los 429:
   *  la cuenta es nueva y la comparte el radar de licitaciones. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  get modelo(): string {
    return process.env.MODELO_COTIZAR?.trim() || MODELO_POR_DEFECTO;
  }

  async generar(id: string, user: User): Promise<ResultadoDeGenerar> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Falta la llave de Anthropic en el motor: la cotización no se puede generar.',
      );
    }
    const inicio = Date.now();
    const companyId = user.company_id;

    const req = await this.repositorio.requerimiento(id, companyId);
    if (!req) throw new NotFoundException('Requerimiento no encontrado.');
    this.asegurarQueSePuede(req);

    const fecha = String(req.event_date ?? '').slice(0, 10);
    const personas = Number(req.people_count) || 0;
    const ninos = Number(req.children_count) || 0;
    if (!fecha || personas < 1) {
      throw new UnprocessableEntityException(
        'El requerimiento necesita fecha y cantidad de personas para generar la cotización.',
      );
    }

    const catalogo = await this.repositorio.catalogo(companyId);
    const historia = await this.historiaDelMomento(req, catalogo);
    const hoy = new Date().toISOString().slice(0, 10);
    const mensaje = mensajeDelRequerimiento(
      {
        numero: req.quotation_number,
        tipoEvento: req.event_type ?? '',
        fecha,
        fin: req.event_end_date
          ? String(req.event_end_date).slice(0, 10)
          : null,
        personas,
        ninos,
        observaciones: req.observations,
        comentarioInterno: req.comentario_interno,
        cliente: req.clients?.name ?? null,
        tipoCliente: req.clients?.client_type ?? null,
      },
      historia,
      catalogo,
      hoy,
    );

    const evento = {
      fecha,
      personas,
      ninos,
      esTourOperador: esTourOperador(req.clients?.client_type),
    };
    const uso: Uso = {
      entrada: 0,
      escrituraCache: 0,
      lecturaCache: 0,
      salida: 0,
    };
    const conversacion: Anthropic.MessageParam[] = [
      { role: 'user', content: mensaje },
    ];
    const sistema = this.sistema(catalogo);

    // Dos intentos. Si lo primero no calza con el catálogo, la IA recibe
    // la lista de errores y corrige; si calza pero alguna comida no tiene
    // la forma de la casa (dos principales, sin postre…) o no parte de un
    // menú guardado, la recibe para corregir o explicar. Se queda la
    // última que se pudo armar.
    let elegido: { plan: PlanDeLaIA; armado: ArmadoValido } | null = null;
    let errores: string[] = [];
    for (let intento = 1; intento <= 2; intento++) {
      const respuesta = await this.preguntar(sistema, conversacion, uso);
      const armado = armarFoto(respuesta.plan, catalogo, evento, ofrecible);
      if (armado.ok) {
        elegido = { plan: respuesta.plan, armado };
        if (armado.avisos.length === 0) break;
      } else {
        errores = armado.errores;
      }
      if (intento === 2) break;
      const reparos = armado.ok ? armado.avisos : armado.errores;
      this.logger.warn(
        `N° ${req.quotation_number}: intento ${intento} con ${reparos.length} ${armado.ok ? 'avisos' : 'errores'}`,
      );
      conversacion.push(
        { role: 'assistant', content: respuesta.contenido },
        {
          role: 'user',
          content: armado.ok
            ? `Revisa estas cajas con las reglas de la casa («Cómo se arma» y «La forma de cada comida»):\n- ${reparos.join('\n- ')}\nSi el pedido lo pide así, déjalas y explícalo en la nota; si no, corrígelas partiendo de un menú guardado y adaptándolo. Devuelve la cotización completa.`
            : `Eso no se puede guardar:\n- ${reparos.join('\n- ')}\nCorrige y devuelve la cotización completa.`,
        },
      );
    }
    if (!elegido) {
      throw new UnprocessableEntityException(
        `La IA no logró armar una cotización válida: ${errores.slice(0, 5).join(' · ') || 'sin respuesta'}`,
      );
    }
    const { plan, armado } = elegido;

    const dinero = computeMoney({
      items: armado.items,
      people_count: personas,
      children_count: ninos,
      discount_percentage: armado.descuentoPorcentaje,
      discount_amount: 0,
      tip_percentage: null,
    });

    const segundos = Math.round((Date.now() - inicio) / 1000);
    const costo = costoEnDolares(this.modelo, uso);
    const nota = [
      plan.nota.trim(),
      ...armado.avisos.map((a) => `Revisar: ${a}`),
      notaDelPresupuesto(
        plan.presupuesto_cliente,
        dinero.totalAmount,
        dinero.valuePerPerson,
      ),
    ]
      .filter(Boolean)
      .join('\n');

    // Justo antes de guardar, de nuevo los candados: alguien pudo armarla a
    // mano mientras la IA pensaba (Felipe trabaja en paralelo).
    const ahora = await this.repositorio.requerimiento(id, companyId);
    if (!ahora) throw new NotFoundException('Requerimiento no encontrado.');
    this.asegurarQueSePuede(ahora);

    const cambios = {
      items: armado.items as unknown as UpdateQuotationDto['items'],
      request_type: 'cotizacion',
      value_per_person: dinero.valuePerPerson,
      fixed_value: dinero.fixedTotal,
      subtotal_amount: dinero.subtotalAmount,
      discount_percentage: armado.descuentoPorcentaje,
      discount_amount: 0,
      tip_percentage: null,
      tip_amount: 0,
      total_amount: dinero.totalAmount,
      comentario_interno: this.comentarioConNota(
        ahora.comentario_interno,
        nota,
      ),
      ...(armado.ultimoDia ? { event_end_date: armado.ultimoDia } : {}),
    } as UpdateQuotationDto;
    await this.quotationsService.update(id, cambios, companyId, user.role, {
      derechos: user.derechos,
      plan: user.plan,
    });

    // Lo que escribe la IA lo firma el Asistente (Felipe, 28-10-2026).
    await this.bitacora
      .crearComoAsistente(companyId, {
        quotation_id: id,
        tipo: 'otro',
        next_contact_date: null,
        note: `Cotización generada con IA en ${segundos} s${costo != null ? ` (costo aprox. US$ ${costo.toFixed(2)})` : ''}. Total ${pesos(dinero.totalAmount)}. Las notas quedaron en el comentario interno: revísalas antes de enviarla.`,
      })
      .catch((e: unknown) =>
        this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
      );

    this.logger.info(
      `N° ${req.quotation_number} generada con ${this.modelo} en ${segundos} s · entrada ${uso.entrada} · caché ${uso.escrituraCache}/${uso.lecturaCache} · salida ${uso.salida}${costo != null ? ` · US$ ${costo.toFixed(3)}` : ''}`,
    );

    return {
      quotation_number: req.quotation_number,
      total_amount: dinero.totalAmount,
      value_per_person: dinero.valuePerPerson,
      nota,
      segundos,
      costo_usd: costo,
    };
  }

  /** Solo requerimientos en solicitada y sin servicios: nunca pisa lo
   *  armado (doc 16, regla 12). */
  private asegurarQueSePuede(r: FilaDelRequerimiento): void {
    if (
      r.request_type !== 'requerimiento' ||
      r.quotation_status !== 'solicitada' ||
      !sinServicios(r)
    ) {
      throw new ConflictException(
        'Solo se generan requerimientos en solicitada y sin servicios: este ya está armado o ya es cotización.',
      );
    }
  }

  /** Las reglas y el catálogo van como instrucciones fijas, en caché: la
   *  segunda cotización seguida (o «Generar todas») los lee mucho más barato. */
  private sistema(catalogo: Catalogo): Anthropic.TextBlockParam[] {
    return [
      { type: 'text', text: instrucciones() },
      {
        type: 'text',
        text: `EL CATÁLOGO DE HOY\n\n${catalogoComoTexto(catalogo, ofrecible)}`,
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  private async preguntar(
    sistema: Anthropic.TextBlockParam[],
    conversacion: Anthropic.MessageParam[],
    uso: Uso,
  ): Promise<{ plan: PlanDeLaIA; contenido: Anthropic.ContentBlock[] }> {
    try {
      const respuesta = await this.cliente().messages.parse({
        model: this.modelo,
        max_tokens: 16000,
        output_config: { format: jsonSchemaOutputFormat(ESQUEMA_DEL_PLAN) },
        system: sistema,
        messages: conversacion,
      });
      uso.entrada += respuesta.usage.input_tokens ?? 0;
      uso.escrituraCache += respuesta.usage.cache_creation_input_tokens ?? 0;
      uso.lecturaCache += respuesta.usage.cache_read_input_tokens ?? 0;
      uso.salida += respuesta.usage.output_tokens ?? 0;
      if (respuesta.stop_reason === 'refusal') {
        throw new UnprocessableEntityException(
          'La IA no quiso armar esta cotización. Ármala a mano.',
        );
      }
      if (respuesta.stop_reason === 'max_tokens' || !respuesta.parsed_output) {
        throw new UnprocessableEntityException(
          'La respuesta de la IA llegó incompleta. Vuelve a intentarlo.',
        );
      }
      return {
        plan: respuesta.parsed_output as PlanDeLaIA,
        contenido: respuesta.content,
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      if (esFallaDeLaCuenta(error)) {
        this.logger.error(`la cuenta de Anthropic falló: ${mensajeDe(error)}`);
        throw new ServiceUnavailableException(
          'La IA no está disponible ahora (cuenta de Anthropic sin cupo o con la llave mala). Prueba en un rato o ármala a mano.',
        );
      }
      this.logger.error(`la IA falló: ${mensajeDe(error)}`);
      throw new ServiceUnavailableException(
        'La IA no respondió. Vuelve a intentarlo en un rato o ármala a mano.',
      );
    }
  }

  /** La historia de ESTE momento (Felipe, 17-10): la última vendida del
   *  cliente, las parecidas del mismo tipo y lo más vendido por comida. */
  private async historiaDelMomento(
    req: FilaDelRequerimiento,
    catalogo: Catalogo,
  ): Promise<HistoriaDelMomento> {
    const companyId = req.company_id;
    const desde = sumarDias(new Date().toISOString().slice(0, 10), -548);
    const delTipo = req.event_type
      ? await this.repositorio.vendidas(companyId, {
          tipo: req.event_type,
          desde,
        })
      : [];
    const deTodos =
      delTipo.length >= 3
        ? null
        : await this.repositorio.vendidas(companyId, { desde });
    let ultima: CotizacionVendida | null = null;
    if (req.client_id) {
      [ultima = null] = await this.repositorio.vendidas(
        companyId,
        { clienteId: req.client_id },
        1,
      );
    }
    const parecidas = masParecidas(
      delTipo.filter((v) => v.numero !== ultima?.numero),
      Number(req.people_count) || 0,
      4,
    );
    return {
      ultimaDelCliente: ultima,
      parecidas,
      masVendido: loMasVendido(deTodos ?? delTipo, catalogo.menus),
      masVendidoDeTodos: deTodos !== null,
    };
  }

  /** La nota de la IA va al final del comentario interno (Felipe, 17-10:
   *  "en el mismo bloque de notas internas"), nunca a Observaciones. */
  private comentarioConNota(actual: string | null, nota: string): string {
    const hora = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
    const bloque = `— Generada con IA · ${hora} —\n${nota}`;
    const previo = (actual ?? '').trim();
    const junto = previo ? `${previo}\n\n${bloque}` : bloque;
    return junto.length > TOPE_COMENTARIO
      ? `${junto.slice(0, TOPE_COMENTARIO - 1)}…`
      : junto;
  }
}
