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

  async remove(id: ServiceGroup['id']) {
    this.logger.info(`remove service group with id ${id}`);
    return await this.serviceGroupsRepository.removeGroup(id);
  }
}
