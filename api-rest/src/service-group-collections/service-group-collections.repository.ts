import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  ServiceGroupCollection,
  ServiceGroupCollectionItem,
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

  findAll(companyId: Company['id']) {
    this.logger.info(
      `findAll service group collections with companyId ${companyId}`,
    );
    return this.supabase.client
      .from('service_group_collections')
      .select(
        '*, groups:service_group_collection_items(group:service_groups(*, items:service_group_items(quantity, service:variable_services(*))))',
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
