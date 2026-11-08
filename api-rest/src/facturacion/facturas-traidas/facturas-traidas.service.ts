import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import { DocumentosTributariosRepository } from '../facturas/documentos-tributarios.repository';
import { nombreDelPdf, nombreParaElBalde } from '../facturas/nombre-del-pdf';
import { FacturasTraidasRepository } from './facturas-traidas.repository';
import { leerFacturaDelPdf } from './leer-factura-del-pdf';

const FACTURA = 33;

/**
 * TRAER UNA FACTURA EMITIDA FUERA DE EVENTIA (doc 19 §9.36). Felipe, 08-11,
 * con las N° 374 y 375 de Santo Tomás, hechas en la página de
 * facturacion.cl: *"¿podrás traer estas facturas para hacer las notas de
 * crédito desde acá?"* y *"ok vamos con la 2"*.
 *
 * Eventia le pide el PDF a facturacion.cl (`ObtenerPdf`, que viene
 * incluido), lo lee sin IA (`leerFacturaDelPdf`) y, con `guardar`, la deja
 * en la lista como emitida, marcada «traída»: desde ahí se anula o se
 * rebaja con su nota, como cualquier otra. Sin `guardar` solo la lee, para
 * mirarla antes. Si la OC de su referencia está en Eventia, queda en ese
 * evento y cuenta en «Por facturar».
 */
@Injectable()
export class FacturasTraidasService {
  constructor(
    private readonly repo: FacturasTraidasRepository,
    private readonly documentos: DocumentosTributariosRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasTraidasService.name);
  }

  async traer(user: User, folio: number, guardar: boolean) {
    const companyId = user.company_id;
    const conexion = this.conexion.de(companyId);
    const ambiente = conexion.ambiente;
    if (ambiente === 'simulado')
      throw new BadRequestException(
        'En el modo simulado no hay facturas de facturacion.cl que traer',
      );
    if (await this.repo.yaEsta(companyId, FACTURA, folio, ambiente))
      throw new ConflictException(`La factura N° ${folio} ya está en Eventia`);
    const pdf = await conexion.obtenerPdf(FACTURA, folio);
    if (!pdf)
      throw new BadRequestException(
        `facturacion.cl no tiene el PDF de la factura N° ${folio}`,
      );
    const leida = leerFacturaDelPdf(pdf);
    if (!leida.ok)
      throw new BadRequestException(
        `No se pudo leer la factura N° ${folio}: ${leida.motivo.toLowerCase()}`,
      );
    const f = leida.factura;
    if (f.folio !== folio)
      throw new BadRequestException(
        `El PDF es de la factura N° ${f.folio}, no de la ${folio}`,
      );
    const ref = f.referencias.find((r) => r.tipo === '801');
    const oc = ref ? await this.repo.ocPorNumero(companyId, ref.folio) : null;
    const vista = {
      ...f,
      evento: oc ? { cotizacion: oc.cotizacion, oc: oc.numero } : null,
    };
    if (!guardar) return { factura: vista, guardada: null };

    // El PDF: el que ya está subido en Documentos del evento (si alguien lo
    // subió a mano), o una copia propia en el balde privado (L10).
    let pdfPath = oc
      ? await this.repo.pdfSubidoAlEvento(oc.quotation_id, folio)
      : null;
    if (!pdfPath) {
      const nombre = nombreParaElBalde(
        nombreDelPdf({
          tipo: FACTURA,
          folio,
          cliente: f.receptor.razon_social,
          cotizacion: oc?.cotizacion ?? null,
          oc: ref?.folio ?? null,
        }),
      );
      pdfPath = oc
        ? `c${companyId}/event-documents/${oc.quotation_id}/facturas/${nombre}.pdf`
        : `c${companyId}/documentos-tributarios/${nombre}.pdf`;
      await this.documentos.guardarPdf(pdfPath, pdf);
    }
    const guardada = await this.repo.guardar({
      company_id: companyId,
      tipo: FACTURA,
      ambiente,
      estado: 'emitido',
      folio,
      fecha_emision: f.fecha_emision,
      receptor: { ...f.receptor, correo: null },
      detalle: f.lineas,
      referencias: f.referencias,
      exento: f.exento,
      neto: f.neto,
      iva: f.iva,
      total: f.total,
      quotation_id: oc?.quotation_id ?? null,
      orden_de_compra_id: oc?.id ?? null,
      // Sin vencimiento no se sabe el plazo: no se adivina la condición.
      forma_de_pago: f.vencimiento ? f.forma_de_pago : null,
      vencimiento: f.vencimiento,
      pdf_path: pdfPath,
      creado_por: user.id ?? null,
      respuesta: { traida: true, de: 'facturacion.cl' },
    });
    this.logger.info(
      `factura N° ${folio} traída de facturacion.cl (empresa ${companyId}, documento ${guardada.id})`,
    );
    return { factura: vista, guardada };
  }
}
