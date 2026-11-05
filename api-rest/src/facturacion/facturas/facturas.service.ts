import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { EditarRazonSocialDto } from 'src/clients/razones-sociales/razon-social.dto';
import { RazonesSocialesService } from 'src/clients/razones-sociales/razones-sociales.service';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { normalizarRut } from '../../people/utils/rut';
import { textoLimpio } from '../archivo/texto';
import { NOTA_DEL_AMBIENTE } from '../facturacion-cl/facturacion-cl';
import {
  Cadena,
  estadoEnPalabras,
  facturadoDeLasOC,
  loQueHace,
} from '../notas/cadena';
import { OrdenesDeCompraRepository } from '../ordenes-de-compra/ordenes-de-compra.repository';
import {
  armarBorrador,
  razonSocialDelRut,
  revisarFactura,
  type ContextoDeLaFactura,
  type FacturaPedida,
  type OrdenAFacturar,
  type Revision,
} from './borrador';
import { ConexionConFacturacionCl } from './conexion';
import { guardarCopiaDelPdf } from './copia-del-pdf';
import { DocumentosTributariosRepository } from './documentos-tributarios.repository';
import { mandarConFolio } from './emision';

/**
 * LA FACTURA DEL EVENTO (doc 19 §9.2 y §9.10, paso 2c).
 *
 * BelIA arma el borrador desde la OC (o desde el evento), la persona lo
 * corrige y lo mira tal como saldrá, y el administrador lo emite (D5). La
 * vista previa y la emisión pasan por la MISMA revisión (`revisarFactura`):
 * lo que se ve es lo que sale.
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
// Lo que lleva notas de crédito y de débito (las boletas, en el paso 0: L21).
const CON_NOTAS = new Set([FACTURA, 56, 61]);

// Se factura un evento aceptado o realizado (§9.2), como lo que cuenta
// como vendido en el resto del motor.
const SE_FACTURA = ['aceptada', 'realizada'];

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Lo que llega de la pantalla, con las mismas reglas de limpieza. */
const normalizada = (p: FacturaPedida): FacturaPedida => ({
  orden_de_compra_id: p.orden_de_compra_id ?? null,
  porcentaje: p.monto != null ? null : (p.porcentaje ?? null),
  monto: p.monto ?? null,
  receptor: {
    ...p.receptor,
    rut: normalizarRut(p.receptor?.rut ?? '') ?? textoLimpio(p.receptor?.rut),
    razon_social: textoLimpio(p.receptor?.razon_social),
  },
  detalle: {
    descripcion: textoLimpio(p.detalle?.descripcion),
    descripcion_larga: (p.detalle?.descripcion_larga ?? '').trim() || null,
  },
  referencias: (p.referencias ?? []).map((r) => ({
    tipo: r.tipo,
    folio: textoLimpio(r.folio),
    fecha: (r.fecha ?? '').trim(),
  })),
  pedir_siempre: [...new Set(p.pedir_siempre ?? [])],
});

/** La revisión para la pantalla: sin el archivo. */
const paraLaPantalla = (r: Revision) => ({
  ok: r.ok,
  montos: r.montos,
  lineas: r.lineas,
  observaciones: r.observaciones,
  avisos: r.avisos,
  problemas: r.problemas,
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

  /** El borrador de BelIA, con su vista previa. */
  async borrador(
    quotationId: string,
    companyId: number,
    ordenDeCompraId: number | null,
  ) {
    const ctx = await this.contexto(quotationId, companyId, ordenDeCompraId);
    const borrador = armarBorrador(ctx);
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
  async revisar(quotationId: string, companyId: number, dto: FacturaPedida) {
    const pedida = normalizada(dto);
    const ctx = await this.contexto(
      quotationId,
      companyId,
      pedida.orden_de_compra_id,
    );
    return this.vistaPrevia(pedida, ctx, companyId);
  }

  async emitir(quotationId: string, user: User, dto: FacturaPedida) {
    const companyId = user.company_id;
    const pedida = normalizada(dto);
    const ctx = await this.contexto(
      quotationId,
      companyId,
      pedida.orden_de_compra_id,
    );
    const conexion = this.conexion.de(companyId);
    const fecha = hoyEnChile();
    const folio = await conexion.folioSiguiente(FACTURA);
    const revision = revisarFactura(pedida, ctx, folio, fecha);
    if (!revision.ok || !revision.archivo || !revision.montos)
      throw new BadRequestException(
        revision.faltan.length
          ? `Falta ${revision.faltan.map((f) => f.texto).join(', ')}`
          : revision.problemas.join('. '),
      );

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
        neto: revision.montos.neto,
        exento: 0,
        iva: revision.montos.iva,
        total: revision.montos.total,
        quotation_id: quotationId,
        orden_de_compra_id: pedida.orden_de_compra_id,
        porcentaje: pedida.porcentaje,
        creado_por: user.id ?? null,
      },
      // El mismo archivo de la vista previa, con el folio que toque.
      armar: (f) =>
        f === folio
          ? revision.archivo
          : revisarFactura(pedida, ctx, f, fecha).archivo,
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
    await this.bitacora
      .crearComoBeliaAPedidoDe(user, {
        quotation_id: quotationId,
        tipo: 'otro',
        next_contact_date: null,
        note: `Emitió la factura N° ${emitido.folio} por ${pesos(emitido.total)} a ${pedida.receptor.razon_social}${ctx.oc ? `, OC ${ctx.oc.numero}` : ''}.${NOTA_DEL_AMBIENTE[emitido.ambiente] ?? ''}`,
      })
      .catch((e: unknown) =>
        this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
      );
    this.logger.info(
      `factura ${emitido.folio} (${emitido.ambiente}) de ${quotationId}: ${emitido.total}`,
    );
    return emitido;
  }

  /** Todo lo que el borrador y la revisión necesitan saber del evento. */
  private async contexto(
    quotationId: string,
    companyId: number,
    ordenDeCompraId: number | null,
  ): Promise<ContextoDeLaFactura> {
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
    pedida: FacturaPedida,
    ctx: ContextoDeLaFactura,
    companyId: number,
  ) {
    const conexion = this.conexion.de(companyId);
    const [folio, emisor] = await Promise.all([
      conexion.folioSiguiente(FACTURA),
      this.ordenes.empresaQueVende(companyId),
    ]);
    const fecha = hoyEnChile();
    return {
      ...paraLaPantalla(revisarFactura(pedida, ctx, folio, fecha)),
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
    pedida: FacturaPedida,
    user: User,
  ) {
    const clientId = ctx.evento.clientId;
    if (!clientId) return;
    const r = pedida.receptor;
    const guardada = razonSocialDelRut(ctx.razones, r.rut);
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
    for (const campo of ['giro', 'direccion', 'comuna', 'ciudad'] as const)
      if (!guardada[campo] && textoLimpio(r[campo])) cambios[campo] = r[campo];
    if (!guardada.correo_facturacion && textoLimpio(r.correo))
      cambios.correo_facturacion = r.correo;
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
