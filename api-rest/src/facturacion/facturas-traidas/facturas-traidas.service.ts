import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import { DocumentosTributariosRepository } from '../facturas/documentos-tributarios.repository';
import { nombreDelPdf, nombreParaElBalde } from '../facturas/nombre-del-pdf';
import { NominaSiiRepository } from '../nomina-sii/nomina-sii.repository';
import { NOMBRE_LARGO, QUE_HACE } from '../notas/cadena';
import { FacturasTraidasRepository } from './facturas-traidas.repository';
import {
  leerFacturaDelPdf,
  type FacturaDelPdf,
  type TipoTraible,
} from './leer-factura-del-pdf';
import { nombreCompletoDelSii, numeroDelRut } from './nombre-del-sii';
import { codigoPorLosMontos, MODIFICABLES } from './nota-traida';

const FACTURA = 33;
const NOTA_DE_CREDITO = 61;

/** «la factura», «la nota de crédito», como lo dicen los mensajes. */
const nombreDe = (tipo: number) => NOMBRE_LARGO[tipo] ?? 'el documento';

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
 * evento y cuenta en «Por facturar». Si facturacion.cl cortó la razón
 * social en su PDF, va completa con la de la nómina del SII
 * (`nombreCompletoDelSii`; Felipe, 08-11, con la N° 375: «Sí, con nombre
 * del SII»), y la del PDF queda anotada en `respuesta`.
 *
 * La nota de crédito se trae igual (Felipe, 08-11: *"tráete las notas de
 * crédito y las facturas"*): modifica el documento de su referencia, que
 * tiene que estar en Eventia, y queda en su cadena, su evento y su OC, con
 * el código sacado de los montos (`nota-traida.ts`).
 */
@Injectable()
export class FacturasTraidasService {
  constructor(
    private readonly repo: FacturasTraidasRepository,
    private readonly documentos: DocumentosTributariosRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly nomina: NominaSiiRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasTraidasService.name);
  }

  async traer(
    user: User,
    folio: number,
    guardar: boolean,
    tipo: TipoTraible = FACTURA,
  ) {
    const companyId = user.company_id;
    const conexion = this.conexion.de(companyId);
    const ambiente = conexion.ambiente;
    const nombre = nombreDe(tipo);
    if (ambiente === 'simulado')
      throw new BadRequestException(
        'En el modo simulado no hay facturas de facturacion.cl que traer',
      );
    if (await this.repo.yaEsta(companyId, tipo, folio, ambiente))
      throw new ConflictException(
        `${mayuscula(nombre)} N° ${folio} ya está en Eventia`,
      );
    const pdf = await conexion.obtenerPdf(tipo, folio);
    if (!pdf)
      throw new BadRequestException(
        `facturacion.cl no tiene el PDF de ${nombre} N° ${folio}`,
      );
    const leida = leerFacturaDelPdf(pdf, tipo);
    if (!leida.ok)
      throw new BadRequestException(
        `No se pudo leer ${nombre} N° ${folio}: ${leida.motivo.toLowerCase()}`,
      );
    const f = leida.factura;
    if (f.folio !== folio)
      throw new BadRequestException(
        `El PDF es de ${nombre} N° ${f.folio}, no de la ${folio}`,
      );
    const delPdf = f.receptor.razon_social;
    const completo = nombreCompletoDelSii(
      delPdf,
      await this.nombreDelSii(f.receptor.rut),
    );
    const receptor = completo
      ? { ...f.receptor, razon_social: completo }
      : f.receptor;

    // La nota: el documento que modifica, en Eventia, y cómo.
    const nota =
      tipo === NOTA_DE_CREDITO
        ? await this.loQueModifica(companyId, folio, f, ambiente)
        : null;
    const ref = f.referencias.find((r) => r.tipo === '801');
    const oc =
      !nota && ref ? await this.repo.ocPorNumero(companyId, ref.folio) : null;
    const evento = nota
      ? nota.original.cotizacion
        ? { cotizacion: nota.original.cotizacion, oc: nota.original.oc }
        : null
      : oc
        ? { cotizacion: oc.cotizacion, oc: oc.numero }
        : null;
    const vista = {
      ...f,
      tipo,
      receptor,
      nombre_del_sii: !!completo,
      evento,
      modifica: nota
        ? {
            tipo: nota.referencia.tipo,
            folio: nota.referencia.folio,
            fecha: nota.referencia.fecha,
            que_hace: QUE_HACE[nota.codigo],
          }
        : null,
    };
    if (!guardar) return { factura: vista, guardada: null };

    const quotationId = nota ? nota.original.quotation_id : oc?.quotation_id;
    // El PDF: el de la factura que ya está subido en Documentos del evento
    // (si alguien lo subió a mano), o una copia propia en el balde privado
    // (L10).
    let pdfPath =
      oc && !nota
        ? await this.repo.pdfSubidoAlEvento(oc.quotation_id, folio)
        : null;
    if (!pdfPath) {
      const archivo = nombreParaElBalde(
        nombreDelPdf({
          tipo,
          folio,
          cliente: receptor.razon_social,
          cotizacion: evento?.cotizacion ?? null,
          oc: evento?.oc ?? ref?.folio ?? null,
        }),
      );
      pdfPath = quotationId
        ? `c${companyId}/event-documents/${quotationId}/facturas/${archivo}.pdf`
        : `c${companyId}/documentos-tributarios/${archivo}.pdf`;
      await this.documentos.guardarPdf(pdfPath, pdf);
    }
    const guardada = await this.repo.guardar({
      company_id: companyId,
      tipo,
      ambiente,
      estado: 'emitido',
      folio,
      fecha_emision: f.fecha_emision,
      receptor: { ...receptor, correo: null },
      detalle: f.lineas,
      referencias: nota
        ? [{ ...nota.referencia, codigo: nota.codigo }]
        : f.referencias,
      exento: f.exento,
      neto: f.neto,
      iva: f.iva,
      total: f.total,
      quotation_id: quotationId ?? null,
      orden_de_compra_id: nota
        ? nota.original.orden_de_compra_id
        : (oc?.id ?? null),
      // Sin vencimiento no se sabe el plazo: no se adivina la condición.
      forma_de_pago: !nota && f.vencimiento ? f.forma_de_pago : null,
      vencimiento: nota ? null : f.vencimiento,
      pdf_path: pdfPath,
      creado_por: user.id ?? null,
      ...(nota
        ? { modifica_id: nota.original.id, codigo_referencia: nota.codigo }
        : {}),
      respuesta: {
        traida: true,
        de: 'facturacion.cl',
        ...(completo ? { razon_social_del_pdf: delPdf } : {}),
        ...(nota ? { codigo_por_los_montos: true } : {}),
      },
    });
    this.logger.info(
      `${nombre} N° ${folio} traída de facturacion.cl (empresa ${companyId}, documento ${guardada.id})`,
    );
    return { factura: vista, guardada };
  }

  /** La nota traída: el documento de su referencia, que tiene que estar en
   *  Eventia, y el código que dicen los montos. Si no, no se trae. */
  private async loQueModifica(
    companyId: number,
    folio: number,
    f: Pick<FacturaDelPdf, 'total' | 'referencias'>,
    ambiente: AmbienteDeFacturacion,
  ) {
    const referencia = f.referencias.find((r) => MODIFICABLES.has(r.tipo));
    if (!referencia)
      throw new BadRequestException(
        `La nota de crédito N° ${folio} no dice qué documento modifica`,
      );
    const suyo = `${nombreDe(Number(referencia.tipo))} N° ${referencia.folio}`;
    const original = await this.repo.documentoPorFolio(
      companyId,
      Number(referencia.tipo),
      Number(referencia.folio),
      ambiente,
    );
    if (!original)
      throw new BadRequestException(
        `La nota de crédito N° ${folio} modifica ${suyo}, que no está en Eventia: tráela primero`,
      );
    const codigo = codigoPorLosMontos(f.total, original.total);
    if (!codigo)
      throw new BadRequestException(
        `La nota de crédito N° ${folio} es por más que ${suyo}`,
      );
    return {
      original,
      codigo,
      referencia: {
        tipo: referencia.tipo,
        folio: referencia.folio,
        fecha: referencia.fecha,
        razon: referencia.razon ?? null,
      },
    };
  }

  /** La razón social del SII para ese RUT. Si no se puede leer, nula: la
   *  factura se trae con el nombre de su PDF. */
  private async nombreDelSii(rut: string): Promise<string | null> {
    const numero = numeroDelRut(rut);
    if (!numero) return null;
    try {
      return (await this.nomina.contribuyente(numero))?.razon_social ?? null;
    } catch (e) {
      this.logger.warn(`nómina del SII para el RUT ${rut}: ${mensajeDe(e)}`);
      return null;
    }
  }
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
