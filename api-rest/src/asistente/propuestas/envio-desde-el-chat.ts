import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import {
  EnvioConBeliaService,
  type EnvioPreparado,
  type EnvioSaltado,
} from 'src/quotations/envio-belia/envio-con-belia.service';
import { SeguimientoConBeliaService } from 'src/quotations/envio-belia/seguimiento-con-belia.service';
import { fechaEnChile } from 'src/quotations/seguimiento/elegibles';
import type { User } from 'src/users/entities/user.entity';
import { enlaceDe, ErrorDeHerramienta } from '../herramientas/comun';
import {
  semaforo,
  type InfoDeBitacora,
} from '../herramientas/seguimientos-pendientes';
import type { ResultadoDeAplicar, TarjetaDePropuesta } from './comun';
import { PropuestasRepository, type Propuesta } from './propuestas.repository';
import { huellaDe, type CotizacionParaCambiar } from './reglas';

// «ENVÍA LAS SOLICITADAS» (doc 20 §19; Felipe, 27-11-2026: «que los envíe
// BelIA, pero que antes me muestre un detalle de qué le dirá a cada uno»).
//
// La herramienta prepara cada correo (`EnvioConBeliaService.preparar`: el
// borrador en el hilo de contacto@, con la tabla verde y la firma) y arma
// una tarjeta por cotización con el texto completo. Nada sale hasta el
// «Sí, enviar» de la persona (una por una o «Enviar todas» en la
// ventanilla); con su «No», el borrador se bota.
//
// Desde el 28-11-2026 también los SEGUIMIENTOS (doc 20 §20; Felipe: «Sí,
// prepáralo», «siempre desde contacto@»): la misma tarjeta, con
// `clase: 'seguimiento'` dentro de la propuesta (tipo `envio`, sin
// migración), preparada por `SeguimientoConBeliaService`.

/** Qué se envía: la cotización en Solicitada o el seguimiento. */
export type ClaseDeEnvio = 'cotizacion' | 'seguimiento';

/** Tope por pedido: el tiempo de la IA y las tarjetas de un turno. */
export const TOPE_DE_ENVIOS = 20;
/** Cuántas se preparan a la vez (la IA tarda ~30 s cada una). */
const A_LA_VEZ = 5;

export type ResultadoDeLaTanda = {
  tarjetas: TarjetaDePropuesta[];
  saltadas: EnvioSaltado[];
  fallas: Array<{ numero: number; cliente: string; error: string }>;
  quedan: number;
};

/** Corre `tarea` sobre la lista, `n` a la vez, en orden. */
async function deANPorVez<T, R>(
  lista: T[],
  n: number,
  tarea: (x: T) => Promise<R>,
): Promise<R[]> {
  const salida: R[] = new Array<R>(lista.length);
  let siguiente = 0;
  const obrero = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      salida[i] = await tarea(lista[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, obrero));
  return salida;
}

const esPreparado = (x: unknown): x is EnvioPreparado =>
  Boolean(x && typeof (x as EnvioPreparado).borrador_id === 'string');

