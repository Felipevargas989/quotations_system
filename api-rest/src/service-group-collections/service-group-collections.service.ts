import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateServiceGroupCollectionDto } from './dto/create-service-group-collection.dto';
import { ServiceGroupCollection } from './entities/service-group-collection.entity';
import { ServiceGroupCollectionsRepository } from './service-group-collections.repository';

@Injectable()
export class ServiceGroupCollectionsService {
  constructor(
    private readonly repository: ServiceGroupCollectionsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupCollectionsService.name);
  }

  async create(
    createDto: CreateServiceGroupCollectionDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `create service group collection with dto ${JSON.stringify(createDto)}`,
    );
    try {
      const { items, services, ...collection } = createDto;

      // create the collection first to obtain its generated id
      const { data: createdCollection, error: collectionError } =
        await this.repository.createCollection({
          ...collection,
          company_id: companyId,
        });

      if (collectionError) throw collectionError;

      // link the N service groups to the new collection id
      const collectionItems = items.map((item) => ({
        collection_id: createdCollection.id,
        service_group_id: item.service_group_id,
      }));

      const { error: itemsError } =
        await this.repository.createCollectionItems(collectionItems);

      if (itemsError) throw itemsError;

      // Servicios sueltos (alojamiento, fiesta): opcionales.
      if (services?.length) {
        const { error: servicesError } =
          await this.repository.createCollectionServices(
            services.map((s) => ({
              collection_id: createdCollection.id,
              variable_service_id: s.variable_service_id,
              quantity: s.quantity,
            })),
          );
        if (servicesError) throw servicesError;
      }

      return createdCollection;
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        (error as Error).message || 'Error al crear el paquete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(
      `findAll service group collections with companyId ${companyId}`,
    );
    try {
      const { data, error } = await this.repository.findAll(companyId);
      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async remove(id: ServiceGroupCollection['id']) {
    this.logger.info(`remove service group collection with id ${id}`);
    return await this.repository.removeCollection(id);
  }
}
