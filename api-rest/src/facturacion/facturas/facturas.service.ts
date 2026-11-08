import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import type { EditarRazonSocialDto } from 'src/clients/razones-sociales/razon-social.dto';
import { RazonesSocialesService } from 'src/clients/razones-sociales/razones-sociales.service';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { normalizarRut } from '../../people/utils/rut';
import { textoLimpio } from '../archivo/texto';
import { BoletasService } from '../boletas/boletas.service';
import {
  NOTA_DEL_AMBIENTE,
  type FacturacionCl,
} from '../facturacion-cl/facturacion-cl';
import { FacturasAnterioresService } from '../facturas-anteriores/facturas-anteriores.service';
import {
  CORTE_DE_LA_RAZON_SOCIAL,
  paraComparar,
} from '../facturas-anteriores/texto-del-pdf';
import { NominaSiiService } from '../nomina-sii/nomina-sii.service';
import {
  Cadena,
  estadoEnPalabras,
  facturadoDeLasOC,
  loQueHace,
} from '../notas/cadena';
import { OrdenesDeCompraRepository } from '../ordenes-de-compra/ordenes-de-compra.repository';
import { OrdenesDeCompraService } from '../ordenes-de-compra/ordenes-de-compra.service';
import {
  armarBorrador,
  razonSocialDelRut,
  revisarDte,
  type ContextoDeLaFactura,
  type DtePedido,
  type EventoAFacturar,
  type OrdenAFacturar,
  type Revision,
  type TipoDeDte,
} from './borrador';
import { ConexionConFacturacionCl } from './conexion';
import { guardarCopiaDelPdf } from './copia-del-pdf';
import { conElTarifario, usaElTarifario } from './del-tarifario';
import { DocumentosTributariosRepository } from './documentos-tributarios.repository';
import { mandarConFolio } from './emision';

/**
 * EL DTE DEL EVENTO (doc 19 §9.2, §9.10 y §9.20): la factura o la boleta.
 *
 * Al abrir «Emitir DTE», BelIA lee las OC que están en Documentos
 * (`preparar`). Arma el borrador desde la OC (o desde la cotización), la
 * persona lo corrige y lo mira tal como saldrá, y el administrador lo
 * emite (D5). La vista previa y la emisión pasan por la MISMA revisión
 * (`revisarDte`): lo que se ve es lo que sale. La boleta sale por el mismo
 * camino que las de recepción (`BoletasService.emitirDelEvento`).
 *
 * Los candados (§5.3):
 * - un solo envío a la vez por evento (índice único de la 184);
 * - nunca más del 100 % de una OC;
 * - `procesar` nunca se reintenta solo: si se corta, queda «por confirmar»
 *   (L5). Solo si facturacion.cl dice que el folio ya existe (alguien emitió
 *   en su web, L3), se pide otro folio UNA vez más.
 *
 * Al emitir: la copia del PDF en Documentos → Facturas, la razón social del
 * receptor queda en la ficha si era nueva (§9.12) con las referencias que
 * pide (E2), y la nota de BelIA en la bitácora.
 */

const FACTURA = 33;
const BOLETA = 39;
// Lo que lleva notas de crédito y de débito (las boletas, en el paso 0: L21).
const CON_NOTAS = new Set([FACTURA, 56, 61]);

// Se factura un evento aceptado o realizado (§9.2), como lo que cuenta
// como vendido en el resto del motor.
const SE_FACTURA = ['aceptada', 'realizada'];

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Lo que llega de la pantalla, con las mismas reglas de limpieza. La
 *  boleta no va contra una OC ni lleva referencias. */
