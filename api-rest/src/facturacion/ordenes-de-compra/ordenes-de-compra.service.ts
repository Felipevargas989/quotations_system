import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { normalizarRut, revisarRut } from '../../people/utils/rut';
import { esFechaDelArchivo, textoLimpio } from '../archivo/texto';
import { LeerOrdenDeCompraService } from './leer-orden-de-compra.service';
import {
  CrearOrdenDeCompraDto,
  EditarOrdenDeCompraDto,
} from './orden-de-compra.dto';
import {
  DatosDeOrdenDeCompra,
  OrdenesDeCompraRepository,
  type OrdenDeCompra,
} from './ordenes-de-compra.repository';

/** Un PDF de órdenes de compra que BelIA no pudo dejar como OC. */
export interface OcSinLeer {
  documento_id: number;
  nombre: string;
  motivo: string;
}

/**
 * LAS ÓRDENES DE COMPRA DE UN EVENTO (doc 19 §9.2, paso 2a).
 *
 * Cada OC del evento con su N°, fecha, a nombre de quién viene, detalle y
 * montos. En el paso 2b las llena BelIA leyendo el PDF; en el 2c, la factura
 * de cada OC sale por su total (E1), a su RUT (§9.12) y con la referencia
 * 801.
 *
 * Antes de guardar: la cotización tiene que ser de la empresa de la sesión,
 * el PDF elegido tiene que ser de esa misma cotización, la fecha tiene que
 * existir, el RUT queda limpio y los textos sin espacios de sobra.
 */
