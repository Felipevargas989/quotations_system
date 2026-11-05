import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
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
import {
  EnvioSinRespuesta,
  type FacturacionCl,
  type RespuestaDeProcesar,
} from '../facturacion-cl/facturacion-cl';
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
import {
  DocumentosTributariosRepository,
  type DocumentoTributario,
} from './documentos-tributarios.repository';

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
   *  'simulado': la pantalla lo dice en un letrero). */
  async documentos(quotationId: string, companyId: number) {
    if (!(await this.repo.eventoAFacturar(quotationId, companyId)))
      throw new NotFoundException('Ese evento no existe');
    return {
      ambiente: this.conexion.de(companyId).ambiente,
      documentos: await this.repo.deCotizacion(quotationId, companyId),
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
    let revision = revisarFactura(
      pedida,
      ctx,
      await conexion.folioSiguiente(FACTURA),
      fecha,
    );
    if (!revision.ok || !revision.archivo || !revision.montos)
      throw new BadRequestException(
        revision.faltan.length
          ? `Falta ${revision.faltan.map((f) => f.texto).join(', ')}`
          : revision.problemas.join('. '),
      );

    // Un solo envío a la vez por evento: el índice único lo asegura.
    let documento: DocumentoTributario;
    try {
      documento = await this.repo.crear({
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
        archivo_enviado: revision.archivo,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505')
        throw new ConflictException(
          'Ya se está emitiendo un documento de este evento: espera su respuesta.',
        );
      throw error;
    }

    let respuesta: RespuestaDeProcesar;
    try {
      respuesta = await conexion.procesar(revision.archivo, FACTURA);
      if (
        respuesta.resultado === 'rechazado' &&
        /ya existe el documento/i.test(respuesta.mensaje)
      ) {
        revision = revisarFactura(
          pedida,
          ctx,
          await conexion.folioSiguiente(FACTURA),
          fecha,
        );
        if (revision.ok && revision.archivo) {
          await this.repo.actualizar(documento.id, companyId, {
            archivo_enviado: revision.archivo,
          });
          respuesta = await conexion.procesar(revision.archivo, FACTURA);
        }
      }
    } catch (error) {
      // L5: no se sabe si salió. Nunca se reintenta solo.
      const motivo =
        error instanceof EnvioSinRespuesta
          ? error.message
          : `El envío falló sin respuesta: ${mensajeDe(error)}`;
      this.logger.warn(`factura de ${quotationId} por confirmar: ${motivo}`);
      return this.repo.actualizar(documento.id, companyId, {
        estado: 'por_confirmar',
        error: motivo,
      });
    }

    if (respuesta.resultado === 'rechazado') {
      await this.repo.actualizar(documento.id, companyId, {
        estado: 'rechazado',
        error: respuesta.mensaje,
        respuesta: respuesta.crudo,
      });
      throw new BadRequestException(
        `facturacion.cl no la aceptó: ${respuesta.mensaje}`,
      );
    }

    let emitido: DocumentoTributario;
    try {
      emitido = await this.repo.actualizar(documento.id, companyId, {
        estado: 'emitido',
        folio: respuesta.folio,
        fecha_emision: respuesta.fecha ?? fecha,
        respuesta: respuesta.crudo,
        url_original: respuesta.urlOriginal,
        url_cedible: respuesta.urlCedible,
        emitido_por: user.id ?? null,
        emitido_en: new Date().toISOString(),
      });
    } catch (error) {
      // Salió, pero no quedó anotado: el registro sigue «enviando» y frena
      // otra emisión del evento hasta revisarlo.
      this.logger.error(
        `factura ${respuesta.folio} de ${quotationId} emitida y SIN anotar: ${mensajeDe(error)}`,
      );
      throw new InternalServerErrorException(
        `La factura N° ${respuesta.folio} salió, pero Eventia no la pudo anotar. No la emitas de nuevo: avisa para revisarla.`,
      );
    }

    // Lo que sigue no cambia la factura: si algo falla, se avisa en el
    // registro y la factura queda emitida igual.
    emitido = await this.guardarPdf(
      emitido,
      quotationId,
      companyId,
      conexion,
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
        note: `Emitió la factura N° ${emitido.folio} por ${pesos(emitido.total)} a ${pedida.receptor.razon_social}${ctx.oc ? `, OC ${ctx.oc.numero}` : ''}.${emitido.ambiente === 'simulado' ? ' Es simulada: no salió nada al SII.' : ''}`,
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
    const [ocs, facturado, razones] = await Promise.all([
      this.repo.ordenesDelEvento(quotationId, companyId),
      this.repo.facturado(quotationId, companyId),
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

  /** La copia propia del PDF (L10), también en Documentos → Facturas. */
  private async guardarPdf(
    doc: DocumentoTributario,
    quotationId: string,
    companyId: number,
    conexion: FacturacionCl,
  ) {
    if (doc.folio == null) return doc;
    const pdf = await conexion.obtenerPdf(doc.tipo, doc.folio);
    // Todavía no está: la pantalla dice «PDF en camino» (§9.10).
    if (!pdf) return doc;
    const sufijo = doc.ambiente === 'produccion' ? '' : `_${doc.ambiente}`;
    const ruta = `c${companyId}/event-documents/${quotationId}/facturas/factura_${doc.folio}${sufijo}.pdf`;
    await this.repo.guardarPdf(ruta, pdf);
    const conPdf = await this.repo.actualizar(doc.id, companyId, {
      pdf_path: ruta,
    });
    await this.repo.agregarAlEvento(
      quotationId,
      `Factura N° ${doc.folio}${doc.ambiente === 'simulado' ? ' (simulada)' : ''}.pdf`,
      ruta,
    );
    return conPdf;
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