const normalizada = (p: DtePedido): DtePedido => {
  const boleta = p.tipo === BOLETA;
  return {
    tipo: boleta ? BOLETA : FACTURA,
    orden_de_compra_id: boleta ? null : (p.orden_de_compra_id ?? null),
    receptor: boleta
      ? {
          rut: '',
          razon_social: '',
          giro: null,
          direccion: null,
          comuna: null,
          ciudad: null,
          // Como en la boleta suelta: el correo en minúscula.
          correo: (p.receptor?.correo ?? '').trim().toLowerCase() || null,
        }
      : {
          ...p.receptor,
          rut:
            normalizarRut(p.receptor?.rut ?? '') ??
            textoLimpio(p.receptor?.rut),
          razon_social: textoLimpio(p.receptor?.razon_social),
        },
    lineas: (p.lineas ?? []).map((l) => ({
      descripcion: textoLimpio(l.descripcion),
      descripcion_larga: (l.descripcion_larga ?? '').trim() || null,
      cantidad: Number(l.cantidad),
      precio: Number(l.precio),
      // El descuento va solo en la factura (§9.22).
      descuento:
        !boleta && Number(l.descuento) > 0 ? Number(l.descuento) : null,
    })),
    referencias: boleta
      ? []
      : (p.referencias ?? []).map((r) => ({
          tipo: r.tipo,
          folio: textoLimpio(r.folio),
          fecha: (r.fecha ?? '').trim(),
          razon: textoLimpio(r.razon) || null,
        })),
    pedir_siempre: boleta ? [] : [...new Set(p.pedir_siempre ?? [])],
    // §9.22: la factura va al contado o a crédito (30 días si no se dice).
    forma_de_pago: boleta ? null : p.forma_de_pago === 1 ? 1 : 2,
    plazo_dias: boleta || p.forma_de_pago === 1 ? null : (p.plazo_dias ?? 30),
    cliente_id: boleta ? null : (p.cliente_id ?? null),
  };
};

/** El % de la OC o del evento que va en el documento (E4: queda el
 *  registro); nulo si pasa del 100 %. */
const porcentajeDe = (total: number, ctx: ContextoDeLaFactura) => {
  const base = ctx.oc ? ctx.oc.total : (ctx.evento?.total ?? 0);
  const pct = base > 0 ? Math.round((total / base) * 10000) / 100 : 0;
  return pct > 0 && pct <= 100 ? pct : null;
};

/** La revisión para la pantalla: sin el archivo. */
const paraLaPantalla = (r: Revision) => ({
  ok: r.ok,
  montos: r.montos,
  lineas: r.lineas,
  observaciones: r.observaciones,
  avisos: r.avisos,
  problemas: r.problemas,
  // §9.22: contado o crédito con su vencimiento, como va en la factura.
  pago: r.pago,
  faltan: r.faltan,
});

@Injectable()
export class FacturasService {
  constructor(
    private readonly repo: DocumentosTributariosRepository,
    private readonly ordenes: OrdenesDeCompraRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly razonesSociales: RazonesSocialesService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
    private readonly ocs: OrdenesDeCompraService,
    private readonly boletas: BoletasService,
    // Los tipos de cliente particulares (doc 21): a ellos se les propone la
    // boleta (§9.24). Sin la pieza (algunas pruebas), como antes.
    @Optional() private readonly alcance?: AlcanceDeRecepcion,
    // El RUT que llena todo (doc 19 §9.27): la nómina del SII.
    @Optional() private readonly nominaSii?: NominaSiiService,
    // Y las facturas que la empresa ya emitió en facturacion.cl (§9.29).
    @Optional() private readonly facturasAnteriores?: FacturasAnterioresService,
  ) {
    this.logger.setContext(FacturasService.name);
  }

  /** Los documentos del evento, y dónde se emiten (en los pasos 1 a 4,
   *  'simulado': la pantalla lo dice en un letrero). Cada uno con su estado
   *  en la cadena (las notas heredan el evento de lo que modifican), y lo
   *  facturado de cada OC con la cadena: una factura anulada ya no cuenta y
   *  la OC se puede volver a facturar. */
  async documentos(quotationId: string, companyId: number) {
    if (!(await this.repo.eventoAFacturar(quotationId, companyId)))
      throw new NotFoundException('Ese evento no existe');
    const documentos = await this.repo.deCotizacion(quotationId, companyId);
    const filas = documentos.map((d) => ({ ...d, total: Number(d.total) }));
    const cadena = new Cadena(filas);
    const porId = new Map(filas.map((d) => [d.id, d]));
    const conexion = this.conexion.de(companyId);
    return {
      ambiente: conexion.ambiente,
      sin_conexion: conexion.sinConexion ?? null,
      documentos: documentos.map((d) => {
        const estado =
          d.estado === 'emitido' && CON_NOTAS.has(d.tipo)
            ? cadena.estado(d.id)
            : { como: 'vigente' as const };
        const modifica =
          d.modifica_id != null ? porId.get(d.modifica_id) : undefined;
        return {
          ...d,
          cadena: {
            como: estado.como,
            texto: estado.como === 'vigente' ? null : estadoEnPalabras(estado),
            modifica: modifica ? loQueHace(d, modifica) : null,
          },
        };
      }),
      // Lo facturado de cada OC cuenta solo lo del ambiente donde se emite.
      facturado_por_oc: Object.fromEntries(
        facturadoDeLasOC(
          filas.filter((d) => d.ambiente === conexion.ambiente),
          cadena,
        ).porOC,
      ),
    };
  }

