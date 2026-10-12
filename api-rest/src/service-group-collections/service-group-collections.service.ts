import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
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
      cambios.name = this.nombreValido(dto.name, 'paquete');
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
      this.fallar(
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
  // Felipe: "un cliente me pregunta por un paseo y debo tener dos o tres
  // alternativas juntas" y "mejor crear y editar listas, es más fácil que
  // una sección que se arme por el nombre del paquete". Cada paquete va
  // en un grupo o en ninguno; el orden de los grupos lo decide la empresa.

  async listarGrupos(companyId: Company['id']): Promise<GrupoListado[]> {
    const { data, error } = await this.repository.gruposDeLaEmpresa(companyId);
    if (error) this.fallar(error, 'No se pudieron leer los grupos');
    return (data ?? []) as GrupoListado[];
  }

  /** Un grupo nuevo va al final del orden. */
  async crearGrupo(nombre: string, companyId: Company['id']) {
    const name = this.nombreValido(nombre, 'grupo');
    const actuales = await this.listarGrupos(companyId);
    const siguiente =
      actuales.reduce((max, g) => Math.max(max, g.sort_order ?? 0), 0) + 1;
    const { data, error } = await this.repository.crearGrupo(
      companyId,
      name,
      siguiente,
    );
    if (error) {
      this.fallar(
        error,
        'No se pudo crear el grupo',
        'Ya existe un grupo con ese nombre. Elige otro.',
      );
    }
    return data;
  }

  async renombrarGrupo(
    id: PackageGroup['id'],
    nombre: string,
    companyId: Company['id'],
  ) {
    const name = this.nombreValido(nombre, 'grupo');
    const { data, error } = await this.repository.renombrarGrupo(
      id,
      companyId,
      name,
    );
    if (error) {
      this.fallar(
        error,
        'No se pudo renombrar el grupo',
        'Ya existe un grupo con ese nombre. Elige otro.',
      );
    }
    if (!data || data.length === 0) {
      throw new HttpException('Grupo no encontrado', HttpStatus.NOT_FOUND);
    }
    return data[0];
  }

  /** Guarda el orden que llega, del 1 en adelante. Los id que no son de
   *  la empresa se descartan sin aviso (igual que los tipos de cliente). */
  async ordenarGrupos(ids: number[], companyId: Company['id']) {
    const propios = new Set(
      (await this.listarGrupos(companyId)).map((g) => g.id),
    );
    const orden = ids.filter((id) => propios.has(id));
    for (const [i, id] of orden.entries()) {
      const { error } = await this.repository.ordenarGrupo(
        id,
        companyId,
        i + 1,
      );
      if (error) this.fallar(error, 'No se pudo ordenar los grupos');
    }
    return this.listarGrupos(companyId);
  }

  /** Borrar un grupo NO borra sus paquetes: quedan sin grupo, en "Otros"
   *  (ON DELETE SET NULL de la migración 120). */
  async borrarGrupo(id: PackageGroup['id'], companyId: Company['id']) {
    const { data, error } = await this.repository.borrarGrupo(id, companyId);
    if (error) this.fallar(error, 'No se pudo borrar el grupo');
    if (!data || data.length === 0) {
      throw new HttpException('Grupo no encontrado', HttpStatus.NOT_FOUND);
    }
    return { removed: true };
  }

  private nombreValido(nombre: string, que: 'grupo' | 'paquete') {
    const name = (nombre ?? '').trim();
    if (!name) {
      throw new HttpException(
        `El nombre del ${que} no puede quedar vacío`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return name;
  }

  /** Error de la base → aviso en castellano. 23505 = nombre repetido. */
  private fallar(
    error: { code?: string; message?: string },
    mensaje: string,
    repetido?: string,
  ): never {
    if (repetido && error?.code === '23505') {
      throw new HttpException(repetido, HttpStatus.CONFLICT);
    }
    this.logger.error(error);
    throw new HttpException(mensaje, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

type GrupoListado = Pick<PackageGroup, 'id' | 'name' | 'sort_order'>;
