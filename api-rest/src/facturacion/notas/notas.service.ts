import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { armarFactura } from '../archivo/factura';
import { netoParaElTotal } from '../archivo/montos';
import { textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle, Receptor } from '../archivo/tipos';
import { BoletasRepository } from '../boletas/boletas.repository';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import { guardarCopiaDelPdf } from '../facturas/copia-del-pdf';
import { DocumentosTributariosRepository } from '../facturas/documentos-tributarios.repository';
import { mandarConFolio } from '../facturas/emision';
import {
  Cadena,
  NOMBRE_CORTO,
  estadoEnPalabras,
  nombreDe,
  plazoDelSii,
} from './cadena';
import { NotaPedidaDto } from './nota.dto';

/**
 * LA LISTA DE FACTURACIÓN Y LAS NOTAS (doc 19 §9.5, paso 4; maqueta del
 * 04-11). Solo el administrador (E5).
 *
 * - La lista: todo lo emitido en un mes (facturas, boletas y notas), cada
 *   documento con su estado en la cadena («Anulada por NC 88», «Rebajada:
 *   queda $…», «Vigente»), lo facturado del mes y lo que espera «Comprobar».
 * - Las notas: la de crédito (61) anula (1), corrige un texto en $0 (2) o
 *   rebaja (3) una factura, y anula una nota de débito; la de débito (56)
 *   anula una nota de crédito. Cada una referencia UN documento y queda
 *   amarrada a él (`modifica_id`). Nunca pasa del saldo de lo que modifica.
 *   La nota de crédito de una boleta se prueba en el paso 0 (L21).
 * - «Comprobar»: lo que se cortó al mandarlo. Si el folio avanzó en
 *   facturacion.cl, salió; si no, no salió y se puede emitir de nuevo.
 */

const NC = 61;
const ND = 56;
const CON_NOTAS = new Set([33, ND, NC]);
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const fechaCorta = (f: string) => f.slice(0, 10).split('-').reverse().join('-');
const QUE_HACE: Record<number, string> = {
  1: 'anula',
  2: 'corrige',
  3: 'rebaja',
};
const NOMBRE_LARGO: Record<number, string> = {
  33: 'la factura',
  39: 'la boleta',
  56: 'la nota de débito',
  61: 'la nota de crédito',
};

/** El primer y el siguiente día del mes (AAAA-MM-DD). */
const delMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const siguiente =
    m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return { desde: `${mes}-01`, hasta: `${siguiente}-01` };
};

/** El folio que llevaba un archivo de factura o nota (Encabezado, campo 2). */
const folioDelArchivo = (archivo: string | null) => {
  const lineas = (archivo ?? '').split(/\r?\n/);
  const i = lineas.indexOf('->Encabezado<-');
  const folio = Number((lineas[i + 1] ?? '').split(';')[1]);
  return i >= 0 && Number.isInteger(folio) && folio > 0 ? folio : null;
};

