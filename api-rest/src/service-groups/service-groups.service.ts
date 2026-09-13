import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateServiceGroupDto } from './dto/create-service-group.dto';
import { ServiceGroup } from './entities/service-group.entity';
import { ServiceGroupsRepository } from './service-groups.repository';

@Injectable()
export class ServiceGroupsService {
  constructor(
    private readonly serviceGroupsRepository: ServiceGroupsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupsService.name);
  }

  async create(
    createServiceGroupDto: CreateServiceGroupDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `create service group with dto ${JSON.stringify(createServiceGroupDto)}`,
    );
    try {
      const { items, ...group } = createServiceGroupDto;

      // Aislamiento entre empresas (11-09-2026): los servicios del menú
      // tienen que ser del catálogo propio. Sus id son correlativos.
      await this.exigirServiciosDeLaEmpresa(
        items.map((item) => item.variable_service_id),
        companyId,
      );

      // create the group first to obtain its generated id
      const { data: createdGroup, error: groupError } =
        await this.serviceGroupsRepository.createGroup({
          ...group,
          company_id: companyId,
        });

      if (groupError) throw groupError;

      // create the N items referencing the new group id
      const groupItems = items.map((item) => ({
        group_id: createdGroup.id,
        variable_service_id: item.variable_service_id,
        quantity: item.quantity,
      }));

      const { error: itemsError } =
        await this.serviceGroupsRepository.createGroupItems(groupItems);

      if (itemsError) throw itemsError;

      return createdGroup;
    } catch (error) {
      // Un 404 o un 409 nuestro se respeta tal cual; lo de abajo es para
      // los errores crudos de la base.
      if (error instanceof HttpException) throw error;
      this.logger.error(error);
      // Nombre repetido (23505): NO es una falla del servidor sino un
      // choque esperable — el frontend necesita poder decírselo al
      // usuario en vez de un "no se pudo" mudo (pillado 05-08 con
      // "Desayuno de campo", que ya existía en una categoría vieja).
      if ((error as { code?: string })?.code === '23505') {
        throw new HttpException(
          'Ya existe un menú guardado con ese nombre. Elige otro.',
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        (error as Error).message || 'Error al crear el grupo de servicios',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Candado de catálogo (11-09-2026): todos los servicios pedidos tienen
   *  que existir en el catálogo de esta empresa. */
  private async exigirServiciosDeLaEmpresa(
    ids: number[],
    companyId: Company['id'],
  ) {
    const pedidos = [...new Set(ids)];
    if (pedidos.length === 0) return;
    const { data, error } =
      await this.serviceGroupsRepository.variableServicesDeLaEmpresa(
        pedidos,
        companyId,
      );
    if (error) throw error;
    if ((data ?? []).length !== pedidos.length) {
      throw new HttpException(
        'Hay servicios que no son del catálogo de tu empresa',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll service groups with companyId ${companyId}`);
    try {
      const { data, error } =
        await this.serviceGroupsRepository.findAll(companyId);
      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  /** Renombrar (Felipe, 09-09): mismo choque de nombre repetido que
   *  al crear; sin fila = ajeno o inexistente, 404. */
  async rename(
    id: ServiceGroup['id'],
    companyId: Company['id'],
    name: ServiceGroup['name'],
  ) {
    this.logger.info(`rename service group ${id} of company ${companyId}`);
    const { data, error } = await this.serviceGroupsRepository.renameGroup(
      id,
      companyId,
      name.trim(),
    );
    if (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new HttpException(
          'Ya existe un menú guardado con ese nombre. Elige otro.',
          HttpStatus.CONFLICT,
        );
      }
      this.logger.error(error);
      throw new HttpException(
        'Menú guardado no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return data;
  }

  /** Borrar (11-09-2026): el menú tiene que ser de la empresa. Sin fila
   *  borrada, era ajeno o no existía: 404, igual que renombrar. */
  async remove(id: ServiceGroup['id'], companyId: Company['id']) {
    this.logger.info(`remove service group ${id} of company ${companyId}`);
    const { data, error } = await this.serviceGroupsRepository.removeGroup(
      id,
      companyId,
    );
    if (error) {
      this.logger.error(error);
      throw new HttpException(
        'No se pudo eliminar el menú guardado',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (!data || data.length === 0) {
      throw new HttpException(
        'Menú guardado no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return { removed: true };
  }
}
