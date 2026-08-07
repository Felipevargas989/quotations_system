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
    // FASE VELOCIDAD Etapa 3 (28-07): la LISTA viaja sin sus dos campos
    // gordos (items y provisioned_services, JSON de miles de líneas) —
    // 93 KB → ~15 KB. Quien necesita el detalle pide la cotización por
    // id (findOne, que sigue trayendo todo). OJO: columna nueva en la
    // tabla ⇒ agregarla acá.
    const COLUMNAS_LISTA =
      'id, quotation_number, user_id, total_amount, people_count, ' +
      'quotation_status, observations, created_at, client_id, event_type, ' +
      'event_date, value_per_person, fixed_value, request_type, updated_at, ' +
      'requires_invoice, has_contract, payment_plan_type, ' +
      'discount_percentage, subtotal_amount, company_id, discount_amount, ' +
      'provisioned_at, provisioned_cost, provisioned_people, ' +
      'survey_sent_at, event_end_date, children_count, tip_percentage, ' +
      'contact_name, tip_amount, sent_at, loss_reason, ' +
      'recontacted_at, recontacted_by, harvest_status';
    const query = this.supabase.client.from('quotations').select(
      `${COLUMNAS_LISTA},
        mandante:client_contacts!quotations_client_contact_id_fkey (
          name
        ),
        clients (
          name,
          email,
          client_type,
          contact_person,
          phone,
          client_contacts (
            name,
            phone,
            email
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
    return data as unknown as QuotationWithClientAndCompany[];
  }

  // La CARTA del catálogo (categorías, secciones y vínculos) para que el
  // documento del portal agrupe por secciones igual que el interno
  // (revisión 06-08: el cliente veía la lista plana). Solo lectura y
  // acotado a la empresa, como toda consulta de este repositorio.
  async cartaDelCatalogo(companyId: number) {
    this.logger.info(`cartaDelCatalogo company ${companyId}`);
    const [cats, secs, links] = await Promise.all([
      this.supabase.client
        .from('service_categories')
        .select('id, name')
        .eq('company_id', companyId),
      this.supabase.client
        .from('category_sections')
        .select('id, name, sort_order, category_id')
        .eq('company_id', companyId),
      this.supabase.client
        .from('variable_service_categories')
        .select('variable_service_id, category_id, section_id')
        .eq('company_id', companyId),
    ]);
    return {
      categories: cats.data || [],
      sections: secs.data || [],
      links: links.data || [],
    };
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

  // Fase 1 punto 3 (migración 38): el número lo entrega LA BASE, de a uno
  // por empresa (función next_quotation_number, atómica por fila de
  // contador). Nada de "último + 1" leído aparte: eso dejaba que dos
  // cotizaciones simultáneas quedaran con el mismo número. Y aunque este
  // código cambie, la restricción UNIQUE (company_id, quotation_number)
  // impide el repetido desde la base.
  async nextQuotationNumber(companyId: Company['id']): Promise<number> {
    const { data, error } = await this.supabase.client.rpc(
      'next_quotation_number',
      { p_company_id: companyId },
    );
    if (error) {
      this.logger.error(error);
      throw error;
    }
    return Number(data);
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

  /**
   * PORTAL DEL MANDANTE (migración 48): el enlace secreto vive en el
   * CONTACTO. Esta es la única puerta pública de lectura: entrega el
   * contacto, su cliente y la marca de la empresa — nada más.
   * (La consulta vive aquí y no en clients por pragmatismo: el portal
   * es un caso de uso de cotizaciones.)
   */
  async findPortalContact(token: string): Promise<{
    data: {
      id: number;
      name: string;
      client_id: string;
      clients: {
        name: string;
        company_id: number;
        companies: Pick<
          Company,
          'name' | 'tagline' | 'logo_url' | 'colors' | 'bank_details'
        > | null;
      } | null;
    } | null;
    error: PostgrestError | null;
  }> {
    this.logger.info('find portal contact by token');
    return (await this.supabase.client
      .from('client_contacts')
      .select(
        `id, name, client_id,
        clients!inner (
          name, company_id,
          companies!inner ( name, tagline, logo_url, colors, bank_details )
        )`,
      )
      .eq('portal_token', token)
      .maybeSingle()) as never;
  }

  /** Cotizaciones visibles en el portal de UN mandante. */
  async findAllByContact(contactId: number): Promise<{
    data: Quotation[] | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`portal quotations of contact ${contactId}`);
    return (await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, event_type, event_date, event_end_date, people_count, total_amount, quotation_status, company_id',
      )
      .eq('client_contact_id', contactId)
      .in('quotation_status', [
        'enviada',
        'en_negociacion',
        'aceptada',
        'realizada',
      ])
      .order('event_date', { ascending: true })) as never;
  }

  /**
   * Cotizaciones (de una lista) con encuesta YA respondida — el portal
   * muestra el agradecimiento en vez del enlace. (Duplica una consulta
   * del módulo de encuestas a propósito: inyectarlo aquí crearía un
   * ciclo de módulos.)
   */
  async answeredSurveys(quotationIds: string[]): Promise<Set<string>> {
    if (!quotationIds.length) return new Set();
    const { data } = await this.supabase.client
      .from('customer_satisfaction_survey_responses')
      .select('quotation_id')
      .in('quotation_id', quotationIds);
    const rows = (data || []) as { quotation_id: string }[];
    return new Set(rows.map((r) => r.quotation_id));
  }

  /**
   * Vincula el mandante escrito (texto) con su contacto real del
   * cliente, si el nombre calza. Se usa al crear/editar cotizaciones
   * para que el portal del mandante las vea sin trabajo manual.
   */
  async resolveContactId(
    clientId: string,
    contactName?: string | null,
  ): Promise<number | null> {
    const nombre = (contactName || '').trim();
    if (!nombre) return null;
    const { data } = await this.supabase.client
      .from('client_contacts')
      .select('id, name')
      .eq('client_id', clientId);
    const contactos = (data || []) as { id: number; name: string }[];
    const match = contactos.find(
      (c) => c.name.trim().toLowerCase() === nombre.toLowerCase(),
    );
    return match ? match.id : null;
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
      .select('name, email, portal_token')
      .eq('client_id', clientId)
      .ilike('name', name)
      .maybeSingle();
  }

  // El token secreto del mandante, para el botón "Ingresar a mi
  // portal" de los correos. Sin contacto vinculado, sin botón.
  async findContactPortalToken(
    contactId: number | null | undefined,
  ): Promise<string | null> {
    if (!contactId) return null;
    const { data } = await this.supabase.client
      .from('client_contacts')
      .select('portal_token')
      .eq('id', contactId)
      .maybeSingle();
    return (
      (data as { portal_token?: string | null } | null)?.portal_token || null
    );
  }

  // SEGUIMIENTO comercial (30-07): cotizaciones ENVIADAS cuyo envío
  // cayó dentro de la ventana [desde, hasta) y cuyo evento aún no
  // pasa. El cron pregunta por el día 7 y el día 14 exactos.
  async findFollowUps(
    desde: string,
    hasta: string,
    eventoDesde: string,
  ): Promise<
    {
      id: string;
      quotation_number: number;
      event_type: string | null;
      event_date: string | null;
      company_id: number;
      client_contact_id: number | null;
      companies: { name: string } | null;
    }[]
  > {
    this.logger.info(`follow-ups enviados entre ${desde} y ${hasta}`);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, event_type, event_date, company_id, client_contact_id, companies ( name )',
      )
      .eq('quotation_status', 'enviada')
      .gte('sent_at', desde)
      .lt('sent_at', hasta)
      .gte('event_date', eventoDesde);
    if (error) throw error;
    return (data || []) as never;
  }

  // El mandante completo por su vínculo REAL (client_contact_id) — lo
  // usan los correos de plata (paso 1 del reordenamiento, 30-07): la
  // correspondencia le escribe a la persona, no a la ficha.
  async findContactById(contactId: number | null | undefined): Promise<{
    name: string;
    email: string | null;
    portal_token: string | null;
  } | null> {
    if (!contactId) return null;
    const { data } = await this.supabase.client
      .from('client_contacts')
      .select('name, email, portal_token')
      .eq('id', contactId)
      .maybeSingle();
    return (data as never) || null;
  }
}
