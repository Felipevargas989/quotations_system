import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizarRut } from '../../people/utils/rut';
import { esFechaDelArchivo, textoLimpio } from '../archivo/texto';
import {
  CrearOrdenDeCompraDto,
  EditarOrdenDeCompraDto,
} from './orden-de-compra.dto';
import {
  DatosDeOrdenDeCompra,
  OrdenesDeCompraRepository,
} from './ordenes-de-compra.repository';

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
  constructor(private readonly repo: OrdenesDeCompraRepository) {}

  async deCotizacion(quotationId: string, companyId: number) {
    await this.asegurarCotizacion(quotationId, companyId);
    return this.repo.deCotizacion(quotationId, companyId);
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
