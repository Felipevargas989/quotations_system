import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { FixedService, VariableService } from './entities/service.entity';

@Injectable()
export class ServicesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServicesRepository.name);
  }

  createVariableServices(services: Omit<VariableService, 'id'>[]) {
    this.logger.info(
      `createVariableServices with services ${JSON.stringify(services)}`,
    );
    return this.supabase.client.from('variable_services').insert(services);
  }

  createFixedServices(services: Omit<FixedService, 'id'>[]) {
    this.logger.info(
      `createFixedServices with services ${JSON.stringify(services)}`,
    );
    return this.supabase.client.from('fixed_services').insert(services);
  }
}