  /**
   * Al abrir «Emitir DTE»: BelIA lee las OC que están en Documentos y
   * todavía no lee (Felipe, 05-11: *"si en documentos existe un documento
   * cargado como orden de compra, Bel ya debe leerlo automáticamente"*), y
   * dice de dónde se puede llenar: cada OC con lo que le queda, y la
   * cotización. Propone la factura si hay OC o razones sociales, o si el
   * cliente no es particular (§9.24, Felipe 07-11: las boletas quedan en
   * pausa, y una empresa sin datos de facturación se factura igual: falta
   * su RUT, no es boleta); la boleta, solo a un particular sin OC ni razón
   * social.
   */
  async preparar(quotationId: string, user: User) {
    const companyId = user.company_id;
    const evento = await this.repo.eventoAFacturar(quotationId, companyId);
    if (!evento) throw new NotFoundException('Ese evento no existe');
    if (!SE_FACTURA.includes(evento.estado))
      throw new BadRequestException(
        'Se factura un evento aceptado o ya realizado',
      );
    const { ordenes, sinLeer } = await this.ocs.deDocumentos(
      quotationId,
      companyId,
      user.id ?? null,
    );
    const ambiente = this.conexion.de(companyId).ambiente;
    const [facturado, razones] = await Promise.all([
      this.repo.facturado(quotationId, companyId, ambiente),
      evento.clientId
        ? this.razonesSociales.deCliente(evento.clientId, companyId)
        : Promise.resolve([]),
    ]);
    const particular = await this.esParticular(evento, companyId);
    return {
      tipo: (ordenes.length || razones.length || !particular
        ? FACTURA
        : BOLETA) as TipoDeDte,
      ocs: ordenes.map((o) => ({
        id: o.id,
        numero: o.numero,
        fecha: o.fecha,
        razon_social: o.razon_social,
        total: Number(o.total),
        facturado: facturado.porOC.get(o.id) ?? 0,
      })),
      sin_leer: sinLeer,
      evento: {
        numero: evento.numero,
        total: evento.total,
        facturado: facturado.total,
        cliente: evento.cliente,
      },
    };
  }

  /** ¿El cliente es particular (una persona natural)? Lo dice la marca de
   *  su tipo (`client_types.es_particular`, doc 21). Un cliente sin tipo
   *  no lo es: a una empresa nunca se le propone la boleta. Sin la pieza
   *  de los tipos (algunas pruebas), como antes. */
  private async esParticular(evento: EventoAFacturar, companyId: number) {
    if (!this.alcance) return true;
    const tipo = evento.tipoDeCliente?.trim().toLowerCase();
    if (!tipo) return false;
    return (await this.alcance.particulares(companyId)).has(tipo);
  }

  /** El borrador de BelIA, con su vista previa. */
  async borrador(
    quotationId: string,
    companyId: number,
    tipo: TipoDeDte,
    ordenDeCompraId: number | null,
    porcentaje: number | null = null,
  ) {
    const ctx = await this.contexto(
      quotationId,
      companyId,
      tipo === BOLETA ? null : ordenDeCompraId,
    );
    // §9.26: la parte que se factura (el 50 % de la OC); sin ella, todo lo
    // que queda.
    const borrador = armarBorrador({ ...ctx, porcentaje }, tipo);
    return {
      ...borrador,
      oc: ctx.oc
        ? {
            numero: ctx.oc.numero,
            total: ctx.oc.total,
            facturado: ctx.oc.facturado,
          }
        : null,
      evento: {
        numero: ctx.evento.numero,
        total: ctx.evento.total,
        facturado: ctx.facturadoDelEvento,
        cliente: ctx.evento.cliente,
      },
      razones: ctx.razones.map((r) => ({
        rut: r.rut,
        razon_social: r.razon_social,
        giro: r.giro,
        direccion: r.direccion,
        comuna: r.comuna,
        ciudad: r.ciudad,
        correo_facturacion: r.correo_facturacion,
        referencias_exigidas: r.referencias_exigidas,
      })),
      vista: await this.vistaPrevia(borrador.pedida, ctx, companyId),
    };
  }

