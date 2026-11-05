import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { tieneDerecho } from 'src/auth/derechos';
import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import { cerebroPara } from 'src/cerebro/cerebro';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { LogisticsService } from 'src/logistics/logistics.service';
import {
  MODELO_OPUS,
  costoDelUso,
  errorDeIA,
  hoyEnChile,
} from 'src/oportunidades/analisis/comun';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { ChoqueDeFecha } from 'src/quotations/choques/choques';
import { ChoquesDeFechaService } from 'src/quotations/choques/choques.service';
import { RequestType } from 'src/quotations/constants/constants';
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { UserRole, type User } from 'src/users/entities/user.entity';
import {
  AsistenteRepository,
  type ComprobantePorRevisar,
} from './asistente.repository';
import { clienteAbierto } from './conversacion/cliente-abierto';
import { LoLeido } from './conversacion/lo-leido';
import type { MensajeDto, PantallaDto, TurnoDto } from './dto/mensaje.dto';
import { herramientasPara } from './herramientas';
import {
  ErrorDeHerramienta,
  estadoDe,
  inicioDelDiaEnChile,
  type ContextoDeHerramienta,
  type Herramienta,
} from './herramientas/comun';
import { esRecepcion, taparPlata } from './herramientas/recepcion';
import { pendientesDe } from './herramientas/seguimientos-pendientes';
import { INSTRUCCIONES_FIJAS, instruccionesDelMomento } from './instrucciones';
import type { TarjetaDePropuesta } from './propuestas/comun';
import { PropuestasService } from './propuestas/propuestas.service';

// BELIA, LA IA DE EVENTIA (doc 20; Felipe, 03-11-2026: "una ventanilla como
// de soporte de chat en Eventia, que esté conectado a un agente, ojalá
// Opus").
//
// Claude conversa con las herramientas de `herramientas/`, que leen con la
// empresa y el cargo de quien escribe (fase 1) o arman propuestas que la
// persona aprueba (fase 2, `propuestas/`). El ciclo es el de siempre de la
// API: si Claude pide una herramienta, el motor la corre y le devuelve el
// resultado, hasta que contesta.
//
// Las barreras no viven acá ni en las instrucciones: viven en que no hay
// herramienta para lo que no se debe hacer (doc 20 §3, regla 2).

/** El modelo se cambia en Railway sin tocar código (doc 20 §2). */
export const MODELO_POR_DEFECTO = MODELO_OPUS;

/** US$ al mes por empresa (Felipe, 03-11: "mmm 100 USD mensuales?"). Desde
 *  el 04-11 cada empresa trae su cupo (`companies.tope_asistente_usd`,
 *  migración 183: 10 para las nuevas, 100 para Valle del Sol); este valor,
 *  o TOPE_ASISTENTE_USD en Railway, queda para cuando no se puede leer. */
export const TOPE_POR_DEFECTO_USD = 100;

/** Vueltas de herramientas por pregunta: una búsqueda, la ficha y una más
 *  sobran para casi todo; el tope frena un ciclo que no termina. */
const MAX_VUELTAS = 8;

/** Lo que puede escribir Claude por vuelta, pensando incluido. */
const MAX_TOKENS = 16_000;

/** Cuántos turnos de la conversación viajan (los más nuevos). */
const MAX_TURNOS = 20;

export type RespuestaDeBelia = {
  respuesta: string;
  herramientas: string[];
  segundos: number;
  costo_usd: number;
  /** Solo para administradores (doc 20 §7: el aviso del 80 %). */
  uso_del_mes?: { gastado_usd: number; tope_usd: number };
  /** Las propuestas de esta respuesta, para las tarjetas (fase 2). */
  propuestas?: TarjetaDePropuesta[];
};

/** Lo que la respuesta en vivo va mandando mientras BelIA trabaja (doc 20
 *  §9, «respuesta en vivo»): el texto apenas Claude lo escribe, y el aviso
 *  de que va a usar herramientas. Lo escrito antes de una herramienta no es
 *  la respuesta: la respuesta es lo de la última vuelta. */
