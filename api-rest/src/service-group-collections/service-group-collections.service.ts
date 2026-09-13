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
      const { items, services, fixed_services, ...collection } = createDto;

      // Aislamiento entre empresas (11-09-2026): menús, servicios sueltos
      // y fijos del paquete tienen que ser propios. Sus id son correlativos.
      await this.exigirDeLaEmpresa(
        'service_groups',
        items.map((item) => item.service_group_id),
        companyId,
      );
      await this.exigirDeLaEmpresa(
        'variable_services',
        (services ?? []).map((s) => s.variable_service_id),
        companyId,
      );
      await this.exigirDeLaEmpresa(
        'fixed_services',
        (fixed_services ?? []).map((f) => f.fixed_service_id),
        companyId,
      );

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

      // Fijos del paquete (28-08): el salón y la decoración son parte
      // del paquete de verdad.
      if (fixed_services?.length) {
        // Tipado de verdad (no repetir el any inseguro del vecino).
        const idCreado = (createdCollection as ServiceGroupCollection).id;
        const { error: fixedError } =
          await this.repository.createCollectionFixedServices(
            fixed_services.map((f) => ({
              collection_id: idCreado,
              fixed_service_id: f.fixed_service_id,
              quantity: f.quantity,
            })),
          );
        if (fixedError) throw fixedError;
      }

      return createdCollection;
    } catch (error) {
      // Un 404 nuestro se respeta tal cual; lo de abajo es para los
      // errores crudos de la base.
      if (error instanceof HttpException) throw error;
      this.logger.error(error);
      throw new HttpException(
        (error as Error).message || 'Error al crear el paquete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Candado de catálogo (11-09-2026): todas las piezas pedidas tienen que
   *  existir en esta empresa. */
  private async exigirDeLaEmpresa(
    tabla: 'service_groups' | 'variable_services' | 'fixed_services',
    ids: number[],
    companyId: Company['id'],
  ) {
    const pedidos = [...new Set(ids)];
    if (pedidos.length === 0) return;
    const { data, error } = await this.repository.idsDeLaEmpresa(
      tabla,
      pedidos,
      companyId,
    );
    if (error) throw error;
    if ((data ?? []).length !== pedidos.length) {
      throw new HttpException(
        'Hay piezas del paquete que no son de tu empresa',
        HttpStatus.NOT_FOUND,
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

  /** Borrar (11-09-2026): el paquete tiene que ser de la empresa. Sin fila
   *  borrada, era ajeno o no existía: 404. */
  async remove(id: ServiceGroupCollection['id'], companyId: Company['id']) {
    this.logger.info(`remove service group collection ${id} of ${companyId}`);
    const { data, error } = await this.repository.removeCollection(
      id,
      companyId,
    );
    if (error) {
      this.logger.error(error);
      throw new HttpException(
        'No se pudo eliminar el paquete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (!data || data.length === 0) {
      throw new HttpException('Paquete no encontrado', HttpStatus.NOT_FOUND);
    }
    return { removed: true };
  }
}