  /** La vista previa de lo que la persona corrigió. */
  async revisar(quotationId: string, companyId: number, dto: DtePedido) {
    const pedida = normalizada(dto);
    const ctx = await this.contexto(
      quotationId,
      companyId,
      pedida.orden_de_compra_id,
    );
    return this.vistaPrevia(pedida, ctx, companyId);
  }

  async emitir(quotationId: string, user: User, dto: DtePedido) {
    const companyId = user.company_id;
    const pedida = normalizada(dto);
    const ctx = await this.contexto(
      quotationId,
      companyId,
      pedida.orden_de_compra_id,
    );
    const conexion = this.conexion.de(companyId);
    const fecha = hoyEnChile();
    const boleta = pedida.tipo === BOLETA;
    const folio = boleta ? 0 : await conexion.folioSiguiente(FACTURA);
    const revision = revisarDte(pedida, ctx, folio, fecha);
    if (!revision.ok || !revision.archivo || !revision.montos)
      throw new BadRequestException(
        revision.faltan.length
          ? `Falta ${revision.faltan.map((f) => f.texto).join(', ')}`
          : revision.problemas.join('. '),
      );
    if (boleta)
      return this.emitirBoleta(quotationId, user, pedida, revision, conexion);
    return this.emitirFactura(user, pedida, ctx, quotationId, {
      folio,
      fecha,
      archivo: revision.archivo,
      revision,
    });
  }

  /** La factura de «Nuevo documento» (§9.21): de cero, sin evento ni OC.
   *  La vista previa y la emisión pasan por la misma revisión, y por las
   *  mismas líneas del tarifario (§9.23). */
  async revisarSinEvento(user: User, dto: DtePedido) {
    const companyId = user.company_id;
    const pedida = await this.pedidaSinEvento(user, dto);
    return this.vistaPrevia(
      pedida,
      await this.sinEvento(companyId, pedida.cliente_id),
      companyId,
    );
  }

  /** Lo que llega de «Nuevo documento», con las líneas del tarifario ya
   *  puestas (`del-tarifario.ts`): la línea a mano y el descuento, solo el
   *  administrador. */
  private async pedidaSinEvento(user: User, dto: DtePedido) {
    const lineas = dto.lineas ?? [];
    const esAdministrador = user.role === UserRole.ADMINISTRADOR;
    const tarifario =
      usaElTarifario(lineas) || !esAdministrador
        ? await this.boletas.tarifario(user.company_id)
        : [];
    return normalizada({
      ...dto,
      tipo: FACTURA,
      orden_de_compra_id: null,
      lineas: conElTarifario(lineas, tarifario, esAdministrador),
    });
  }

  /** El buscador del destinatario de «Nuevo documento» (§9.22): los
   *  clientes con sus razones sociales y su contacto. */
  clientesParaFacturar(companyId: number) {
    return this.repo.clientesParaFacturar(companyId);
  }

  async emitirSinEvento(user: User, dto: DtePedido) {
    const companyId = user.company_id;
    const pedida = await this.pedidaSinEvento(user, dto);
    const ctx = await this.sinEvento(companyId, pedida.cliente_id);
    const conexion = this.conexion.de(companyId);
    const fecha = hoyEnChile();
    const folio = await conexion.folioSiguiente(FACTURA);
    const revision = revisarDte(pedida, ctx, folio, fecha);
    if (!revision.ok || !revision.archivo || !revision.montos)
      throw new BadRequestException(
        revision.faltan.length
          ? `Falta ${revision.faltan.map((f) => f.texto).join(', ')}`
          : revision.problemas.join('. '),
      );
    return this.emitirFactura(user, pedida, ctx, null, {
      folio,
      fecha,
      archivo: revision.archivo,
      revision,
    });
  }