export type EventoEnVivo =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'herramientas'; nombres: string[] };

/** Lo que mira la ventanilla para el ánimo de BelIA (doc 20 §8b). */
export type EstadoDeBelia = {
  /** Cotizaciones vivas con el compromiso vencido. */
  vencidos: number;
  /** Las que llevan 3 días o más sin gestión, sin compromiso. */
  sin_gestion: number;
  /** Compromisos que vencen hoy, todavía sin cumplir. */
  vencen_hoy: number;
  /** Requerimientos que llegaron hoy (día en Chile). */
  requerimientos_de_hoy: number;
  /** Cotizaciones vivas con tope de calendario (la lista del tablero). */
  topes_de_calendario: number;
  /** Comprobantes del portal sin revisar: solo a operaciones para arriba
   *  con Post-Venta (los demás reciben 0). */
  comprobantes_por_revisar: number;
};

/** La conversación que trae la ventanilla, como la pide la API: parte con
 *  la persona y alterna. El saludo de la ventanilla no viaja. */
export const comoMensajes = (
  historial: TurnoDto[] | undefined,
  mensaje: string,
): Anthropic.MessageParam[] => {
  const turnos = [
    ...(historial ?? []).slice(-MAX_TURNOS),
    { rol: 'persona' as const, texto: mensaje },
  ];
  const mensajes: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const t of turnos) {
    const role = t.rol === 'belia' ? 'assistant' : 'user';
    const texto = t.texto.trim();
    if (!texto) continue;
    if (mensajes.length === 0 && role === 'assistant') continue;
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo?.role === role) {
      ultimo.content = `${ultimo.content}\n\n${texto}`;
      continue;
    }
    mensajes.push({ role, content: texto });
  }
  return mensajes;
};

// LO QUE CUESTA (doc 20 §7; Felipe, 03-11: "alguna forma de que sea más
// eficiente?"). Las instrucciones y las herramientas se guardan en la caché
// una hora; la conversación, cinco minutos, con la marca siempre al final,
// así cada vuelta lee de la caché lo de las anteriores en vez de pagarlo
// de nuevo. Las de una hora van antes que las de cinco minutos, como pide
// la API, y son 3 marcas de las 4 que permite.
const CACHE_5M: Anthropic.CacheControlEphemeral = { type: 'ephemeral' };
const CACHE_1H: Anthropic.CacheControlEphemeral = {
  type: 'ephemeral',
  ttl: '1h',
};

/** Los tokens de una respuesta, con la caché de cada duración aparte. */
type Uso = {
  entrada: number;
  salida: number;
  cacheLeida: number;
  cache5m: number;
  cache1h: number;
};

const SIN_USO: Uso = {
  entrada: 0,
  salida: 0,
  cacheLeida: 0,
  cache5m: 0,
  cache1h: 0,
};

export const usoDe = (u: Anthropic.Usage): Uso => {
  const escrita = u.cache_creation_input_tokens ?? 0;
  const unaHora = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return {
    entrada: u.input_tokens ?? 0,
    salida: u.output_tokens ?? 0,
    cacheLeida: u.cache_read_input_tokens ?? 0,
    cache5m: u.cache_creation?.ephemeral_5m_input_tokens ?? escrita - unaHora,
    cache1h: unaHora,
  };
};

const sumar = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  cacheLeida: a.cacheLeida + b.cacheLeida,
  cache5m: a.cache5m + b.cache5m,
  cache1h: a.cache1h + b.cache1h,
});

/** Lo que cuesta, con los precios de la página de Anthropic (verificados
 *  el 03-11): la caché de una hora se escribe más cara que la de cinco
 *  minutos. */
