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
import type { FilaDeLaMatriz } from './armar-la-oferta';
import { calzaCon, repartirElPrecio } from './el-reparto';
import { sinPrecioAparte } from './la-cotizacion-de-lo-postulado';
import {
  armarLaCotizacionDetallada,
  type DiaDeLaCotizacion,
  diasDeLaCotizacion,
  medidasDeLaImagen,
  nombreDeLaCotizacionDetallada,
  pidenElDetalle,
  plazoDeLaCotizacion,
} from './la-cotizacion-detallada';
import { nombreDelPapel } from './los-papeles';
import {
  type CotizacionDeLaPostulacion,
  PostulacionRepository,
} from './postulacion.repository';

// LA COTIZACIÓN DETALLADA EN «MI POSTULACIÓN» (decisión 119 del doc 17,
// 07-11, parte 2). La arma «Armar postulación» cuando las bases piden una
// cotización y hay una vinculada: el Word sale del motor, sin IA, con los
// servicios de la cotización y el precio que se postula repartido entre
// ellos, y queda sin firma como lo demás. Se firma con «Firmar».
//
// Desde la decisión 120 (08-11), sin cotización vinculada también: sale de
// lo postulado con los precios del catálogo, en memoria y sin número, sin
// crear nada en Eventia (la-cotizacion-de-lo-postulado.ts). Lo particular
// va en su línea y lo que se subcontrata, en «También incluye», sin precio
// aparte.

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
    opciones: {
      conPropuesta: boolean;
      reemplaza: number[];
      /** El reparto que calculó «Armar postulación» (el mismo que va a los
       *  formularios); sin él, se calcula aquí igual. */
      reparto?: DiaDeLaCotizacion[] | null;
      /** Como la llaman las bases (decisión 119, parte 3b): el archivo
       *  lleva ese nombre. Sin él, «Cotización detallada <código>». */
      nombre?: string;
      /** Sin cotización vinculada, la de lo postulado en memoria, con lo
       *  que la oferta compromete (decisión 120). */
      deLoPostulado?: {
        cotizacion: CotizacionDeLaPostulacion;
        matriz: FilaDeLaMatriz[];
      } | null;
    },
  ): Promise<Adjunto> {
    const companyId = user.company_id;
    const o = await this.repo.oportunidad(companyId, oportunidadId);
    if (!o) throw new NotFoundException('No existe esa oportunidad.');
    const [vinculada, oferente, empresa, analisis, perfil] = await Promise.all([
      o.quotation_id
        ? this.repo.cotizacion(companyId, { id: o.quotation_id })
        : Promise.resolve(null),
      this.oferente.oferente(companyId),
      this.oferente.empresa(companyId),
      this.analisis.ultimo(companyId, oportunidadId),
      this.adjuntos.perfilDe(companyId, user.id),
    ]);
    if (o.quotation_id && !vinculada) {
      throw new BadRequestException(
        'No encontramos la cotización vinculada: vincúlala de nuevo.',
      );
    }
    // Decisión 120: "cuando yo busco el mercado" no hay cotización y sale de
    // lo postulado; "cuando el mercado me busca", manda la vinculada.
    const postulado = vinculada ? null : (opciones.deLoPostulado ?? null);
    const q = vinculada ?? postulado?.cotizacion ?? null;
    if (!q) {
      throw new BadRequestException(
        'Las bases piden una cotización: arma la postulación, de lo postulado salen sus servicios.',
      );
    }
    const cual = vinculada
      ? `La cotización N° ${vinculada.quotation_number}`
      : 'Lo postulado';
    const dias = diasDeLaCotizacion(q);
    const subtotal = dias.reduce((s, d) => s + d.subtotal, 0);
    if (subtotal <= 0) {
      throw new BadRequestException(`${cual} no tiene servicios con precio.`);
    }
    // El precio que manda es el que se postula, no el de la cotización
    // (Felipe postula a propósito por otro monto y, si gana, ajusta la
    // cotización): "la cotización manda en los servicios". Con el detalle
    // de precios si las bases lo piden: cada precio repartido en la misma
    // proporción hasta el que se postula, suba o baje, sin línea de
    // descuento (el-reparto.ts). Si no lo piden, una sola línea por el
    // total, con lo que incluye y sin precio por ítem, como eligió Felipe
    // con la 3904-996-COT26.
    const resultado = analisis?.estado === 'listo' ? analisis.resultado : null;
    const detallada = pidenElDetalle(resultado);
    const repartidos = !detallada
      ? null
      : calzaCon(opciones.reparto, total)
        ? opciones.reparto
        : repartirElPrecio(dias, total);
    if (detallada && !repartidos) {
      throw new BadRequestException(
        `No pudimos repartir ${pesos(total)} entre los servicios de ${cual.replace(/^L/, 'l')}.`,
      );
    }
    if (q.subtotal_amount && q.subtotal_amount !== subtotal) {
      this.logger.warn(
        `cotización ${q.quotation_number}: sus líneas suman ${subtotal} y su subtotal dice ${q.subtotal_amount}`,
      );
    }
    // Lo que la oferta compromete sin precio aparte (decisión 120): lo
    // particular en su línea y lo demás en «También incluye».
    const { dias: delDocumento, tambien } = postulado
      ? sinPrecioAparte(repartidos ?? dias, postulado.matriz)
      : { dias: repartidos ?? dias, tambien: [] };

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
    const enElComplejo = resultado?.se_puede_en_el_complejo === 'si';
    // Los colores de la marca, como la cotización que Eventia manda.
    const hex = (c: string | null | undefined) =>
      /^#?[0-9a-f]{6}$/i.test(c?.trim() ?? '')
        ? (c as string).trim().replace('#', '').toUpperCase()
        : null;
    const primario = hex(empresa?.colors?.primary);
    const secundario = hex(empresa?.colors?.secondary);
    const logo = await bajarLogo(
      urlDelLogo(empresa?.logo_url ?? null) ?? undefined,
      (m) => this.logger.warn(`cotización detallada: ${m}`),
    );
    const medidas = logo ? medidasDeLaImagen(logo) : null;

    const docx = armarLaCotizacionDetallada({
      proceso: `${o.proceso.tipo === 'compra_agil' ? 'Compra Ágil' : 'Licitación'} ${o.codigo}`,
      nombre: o.proceso.nombre,
      comprador: o.proceso.organismo,
      numero: vinculada ? vinculada.quotation_number : null,
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
      dias: delDocumento,
      total,
      unaSolaLinea: !detallada,
      tambien,
      marca: primario ? { primario, secundario: secundario ?? 'F3F4F6' } : null,
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

    const nombre = opciones.nombre
      ? nombreDelPapel(opciones.nombre, o.codigo)
      : nombreDeLaCotizacionDetallada(o.codigo, detallada);
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
