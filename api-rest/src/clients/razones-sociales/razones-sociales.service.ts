import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { datosDeFacturacionLimpios } from '../../facturacion/datos-del-receptor';
import { CrearRazonSocialDto, EditarRazonSocialDto } from './razon-social.dto';
import {
  RazonesSocialesRepository,
  type RazonSocial,
} from './razones-sociales.repository';

/**
 * LAS RAZONES SOCIALES DE UN CLIENTE: a quién se le factura (doc 19 §9.12).
 *
 * Felipe, 04-11: *"es posible como en CCU que algunas facturas sean a un rut
 * y otras a otro"*. Santo Tomás, por ejemplo, factura un mismo evento al CFT
 * y al Instituto Profesional, cada uno con su RUT. Por eso un cliente tiene
 * una LISTA de razones sociales, cada una con sus datos y las referencias
 * que exige. La factura de una OC va al RUT de esa OC (paso 2).
 *
 * Antes de guardar, los datos se limpian con `datosDeFacturacionLimpios`:
 * el RUT sin puntos, lo vacío en null, los correos en minúscula y las
 * referencias en el orden del SII.
 */
@Injectable()
export class RazonesSocialesService {
  constructor(private readonly repo: RazonesSocialesRepository) {}

  async deCliente(clientId: string, companyId: number) {
    await this.asegurarCliente(clientId, companyId);
    return this.repo.deCliente(clientId, companyId);
  }

  /** `origen` 'orden_de_compra': la guardó la primera factura a ese RUT,
   *  con lo que decía la OC y la persona confirmó (paso 2c). */
  async crear(
    clientId: string,
    companyId: number,
    dto: CrearRazonSocialDto,
    usuarioId: string | null,
    origen: RazonSocial['origen'] = 'manual',
  ) {
    await this.asegurarCliente(clientId, companyId);
    const limpios = datosDeFacturacionLimpios(dto);
    return this.conRutUnico(() =>
      this.repo.crear({
        ...limpios,
        rut: limpios.rut ?? '',
        razon_social: limpios.razon_social ?? '',
        company_id: companyId,
        client_id: clientId,
        origen,
        creado_por: usuarioId,
      }),
    );
  }

  async editar(
    clientId: string,
    companyId: number,
    id: number,
    dto: EditarRazonSocialDto,
  ) {
    const editada = await this.conRutUnico(() =>
      this.repo.editar(id, clientId, companyId, datosDeFacturacionLimpios(dto)),
    );
    if (!editada) throw new NotFoundException('Esa razón social no existe');
    return editada;
  }

  async borrar(clientId: string, companyId: number, id: number) {
    const borradas = await this.repo.borrar(id, clientId, companyId);
    if (!borradas) throw new NotFoundException('Esa razón social no existe');
    return { borrada: id };
  }

  /** El cliente tiene que ser de la empresa de la sesión (mapa 22). */
  private async asegurarCliente(clientId: string, companyId: number) {
    if (!(await this.repo.clienteDeLaEmpresa(clientId, companyId)))
      throw new NotFoundException('Ese cliente no existe');
  }

  /** Un RUT va una sola vez en cada cliente (índice único de la 184). */
  private async conRutUnico<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (error) {
      if ((error as { code?: string })?.code === '23505')
        throw new ConflictException(
          'Ese RUT ya está en las razones sociales de este cliente',
        );
      throw error;
    }
  }
}
