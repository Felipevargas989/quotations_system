import { ConflictException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'src/clients/entities/client.entity';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { QuotationStatus, RequestType } from './constants/constants';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { Quotation } from './entities/quotation.entity';
import {
  CreateQuotation,
  QuotationWithClientAndCompany,
} from './interfaces/quotations.interface';

@Injectable()
export class QuotationsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsRepository.name);
  }

  async findAll({
    company_id,
    request_type,
    statuses,
    sort_by,
    sort_order,
    event_date,
    dateRange,
    eventDateFrom,
  }: {
    company_id: Company['id'] | undefined;
    request_type?: RequestType;
    statuses?: QuotationStatus[];
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    event_date?: Date;
    dateRange?: { start_date: Date; end_date: Date };
    // Dashboard Fase 1: eventos cuyo event_date cae desde esta fecha en
    // adelante (incluye el futuro confirmado, que se pinta punteado).
    eventDateFrom?: Date;
  }): Promise<QuotationWithClientAndCompany[]> {
    this.logger.info(`findAll quotations with company_id ${company_id}`);
    const query = this.supabase.client.from('quotations').select(
      `*,
        clients (
          name,
          email,
          client_type,
          contact_person,
          phone,
          client_contacts (
            name,
            phone
          )
        ),
        companies (
          name
        )
        `,
    );
    if (company_id) {
      query.eq('company_id', company_id);
    }
    if (request_type) {
      query.eq('request_type', request_type);
    }

    if (sort_by) {
      query.order(sort_by, { ascending: sort_order === 'asc' });
    }

    if (statuses) {
      query.in('quotation_status', statuses);
    }

    if (event_date) {
      query.eq('event_date', event_date.toISOString());
    }

    if (dateRange) {
      query.gte('created_at', dateRange.start_date.toISOString());
      query.lte('created_at', dateRange.end_date.toISOString());
    }

    if (eventDateFrom) {
      query.gte('event_date', eventDateFrom.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as QuotationWithClientAndCompany[];
  }

  async findOne(id: string): Promise<{
    data:
      | (Quotation & { clients: Pick<Client, 'name' | 'email'> } & {
          companies: Pick<Company, 'name'>;
        })
      | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`find quotation with id ${id}`);
    return await this.supabase.client
      .from('quotations')
      .select(
        `*,
        clients (
          name,
          email
        ),
        companies (
          name
        )
        `,
      )
      .eq('id', id)
      .single();
  }

  async create(createQuotation: CreateQuotation) {
    this.logger.info(
      `create quotation with createQuotationDto ${JSON.stringify(createQuotation)}`,
    );
    const { data, error } = await this.supabase.client
      .from('quotations')
      .insert([createQuotation])
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as Quotation;
  }

  async update(
    id: string,
    updateQuotationDto: UpdateQuotationDto,
    companyId: number,
  ): Promise<Quotation> {
    this.logger.info(
      `update quotation with id ${id} and updateQuotationDto ${JSON.stringify(updateQuotationDto)}`,
    );
    const { data, error } = await this.supabase.client
      .from('quotations')
      .update(updateQuotationDto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as Quotation;
  }

  async remove(id: string, companyId: number) {
    this.logger.info(
      `remove quotation with id ${id} and companyId ${companyId}`,
    );
    await this.assertDeletable(id, companyId);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) {
      throw error;
    }
    return data as unknown as Quotation;
  }

  // UNA COTIZACIÓN CON PLATA COLGANDO NO SE BORRA (26-07-2026).
  //
  // La base ya lo impedía sola: payments, payment_transactions, refunds y
  // customer_satisfaction_survey_responses apuntan a quotations con NO
  // ACTION, así que el DELETE reventaba con un error de llave foránea.
  // Eso está bien y no se toca — la regla es correcta, existe para que
  // nunca queden registros de dinero sin dueño.
  //
  // Lo que estaba mal era lo que veía el usuario. El error crudo llegaba
  // a la pantalla convertido en "No se pudo eliminar. Intenta de nuevo",
  // que es una mentira: por más veces que se intente NUNCA va a
  // funcionar, porque el motivo no es un tropiezo pasajero. Felipe se
  // topó con esto el 26-07 y tuvo que adivinar la salida solo.
  //
  // Esta guardia no agrega una regla nueva. Traduce la que ya existe, y
  // en cada caso dice cuál es la salida real.
  //
  // OJO SI SE AGREGA OTRA TABLA que apunte a quotations sin CASCADE: hay
  // que sumarla ACÁ TAMBIÉN, o el borrado vuelve a fallar con el error
  // crudo y volvemos al mensaje mentiroso. La lista de verdad, la que
  // manda, se mira en la base así:
  //
  //   SELECT src.relname, con.confdeltype
  //   FROM pg_constraint con
  //   JOIN pg_class src ON src.oid = con.conrelid
  //   JOIN pg_class tgt ON tgt.oid = con.confrelid
  //   WHERE con.contype = 'f' AND tgt.relname = 'quotations';
  //
  // confdeltype 'a' o 'r' = bloquea (va en esta guardia).
  // confdeltype 'c' = CASCADE, se borra en cadena y no estorba.
  private async assertDeletable(id: string, companyId: number) {
    // Solo se revisa si la cotización es de esta empresa. Si no lo es, el
    // DELETE de arriba no borra nada igual, y no corresponde contarle a
    // nadie qué tiene adentro la cotización de otra empresa.
    const { data: owned, error: ownedError } = await this.supabase.client
      .from('quotations')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (ownedError) throw ownedError;
    if (!owned) return;

    const cuantasHay = async (table: string) => {
      const { count, error } = await this.supabase.client
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('quotation_id', id);
      if (error) throw error;
      return count ?? 0;
    };

    // El orden importa: se informa el impedimento MÁS grave primero,
    // porque es el que decide qué tiene que hacer el usuario. Una
    // cotización con dinero registrado también tiene plan de pagos, y
    // avisarle del plan sería mandarlo por un camino que no lleva a
    // ninguna parte.
    if (await cuantasHay('payment_transactions')) {
      throw new ConflictException(
        'No se puede eliminar: esta cotización tiene pagos registrados. Si el evento no se hizo, anúlala desde Post-Venta.',
      );
    }
    if (await cuantasHay('refunds')) {
      throw new ConflictException(
        'No se puede eliminar: esta cotización tiene reembolsos registrados. Resuélvelos primero en Post-Venta.',
      );
    }
    if (await cuantasHay('payments')) {
      throw new ConflictException(
        'No se puede eliminar: esta cotización tiene un plan de pagos. Cámbiale el estado a uno de pre-venta (por ejemplo "En negociación") y el plan se eliminará solo.',
      );
    }
    if (await cuantasHay('customer_satisfaction_survey_responses')) {
      throw new ConflictException(
        'No se puede eliminar: esta cotización tiene una encuesta de satisfacción respondida.',
      );
    }
  }

  // Contacto de la cotización: correo de la persona (client_contacts) por
  // cliente + nombre, sin distinguir mayúsculas. La correspondencia sigue
  // a la persona asociada a la cotización.
  findContactByName(clientId: string, name: string) {
    return this.supabase.client
      .from('client_contacts')
      .select('name, email')
      .eq('client_id', clientId)
      .ilike('name', name)
      .maybeSingle();
  }
}