@Injectable()
export class OrdenesDeCompraService {
  constructor(
    private readonly repo: OrdenesDeCompraRepository,
    private readonly lector: LeerOrdenDeCompraService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  /**
   * AL SUBIR UNA OC A DOCUMENTOS (§9.26; Felipe, 07-11: *"con las órdenes
   * de compra, cada vez que una se suba se debería leer y dejar todo listo
   * para facturar"*): BelIA la lee por detrás, sin hacer esperar a quien la
   * subió. Nunca falla hacia afuera: lo que no pudo leer se anota en el
   * registro y se vuelve a intentar al facturar.
   */
  async leerAlSubir(
    quotationId: string,
    companyId: number,
    usuarioId: string | null,
  ): Promise<void> {
    try {
      const { ordenes, sinLeer } = await this.deDocumentos(
        quotationId,
        companyId,
        usuarioId,
      );
      this.logger?.info(
        `OC del evento ${quotationId}: ${ordenes.length} leídas` +
          (sinLeer.length
            ? `; sin leer: ${sinLeer.map((s) => `${s.nombre} (${s.motivo})`).join(', ')}`
            : ''),
      );
    } catch (error) {
      this.logger?.warn(
        `no pude leer las OC del evento ${quotationId}: ${mensajeDe(error)}`,
      );
    }
  }

  async deCotizacion(quotationId: string, companyId: number) {
    await this.asegurarCotizacion(quotationId, companyId);
    return this.repo.deCotizacion(quotationId, companyId);
  }

  /**
   * Las OC del evento salen de Documentos (doc 19 §9.20; Felipe, 05-11:
   * *"si en documentos existe un documento cargado como orden de compra,
   * Bel ya debe leerlo automáticamente y traer la información"*). Cada PDF
   * de «Órdenes de compra» que todavía no es una OC lo lee BelIA y queda
   * guardado tal como lo leyó (`origen` `pdf`). La OC leída cuyo PDF se
   * quitó de Documentos se va con él, salvo que ya tenga documentos
   * tributarios (L6). Lo que BelIA no pudo leer se dice, y se vuelve a
   * intentar la próxima vez.
   */
  async deDocumentos(
    quotationId: string,
    companyId: number,
    usuarioId: string | null,
  ): Promise<{ ordenes: OrdenDeCompra[]; sinLeer: OcSinLeer[] }> {
    await this.asegurarCotizacion(quotationId, companyId);
    const [pdfs, antes] = await Promise.all([
      this.repo.ordenesEnDocumentos(quotationId),
      this.repo.deCotizacion(quotationId, companyId),
    ]);
    const sinSuPdf = antes.filter(
      (o) => o.origen === 'pdf' && o.documento_id == null,
    );
    for (const oc of sinSuPdf)
      await this.borrar(quotationId, companyId, oc.id).catch(
        (e: unknown) => e, // con documentos tributarios, se queda
      );

    const sinLeer: OcSinLeer[] = [];
    const nuevos = pdfs.filter(
      (d) => !antes.some((o) => o.documento_id === d.id),
    );
    await Promise.all(
      nuevos.map(async (d) => {
        const motivo = await this.leerYGuardar(
          quotationId,
          companyId,
          d.id,
          usuarioId,
        );
        if (motivo)
          sinLeer.push({ documento_id: d.id, nombre: d.file_name, motivo });
      }),
    );
    return {
      ordenes:
        nuevos.length || sinSuPdf.length
          ? await this.repo.deCotizacion(quotationId, companyId)
          : antes,
      sinLeer: sinLeer.sort((a, b) => a.documento_id - b.documento_id),
    };
  }

  /** Lee un PDF y lo guarda como OC; si no se puede, el porqué. */
  private async leerYGuardar(
    quotationId: string,
    companyId: number,
    documentoId: number,
    usuarioId: string | null,
  ): Promise<string | null> {
    let leida: Awaited<ReturnType<LeerOrdenDeCompraService['leer']>>;
    try {
      leida = await this.lector.leer(quotationId, companyId, documentoId);
    } catch (error) {
      return mensajeDe(error);
    }
    const p = leida.propuesta;
    const falta = [
      ...(p.fecha ? [] : ['la fecha']),
      ...(p.total ? [] : ['el total']),
    ];
    if (falta.length) return `no encontró ${falta.join(' ni ')}`;
    const comprador = {
      giro: p.giro,
      direccion: p.direccion,
      comuna: p.comuna,
      ciudad: p.ciudad,
    };
    try {
      await this.crear(
        quotationId,
        companyId,
        {
          numero: p.numero.slice(0, 18),
          fecha: p.fecha ?? '',
          // Un RUT mal leído no se guarda: la factura elige la razón social.
          rut: p.rut && revisarRut(p.rut) === null ? p.rut : null,
          razon_social: p.razon_social,
          comprador: Object.values(comprador).some(Boolean) ? comprador : null,
          descripcion: p.descripcion,
          neto: p.neto,
          iva: p.iva,
          total: p.total ?? 0,
          documento_id: documentoId,
          origen: 'pdf',
        },
        usuarioId,
      );
      return null;
    } catch (error) {
      // Otra pestaña la guardó recién: está bien.
      const ya = (await this.repo.deCotizacion(quotationId, companyId)).some(
        (o) => o.documento_id === documentoId,
      );
      if (ya) return null;
      return error instanceof ConflictException
        ? `es la OC N° ${p.numero}, que ya está en este evento`
        : mensajeDe(error);
    }
  }

  async crear(
    quotationId: string,
    companyId: number,
    dto: CrearOrdenDeCompraDto,
    usuarioId: string | null,
  ) {
    await this.asegurarCotizacion(quotationId, companyId);
    const datos = await this.limpios(dto, quotationId);
    return this.conErroresDeLaBase(() =>
      this.repo.crear({
        ...datos,
        numero: datos.numero ?? '',
        fecha: datos.fecha ?? '',
        total: datos.total ?? 0,
        company_id: companyId,
        quotation_id: quotationId,
        origen: dto.origen ?? 'manual',
        creado_por: usuarioId,
      }),
    );
  }

  async editar(
    quotationId: string,
    companyId: number,
    id: number,
    dto: EditarOrdenDeCompraDto,
  ) {
    await this.asegurarCotizacion(quotationId, companyId);
    const datos = await this.limpios(dto, quotationId);
    const editada = await this.conErroresDeLaBase(() =>
      this.repo.editar(id, quotationId, companyId, datos),
    );
    if (!editada) throw new NotFoundException('Esa orden de compra no existe');
    return editada;
  }

  async borrar(quotationId: string, companyId: number, id: number) {
    const borradas = await this.conErroresDeLaBase(() =>
      this.repo.borrar(id, quotationId, companyId),
    );
    if (!borradas) throw new NotFoundException('Esa orden de compra no existe');
    return { borrada: id };
  }

  /** Los datos que venían, limpios y revisados. */
  private async limpios(
    dto: EditarOrdenDeCompraDto,
    quotationId: string,
  ): Promise<DatosDeOrdenDeCompra> {
    const datos: DatosDeOrdenDeCompra = {};
    if (dto.numero !== undefined) datos.numero = textoLimpio(dto.numero);
    if (dto.fecha !== undefined) {
      if (!esFechaDelArchivo(dto.fecha))
        throw new BadRequestException('Esa fecha no existe');
      datos.fecha = dto.fecha;
    }
    if (dto.rut !== undefined)
      datos.rut = dto.rut ? normalizarRut(dto.rut) : null;
    if (dto.razon_social !== undefined)
      datos.razon_social = textoLimpio(dto.razon_social) || null;
    if (dto.comprador !== undefined) {
      const c = dto.comprador ?? {};
      const comprador = {
        giro: textoLimpio(c.giro) || null,
        direccion: textoLimpio(c.direccion) || null,
        comuna: textoLimpio(c.comuna) || null,
        ciudad: textoLimpio(c.ciudad) || null,
      };
      datos.comprador = Object.values(comprador).some(Boolean)
        ? comprador
        : null;
    }
    if (dto.descripcion !== undefined)
      datos.descripcion = (dto.descripcion ?? '').trim() || null;
    for (const campo of ['neto', 'iva'] as const) {
      if (dto[campo] !== undefined) datos[campo] = dto[campo] ?? null;
    }
    if (dto.total !== undefined) datos.total = dto.total;
    if (dto.documento_id !== undefined) {
      if (
        dto.documento_id !== null &&
        !(await this.repo.documentoDeLaCotizacion(
          dto.documento_id,
          quotationId,
        ))
      )
        throw new BadRequestException(
          'Ese PDF no está en los documentos de este evento',
        );
      datos.documento_id = dto.documento_id;
    }
    return datos;
  }

  /** La cotización tiene que ser de la empresa de la sesión (mapa 22). */
  private async asegurarCotizacion(quotationId: string, companyId: number) {
    if (!(await this.repo.cotizacionDeLaEmpresa(quotationId, companyId)))
      throw new NotFoundException('Ese evento no existe');
  }

  /** Lo que la base frena, dicho con palabras. */
  private async conErroresDeLaBase<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (error) {
      const codigo = (error as { code?: string })?.code;
      if (codigo === '23505')
        throw new ConflictException('Esa OC ya está cargada en este evento');
      // La llave de documentos_tributarios (sin cascada, L6).
      if (codigo === '23503')
        throw new ConflictException(
          'Esa OC ya tiene documentos tributarios: no se puede quitar',
        );
      throw error;
    }
  }
}