  /**
   * EL RUT QUE LLENA TODO (doc 19 §9.25 y §9.27): primero la razón social
   * guardada en Eventia con ese RUT (de cualquier cliente de la empresa); si
   * no, la nómina del SII (personas jurídicas con actividades vigentes).
   * Dice de dónde salió (`origen`); nulo si no está en ninguna.
   */
  async razonSocialPorRut(companyId: number, rut: string) {
    const canonico = normalizarRut(rut);
    if (!canonico) return null;
    const guardada = await this.repo.razonSocialDeLaEmpresa(
      companyId,
      canonico,
    );
    if (guardada) return { ...guardada, origen: 'eventia' as const };
    const [anterior, delSii] = await Promise.all([
      this.facturasAnteriores?.buscar(companyId, canonico).catch(() => null),
      this.nominaSii?.buscar(canonico).catch(() => null),
    ]);
    if (anterior) {
      // Lo que se usó de verdad en su última factura (§9.29). El PDF corta
      // la razón social a 50: si el SII la tiene entera, va la del SII.
      const delPdf = anterior.razon_social;
      const entera =
        delSii &&
        delPdf.length >= CORTE_DE_LA_RAZON_SOCIAL &&
        paraComparar(delSii.razon_social).startsWith(paraComparar(delPdf))
          ? delSii.razon_social
          : null;
      return {
        rut: canonico,
        razon_social: entera ?? delPdf,
        giro: anterior.giro,
        direccion: anterior.direccion,
        comuna: anterior.comuna,
        ciudad: anterior.ciudad,
        correo_facturacion: null,
        referencias_exigidas: [] as string[],
        cliente: null,
        giros: delSii?.giros ?? [],
        origen: 'factura' as const,
        factura: {
          folio: anterior.folio,
          fecha_emision: anterior.fecha_emision,
          // Puede venir incompleta: la pantalla lo dice.
          razon_social_cortada:
            !entera && delPdf.length >= CORTE_DE_LA_RAZON_SOCIAL,
        },
      };
    }
    if (!delSii) return null;
    return {
      rut: canonico,
      razon_social: delSii.razon_social,
      giro: delSii.giro,
      direccion: delSii.direccion,
      comuna: delSii.comuna,
      ciudad: delSii.ciudad,
      correo_facturacion: null,
      referencias_exigidas: [] as string[],
      cliente: null,
      // Las otras actividades vigentes, para elegir el giro (§9.27).
      giros: delSii.giros,
      origen: 'sii' as const,
    };
  }

  /** Lo que una factura sin evento sabe: nada del evento ni de la OC; si
   *  va a un cliente de Eventia (§9.22), sus razones sociales. Un cliente
   *  de otra empresa no trae nada: `deCliente` filtra por la empresa. */
  private async sinEvento(
    companyId: number,
    clienteId?: string | null,
  ): Promise<ContextoDeLaFactura> {
    return {
      evento: null,
      oc: null,
      razones: clienteId
        ? await this.razonesSociales.deCliente(clienteId, companyId)
        : [],
      clienteId: clienteId ?? null,
      facturadoDelEvento: 0,
      totalDeLasOC: 0,
      ambiente: this.conexion.de(companyId).ambiente,
    };
  }