@Injectable()
export class NotasService {
  constructor(
    private readonly documentos: DocumentosTributariosRepository,
    private readonly boletas: BoletasRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotasService.name);
  }

  /** La lista de Facturación de un mes, con la cadena. */
  async lista(companyId: number, mes?: string) {
    const hoy = hoyEnChile();
    const elMes = mes ?? hoy.slice(0, 7);
    const { desde, hasta } = delMes(elMes);
    const [delPeriodo, todos] = await Promise.all([
      this.documentos.delPeriodo(companyId, desde, hasta),
      this.documentos.cadenaDeLaEmpresa(companyId),
    ]);
    const cadena = new Cadena(todos);
    const porId = new Map(todos.map((d) => [d.id, d]));

    const documentos = delPeriodo.map((d) => {
      const total = Number(d.total);
      const emitido = d.estado === 'emitido';
      const conCadena = emitido && CON_NOTAS.has(d.tipo);
      const estado = conCadena
        ? cadena.estado(d.id)
        : { como: 'vigente' as const };
      const modifica = d.modifica_id ? porId.get(d.modifica_id) : undefined;
      // «reemplaza a la 1235»: otra factura de la misma OC, anulada, de antes.
      const reemplaza =
        d.tipo === 33 && d.orden_de_compra_id
          ? todos.find(
              (o) =>
                o.tipo === 33 &&
                o.id < d.id &&
                o.orden_de_compra_id === d.orden_de_compra_id &&
                !cadena.vigente(o.id),
            )
          : undefined;
      const esNota = d.tipo === NC || d.tipo === ND;
      const titulo =
        esNota && modifica
          ? `${nombreDe(d)} · ${QUE_HACE[d.codigo_referencia ?? 0] ?? 'modifica'} la ${modifica.tipo === 33 ? modifica.folio : nombreDe(modifica)}`
          : nombreDe(d);
      const textoDelEstado = !emitido
        ? 'Por confirmar'
        : esNota
          ? estado.como === 'anulado'
            ? estadoEnPalabras(estado)
            : `Código ${d.codigo_referencia} · ${d.fecha_emision ? fechaCorta(d.fecha_emision).slice(0, 5) : ''}`
          : estadoEnPalabras(estado);
      const vigente = estado.como !== 'anulado';
      const detalle = (d.detalle ?? []) as { cabana?: string | null }[];
      return {
        id: d.id,
        tipo: d.tipo,
        folio: d.folio,
        fecha_emision: d.fecha_emision,
        estado: d.estado,
        ambiente: d.ambiente,
        titulo,
        reemplaza: reemplaza ? nombreDe(reemplaza) : null,
        cliente:
          d.tipo === 39
            ? (detalle[0]?.cabana ?? 'Boleta')
            : (d.receptor?.razon_social ?? null),
        total: esNota && d.tipo === NC ? -total : total,
        neto: Number(d.neto),
        iva: Number(d.iva),
        numero: d.cotizacion?.quotation_number ?? null,
        quotation_id: d.quotation_id,
        oc: d.oc?.numero ?? null,
        modifica_id: d.modifica_id,
        cadena: { como: estado.como, texto: textoDelEstado },
        pdf_path: d.pdf_path,
        error: d.error,
        acciones: {
          anular:
            conCadena &&
            vigente &&
            !(d.tipo === 33 && estado.como === 'rebajado'),
          rebajar:
            conCadena && d.tipo === 33 && vigente && cadena.saldo(d.id) > 0,
          corregir: conCadena && d.tipo === 33 && vigente,
          comprobar: d.estado === 'por_confirmar' || d.estado === 'enviando',
          pedirPdf: emitido && !d.pdf_path,
        },
        saldo: conCadena && d.tipo === 33 ? cadena.saldo(d.id) : null,
        plazos:
          conCadena && d.fecha_emision
            ? {
                anular: plazoDelSii(d.fecha_emision, 'anular'),
                rebajar: plazoDelSii(d.fecha_emision, 'rebajar'),
              }
            : null,
      };
    });

    const emitidos = delPeriodo.filter((d) => d.estado === 'emitido');
    return {
      ambiente: this.conexion.de(companyId).ambiente,
      mes: elMes,
      hoy,
      resumen: {
        // Lo facturado neto del mes: las notas de crédito restan.
        facturado: emitidos.reduce(
          (s, d) => s + (d.tipo === NC ? -1 : 1) * Number(d.total),
          0,
        ),
        facturas: emitidos.filter((d) => d.tipo === 33).length,
        boletas: emitidos.filter((d) => d.tipo === 39).length,
        notas: emitidos.filter((d) => d.tipo === NC || d.tipo === ND).length,
        porConfirmar: delPeriodo.filter((d) => d.estado !== 'emitido').length,
      },
      documentos,
    };
  }

  /** La vista previa de la nota: lo que sale y los plazos del SII. */
  async revisarNota(user: User, id: number, dto: NotaPedidaDto) {
    const armada = await this.armar(user, id, dto);
    return {
      ok: armada.armado.ok,
      problemas: armada.armado.ok ? [] : armada.armado.problemas,
      avisos: [
        ...armada.avisos,
        ...(armada.armado.ok ? armada.armado.avisos : []),
      ],
      tipo: armada.tipo,
      folio: armada.folio,
      fecha: armada.fecha,
      codigo: armada.codigo,
      modifica: nombreDe(armada.original),
      plazo: armada.plazo,
      montos: armada.armado.ok ? armada.armado.montos : null,
      lineas: armada.lineas,
      receptor: armada.receptor,
      ambiente: armada.conexion.ambiente,
    };
  }

  async emitirNota(user: User, id: number, dto: NotaPedidaDto) {
    const companyId = user.company_id;
    const armada = await this.armar(user, id, dto);
    const { armado, original, tipo, codigo, conexion, fecha } = armada;
    if (!armado.ok) throw new BadRequestException(armado.problemas.join('. '));

    const nombre = tipo === NC ? 'La nota de crédito' : 'La nota de débito';
    const enviado = await mandarConFolio({
      repo: this.documentos,
      conexion,
      logger: this.logger,
      user,
      tipo,
      fila: {
        company_id: companyId,
        tipo,
        ambiente: conexion.ambiente,
        estado: 'enviando',
        receptor: armada.receptor,
        detalle: armada.lineas,
        referencias: [armada.referencia],
        neto: armado.montos.neto,
        exento: 0,
        iva: armado.montos.iva,
        total: armado.montos.total,
        quotation_id: original.quotation_id,
        orden_de_compra_id: original.orden_de_compra_id,
        porcentaje: null,
        creado_por: user.id ?? null,
        modifica_id: original.id,
        codigo_referencia: codigo,
      },
      armar: (f) =>
        f === armada.folio ? armado.archivo : this.archivoCon(armada, f),
      folio: armada.folio,
      fecha,
      nombre,
    });
    if (enviado.porConfirmar) return enviado.documento;

    const emitida = await guardarCopiaDelPdf(
      this.documentos,
      conexion,
      enviado.documento,
      companyId,
      original.quotation_id,
    ).catch((e: unknown) => {
      this.logger.warn(
        `PDF de la nota ${enviado.documento.folio}: ${mensajeDe(e)}`,
      );
      return enviado.documento;
    });
    if (original.quotation_id)
      await this.bitacora
        .crearComoBeliaAPedidoDe(user, {
          quotation_id: original.quotation_id,
          tipo: 'otro',
          next_contact_date: null,
          note: `Emitió ${tipo === NC ? 'la nota de crédito' : 'la nota de débito'} N° ${emitida.folio} que ${QUE_HACE[codigo]} ${NOMBRE_LARGO[original.tipo] ?? 'el documento'} N° ${original.folio} (${pesos(emitida.total)}): ${textoLimpio(dto.motivo)}.${emitida.ambiente === 'simulado' ? ' Es simulada: no salió nada al SII.' : ''}`,
        })
        .catch((e: unknown) =>
          this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
        );
    this.logger.info(
      `nota ${tipo} N° ${emitida.folio} (${emitida.ambiente}) ${QUE_HACE[codigo]} el documento ${original.id}`,
    );
    return emitida;
  }

  /**
   * «Comprobar» (§9.10, L5): lo que se cortó al mandarlo. Si en
   * facturacion.cl el folio ya pasó el que se mandó, salió con ese folio; si
   * no, no salió, y lo que esperaba (la cabaña de un cobro) vuelve a quedar
   * por emitir.
   */
  async comprobar(user: User, id: number) {
    const companyId = user.company_id;
    const doc = await this.documentos.documento(id, companyId);
    if (!doc) throw new NotFoundException('Ese documento no existe');
    if (doc.estado !== 'por_confirmar' && doc.estado !== 'enviando')
      throw new BadRequestException('Ese documento no está por confirmar');
    if (
      doc.estado === 'enviando' &&
      Date.now() - new Date(doc.created_at).getTime() < 5 * 60 * 1000
    )
      throw new BadRequestException(
        'Se está emitiendo: espera unos minutos y vuelve a comprobar',
      );
    const conexion = this.conexion.de(companyId);
    const siguiente = await conexion.folioSiguiente(doc.tipo);
    const enviado =
      doc.tipo === 39 || doc.tipo === 41
        ? Number(
            (doc.respuesta as { folio_esperado?: number } | null)
              ?.folio_esperado ?? 0,
          ) || null
        : folioDelArchivo(doc.archivo_enviado);
    if (enviado != null && siguiente > enviado) {
      const emitido = await this.documentos.actualizar(id, companyId, {
        estado: 'emitido',
        folio: enviado,
        fecha_emision: hoyEnChile(),
        error: null,
        emitido_por: user.id ?? null,
        emitido_en: new Date().toISOString(),
      });
      return guardarCopiaDelPdf(
        this.documentos,
        conexion,
        emitido,
        companyId,
        emitido.quotation_id,
      ).catch(() => emitido);
    }
    const noSalio = await this.documentos.actualizar(id, companyId, {
      estado: 'rechazado',
      error: `No salió: comprobado con facturacion.cl el ${hoyEnChile()}. Se puede emitir de nuevo.`,
    });
    if (doc.tipo === 39) await this.boletas.desamarrarDeLaBoleta(id, companyId);
    return noSalio;
  }

  /** La copia propia del PDF que no alcanzó a llegar (L10). */
  async pedirPdf(user: User, id: number) {
    const companyId = user.company_id;
    const doc = await this.documentos.documento(id, companyId);
    if (!doc) throw new NotFoundException('Ese documento no existe');
    if (doc.estado !== 'emitido')
      throw new BadRequestException('Solo un documento emitido tiene PDF');
    if (doc.pdf_path) return doc;
    const conPdf = await guardarCopiaDelPdf(
      this.documentos,
      this.conexion.de(companyId),
      doc,
      companyId,
      doc.quotation_id,
    );
    if (!conPdf.pdf_path)
      throw new BadRequestException(
        'facturacion.cl todavía no tiene el PDF: prueba en unos minutos',
      );
    return conPdf;
  }

  /** Arma la nota con el folio que sigue: lo usan la vista previa y emitir. */
  private async armar(user: User, id: number, dto: NotaPedidaDto) {
    const companyId = user.company_id;
    const original = await this.documentos.documento(id, companyId);
    if (!original) throw new NotFoundException('Ese documento no existe');
    if (
      original.estado !== 'emitido' ||
      original.folio == null ||
      !original.fecha_emision
    )
      throw new BadRequestException('Solo se modifica un documento emitido');
    if (!CON_NOTAS.has(original.tipo))
      throw new BadRequestException(
        'La nota de crédito de una boleta se prueba con facturacion.cl en el paso 0 (L21)',
      );
    const cadena = new Cadena(
      await this.documentos.cadenaDeLaEmpresa(companyId),
    );
    if (!cadena.vigente(id))
      throw new ConflictException(`${nombreDe(original)} ya está anulada`);
    if (dto.accion !== 'anular' && original.tipo !== 33)
      throw new BadRequestException('A una nota solo se la anula');
    const motivo = textoLimpio(dto.motivo);
    if (!motivo)
      throw new BadRequestException('Falta el motivo: va en la nota');

    // La ND anula una NC; la NC, todo lo demás (la factura o una ND).
    const tipo: 56 | 61 = original.tipo === NC ? ND : NC;
    const codigo: 1 | 2 | 3 =
      dto.accion === 'anular' ? 1 : dto.accion === 'corregir' ? 2 : 3;
    const saldo = cadena.saldo(id);
    let receptor: Receptor = { ...original.receptor };
    let lineas: LineaDeDetalle[];
    let totalEsperado: number;
    if (dto.accion === 'anular') {
      if (original.tipo === 33 && saldo < Number(original.total))
        throw new ConflictException(
          `${nombreDe(original)} tiene rebajas: rebaja lo que le queda (${pesos(saldo)})`,
        );
      lineas = ((original.detalle ?? []) as LineaDeDetalle[]).map((l) => ({
        descripcion: l.descripcion,
        descripcionLarga: l.descripcionLarga ?? null,
        cantidad: l.cantidad,
        precio: l.precio,
      }));
      totalEsperado = Number(original.total);
    } else if (dto.accion === 'rebajar') {
      if (!dto.monto) throw new BadRequestException('Falta cuánto se rebaja');
      if (dto.monto > saldo)
        throw new BadRequestException(
          `A ${nombreDe(original)} le quedan ${pesos(saldo)}: la rebaja no puede pasar de eso`,
        );
      lineas = [
        {
          descripcion: Array.from(`Rebaja: ${motivo}`).slice(0, 80).join(''),
          cantidad: 1,
          precio: netoParaElTotal(dto.monto).neto,
        },
      ];
      totalEsperado = dto.monto;
    } else {
      lineas = [
        {
          descripcion: Array.from(`Corrige: ${motivo}`).slice(0, 80).join(''),
          cantidad: 1,
          precio: 0,
        },
      ];
      totalEsperado = 0;
      if (dto.receptor)
        receptor = {
          ...receptor,
          razon_social:
            textoLimpio(dto.receptor.razon_social) || receptor.razon_social,
          giro: textoLimpio(dto.receptor.giro) || receptor.giro,
          direccion: textoLimpio(dto.receptor.direccion) || receptor.direccion,
          comuna: textoLimpio(dto.receptor.comuna) || receptor.comuna,
          ciudad: textoLimpio(dto.receptor.ciudad) || receptor.ciudad,
        };
    }

    const fecha = hoyEnChile();
    const plazo = plazoDelSii(original.fecha_emision, dto.accion);
    const avisos: string[] = [];
    if (fecha > plazo)
      avisos.push(
        dto.accion === 'rebajar'
          ? `Pasaron los 6 meses para rebajar (hasta el ${fechaCorta(plazo)}): la nota sale sin derecho a rebajar el débito del IVA.`
          : `Venció el plazo del SII (hasta el ${fechaCorta(plazo)}): el débito ya pagado solo se recupera con el formulario 2117.`,
      );
    const conexion = this.conexion.de(companyId);
    const folio = await conexion.folioSiguiente(tipo);
    const referencia = {
      tipo: String(original.tipo),
      folio: String(original.folio),
      fecha: original.fecha_emision,
      codigo,
      razon: motivo,
    };
    const base = { tipo, fecha, receptor, lineas, referencia, totalEsperado };
    const armado = armarFactura({
      tipo,
      folio,
      fecha,
      receptor,
      lineas,
      referencias: [referencia],
      totalEsperado,
    });
    return {
      ...base,
      original,
      codigo,
      folio,
      plazo,
      avisos,
      conexion,
      armado,
      nombre: NOMBRE_CORTO[tipo],
    };
  }

  private archivoCon(
    a: {
      tipo: 56 | 61;
      fecha: string;
      receptor: Receptor;
      lineas: LineaDeDetalle[];
      referencia: {
        tipo: string;
        folio: string;
        fecha: string;
        codigo: 1 | 2 | 3;
        razon: string;
      };
      totalEsperado: number;
    },
    folio: number,
  ) {
    const r = armarFactura({
      tipo: a.tipo,
      folio,
      fecha: a.fecha,
      receptor: a.receptor,
      lineas: a.lineas,
      referencias: [a.referencia],
      totalEsperado: a.totalEsperado,
    });
    return r.ok ? r.archivo : null;
  }
}
