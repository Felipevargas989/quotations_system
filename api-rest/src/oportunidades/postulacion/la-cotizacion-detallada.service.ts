import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import type { User } from 'src/users/entities/user.entity';
import {
  type Adjunto,
  AdjuntosRepository,
} from '../adjuntos/adjuntos.repository';
import { sello, TIPOS_POR_EXTENSION } from '../adjuntos/adjuntos.service';
import { AnalisisRepository } from '../analisis/analisis.repository';
import { fechaLarga, pesos } from '../generacion/instrucciones';
import { bajarLogo, urlDelLogo } from '../generacion/logo';
import { OferenteRepository } from '../oferente/oferente.repository';
import {
  armarLaCotizacionDetallada,
  diasDeLaCotizacion,
  medidasDeLaImagen,
  nombreDeLaCotizacionDetallada,
  plazoDeLaCotizacion,
} from './la-cotizacion-detallada';
import { PostulacionRepository } from './postulacion.repository';

// LA COTIZACIÓN DETALLADA EN «MI POSTULACIÓN» (decisión 119 del doc 17,
// 07-11, parte 2). La arma «Armar postulación» cuando las bases piden una
// cotización y hay una vinculada: el Word sale del motor, sin IA, con las
// cifras de la cotización, y queda sin firma como lo demás. Se firma con
// «Firmar».

const TIPO_WORD = TIPOS_POR_EXTENSION.docx;

@Injectable()
export class LaCotizacionDetalladaService {
  constructor(
    private readonly repo: PostulacionRepository,
    private readonly oferente: OferenteRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly analisis: AnalisisRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LaCotizacionDetalladaService.name);
  }

  /** La arma y la guarda; lanza con un mensaje en palabras si no se puede
   *  (lo anota «Armar postulación»). `reemplaza`: los borradores de antes,
   *  que se borran recién cuando la nueva quedó guardada. */
  async armar(
    user: User,
    oportunidadId: number,
    ofertaId: number,
    total: number,
    opciones: { conPropuesta: boolean; reemplaza: number[] },
  ): Promise<Adjunto> {
    const companyId = user.company_id;
    const o = await this.repo.oportunidad(companyId, oportunidadId);
    if (!o) throw new NotFoundException('No existe esa oportunidad.');
    if (!o.quotation_id) {
      throw new BadRequestException(
        'Las bases piden una cotización detallada: vincula tu cotización o créala con «Crear la cotización», y vuelve a armar.',
      );
    }
    const [q, oferente, empresa, analisis, perfil] = await Promise.all([
      this.repo.cotizacion(companyId, { id: o.quotation_id }),
      this.oferente.oferente(companyId),
      this.oferente.empresa(companyId),
      this.analisis.ultimo(companyId, oportunidadId),
      this.adjuntos.perfilDe(companyId, user.id),
    ]);
    if (!q) {
      throw new BadRequestException(
        'No encontramos la cotización vinculada: vincúlala de nuevo.',
      );
    }
    const dias = diasDeLaCotizacion(q);
    const subtotal = dias.reduce((s, d) => s + d.subtotal, 0);
    if (subtotal <= 0) {
      throw new BadRequestException(
        `La cotización N° ${q.quotation_number} no tiene servicios con precio.`,
      );
    }
    // Precios nunca a dedo: lo que baja va como descuento, y no se sube.
    if (total > subtotal) {
      throw new BadRequestException(
        `El precio que postulas (${pesos(total)}) es mayor que la cotización N° ${q.quotation_number} a precios del catálogo (${pesos(subtotal)}): agrega lo que falta a la cotización o baja el precio.`,
      );
    }
    if (q.subtotal_amount && q.subtotal_amount !== subtotal) {
      this.logger.warn(
        `cotización ${q.quotation_number}: sus líneas suman ${subtotal} y su subtotal dice ${q.subtotal_amount}`,
      );
    }

    const razonSocial = oferente?.razon_social?.trim() || empresa?.name || '';
    const direccion = [oferente?.direccion, oferente?.comuna, oferente?.region]
      .map((x) => x?.trim())
      .filter(Boolean)
      .join(', ');
    const representante = [
      oferente?.representante_nombre?.trim(),
      oferente?.representante_cargo?.trim(),
    ]
      .filter(Boolean)
      .join(', ');
    const b = empresa?.bank_details;
    const banco: Array<[string, string]> = b
      ? (
          [
            ['Titular', b.titular],
            ['RUT', b.rut],
            ['Banco', b.banco],
            ['Tipo de cuenta', b.tipo_cuenta],
            ['Número de cuenta', b.numero],
            ['Correo para avisar el pago', b.correo_pagos],
          ] as Array<[string, string | null | undefined]>
        ).flatMap(([k, v]) =>
          v?.trim() ? [[k, v.trim()] as [string, string]] : [],
        )
      : [];
    const enElComplejo =
      analisis?.estado === 'listo' &&
      analisis.resultado?.se_puede_en_el_complejo === 'si';
    const logo = await bajarLogo(
      urlDelLogo(empresa?.logo_url ?? null) ?? undefined,
      (m) => this.logger.warn(`cotización detallada: ${m}`),
    );
    const medidas = logo ? medidasDeLaImagen(logo) : null;

    const docx = armarLaCotizacionDetallada({
      proceso: `${o.proceso.tipo === 'compra_agil' ? 'Compra Ágil' : 'Licitación'} ${o.codigo}`,
      nombre: o.proceso.nombre,
      comprador: o.proceso.organismo,
      numero: q.quotation_number,
      fecha: fechaLarga(),
      proveedor: (
        [
          ['Razón social', razonSocial],
          ['RUT', oferente?.rut],
          ['Giro', oferente?.giro],
          ['Dirección', direccion],
          ['Teléfono', oferente?.telefono],
          ['Correo', oferente?.correo],
          ['Representante legal', representante],
        ] as Array<[string, string | null | undefined]>
      ).flatMap(([k, v]) =>
        v?.trim() ? [[k, v.trim()] as [string, string]] : [],
      ),
      dias,
      total,
      conPropuesta: opciones.conPropuesta,
      plazo: plazoDeLaCotizacion(q),
      lugar: enElComplejo && direccion ? direccion : null,
      banco,
      firma: {
        nombre: oferente?.representante_nombre?.trim() || '',
        razonSocial,
      },
      logo: logo && medidas ? { datos: logo, tipo: medidas.tipo } : null,
    });

    const nombre = nombreDeLaCotizacionDetallada(o.codigo);
    const ruta = `c${companyId}/oportunidades/${oportunidadId}/postulacion/${sello()}_${sanitize(nombre)}`;
    await this.adjuntos.subirArchivo(ruta, docx, TIPO_WORD);
    let fila: Adjunto;
    try {
      fila = await this.adjuntos.guardar({
        company_id: companyId,
        oportunidad_id: oportunidadId,
        nombre,
        ruta,
        tipo: TIPO_WORD,
        bytes: docx.length,
        seccion: 'postulacion',
        subido_por: perfil,
        origen: 'generado',
        viene_de: null,
        // La corrida de la oferta que la pidió: con otra oferta, queda vieja.
        generacion_id: ofertaId,
      });
    } catch (error) {
      await this.adjuntos.borrarArchivo(ruta);
      throw error;
    }
    if (opciones.reemplaza.length > 0) {
      await this.adjuntos
        .borrarBorradores(companyId, oportunidadId, opciones.reemplaza)
        .catch((error) =>
          this.logger.warn(
            `borradores de la cotización detallada ${oportunidadId}: ${mensajeDe(error)}`,
          ),
        );
    }
    return fila;
  }
}