export const costoDe = (u: Uso, modelo: string): number =>
  costoDelUso(
    {
      entrada: u.entrada,
      salida: u.salida,
      cacheEscrita: u.cache5m,
      cacheLeida: u.cacheLeida,
    },
    modelo,
    '5m',
  ) +
  costoDelUso(
    { entrada: 0, salida: 0, cacheEscrita: u.cache1h, cacheLeida: 0 },
    modelo,
    '1h',
  );

/** La marca de caché de la conversación va en su último bloque, y en ningún
 *  otro: la de la vuelta anterior se saca. */
export const marcarElFinal = (mensajes: Anthropic.MessageParam[]): void => {
  for (const m of mensajes) {
    if (typeof m.content === 'string') continue;
    for (const b of m.content) {
      delete (b as { cache_control?: unknown }).cache_control;
    }
  }
  const ultimo = mensajes[mensajes.length - 1];
  if (!ultimo) return;
  if (typeof ultimo.content === 'string') {
    ultimo.content = [
      { type: 'text', text: ultimo.content, cache_control: CACHE_5M },
    ];
    return;
  }
  const bloque = ultimo.content[ultimo.content.length - 1];
  if (bloque) (bloque as { cache_control?: unknown }).cache_control = CACHE_5M;
};

/** Cuánto piensa antes de contestar (doc 20 §7): «medium» por defecto,
 *  porque escribir es lo más caro. Se cambia en Railway con
 *  ESFUERZO_ASISTENTE. */
const ESFUERZOS = ['low', 'medium', 'high'] as const;
type Esfuerzo = (typeof ESFUERZOS)[number];