@Injectable()
export class EnvioDesdeElChat {
  constructor(
    private readonly guardadas: PropuestasRepository,
    private readonly envio: EnvioConBeliaService,
    private readonly seguimientos: SeguimientoConBeliaService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EnvioDesdeElChat.name);
  }

  /** Prepara las solicitadas (o los seguimientos) que la persona ve
   *  (`laVe`), o solo las de `numeros`, y arma sus tarjetas. */
  async proponer(
    usuario: User,
    laVe: (q: { clients: { client_type: string | null } | null }) => boolean,
    numeros?: number[],
    clase: ClaseDeEnvio = 'cotizacion',
  ): Promise<ResultadoDeLaTanda> {
    const empresa = usuario.company_id;
    const seguimiento = clase === 'seguimiento';
    let lista: Array<{
      id: string;
      quotation_number: number;
      clients: { name: string | null; client_type: string | null } | null;
    }> = seguimiento
      ? (await this.guardadas.enSeguimiento(empresa)).filter(laVe)
      : (await this.guardadas.solicitadas(empresa)).filter(laVe);
    if (numeros?.length) {
      const pedidas = new Set(numeros);
      lista = lista.filter((q) => pedidas.has(q.quotation_number));
      const faltan = numeros.filter(
        (n) => !lista.some((q) => q.quotation_number === n),
      );
      if (lista.length === 0) {
        throw new ErrorDeHerramienta(
          seguimiento
            ? `No encontré cotizaciones enviadas o en negociación con esos N° (${faltan.join(', ')}): o no existen, o no están en esos estados, o su cargo no las ve.`
            : `No encontré solicitadas con esos N° (${faltan.join(', ')}): o no existen, o no están en Solicitada, o son requerimientos.`,
        );
      }
    } else if (seguimiento) {
      // La tanda: las que «Requieren seguimiento», con la regla del
      // tablero, de la más urgente a la menos.
      const info = (await this.bitacora.mapByCompany(empresa)) as Record<
        string,
        InfoDeBitacora
      >;
      const hoy = fechaEnChile();
      lista = (
        lista as Awaited<ReturnType<PropuestasRepository['enSeguimiento']>>
      )
        .map((q) => ({ q, s: semaforo(q, info[q.id], hoy) }))
        .filter((x) => x.s.requiere)
        .sort(
          (a, b) =>
            (b.s.requiere ? b.s.urgencia : 0) -
            (a.s.requiere ? a.s.urgencia : 0),
        )
        .map((x) => x.q);
    }
    if (lista.length === 0) {
      throw new ErrorDeHerramienta(
        seguimiento
          ? 'No hay cotizaciones que requieran seguimiento y que puedas enviar.'
          : 'No hay cotizaciones en Solicitada que puedas enviar.',
      );
    }
    const tanda = lista.slice(0, TOPE_DE_ENVIOS);
    const r: ResultadoDeLaTanda = {
      tarjetas: [],
      saltadas: [],
      fallas: [],
      quedan: lista.length - tanda.length,
    };
    const hechos = await deANPorVez(tanda, A_LA_VEZ, async (q) => {
      try {
        return await this.prepararUna(
          usuario,
          q.id,
          seguimiento ? { aPedido: Boolean(numeros?.length) } : null,
        );
      } catch (e) {
        this.logger.warn(
          `N° ${q.quotation_number}: no pude preparar el envío: ${mensajeDe(e)}`,
        );
        return {
          falla: {
            numero: q.quotation_number,
            cliente: q.clients?.name ?? '',
            error: mensajeDe(e).slice(0, 200),
          },
        };
      }
    });
    for (const h of hechos) {
      if ('falla' in h) r.fallas.push(h.falla);
      else if ('motivo' in h) r.saltadas.push(h);
      else r.tarjetas.push(h);
    }
    return r;
  }

  private async prepararUna(
    usuario: User,
    quotationId: string,
    // Con esto, un seguimiento (doc 20 §20); sin esto, la cotización.
    deSeguimiento: { aPedido: boolean } | null,
  ): Promise<TarjetaDePropuesta | EnvioSaltado> {
    const empresa = usuario.company_id;
    // Lo que esperaba de antes se reemplaza: su borrador se bota primero,
    // o el hilo ya tendría uno y no se escribiría otro.
    for (const viejo of await this.guardadas.enviosPendientes(
      empresa,
      quotationId,
      usuario.id,
    )) {
      if (esPreparado(viejo)) await this.envio.botar(viejo);
    }
    await this.guardadas.descartarPendientes(empresa, quotationId, usuario.id);

    const listo = deSeguimiento
      ? await this.seguimientos.preparar(
          quotationId,
          usuario,
          deSeguimiento.aPedido,
        )
      : await this.envio.preparar(quotationId, usuario);
    if (!esPreparado(listo)) return listo;
    const q = await this.guardadas.cotizacionParaCambiar(empresa, {
      id: quotationId,
    });
    if (!q) throw new Error('la cotización desapareció');
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: q.id,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'envio',
      resumen:
        listo.resumen ||
        (deSeguimiento
          ? `Enviarle el seguimiento a ${listo.para}`
          : `Enviarle la cotización a ${listo.para}`),
      antes: {},
      despues: listo as unknown as Record<string, unknown>,
      huella_antes: huellaDe(q),
    });
    return this.tarjeta(fila, listo, q, usuario);
  }

  private tarjeta(
    fila: Propuesta,
    e: EnvioPreparado,
    q: CotizacionParaCambiar,
    usuario: User,
  ): TarjetaDePropuesta {
    return {
      id: fila.id,
      tipo: 'envio',
      numero: e.numero,
      cliente: e.cliente,
      cotizacion_id: e.quotation_id,
      enlace: enlaceDe(q, usuario.role, true),
      resumen: fila.resumen,
      lineas: [],
      envio: {
        clase: e.clase ?? 'cotizacion',
        para: e.para,
        cc: e.cc,
        desde: e.buzon,
        en_hilo: e.en_hilo,
        asunto: e.asunto,
        texto: e.texto,
        total: e.total,
        para_real: e.para_real,
      },
      avisos: e.para_real
        ? [
            `Laboratorio: va a ${e.para} en vez de ${e.para_real}. Ningún cliente recibe nada.`,
          ]
        : [],
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, enviar»: revisa que nadie la haya cambiado y la envía. */
  async enviar(
    usuario: User,
    p: Propuesta,
    q: CotizacionParaCambiar,
  ): Promise<ResultadoDeAplicar> {
    if (huellaDe(q) !== p.huella_antes) {
      throw new ErrorDeHerramienta(
        `La N° ${q.quotation_number} cambió desde que preparé el correo (alguien la guardó entre medio): la tabla ya no calza. Pídemelo de nuevo.`,
      );
    }
    if (!esPreparado(p.despues)) {
      throw new ErrorDeHerramienta('A esa propuesta le falta el correo.');
    }
    const r =
      p.despues.clase === 'seguimiento'
        ? await this.seguimientos.enviar(p.despues, usuario)
        : await this.envio.enviar(p.despues, usuario);
    return {
      estado: 'aplicada',
      numero: q.quotation_number,
      enlace: enlaceDe(q, usuario.role, true),
      aviso: r.aviso,
    };
  }

  /** El «No»: el borrador que dejó BelIA se bota. */
  async alDescartar(p: Propuesta): Promise<void> {
    if (esPreparado(p.despues)) await this.envio.botar(p.despues);
  }
}
