import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import {
  fallar,
  nombreValido,
  ReglasDeGrupos,
} from 'src/grupos-de-lista/reglas-de-grupos';
import { CreateServiceGroupCollectionDto } from './dto/create-service-group-collection.dto';
import { ActualizarPaqueteDto } from './dto/grupos-de-paquetes.dto';
import {
  PackageGroup,
  ServiceGroupCollection,
} from './entities/service-group-collection.entity';
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
      // Su grupo (12-10-2026), si viene, también tiene que ser propio.
      await this.exigirDeLaEmpresa(
        'package_groups',
        collection.package_group_id != null
          ? [collection.package_group_id]
          : [],
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
    tabla:
      | 'service_groups'
      | 'variable_services'
      | 'fixed_services'
      | 'package_groups',
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

  /** Renombrar un paquete y/o cambiarlo de grupo (12-10-2026). Grupo
   *  null = sin grupo ("Otros"). El grupo tiene que ser de la empresa, y
   *  el paquete también: sin fila actualizada, 404. */
  async actualizar(
    id: ServiceGroupCollection['id'],
    dto: ActualizarPaqueteDto,
    companyId: Company['id'],
  ) {
    this.logger.info(`actualizar paquete ${id} of ${companyId}`);
    const cambios: Partial<
      Pick<ServiceGroupCollection, 'name' | 'package_group_id'>
    > = {};
    if (dto.name !== undefined) {
      cambios.name = nombreValido(dto.name, 'paquete');
    }
    if (dto.package_group_id !== undefined) {
      if (dto.package_group_id !== null) {
        await this.exigirDeLaEmpresa(
          'package_groups',
          [dto.package_group_id],
          companyId,
        );
      }
      cambios.package_group_id = dto.package_group_id;
    }
    if (Object.keys(cambios).length === 0) {
      throw new HttpException(
        'No hay nada que cambiar',
        HttpStatus.BAD_REQUEST,
      );
    }
    const { data, error } = await this.repository.actualizarPaquete(
      id,
      companyId,
      cambios,
    );
    if (error) {
      fallar(
        this.logger,
        error,
        'No se pudo guardar el paquete',
        'Ya existe un paquete con ese nombre. Elige otro.',
      );
    }
    if (!data || data.length === 0) {
      throw new HttpException('Paquete no encontrado', HttpStatus.NOT_FOUND);
    }
    return data[0];
  }

  // ---------- GRUPOS DE PAQUETES (12-10-2026, migración 120) ----------
  // Las reglas son las MISMAS que las de los grupos de menús guardados y
  // viven en una sola pieza (src/grupos-de-lista). Acá solo se le presta
  // la tabla de grupos de paquetes, filtrada por empresa.

  private grupos(companyId: Company['id']) {
    return new ReglasDeGrupos(
      {
        listar: () => this.repository.gruposDeLaEmpresa(companyId),
        crear: (name, orden) =>
          this.repository.crearGrupo(companyId, name, orden),
        renombrar: (id, name) =>
          this.repository.renombrarGrupo(id, companyId, name),
        ordenar: (id, orden) =>
          this.repository.ordenarGrupo(id, companyId, orden),
        borrar: (id) => this.repository.borrarGrupo(id, companyId),
      },
      this.logger,
    );
  }

  listarGrupos(companyId: Company['id']) {
    return this.grupos(companyId).listar();
  }

  crearGrupo(nombre: string, companyId: Company['id']) {
    return this.grupos(companyId).crear(nombre);
  }

  renombrarGrupo(
    id: PackageGroup['id'],
    nombre: string,
    companyId: Company['id'],
  ) {
    return this.grupos(companyId).renombrar(id, nombre);
  }

  ordenarGrupos(ids: number[], companyId: Company['id']) {
    return this.grupos(companyId).ordenar(ids);
  }

  borrarGrupo(id: PackageGroup['id'], companyId: Company['id']) {
    return this.grupos(companyId).borrar(id);
  }
}