  /**
   * Manda la factura ya revisada, con o sin evento: `enviando` antes de
   * `procesar`, sin reintentos (L5), y después el PDF, la razón social en
   * la ficha (con evento) y la nota de BelIA en la bitácora (con evento).
   */
  private async emitirFactura(
    user: User,
    pedida: DtePedido,
    ctx: ContextoDeLaFactura,
    quotationId: string | null,
    revisada: {
      folio: number;
      fecha: string;
      archivo: string;
      revision: Revision;
    },
  ) {
    const companyId = user.company_id;
    const conexion = this.conexion.de(companyId);
    const { folio, fecha, revision } = revisada;
    const montos = revision.montos;
    if (!montos) throw new BadRequestException('La factura no tiene montos');
    const enviado = await mandarConFolio({
      repo: this.repo,
      conexion,
      logger: this.logger,
      user,
      tipo: FACTURA,
      fila: {
        company_id: companyId,
        tipo: FACTURA,
        ambiente: conexion.ambiente,
        estado: 'enviando',
        receptor: pedida.receptor,
        detalle: revision.lineas,
        referencias: pedida.referencias,
        neto: montos.neto,
        exento: 0,
        iva: montos.iva,
        total: montos.total,
        quotation_id: quotationId,
        orden_de_compra_id: pedida.orden_de_compra_id,
        porcentaje: quotationId ? porcentajeDe(montos.total, ctx) : null,
        creado_por: user.id ?? null,
        // §9.22 (migración 189): contado o crédito, y cuándo vence.
        forma_de_pago: revision.pago?.forma ?? null,
        vencimiento: revision.pago?.vencimiento ?? null,
      },
      // El mismo archivo de la vista previa, con el folio que toque.
      armar: (f) =>
        f === folio
          ? revisada.archivo
          : revisarDte(pedida, ctx, f, fecha).archivo,
      folio,
      fecha,
      nombre: 'La factura',
    });
    if (enviado.porConfirmar) return enviado.documento;
    let emitido = enviado.documento;

    // Lo que sigue no cambia la factura: si algo falla, se avisa en el
    // registro y la factura queda emitida igual.
    emitido = await guardarCopiaDelPdf(
      this.repo,
      conexion,
      emitido,
      companyId,
      quotationId,
    ).catch((e: unknown) => {
      this.logger.warn(`PDF de la factura ${emitido.folio}: ${mensajeDe(e)}`);
      return emitido;
    });
    await this.recordarReceptor(ctx, pedida, user).catch((e: unknown) =>
      this.logger.warn(`razón social de la factura: ${mensajeDe(e)}`),
    );
    if (quotationId)
      await this.anotar(
        user,
        quotationId,
        `Emitió la factura N° ${emitido.folio} por ${pesos(emitido.total)} a ${pedida.receptor.razon_social}${ctx.oc ? `, OC ${ctx.oc.numero}` : ''}.${NOTA_DEL_AMBIENTE[emitido.ambiente] ?? ''}`,
      );
    this.logger.info(
      `factura ${emitido.folio} (${emitido.ambiente}) de ${quotationId ?? 'Nuevo documento'}: ${emitido.total}`,
    );
    return emitido;
  }

  /** La boleta del evento: el mismo camino que las de recepción, con las
   *  líneas y el correo del DTE, y su nota en la bitácora. */
  private async emitirBoleta(
    quotationId: string,
    user: User,
    pedida: DtePedido,
    revision: Revision,
    conexion: FacturacionCl,
  ) {
    const emitida = await this.boletas.emitirDelEvento(user, conexion, {
      quotationId,
      lineas: revision.lineas,
      correo: pedida.receptor.correo ?? null,
      observaciones: revision.observaciones,
      totalEsperado: pedida.lineas.reduce(
        (s, l) => s + Math.round(l.cantidad * l.precio),
        0,
      ),
    });
    if (emitida.estado !== 'emitido') return emitida;
    await this.anotar(
      user,
      quotationId,
      `Emitió la boleta N° ${emitida.folio} por ${pesos(Number(emitida.total))}.${NOTA_DEL_AMBIENTE[emitida.ambiente] ?? ''}`,
    );
    this.logger.info(
      `boleta ${emitida.folio} (${emitida.ambiente}) de ${quotationId}: ${emitida.total}`,
    );
    return emitida;
  }

  /** La nota de BelIA en la bitácora: si falla, se registra y sigue. */
  private async anotar(user: User, quotationId: string, note: string) {
    await this.bitacora
      .crearComoBeliaAPedidoDe(user, {
        quotation_id: quotationId,
        tipo: 'otro',
        next_contact_date: null,
        note,
      })
      .catch((e: unknown) =>
        this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
      );
  }

