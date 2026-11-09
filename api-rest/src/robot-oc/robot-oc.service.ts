import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { OrdenesDeCompraService } from 'src/facturacion/ordenes-de-compra/ordenes-de-compra.service';
import { sanitize } from 'src/storage/storage.service';
import {
  elegirCotizacion,
  limpiarNumero,
  type CotizacionCandidata,
  type Eleccion,
} from './elegir-cotizacion';
import { RobotOcRepository } from './robot-oc.repository';

export interface OcDelCorreo {
  numero: string;
  total: number;
  rut?: string | null;
  correos: string[];
  /** true: solo dice dónde iría, sin subir nada. */
  probar: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;

const resumen = (c: CotizacionCandidata) => ({
  numero: c.numero,
  cliente: c.cliente,
  estado: c.estado,
  total: c.total,
  fecha_evento: c.fecha_evento?.slice(0, 10) ?? null,
  contacto: c.correo_contacto,
});

/** «Rudel S.A.» → «Rudel»; «Instituto Profesional Santo Tomás» queda igual. */
export const clienteCorto = (nombre: string) =>
  nombre
    .replace(/\b(S\.?\s?A\.?|SpA|Ltda\.?|Limitada|E\.?I\.?R\.?L\.?)\s*$/i, '')
    .replace(/[\s,.]+$/, '')
    .trim()
    .slice(0, 40);

/**
 * EL ROBOT DE ÓRDENES DE COMPRA (doc 23).
 *
 * La rutina que lee los correos de la empresa, cuando encuentra una OC, la
 * manda acá con lo que leyó. El motor decide a qué cotización va
 * (`elegirCotizacion`); si hay una sola, la deja en Documentos → «Órdenes
 * de compra» igual que si la subiera una persona, y BelIA la lee por
 * detrás (doc 19 §9.26). Con duda no sube nada: devuelve las candidatas.
 */
@Injectable()
export class RobotOcService {
  constructor(
    private readonly repo: RobotOcRepository,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly ocs?: OrdenesDeCompraService,
  ) {
    this.logger.setContext(RobotOcService.name);
  }

  /** La llave del robot: sin `ROBOT_OC_KEY` y `ROBOT_OC_EMPRESA` la puerta
   *  está apagada; con una llave distinta, cerrada. Devuelve la empresa. */
  revisarLlave(dada: string | undefined): number {
    const llave = this.config.get<string>('ROBOT_OC_KEY')?.trim();
    const empresa = Number(this.config.get<string>('ROBOT_OC_EMPRESA'));
    if (!llave || !Number.isInteger(empresa) || empresa <= 0)
      throw new ServiceUnavailableException('El robot de OC está apagado');
    const h = (s: string) => createHash('sha256').update(s).digest();
    if (!dada || !timingSafeEqual(h(dada.trim()), h(llave)))
      throw new UnauthorizedException('Llave del robot inválida');
    return empresa;
  }

  async recibir(
    empresa: number,
    oc: OcDelCorreo,
    pdf?: { buffer: Buffer; size: number; mimetype: string },
  ) {
    if (!limpiarNumero(oc.numero))
      throw new BadRequestException('Falta el N° de la OC');
    if (!(oc.total > 0))
      throw new BadRequestException('Falta el total de la OC');

    const eleccion: Eleccion = elegirCotizacion(
      oc,
      await this.repo.candidatas(empresa),
    );
    const base = { numero: oc.numero, total: oc.total };

    if (eleccion.resultado === 'sin_cliente')
      return {
        ...base,
        resultado: eleccion.resultado,
        motivo: eleccion.motivo,
      };
    if (eleccion.resultado === 'duda')
      return {
        ...base,
        resultado: eleccion.resultado,
        motivo: eleccion.motivo,
        candidatas: eleccion.candidatas.map(resumen),
      };
    if (eleccion.resultado === 'ya_estaba')
      return {
        ...base,
        resultado: eleccion.resultado,
        cotizacion: resumen(eleccion.cotizacion),
      };

    const cot = eleccion.cotizacion;
    const nombre = `OC ${oc.numero.trim()} · ${clienteCorto(cot.cliente)}`;
    if (oc.probar)
      return {
        ...base,
        resultado: 'iria',
        por: eleccion.por,
        nombre,
        cotizacion: resumen(cot),
      };

    if (!pdf) throw new BadRequestException('Falta el PDF de la OC');
    if (pdf.size > MAX_BYTES)
      throw new BadRequestException('El PDF pasa de 5 MB');
    if (
      pdf.mimetype !== 'application/pdf' ||
      pdf.buffer.subarray(0, 5).toString('latin1') !== '%PDF-'
    )
      throw new BadRequestException('El archivo no es un PDF');

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ruta = `c${empresa}/event-documents/${cot.id}/ordenes_compra/${ts}_OC_${sanitize(
      oc.numero.trim(),
    )}.pdf`;
    await this.repo.subirPdf(ruta, pdf.buffer);
    const documentoId = await this.repo.agregarDocumento(cot.id, nombre, ruta);
    this.logger.info(
      `robot OC: ${oc.numero} → cotización ${cot.numero} (${eleccion.por}), documento ${documentoId}`,
    );
    // Igual que al subirla una persona: BelIA la lee por detrás y nunca
    // tumba la subida (doc 19 §9.26).
    if (this.ocs) {
      const ocs = this.ocs;
      void ocs.leerAlSubir(cot.id, empresa, null).catch(() => undefined);
    }
    return {
      ...base,
      resultado: 'subida',
      por: eleccion.por,
      nombre,
      documento_id: documentoId,
      cotizacion: resumen(cot),
    };
  }
}
