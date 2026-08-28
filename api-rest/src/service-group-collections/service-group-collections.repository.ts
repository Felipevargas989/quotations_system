import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  ServiceGroupCollection,
  ServiceGroupCollectionFixedService,
  ServiceGroupCollectionItem,
  ServiceGroupCollectionService,
} from './entities/service-group-collection.entity';

@Injectable()
export class ServiceGroupCollectionsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupCollectionsRepository.name);
  }

  createCollection(
    collection: Omit<ServiceGroupCollection, 'id' | 'created_at'>,
  ) {
    this.logger.info(
      `createCollection with collection ${JSON.stringify(collection)}`,
    );
    return this.supabase.client
      .from('service_group_collections')
      .insert(collection)
      .select()
      .single();
  }

  createCollectionItems(
    items: Omit<ServiceGroupCollectionItem, 'id' | 'created_at'>[],
  ) {
    this.logger.info(`createCollectionItems with total items ${items.length}`);
    return this.supabase.client
      .from('service_group_collection_items')
      .insert(items);
  }

  // Servicios sueltos del paquete (13-08): alojamiento, fiesta, lo que
  // no sea un menú.
  createCollectionServices(
    services: Omit<ServiceGroupCollectionService, 'id' | 'created_at'>[],
  ) {
    this.logger.info(`createCollectionServices with total ${services.length}`);
    return this.supabase.client
      .from('service_group_collection_services')
      .insert(services);
  }

  // Fijos del paquete (28-08): salón, decoración, audiovisual.
  createCollectionFixedServices(
    services: Omit<ServiceGroupCollectionFixedService, 'id' | 'created_at'>[],
  ) {
    this.logger.info(
      `createCollectionFixedServices with total ${services.length}`,
    );
    return this.supabase.client
      .from('service_group_collection_fixed_services')
      .insert(services);
  }

  findAll(companyId: Company['id']) {
    this.logger.info(
      `findAll service group collections with companyId ${companyId}`,
    );
    return this.supabase.client
      .from('service_group_collections')
      .select(
        '*, groups:service_group_collection_items(group:service_groups(*, items:service_group_items(quantity, service:variable_services(*))))' +
          ', services:service_group_collection_services(quantity, service:variable_services(*))' +
          ', fixed_services:service_group_collection_fixed_services(quantity, service:fixed_services(*))',
      )
      .eq('company_id', companyId);
  }

  removeCollection(id: ServiceGroupCollection['id']) {
    this.logger.info(`removeCollection with id ${id}`);
    return this.supabase.client
      .from('service_group_collections')
      .delete()
      .eq('id', id);
  }
}