  /** Todo lo que el borrador y la revisión necesitan saber del evento. */
  private async contexto(
    quotationId: string,
    companyId: number,
    ordenDeCompraId: number | null,
  ): Promise<ContextoDeLaFactura & { evento: EventoAFacturar }> {
    const evento = await this.repo.eventoAFacturar(quotationId, companyId);
    if (!evento) throw new NotFoundException('Ese evento no existe');
    if (!SE_FACTURA.includes(evento.estado))
      throw new BadRequestException(
        'Se factura un evento aceptado o ya realizado',
      );
    const ambiente = this.conexion.de(companyId).ambiente;
    const [ocs, facturado, razones] = await Promise.all([
      this.repo.ordenesDelEvento(quotationId, companyId),
      this.repo.facturado(quotationId, companyId, ambiente),
      evento.clientId
        ? this.razonesSociales.deCliente(evento.clientId, companyId)
        : Promise.resolve([]),
    ]);
    let oc: OrdenAFacturar | null = null;
    if (ordenDeCompraId != null) {
      const o = ocs.find((x) => x.id === ordenDeCompraId);
      if (!o) throw new NotFoundException('Esa OC no está en este evento');
      oc = {
        ...o,
        neto: o.neto != null ? Number(o.neto) : null,
        iva: o.iva != null ? Number(o.iva) : null,
        total: Number(o.total),
        facturado: facturado.porOC.get(o.id) ?? 0,
        pdf: o.documento_id
          ? await this.repo.nombreDelDocumento(o.documento_id, quotationId)
          : null,
      };
    }
    return {
      evento,
      oc,
      razones,
      facturadoDelEvento: facturado.total,
      totalDeLasOC: ocs.reduce((s, o) => s + Number(o.total), 0),
      ambiente,
    };
  }

  private async vistaPrevia(
    pedida: DtePedido,
    ctx: ContextoDeLaFactura,
    companyId: number,
  ) {
    const conexion = this.conexion.de(companyId);
    // La boleta va con folio 0 (lo pone facturacion.cl): se muestra el que
    // debería tocarle.
    const [folio, emisor] = await Promise.all([
      conexion.folioSiguiente(pedida.tipo),
      this.ordenes.empresaQueVende(companyId),
    ]);
    const fecha = hoyEnChile();
    return {
      ...paraLaPantalla(
        revisarDte(pedida, ctx, pedida.tipo === BOLETA ? 0 : folio, fecha),
      ),
      folio,
      fecha,
      emisor,
      ambiente: conexion.ambiente,
    };
  }

  /**
   * §9.12 y E2: el receptor queda en la ficha del cliente. Si su RUT era
   * nuevo, como una razón social más; si ya estaba, lo guardado manda: solo
   * se completa lo que la ficha no tenía y las referencias que pide.
   */
  private async recordarReceptor(
    ctx: ContextoDeLaFactura,
    pedida: DtePedido,
    user: User,
  ) {
    const clientId = ctx.evento?.clientId ?? ctx.clienteId;
    if (!clientId) return;
    const r = pedida.receptor;
    const guardada = razonSocialDelRut(ctx.razones, r.rut);
    // En «Nuevo documento» lo editado a mano manda (§9.22: «los cambios
    // quedan en la ficha»); con evento, solo se llena lo que faltaba.
    const manda = !ctx.evento;
    if (!guardada) {
      await this.razonesSociales.crear(
        clientId,
        user.company_id,
        {
          rut: r.rut,
          razon_social: r.razon_social,
          giro: r.giro,
          direccion: r.direccion,
          comuna: r.comuna,
          ciudad: r.ciudad,
          correo_facturacion: r.correo,
          referencias_exigidas: pedida.pedir_siempre,
        },
        user.id ?? null,
        ctx.oc ? 'orden_de_compra' : 'manual',
      );
      return;
    }
    const cambios: EditarRazonSocialDto = {};
    const cambia = (antes: string | null, ahora: string | null | undefined) =>
      !!textoLimpio(ahora) &&
      (manda ? textoLimpio(ahora) !== textoLimpio(antes) : !antes);
    for (const campo of ['giro', 'direccion', 'comuna', 'ciudad'] as const)
      if (cambia(guardada[campo], r[campo])) cambios[campo] = r[campo];
    if (cambia(guardada.correo_facturacion, r.correo))
      cambios.correo_facturacion = r.correo;
    if (manda && cambia(guardada.razon_social, r.razon_social))
      cambios.razon_social = r.razon_social;
    const antes = [...guardada.referencias_exigidas].sort().join(',');
    if (antes !== [...pedida.pedir_siempre].sort().join(','))
      cambios.referencias_exigidas = pedida.pedir_siempre;
    if (Object.keys(cambios).length)
      await this.razonesSociales.editar(
        clientId,
        user.company_id,
        guardada.id,
        cambios,
      );
  }
}