@Injectable()
export class AsistenteService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repositorio: AsistenteRepository,
    private readonly cotizaciones: QuotationsRepository,
    private readonly catalogo: GenerarRepository,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
    // AL FINAL a propósito: las pruebas arman este servicio por posición.
    private readonly logistica: LogisticsService,
    private readonly propuestas: PropuestasService,
    private readonly choques: ChoquesDeFechaService,
    // Lo que BelIA ya leyó en la conversación (04-11-2026). Con valor por
    // defecto: las pruebas que no lo pasan siguen igual.
    private readonly loLeido: LoLeido = new LoLeido(),
    // Lo que ve recepción (doc 21): la plata de sus particulares. Sin ella,
    // recepción no ve la de nadie.
    @Optional() private readonly alcance?: AlcanceDeRecepcion,
  ) {
    this.logger.setContext(AsistenteService.name);
  }

  /** Se crea al primer uso y lee ANTHROPIC_API_KEY. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 120_000,
      });
    }
    return this.clienteAnthropic;
  }

  get modelo(): string {
    return process.env.MODELO_ASISTENTE?.trim() || MODELO_POR_DEFECTO;
  }

  get esfuerzo(): Esfuerzo {
    const v = process.env.ESFUERZO_ASISTENTE?.trim();
    return ESFUERZOS.includes(v as Esfuerzo) ? (v as Esfuerzo) : 'medium';
  }

  get tope(): number {
    const v = Number(process.env.TOPE_ASISTENTE_USD);
    return Number.isFinite(v) && v > 0 ? v : TOPE_POR_DEFECTO_USD;
  }

  async responder(
    dto: MensajeDto,
    usuario: User,
    // Con esto, la respuesta va en vivo (POST /asistente/mensajes/en-vivo).
    alEscribir?: (evento: EventoEnVivo) => void,
  ): Promise<RespuestaDeBelia> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const empresa = usuario.company_id;
    if (!empresa) throw new BadRequestException('La sesión no trae empresa.');

    const hoy = hoyEnChile();
    const mes = hoy.slice(0, 7);
    const [gastado, tope] = await Promise.all([
      this.repositorio.gastoDelMes(empresa, mes),
      this.topeDe(empresa),
    ]);
    if (gastado >= tope) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          codigo: 'TOPE_DE_BELIA',
          message: `BelIA llegó a su cupo de US$ ${tope} de este mes. Vuelve el día 1, o pídele a Eventia más cupo.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const herramientas = herramientasPara(usuario);
    const [pantalla, nombreEmpresa, nombre] = await Promise.all([
      this.pantallaDe(dto.pantalla, empresa, usuario.role),
      this.repositorio.nombreDeLaEmpresa(empresa),
      // La sesión no trae el nombre: sin él, BelIA no sabía con quién
      // hablaba ni a pedido de quién anotar (03-11, la 447 del laboratorio).
      usuario.id
        ? this.repositorio
            .nombreDeLaPersona(empresa, usuario.id)
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const persona: User = {
      ...usuario,
      full_name: nombre ?? usuario.full_name,
    };
    const ctx: ContextoDeHerramienta = {
      usuario: persona,
      cotizacionAbierta: pantalla.cotizacion,
      repositorio: this.repositorio,
      cotizaciones: this.cotizaciones,
      catalogo: this.catalogo,
      bitacora: this.bitacora,
      logistica: this.logistica,
      choques: this.choques,
      propuestas: this.propuestas,
      tarjetas: [],
      hoy,
      alcance: this.alcance,
    };
    const sistema: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        // Sus instrucciones y, después, el cerebro común de la IA de Eventia
        // (Felipe, 04-11-2026: «una sola IA»): lo de la casa y, si la empresa
        // lo tiene escrito, lo suyo. Todo en la caché de una hora.
        text: `${INSTRUCCIONES_FIJAS}\n\n---\n\n${cerebroPara(empresa, 'conversar')}`,
        cache_control: CACHE_1H,
      },
      {
        type: 'text',
        text: instruccionesDelMomento({
          nombre: persona.full_name,
          cargo: usuario.role,
          empresa: nombreEmpresa,
          hoy,
          pantalla: pantalla.texto,
        }),
      },
    ];
    const definiciones: Anthropic.Tool[] = herramientas.map((h, i) => ({
      name: h.nombre,
      description: h.descripcion,
      input_schema: h.esquema,
      // La lista va en caché junto con las instrucciones fijas.
      ...(i === herramientas.length - 1 ? { cache_control: CACHE_1H } : {}),
    }));
    const mensajes: Anthropic.MessageParam[] = comoMensajes(
      dto.historial,
      dto.mensaje,
    );
    // Antes de la pregunta: la ficha del cliente abierto (doc 20 §17) y las
    // fichas que ya revisó, al día (`LoLeido`).
    const alDia =
      [pantalla.cliente, await this.fichasAlDia(herramientas, ctx)]
        .filter((b): b is string => Boolean(b))
        .join('\n\n') || null;
    const pregunta = mensajes[mensajes.length - 1];
    if (alDia && pregunta && typeof pregunta.content === 'string') {
      pregunta.content = [
        { type: 'text', text: alDia },
        { type: 'text', text: pregunta.content },
      ];
    }

    const inicio = Date.now();
    let uso = SIN_USO;
    const usadas: string[] = [];
    let respuesta = '';
    let vueltas = 0;
    let falla: unknown = null;
    try {
      for (; vueltas < MAX_VUELTAS; vueltas++) {
        marcarElFinal(mensajes);
        const pedido: Anthropic.MessageCreateParamsNonStreaming = {
          model: this.modelo,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'adaptive' },
          output_config: { effort: this.esfuerzo },
          system: sistema,
          ...(definiciones.length ? { tools: definiciones } : {}),
          messages: mensajes,
        };
        const r = alEscribir
          ? await this.enVivo(pedido, alEscribir)
          : await this.cliente().messages.create(pedido);
        uso = sumar(uso, usoDe(r.usage));
        const pedidas = r.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        if (r.stop_reason === 'tool_use' && pedidas.length > 0) {
          mensajes.push({ role: 'assistant', content: r.content });
          usadas.push(...pedidas.map((p) => p.name));
          alEscribir?.({
            tipo: 'herramientas',
            nombres: pedidas.map((p) => p.name),
          });
          const resultados = await Promise.all(
            pedidas.map((p) => this.usar(p, herramientas, ctx)),
          );
          mensajes.push({ role: 'user', content: resultados });
          continue;
        }
        respuesta = r.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        if (r.stop_reason === 'max_tokens') {
          respuesta = respuesta
            ? `${respuesta}\n\n(La respuesta quedó cortada: pregúntame por partes.)`
            : 'La respuesta me quedó muy larga: pregúntame por partes.';
        }
        if (!respuesta) respuesta = 'Eso no lo puedo responder.';
        break;
      }
      if (!respuesta) {
        respuesta =
          'No alcancé a terminar la búsqueda: prueba con una pregunta más acotada.';
      }
    } catch (error) {
      falla = error;
    }

    const segundos = Math.round((Date.now() - inicio) / 1000);
    const costo = costoDe(uso, this.modelo);
    if (
      uso.entrada + uso.salida + uso.cache5m + uso.cache1h + uso.cacheLeida >
      0
    ) {
      await this.repositorio
        .registrarUso({
          company_id: empresa,
          usuario_id: usuario.id ?? null,
          mes,
          modelo: this.modelo,
          tokens_entrada: uso.entrada,
          tokens_salida: uso.salida,
          tokens_cache_escrita: uso.cache5m + uso.cache1h,
          tokens_cache_leida: uso.cacheLeida,
          costo_usd: costo,
          segundos,
          herramientas: usadas,
          ruta: dto.pantalla?.ruta ?? null,
          fallo: falla ? mensajeDe(falla).slice(0, 300) : null,
        })
        .catch((e) =>
          this.logger.warn(`no pude anotar el uso de BelIA: ${mensajeDe(e)}`),
        );
    }
    this.logger.info(
      `BelIA ${falla ? 'falló' : 'respondió'} en ${segundos} s · vueltas ${vueltas + 1} · herramientas ${usadas.join(',') || '-'} · entrada ${uso.entrada} · caché 1h ${uso.cache1h} 5m ${uso.cache5m} leída ${uso.cacheLeida} · salida ${uso.salida} · US$ ${costo.toFixed(4)}`,
    );
    if (falla) {
      this.logger.error(`BelIA: ${mensajeDe(falla)}`);
      throw new ServiceUnavailableException(
        errorDeIA(falla, 'BelIA no pudo responder'),
      );
    }

    return {
      respuesta,
      herramientas: usadas,
      segundos,
      costo_usd: costo,
      ...(ctx.tarjetas.length ? { propuestas: ctx.tarjetas } : {}),
      ...(usuario.role === UserRole.ADMINISTRADOR
        ? {
            uso_del_mes: {
              gastado_usd: Math.round((gastado + costo) * 100) / 100,
              tope_usd: tope,
            },
          }
        : {}),
    };
  }

  /** El cupo del mes de la empresa (Felipe, 04-11-2026: «en las otras
   *  empresas que se vayan creando, dale $10 de cupo inicial»). Si no se
   *  puede leer (la 183 sin aplicar), el de siempre. */
  private async topeDe(empresa: number): Promise<number> {
    try {
      return (await this.repositorio.cupoDeLaEmpresa(empresa)) ?? this.tope;
    } catch {
      return this.tope;
    }
  }

  /** Los ánimos de BelIA (doc 20 §8b), sin IA y sin costo: lo vencido
   *  para enojarse y lo nuevo de hoy para llamar la atención (compromisos,
   *  requerimientos, topes de calendario y comprobantes del portal). Cuenta
   *  con las mismas reglas que las herramientas y que el tablero. */
  async estado(usuario: User): Promise<EstadoDeBelia> {
    const empresa = usuario.company_id;
    if (!empresa) throw new BadRequestException('La sesión no trae empresa.');
    const hoy = hoyEnChile();
    // Recepción (doc 20 §13): solo la avisan los requerimientos que llegan.
    // Los seguimientos vencidos son de quien vende: no la enojan.
    if (esRecepcion(usuario.role)) {
      const deHoy = await this.repositorio.buscarCotizaciones(empresa, {
        tipo: RequestType.REQUERIMIENTO,
        creadaDesde: inicioDelDiaEnChile(hoy),
        orden: 'creada',
        limite: 1,
      });
      return {
        vencidos: 0,
        sin_gestion: 0,
        vencen_hoy: 0,
        requerimientos_de_hoy: deHoy.total,
        topes_de_calendario: 0,
        comprobantes_por_revisar: 0,
      };
    }
    const veComprobantes =
      OPERATIONS_AND_UP.includes(usuario.role) &&
      tieneDerecho(usuario.derechos, 'post_venta');
    // Los topes y los comprobantes no frenan el ánimo si fallan: se mira
    // cada 5 minutos y lo demás sigue sirviendo.
    const [{ pendientes, vencenHoy }, deHoy, choques, comprobantes] =
      await Promise.all([
        pendientesDe(
          { cotizaciones: this.cotizaciones, bitacora: this.bitacora, hoy },
          empresa,
        ),
        this.repositorio.buscarCotizaciones(empresa, {
          tipo: RequestType.REQUERIMIENTO,
          creadaDesde: inicioDelDiaEnChile(hoy),
          orden: 'creada',
          limite: 1,
        }),
        this.choques.listar(usuario).catch((e: unknown): ChoqueDeFecha[] => {
          this.logger.warn(`BelIA, topes de calendario: ${mensajeDe(e)}`);
          return [];
        }),
        veComprobantes
          ? this.repositorio
              .comprobantesPorRevisar(empresa)
              .catch((e: unknown): ComprobantePorRevisar[] => {
                this.logger.warn(`BelIA, comprobantes: ${mensajeDe(e)}`);
                return [];
              })
          : Promise.resolve<ComprobantePorRevisar[]>([]),
      ]);
    return {
      vencidos: pendientes.filter((p) => p.s.urgencia >= 1000).length,
      sin_gestion: pendientes.filter((p) => p.s.urgencia < 1000).length,
      vencen_hoy: vencenHoy,
      requerimientos_de_hoy: deHoy.total,
      topes_de_calendario: new Set(choques.map((c) => c.quotation_id)).size,
      comprobantes_por_revisar: comprobantes.length,
    };
  }

  /** La pantalla en palabras, y la cotización abierta solo si es de la
   *  empresa de la sesión (el id viene del navegador). */
  private async pantallaDe(
    p: PantallaDto | undefined,
    empresa: number,
    rol: UserRole,
  ): Promise<{
    texto: string | null;
    cotizacion: string | null;
    cliente: string | null;
  }> {
    if (p?.cotizacion_id) {
      const q = await this.repositorio.cotizacionVista(
        empresa,
        p.cotizacion_id,
      );
      if (q) {
        const cliente = q.clients?.name ? ` · ${q.clients.name}` : '';
        return {
          texto: `la cotización N° ${q.quotation_number}${cliente} (${estadoDe(q.quotation_status)})`,
          cotizacion: q.id,
          cliente: null,
        };
      }
    }
    if (p?.cliente_id) {
      const c = await clienteAbierto(
        this.repositorio,
        empresa,
        p.cliente_id,
        rol,
      ).catch((e: unknown) => {
        this.logger.warn(`BelIA, cliente abierto: ${mensajeDe(e)}`);
        return null;
      });
      if (c) return { texto: c.texto, cotizacion: null, cliente: c.bloque };
    }
    return {
      texto: p?.ruta ? `la pantalla ${p.ruta}` : null,
      cotizacion: null,
      cliente: null,
    };
  }

  /** Una vuelta en vivo: el texto sale apenas Claude lo escribe; lo demás
   *  (lo que piensa, las herramientas que pide) llega con el mensaje final,
   *  igual que sin vivo. */
  private async enVivo(
    pedido: Anthropic.MessageCreateParamsNonStreaming,
    alEscribir: (evento: EventoEnVivo) => void,
  ): Promise<Anthropic.Message> {
    const vivo = this.cliente().messages.stream(pedido);
    vivo.on('text', (texto) => alEscribir({ tipo: 'texto', texto }));
    return vivo.finalMessage();
  }

  /** Las fichas de las cotizaciones que BelIA revisó en los últimos minutos,
   *  recién leídas de la base con la misma herramienta y el cargo de quien
   *  escribe (`LoLeido`). null si no hay ninguna. */
  private async fichasAlDia(
    herramientas: Herramienta[],
    ctx: ContextoDeHerramienta,
  ): Promise<string | null> {
    const ver = herramientas.find((h) => h.nombre === 'ver_cotizacion');
    const numeros = ver ? this.loLeido.recientes(ctx.usuario) : [];
    if (!ver || numeros.length === 0) return null;
    const fichas = (
      await Promise.all(
        numeros.map((numero) =>
          ver.ejecutar({ numero }, ctx).catch((e: unknown) => {
            this.logger.warn(`BelIA, ficha al día ${numero}: ${mensajeDe(e)}`);
            return null;
          }),
        ),
      )
    ).filter((f) => f != null);
    if (fichas.length === 0) return null;
    const json = JSON.stringify(
      esRecepcion(ctx.usuario.role) ? taparPlata(fichas) : fichas,
    );
    return `FICHAS AL DÍA de las cotizaciones que ya revisaste en esta conversación, recién leídas de Eventia: úsalas y no las vuelvas a pedir con ver_cotizacion.\n${json}`;
  }

  /** Corre una herramienta pedida por Claude. Nunca revienta el ciclo: lo
   *  que falla vuelve como error y Claude se lo explica a la persona. */
  private async usar(
    pedida: Anthropic.ToolUseBlock,
    herramientas: Herramienta[],
    ctx: ContextoDeHerramienta,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const base = { type: 'tool_result' as const, tool_use_id: pedida.id };
    // Solo las que se le ofrecieron a esta persona: lo demás no existe.
    const h = herramientas.find((x) => x.nombre === pedida.name);
    if (!h) {
      return {
        ...base,
        is_error: true,
        content:
          'Esa herramienta no existe, o tu cargo no ve esa parte de Eventia.',
      };
    }
    const entrada =
      pedida.input &&
      typeof pedida.input === 'object' &&
      !Array.isArray(pedida.input)
        ? (pedida.input as Record<string, unknown>)
        : {};
    try {
      const salida = await h.ejecutar(entrada, ctx);
      // La ficha que leyó viaja al día en las preguntas que siguen.
      const numero = (salida as { numero?: unknown } | null)?.numero;
      if (h.nombre === 'ver_cotizacion' && typeof numero === 'number') {
        this.loLeido.anotar(ctx.usuario, numero);
      }
      // La red de recepción (doc 20 §13): las herramientas ya le sacan la
      // plata, y esto tapa la que venga escrita a mano en una nota. Menos lo
      // que es de un particular (doc 21) y el catálogo (`plataLibre`).
      const resultado =
        JSON.stringify(
          esRecepcion(ctx.usuario.role) && !h.plataLibre
            ? taparPlata(salida)
            : salida,
        ) ?? 'null';
      return { ...base, content: resultado };
    } catch (e) {
      if (e instanceof ErrorDeHerramienta) {
        return { ...base, is_error: true, content: e.message };
      }
      this.logger.error(`BelIA, herramienta ${h.nombre}: ${mensajeDe(e)}`);
      return {
        ...base,
        is_error: true,
        content:
          'No pude leer ese dato de Eventia (falla del motor). Intenta de nuevo en un rato.',
      };
    }
  }
}
