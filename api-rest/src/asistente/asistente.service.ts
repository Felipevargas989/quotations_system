import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  MODELO_OPUS,
  costoDelUso,
  errorDeIA,
  hoyEnChile,
  usoDeLaRespuesta,
  type UsoDeTokens,
} from 'src/oportunidades/analisis/comun';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { RequestType } from 'src/quotations/constants/constants';
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { AsistenteRepository } from './asistente.repository';
import type { MensajeDto, PantallaDto, TurnoDto } from './dto/mensaje.dto';
import { herramientasPara } from './herramientas';
import {
  ErrorDeHerramienta,
  estadoDe,
  inicioDelDiaEnChile,
  type ContextoDeHerramienta,
  type Herramienta,
} from './herramientas/comun';
import { pendientesDe } from './herramientas/seguimientos-pendientes';
import { INSTRUCCIONES_FIJAS, instruccionesDelMomento } from './instrucciones';

// BELIA, LA IA DE EVENTIA (doc 20; Felipe, 03-11-2026: "una ventanilla como
// de soporte de chat en Eventia, que esté conectado a un agente, ojalá
// Opus").
//
// Fase 1, sprint 1: solo consultas. Claude conversa con las herramientas de
// `herramientas/`, que leen con la empresa y el cargo de quien escribe. El
// ciclo es el de siempre de la API: si Claude pide una herramienta, el
// motor la corre y le devuelve el resultado, hasta que contesta.
//
// Las barreras no viven acá ni en las instrucciones: viven en que no hay
// herramienta para lo que no se debe hacer (doc 20 §3, regla 2).

/** El modelo se cambia en Railway sin tocar código (doc 20 §2). */
export const MODELO_POR_DEFECTO = MODELO_OPUS;

/** US$ al mes por empresa (Felipe, 03-11: "mmm 100 USD mensuales?"). Se
 *  cambia en Railway con TOPE_ASISTENTE_USD. */
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
};

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

const sumar = (a: UsoDeTokens, b: UsoDeTokens): UsoDeTokens => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  cacheEscrita: a.cacheEscrita + b.cacheEscrita,
  cacheLeida: a.cacheLeida + b.cacheLeida,
});

const SIN_USO: UsoDeTokens = {
  entrada: 0,
  salida: 0,
  cacheEscrita: 0,
  cacheLeida: 0,
};

@Injectable()
export class AsistenteService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repositorio: AsistenteRepository,
    private readonly cotizaciones: QuotationsRepository,
    private readonly catalogo: GenerarRepository,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
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

  get tope(): number {
    const v = Number(process.env.TOPE_ASISTENTE_USD);
    return Number.isFinite(v) && v > 0 ? v : TOPE_POR_DEFECTO_USD;
  }

  async responder(dto: MensajeDto, usuario: User): Promise<RespuestaDeBelia> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const empresa = usuario.company_id;
    if (!empresa) throw new BadRequestException('La sesión no trae empresa.');

    const hoy = hoyEnChile();
    const mes = hoy.slice(0, 7);
    const gastado = await this.repositorio.gastoDelMes(empresa, mes);
    if (gastado >= this.tope) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          codigo: 'TOPE_DE_BELIA',
          message: `BelIA llegó al tope de US$ ${this.tope} de este mes. Vuelve el día 1, o un administrador puede subir el tope.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const herramientas = herramientasPara(usuario);
    const [pantalla, nombreEmpresa] = await Promise.all([
      this.pantallaDe(dto.pantalla, empresa),
      this.repositorio.nombreDeLaEmpresa(empresa),
    ]);
    const ctx: ContextoDeHerramienta = {
      usuario,
      cotizacionAbierta: pantalla.cotizacion,
      repositorio: this.repositorio,
      cotizaciones: this.cotizaciones,
      catalogo: this.catalogo,
      bitacora: this.bitacora,
      hoy,
    };
    const sistema: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: INSTRUCCIONES_FIJAS,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: instruccionesDelMomento({
          nombre: usuario.full_name,
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
      ...(i === herramientas.length - 1
        ? { cache_control: { type: 'ephemeral' as const } }
        : {}),
    }));
    const mensajes: Anthropic.MessageParam[] = comoMensajes(
      dto.historial,
      dto.mensaje,
    );

    const inicio = Date.now();
    let uso = SIN_USO;
    const usadas: string[] = [];
    let respuesta = '';
    let vueltas = 0;
    let falla: unknown = null;
    try {
      for (; vueltas < MAX_VUELTAS; vueltas++) {
        const r = await this.cliente().messages.create({
          model: this.modelo,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'adaptive' },
          system: sistema,
          ...(definiciones.length ? { tools: definiciones } : {}),
          messages: mensajes,
        });
        uso = sumar(uso, usoDeLaRespuesta(r.usage));
        const pedidas = r.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        if (r.stop_reason === 'tool_use' && pedidas.length > 0) {
          mensajes.push({ role: 'assistant', content: r.content });
          usadas.push(...pedidas.map((p) => p.name));
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
    const costo = costoDelUso(uso, this.modelo, '5m');
    if (uso.entrada + uso.salida + uso.cacheEscrita + uso.cacheLeida > 0) {
      await this.repositorio
        .registrarUso({
          company_id: empresa,
          usuario_id: usuario.id ?? null,
          mes,
          modelo: this.modelo,
          tokens_entrada: uso.entrada,
          tokens_salida: uso.salida,
          tokens_cache_escrita: uso.cacheEscrita,
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
      `BelIA ${falla ? 'falló' : 'respondió'} en ${segundos} s · vueltas ${vueltas + 1} · herramientas ${usadas.join(',') || '-'} · entrada ${uso.entrada} · caché ${uso.cacheEscrita}/${uso.cacheLeida} · salida ${uso.salida} · US$ ${costo.toFixed(4)}`,
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
      ...(usuario.role === UserRole.ADMINISTRADOR
        ? {
            uso_del_mes: {
              gastado_usd: Math.round((gastado + costo) * 100) / 100,
              tope_usd: this.tope,
            },
          }
        : {}),
    };
  }

  /** Los ánimos de BelIA (doc 20 §8b), sin IA y sin costo: lo vencido
   *  para enojarse y lo nuevo de hoy para llamar la atención. Cuenta con la
   *  misma regla que la herramienta de seguimientos y que el tablero. */
  async estado(usuario: User): Promise<EstadoDeBelia> {
    const empresa = usuario.company_id;
    if (!empresa) throw new BadRequestException('La sesión no trae empresa.');
    const hoy = hoyEnChile();
    const [{ pendientes, vencenHoy }, deHoy] = await Promise.all([
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
    ]);
    return {
      vencidos: pendientes.filter((p) => p.s.urgencia >= 1000).length,
      sin_gestion: pendientes.filter((p) => p.s.urgencia < 1000).length,
      vencen_hoy: vencenHoy,
      requerimientos_de_hoy: deHoy.total,
    };
  }

  /** La pantalla en palabras, y la cotización abierta solo si es de la
   *  empresa de la sesión (el id viene del navegador). */
  private async pantallaDe(
    p: PantallaDto | undefined,
    empresa: number,
  ): Promise<{ texto: string | null; cotizacion: string | null }> {
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
        };
      }
    }
    return {
      texto: p?.ruta ? `la pantalla ${p.ruta}` : null,
      cotizacion: null,
    };
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
      const resultado = await h.ejecutar(entrada, ctx);
      return { ...base, content: JSON.stringify(resultado) };
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
