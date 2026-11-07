import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { BoletasService } from '../boletas/boletas.service';
import { Cadena } from '../notas/cadena';
import { ConexionConFacturacionCl } from './conexion';
import { DocumentosTributariosRepository } from './documentos-tributarios.repository';

/** Desde cuándo mira «Por facturar» (doc 19 §9.21): los eventos de los
 *  últimos 90 días y los que vienen. Lo de antes se facturó fuera de
 *  Eventia. */
const DIAS_POR_FACTURAR = 90;

/** «2026-11-06» menos n días, sin pasar por la hora local. */
const diasAntes = (fecha: string, n: number) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
};

const FACTURA = 33;
const BOLETA = 39;
// Se factura (y se marca) un evento aceptado o realizado (§9.2).
const SE_FACTURA = ['aceptada', 'realizada'];

/**
 * «POR FACTURAR» DE LA SECCIÓN FACTURACIÓN (doc 19 §9.21 y §9.24). Salió de
 * `FacturasService` el 07-11, cuando «Ya está facturado» lo hizo pasar de
 * las 800 líneas: el DTE del evento sigue allá, y acá queda la lista y lo
 * facturado fuera de Eventia.
 */
@Injectable()
export class PorFacturarService {
  constructor(
    private readonly repo: DocumentosTributariosRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly boletas: BoletasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PorFacturarService.name);
  }

  /**
   * «Por facturar» (doc 19 §9.21; Felipe, 06-11: *"los eventos que no se
   * hayan facturado (…) y los pudiera como facturar de acá, hacer una
   * facturación masiva"*): los eventos aceptados o realizados de los
   * últimos 90 días (y los que vienen) a los que les queda algo por
   * emitir. Lo emitido es lo de las facturas y boletas del evento con la
   * cadena (una factura anulada ya no cuenta), en el ambiente donde se
   * emite.
   *
   * Lo ya facturado fuera de Eventia (§9.24, Felipe 07-11: *"yo te puedo
   * dar el check de lo que ya está facturado"*): el evento marcado con «Ya
   * está facturado» va aparte, en `facturados_fuera`, y no entra a la
   * masiva; el que tiene en Documentos el PDF de una factura subido a mano
   * lleva `tiene_factura_en_documentos`, para revisarlo primero.
   */
  async porFacturar(companyId: number) {
    const conexion = this.conexion.de(companyId);
    const desde = diasAntes(hoyEnChile(), DIAS_POR_FACTURAR);
    const eventos = await this.repo.eventosDesde(companyId, desde);
    const ids = eventos.map((e) => e.id);
    const [docs, ocs, fuera, conFactura] = await Promise.all([
      this.repo.emitidoDeLosEventos(companyId, conexion.ambiente, ids),
      this.repo.ocsDeLosEventos(companyId, ids),
      this.repo.facturadosFuera(companyId, ids),
      this.repo.conFacturaEnDocumentos(companyId, ids),
    ]);
    const cadena = new Cadena(docs);
    const emitido = new Map<string, number>();
    for (const d of docs)
      if (d.tipo === FACTURA || d.tipo === BOLETA)
        emitido.set(
          d.quotation_id,
          (emitido.get(d.quotation_id) ?? 0) + cadena.facturado(d.id),
        );
    const conSaldo = eventos
      .map((e) => {
        const yaEmitido = emitido.get(e.id) ?? 0;
        return {
          ...e,
          emitido: yaEmitido,
          queda: Math.max(0, e.total - yaEmitido),
          ocs: ocs.get(e.id) ?? 0,
          tiene_factura_en_documentos: conFactura.has(e.id),
        };
      })
      // $1 de redondeo se tolera, como en el tope de la OC.
      .filter((e) => e.total > 0 && e.queda > 1);
    return {
      ambiente: conexion.ambiente,
      sin_conexion: conexion.sinConexion ?? null,
      desde,
      eventos: conSaldo.filter((e) => !fuera.has(e.id)),
      facturados_fuera: conSaldo.flatMap((e) => {
        const marca = fuera.get(e.id);
        return marca
          ? [{ ...e, marcado_por: marca.por, marcado_en: marca.en }]
          : [];
      }),
    };
  }

  /**
   * «Ya está facturado» (§9.24): el evento se facturó fuera de Eventia (a
   * mano en la web de facturacion.cl, o se boleteó en Facto). Sale de «Por
   * facturar» y de la masiva, y queda quién lo marcó y cuándo. No emite ni
   * anula nada.
   */
  async marcarFacturadoFuera(quotationId: string, user: User) {
    const companyId = user.company_id;
    const evento = await this.repo.eventoAFacturar(quotationId, companyId);
    if (!evento) throw new NotFoundException('Ese evento no existe');
    if (!SE_FACTURA.includes(evento.estado))
      throw new BadRequestException(
        'Se marca un evento aceptado o ya realizado',
      );
    await this.repo.marcarFacturadoFuera(companyId, quotationId, {
      id: user.id ?? null,
      nombre: await this.boletas.nombreDe(user),
    });
    this.logger.info(
      `#${evento.numero} marcado como facturado fuera de Eventia`,
    );
    return { ok: true };
  }

  /** «Devolver»: el evento vuelve a «Por facturar». */
  async desmarcarFacturadoFuera(quotationId: string, user: User) {
    const companyId = user.company_id;
    if (!(await this.repo.eventoAFacturar(quotationId, companyId)))
      throw new NotFoundException('Ese evento no existe');
    await this.repo.desmarcarFacturadoFuera(companyId, quotationId);
    return { ok: true };
  }
}
