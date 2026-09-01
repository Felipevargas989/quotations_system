import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  Cargo,
  DayNote,
  EventStaff,
  EventStaffConPersona,
  Payroll,
  PayrollPerson,
  Person,
  PersonReview,
  StaffSheet,
  TipPool,
} from './entities/person.entity';
import { CreatePerson, UpdatePerson } from './interfaces/people.interfaces';
import {
  pagadoDePersonalPorMes,
  PagoDeNomina,
  SillaDeNomina,
} from './utils/pagado-por-mes';

/** Código de Postgres para "ya existe uno igual". */
const YA_EXISTE = '23505';

@Injectable()
export class PeopleRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PeopleRepository.name);
  }

  // ------------------------------------------------------------------
  // PERSONAS
  // ------------------------------------------------------------------

  async findAll(companyId: number) {
    this.logger.info(`findAll people with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('people')
      .select('*, management_resources(id, name)')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return data as unknown as Person[];
  }

  async findOne(id: number, companyId: number) {
    this.logger.info(`findOne person ${id} with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('people')
      .select('*, management_resources(id, name)')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe esa persona');
    return data as unknown as Person;
  }

  /** Quién tiene ya ese RUT, para poder decirlo por su nombre en vez de
   *  soltar un error de base de datos que no le sirve a nadie. */
  async findByRut(rut: string, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('people')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('rut', rut)
      .maybeSingle();
    if (error) throw error;
    return data as { id: number; name: string } | null;
  }

  async create(person: CreatePerson) {
    this.logger.info(`create person ${person.name}`);
    const { data, error } = await this.supabase.client
      .from('people')
      .insert([person])
      .select('*, management_resources(id, name)')
      .single();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw await this.errorDeRutRepetido(person.rut, person.company_id);
      }
      throw error;
    }
    return data as unknown as Person;
  }

  async update(id: number, cambios: UpdatePerson, companyId: number) {
    this.logger.info(`update person ${id} with ${JSON.stringify(cambios)}`);
    const { data, error } = await this.supabase.client
      .from('people')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*, management_resources(id, name)')
      .maybeSingle();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw await this.errorDeRutRepetido(cambios.rut, companyId, id);
      }
      throw error;
    }
    if (!data) throw new NotFoundException('No existe esa persona');
    return data as unknown as Person;
  }

  async remove(id: number, companyId: number) {
    this.logger.info(`remove person ${id}`);
    const { data, error } = await this.supabase.client
      .from('people')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe esa persona');
    return data;
  }

  /** Traduce el choque de la base a algo que se entienda: dice de quién
   *  es el RUT que ya está cargado. */
  private async errorDeRutRepetido(
    rut: string | null | undefined,
    companyId: number,
    exceptoId?: number,
  ) {
    if (!rut) {
      return new ConflictException('Ya existe una persona con esos datos');
    }
    const duenio = await this.findByRut(rut, companyId);
    if (duenio && duenio.id !== exceptoId) {
      return new ConflictException(`Ese RUT ya está cargado en ${duenio.name}`);
    }
    return new ConflictException('Ese RUT ya está cargado en otra persona');
  }

  // ------------------------------------------------------------------
  // CARGOS
  //
  // Viven en `management_resources` con type='personal' — la MISMA tabla
  // que usa Recursos. Eran dos listas y se fusionaron el 14-08 ("es lo
  // mismo todo", Felipe): Garzón estaba escrito en las dos.
  //
  // El precio del cargo es solo una SUGERENCIA. No decide nada: un garzón
  // de planta no cuesta y el mismo cargo con un freelance sí. Lo que decide
  // si una jornada cuesta plata es si LA PERSONA es planta o freelance ese
  // día — atributo de la persona, no del cargo (Felipe, 14-08). Por eso
  // TODOS los cargos aparecen en todas partes, tengan precio o no.
  // ------------------------------------------------------------------

  async findRoles(companyId: number, incluirInactivos = false) {
    this.logger.info(`findRoles with companyId ${companyId}`);
    let consulta = this.supabase.client
      .from('management_resources')
      .select('*')
      .eq('company_id', companyId)
      .eq('type', 'personal');
    if (!incluirInactivos) consulta = consulta.eq('is_active', true);
    const { data, error } = await consulta.order('name');
    if (error) throw error;
    return data as unknown as Cargo[];
  }

  async createRole(companyId: number, name: string) {
    this.logger.info(`createRole ${name} for companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('management_resources')
      // Sin precio: nace sin sugerencia y se le pone cuando se sepa. Igual
      // aparece en todas partes desde el primer momento.
      .insert([
        { company_id: companyId, name, type: 'personal', is_active: true },
      ])
      .select()
      .single();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw new ConflictException(`Ya existe el cargo "${name}"`);
      }
      throw error;
    }
    return data as unknown as Cargo;
  }

  async updateRole(
    id: number,
    cambios: Partial<Pick<Cargo, 'name' | 'is_active'>>,
    companyId: number,
  ) {
    this.logger.info(`updateRole ${id} with ${JSON.stringify(cambios)}`);
    const { data, error } = await this.supabase.client
      .from('management_resources')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      // El candado que impide renombrar un arriendo creyendo que es un cargo.
      .eq('type', 'personal')
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw new ConflictException(`Ya existe el cargo "${cambios.name}"`);
      }
      throw error;
    }
    if (!data) throw new NotFoundException('No existe ese cargo');
    return data as unknown as Cargo;
  }

  // ------------------------------------------------------------------
  // QUIÉN TRABAJA CADA DÍA
  // ------------------------------------------------------------------

  /** Todo lo asignado en un rango de fechas, de TODOS los eventos. Es lo
   *  que alimenta la planificación semanal: Felipe no llena un evento, se
   *  sienta el lunes y llena la semana. */
  async findStaffRange(companyId: number, desde: string, hasta: string) {
    this.logger.info(`findStaffRange ${desde} a ${hasta}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select(
        '*, people(id, name, rut, default_kind), management_resources(id, name)',
      )
      .eq('company_id', companyId)
      .gte('day', desde)
      .lte('day', hasta)
      .order('day');
    if (error) throw error;
    return data as unknown as EventStaffConPersona[];
  }

  async findStaff(companyId: number, quotationId: string) {
    this.logger.info(`findStaff evento ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select(
        '*, people(id, name, rut, default_kind), management_resources(id, name)',
      )
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .order('day');
    if (error) throw error;
    return data as unknown as EventStaffConPersona[];
  }

  /** Muchas filas en UN viaje. La proyección de planta creaba 262
   *  jornadas de a una —12 segundos al guardar una ficha (Felipe,
   *  18-08). Sin devolver las filas: no hacen falta. */
  async addStaffEnLote(rows: Record<string, unknown>[]) {
    if (rows.length === 0) return 0;
    this.logger.info(`addStaffEnLote ${rows.length} filas`);
    const { error } = await this.supabase.client
      .from('event_staff')
      .insert(rows);
    if (error) throw error;
    return rows.length;
  }

  /** Muchas filas fuera en UN viaje, filtrando por empresa. */
  async removeStaffEnLote(ids: number[], companyId: number) {
    if (ids.length === 0) return 0;
    const { error } = await this.supabase.client
      .from('event_staff')
      .delete()
      .in('id', ids)
      .eq('company_id', companyId);
    if (error) throw error;
    return ids.length;
  }

  async addStaff(row: Record<string, unknown>) {
    this.logger.info(`addStaff ${JSON.stringify(row)}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .insert([row])
      .select(
        '*, people(id, name, rut, default_kind), management_resources(id, name)',
      )
      .single();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw new ConflictException('Esa persona ya está puesta ese día');
      }
      throw error;
    }
    return data as unknown as EventStaff;
  }

  /** Una asignación por su id — para revisar antes de confirmarla. */
  async findStaffPorId(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe esa asignación');
    return data as unknown as EventStaff;
  }

  async updateStaff(
    id: number,
    cambios: Record<string, unknown>,
    companyId: number,
  ) {
    this.logger.info(`updateStaff ${id}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select(
        '*, people(id, name, rut, default_kind), management_resources(id, name)',
      )
      .maybeSingle();
    if (error) {
      // Al MOVER de día puede chocar con un día donde ya está.
      if (error.code === YA_EXISTE) {
        throw new ConflictException('Esa persona ya está puesta ese día');
      }
      throw error;
    }
    if (!data) throw new NotFoundException('No existe esa asignación');
    return data as unknown as EventStaff;
  }

  /** Los días de planta (sin evento) desde una fecha: la marca de agua
   *  por persona para que la carga automática solo mire hacia adelante. */
  async findPlantaDesde(companyId: number, desde: string) {
    this.logger.info(`findPlantaDesde ${desde}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('person_id, day')
      .eq('company_id', companyId)
      .is('quotation_id', null)
      .gte('day', desde);
    if (error) throw error;
    return data as { person_id: number; day: string }[];
  }

  /** Todas las jornadas de UNA persona desde un día — para proyectar. */
  async findDePersonaDesde(companyId: number, personId: number, desde: string) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      // Trae también la PLATA y el kind: sin eso, la proyección decidía
      // a ciegas a quién borrar (revisión del 16-08).
      .select(
        'id, day, quotation_id, starts_at, ends_at, break_minutes, kind, amount, tip_amount, payroll_id, tip_payroll_id, role_id, ajuste',
      )
      .eq('company_id', companyId)
      .eq('person_id', personId)
      .gte('day', desde);
    if (error) throw error;
    return data as {
      id: number;
      day: string;
      quotation_id: string | null;
      starts_at: string | null;
      ends_at: string | null;
      break_minutes: number | null;
      kind: string | null;
      amount: number | null;
      tip_amount: number | null;
      payroll_id: number | null;
      tip_payroll_id: number | null;
      role_id: number | null;
      /** Cambio de día (migración 89): la proyección no lo toca. */
      ajuste: 'trabaja' | 'descansa' | null;
    }[];
  }

  /** TODO lo que esa persona ha trabajado, con su evento: la base de su
   *  pestaña de Pagos. Trae el número y el cliente de la cotización para
   *  no tener que pedirlos aparte. */
  async findHistorialDePersona(companyId: number, personId: number) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select(
        '*, management_resources(id, name), quotations(quotation_number, clients(name))',
      )
      .eq('company_id', companyId)
      .eq('person_id', personId)
      .order('day', { ascending: false });
    if (error) throw error;
    return data as unknown as EventStaffConPersona[];
  }

  /**
   * El día de restaurante más viejo que todavía tiene gente. Sirve para
   * que la pantalla de liquidación abra su ventana hasta ahí: un día
   * sin liquidar no puede caerse de la lista por antiguo (revisión del
   * 16-08).
   */
  async diaMasViejoDeRestaurante(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('day')
      .eq('company_id', companyId)
      .is('quotation_id', null)
      .order('day', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? String((data as { day: string }).day).slice(0, 10) : null;
  }

  /**
   * ¿Ese evento y ese cargo son de esta empresa? La base se consulta con
   * la llave de servicio, así que el aislamiento lo hace el código: un
   * id ajeno que llegue en el cuerpo entraría igual (revisión del
   * 16-08).
   */
  async esCotizacionDeLaEmpresa(companyId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('id')
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async esRecursoDeLaEmpresa(companyId: number, roleId: number) {
    const { data, error } = await this.supabase.client
      .from('management_resources')
      .select('id')
      .eq('id', roleId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  /** La silla vacía que mejor calza para sentar a alguien: primero la
   *  del día exacto, si no una "sin día" (el por ubicar del plan). */
  async findSillaVacia(
    companyId: number,
    quotationId: string,
    roleId: number | null,
    day: string,
  ) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('*')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .is('person_id', null)
      .order('day', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const sillas = (data as unknown as EventStaff[]).filter(
      (s) => (s.role_id ?? null) === (roleId ?? null),
    );
    return (
      sillas.find((s) => String(s.day ?? '').slice(0, 10) === day) ??
      sillas.find((s) => s.day == null) ??
      null
    );
  }

  /** Al cerrar la ficha, las sillas que quedaron vacías se van: no se
   *  contrató a nadie y el costo converge a lo real (migración 84). */
  async deleteSillasVacias(companyId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .delete()
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .is('person_id', null)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }

  /** El costo de personal por evento y cargo: sillas con nombre al monto
   *  acordado, vacías al estimado. Para Gestión, Servicios y Dashboard. */
  async costoPersonalPorEvento(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('quotation_id, role_id, amount')
      .eq('company_id', companyId)
      .not('quotation_id', 'is', null);
    if (error) throw error;
    const grupos = new Map<
      string,
      {
        quotation_id: string;
        role_id: number | null;
        total: number;
        sillas: number;
      }
    >();
    for (const f of data as {
      quotation_id: string;
      role_id: number | null;
      amount: number | null;
    }[]) {
      const k = `${f.quotation_id}|${f.role_id ?? 0}`;
      const g = grupos.get(k) ?? {
        quotation_id: f.quotation_id,
        role_id: f.role_id ?? null,
        total: 0,
        sillas: 0,
      };
      g.total += Number(f.amount ?? 0);
      g.sillas += 1;
      grupos.set(k, g);
    }
    return [...grupos.values()];
  }

  /** Cuántos días trabajados tiene una persona: lo que impide borrarla. */
  async cuantasJornadas(companyId: number, personId: number) {
    const { count, error } = await this.supabase.client
      .from('event_staff')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('person_id', personId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Una fila de personal por id, para poder mirarla antes de tocarla. */
  async findStaffRow(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as EventStaff | null;
  }

  async removeStaff(id: number, companyId: number) {
    this.logger.info(`removeStaff ${id}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe esa asignación');
    return data;
  }

  /** Cuánta gente lo tiene como cargo por defecto. Un cargo en uso NO se
   *  borra: se apaga, para no dejar fichas apuntando a la nada. */
  async countPeopleWithRole(roleId: number, companyId: number) {
    const { count, error } = await this.supabase.client
      .from('people')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('default_role_id', roleId);
    if (error) throw error;
    return count ?? 0;
  }

  // ================= EL CICLO DE LA FICHA =================

  async findSheets(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('staff_sheets')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    const sheets = data as unknown as StaffSheet[];
    // EN NÓMINA NO HAY VUELTA ATRÁS (Felipe, 24-08): el Histórico
    // necesita saber a quién ponerle candado. Una jornada o propina del
    // evento con sello de nómina bloquea el reabrir (el backend además
    // lo rechaza en payrolls/reabrir; esto es para pintarlo).
    const ids = sheets.map((s) => s.quotation_id);
    let enNomina = new Set<string>();
    if (ids.length > 0) {
      const { data: selladas, error: e2 } = await this.supabase.client
        .from('event_staff')
        .select('quotation_id')
        .eq('company_id', companyId)
        .in('quotation_id', ids)
        .or('payroll_id.not.is.null,tip_payroll_id.not.is.null');
      if (e2) throw e2;
      enNomina = new Set(
        (selladas ?? []).map((f) =>
          String((f as { quotation_id: string }).quotation_id),
        ),
      );
    }
    return sheets.map((s) => ({
      ...s,
      en_nomina: enNomina.has(String(s.quotation_id)),
    }));
  }

  async findSheetByQuotation(companyId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('staff_sheets')
      .select('*')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as StaffSheet | null;
  }

  async upsertSheet(
    companyId: number,
    quotationId: string,
    cambios: Record<string, unknown>,
  ) {
    this.logger.info(`upsertSheet ${quotationId} ${JSON.stringify(cambios)}`);
    const { data, error } = await this.supabase.client
      .from('staff_sheets')
      .upsert(
        [{ company_id: companyId, quotation_id: quotationId, ...cambios }],
        { onConflict: 'company_id,quotation_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as StaffSheet;
  }

  // ================= LOS POZOS DE PROPINA =================

  async findPools(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('tip_pools')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at');
    if (error) throw error;
    return data as unknown as TipPool[];
  }

  /** Las jornadas y propinas que YA entraron a una nómina, desde una
   *  fecha: la materia prima del Histórico de pagos. */
  async filasEnNominaDesde(companyId: number, desde: string) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select(
        'day, amount, tip_amount, payroll_id, tip_payroll_id, person_id, people(name)',
      )
      .eq('company_id', companyId)
      .gte('day', desde)
      .or('payroll_id.not.is.null,tip_payroll_id.not.is.null');
    if (error) throw error;
    return data as unknown as {
      day: string;
      amount: number | null;
      tip_amount: number | null;
      payroll_id: number | null;
      tip_payroll_id: number | null;
      person_id: number | null;
      people: { name: string } | null;
    }[];
  }

  /** ¿Algo de este evento (o de este día de restaurante) ya entró a
   *  una nómina? Es el candado para reabrir una liquidación. */
  async hayPagosEn(
    companyId: number,
    origen: { quotation_id?: string; day?: string },
  ) {
    let q = this.supabase.client
      .from('event_staff')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or('payroll_id.not.is.null,tip_payroll_id.not.is.null');
    q = origen.quotation_id
      ? q.eq('quotation_id', origen.quotation_id)
      : q.is('quotation_id', null).eq('day', origen.day ?? '');
    const { count, error } = await q;
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /** El pozo de un día de restaurante vuelve a "sin repartir". */
  async desrepartirPozoDelDia(companyId: number, day: string) {
    const { error } = await this.supabase.client
      .from('tip_pools')
      .update({ distributed_at: null })
      .eq('company_id', companyId)
      .is('quotation_id', null)
      .eq('day', day);
    if (error) throw error;
  }

  async findPool(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('tip_pools')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe ese pozo');
    return data as unknown as TipPool;
  }

  /** Los días que abarca un evento (inicio → término), como texto ISO. */
  async diasDeEvento(companyId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('event_date, event_end_date')
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.event_date) return [] as string[];
    const ini = String(data.event_date).slice(0, 10);
    const fin = String(data.event_end_date ?? data.event_date).slice(0, 10);
    const dias: string[] = [];
    for (
      let t = new Date(`${ini}T00:00:00Z`).getTime();
      t <= new Date(`${fin}T00:00:00Z`).getTime();
      t += 86_400_000
    ) {
      dias.push(new Date(t).toISOString().slice(0, 10));
    }
    return dias;
  }

  /** La planta con turno de restaurante en esos días. */
  async plantaEnDias(companyId: number, dias: string[]) {
    if (dias.length === 0) return [] as EventStaff[];
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('*')
      .eq('company_id', companyId)
      .is('quotation_id', null)
      .eq('kind', 'planta')
      .not('person_id', 'is', null)
      .in('day', dias);
    if (error) throw error;
    return data as unknown as EventStaff[];
  }

  /** El pozo de un evento o de un día, si ya existe. */
  async findPoolDe(
    companyId: number,
    de: { quotation_id?: string | null; day?: string | null },
  ) {
    let q = this.supabase.client
      .from('tip_pools')
      .select('*')
      .eq('company_id', companyId);
    q = de.quotation_id
      ? q.eq('quotation_id', de.quotation_id)
      : q.is('quotation_id', null).eq('day', de.day as string);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data as unknown as TipPool | null;
  }

  async createPool(row: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('tip_pools')
      .insert([row])
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as TipPool;
  }

  async updatePool(
    id: number,
    cambios: Record<string, unknown>,
    companyId: number,
  ) {
    const { data, error } = await this.supabase.client
      .from('tip_pools')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe ese pozo');
    return data as unknown as TipPool;
  }

  async removePool(id: number, companyId: number) {
    const { error } = await this.supabase.client
      .from('tip_pools')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { id };
  }

  /** La planta de UN día (sin evento), para repartir su pozo. */
  async findPlantaDelDia(companyId: number, day: string) {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select(
        '*, people(id, name, rut, default_kind), management_resources(id, name)',
      )
      .eq('company_id', companyId)
      .is('quotation_id', null)
      .eq('day', day)
      // El que descansa por cambio de día (migración 89) no vino: no
      // entra al día ni a su reparto.
      .or('ajuste.is.null,ajuste.neq.descansa');
    if (error) throw error;
    return data as unknown as EventStaffConPersona[];
  }

  /** Borra el reparto anterior de un pozo, para volver a repartir. */
  async clearTips(poolId: number, companyId: number) {
    const { error } = await this.supabase.client
      .from('event_staff')
      .update({ tip_amount: null, tip_pool_id: null })
      .eq('company_id', companyId)
      .eq('tip_pool_id', poolId);
    if (error) throw error;
  }

  // ================= LAS ESTRELLAS =================

  async findReviews(companyId: number, personId?: number) {
    let q = this.supabase.client
      .from('person_reviews')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (personId) q = q.eq('person_id', personId);
    const { data, error } = await q;
    if (error) throw error;
    return data as unknown as PersonReview[];
  }

  async createReview(row: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('person_reviews')
      .insert([row])
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as PersonReview;
  }

  // ================= LA NÓMINA =================

  async createPayroll(row: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('payrolls')
      .insert([row])
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as Payroll;
  }

  async findPayrolls(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('payrolls')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as unknown as Payroll[];
  }

  /** Los pagos marcados de varias nóminas, de una sola pasada. */
  async pagosDeNominas(companyId: number, payrollIds: number[]) {
    if (payrollIds.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('payroll_people')
      .select('payroll_id, person_id, jornada_paid, propina_paid')
      .eq('company_id', companyId)
      .in('payroll_id', payrollIds);
    if (error) throw error;
    return data as unknown as PayrollPerson[];
  }

  /** Lo que suma cada nómina, de una sola pasada. */
  async montosDeNominas(companyId: number, payrollIds: number[]) {
    if (payrollIds.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('payroll_id, tip_payroll_id, amount, tip_amount')
      .eq('company_id', companyId)
      .or(
        `payroll_id.in.(${payrollIds.join(',')}),tip_payroll_id.in.(${payrollIds.join(',')})`,
      );
    if (error) throw error;
    return data as unknown as {
      payroll_id: number | null;
      tip_payroll_id: number | null;
      amount: number | null;
      tip_amount: number | null;
    }[];
  }

  async findPayroll(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('payrolls')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe esa nómina');
    return data as unknown as Payroll;
  }

  /** Jornadas sin nómina (pendientes), con el filtro del selector. */
  async jornadasPendientes(
    companyId: number,
    f: {
      hasta?: string;
      desde?: string;
      quotationIds?: string[];
      dias?: string[];
    },
  ) {
    let q = this.supabase.client
      .from('event_staff')
      .select('*, people(*), management_resources(id, name)')
      .eq('company_id', companyId)
      // Una silla vacía JAMÁS llega a la nómina (migración 84).
      .not('person_id', 'is', null)
      .is('payroll_id', null)
      // Se paga toda fila CON MONTO, sea freelance o planta: la planta no
      // cobra jornada, pero sí la ASIGNACIÓN EXTRA que se le ponga en un
      // día (Felipe, 18-08). El monto en cero o nulo no entra.
      .not('amount', 'is', null)
      .gt('amount', 0);
    // El modo "días sueltos" es excluyente: nada de eventos, y solo
    // esos días. No se mezcla con el rango.
    if (f.dias?.length) {
      q = q.is('quotation_id', null).in('day', f.dias);
    } else {
      if (f.quotationIds?.length) q = q.in('quotation_id', f.quotationIds);
      if (f.hasta) q = q.lte('day', f.hasta);
      if (f.desde) q = q.gte('day', f.desde);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data as unknown as EventStaffConPersona[];
  }

  /** Propinas repartidas y sin nómina, con el filtro del selector. */
  async propinasPendientes(
    companyId: number,
    f: {
      hasta?: string;
      desde?: string;
      quotationIds?: string[];
      dias?: string[];
    },
  ) {
    let q = this.supabase.client
      .from('event_staff')
      .select('*, people(*), management_resources(id, name)')
      .eq('company_id', companyId)
      // Una silla vacía JAMÁS llega a la nómina (migración 84).
      .not('person_id', 'is', null)
      .is('tip_payroll_id', null)
      .not('tip_amount', 'is', null)
      .gt('tip_amount', 0);
    // El modo "días sueltos" es excluyente: nada de eventos, y solo
    // esos días. No se mezcla con el rango.
    if (f.dias?.length) {
      q = q.is('quotation_id', null).in('day', f.dias);
    } else {
      if (f.quotationIds?.length) q = q.in('quotation_id', f.quotationIds);
      if (f.hasta) q = q.lte('day', f.hasta);
      if (f.desde) q = q.gte('day', f.desde);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data as unknown as EventStaffConPersona[];
  }

  /** Los pozos sin repartir del filtro — lo que la nómina DEJA FUERA y
   *  tiene que decir. La nómina no bloquea: muestra. */
  async poolsSinRepartir(
    companyId: number,
    f: {
      hasta?: string;
      desde?: string;
      quotationIds?: string[];
      dias?: string[];
    },
  ) {
    const q = this.supabase.client
      .from('tip_pools')
      .select('*')
      .eq('company_id', companyId)
      .is('distributed_at', null);
    const { data, error } = await q;
    if (error) throw error;
    const pools = data as unknown as TipPool[];
    return pools.filter((p) => {
      if (f.dias?.length)
        return (
          !p.quotation_id &&
          !!p.day &&
          f.dias.includes(String(p.day).slice(0, 10))
        );
      if (f.quotationIds?.length)
        return p.quotation_id && f.quotationIds.includes(p.quotation_id);
      if (p.day) {
        if (f.hasta && p.day > f.hasta) return false;
        if (f.desde && p.day < f.desde) return false;
      }
      return true;
    });
  }

  async stampRows(
    ids: number[],
    cambios: Record<string, unknown>,
    companyId: number,
  ) {
    if (ids.length === 0) return;
    const { error } = await this.supabase.client
      .from('event_staff')
      .update(cambios)
      .eq('company_id', companyId)
      .in('id', ids);
    if (error) throw error;
  }

  async rowsDeNomina(payrollId: number, companyId: number) {
    const traer = async (col: string) => {
      const { data, error } = await this.supabase.client
        .from('event_staff')
        .select('*, people(*), management_resources(id, name)')
        .eq('company_id', companyId)
        .eq(col, payrollId)
        .order('day');
      if (error) throw error;
      return data as unknown as EventStaff[];
    };
    return {
      jornadas: await traer('payroll_id'),
      propinas: await traer('tip_payroll_id'),
    };
  }

  async insertPagos(rows: Record<string, unknown>[]) {
    if (rows.length === 0) return;
    const { error } = await this.supabase.client
      .from('payroll_people')
      .upsert(rows, { onConflict: 'payroll_id,person_id' });
    if (error) throw error;
  }

  /** Lo pagado al equipo, mes a mes, para el flujo de caja del panel.
   *  Con nombres: el desglose por persona del globo (31-08). */
  async pagadoDePersonalPorMes(companyId: number) {
    const [pagos, sillas, gente] = await Promise.all([
      this.supabase.client
        .from('payroll_people')
        .select('payroll_id, person_id, jornada_paid, propina_paid, paid_at')
        .eq('company_id', companyId)
        .not('paid_at', 'is', null),
      this.supabase.client
        .from('event_staff')
        .select('person_id, payroll_id, tip_payroll_id, amount, tip_amount')
        .eq('company_id', companyId)
        .or('payroll_id.not.is.null,tip_payroll_id.not.is.null'),
      this.supabase.client
        .from('people')
        .select('id, name')
        .eq('company_id', companyId),
    ]);
    if (pagos.error) throw pagos.error;
    if (sillas.error) throw sillas.error;
    if (gente.error) throw gente.error;
    const nombres = new Map(
      ((gente.data || []) as { id: number; name: string }[]).map((p) => [
        p.id,
        p.name,
      ]),
    );
    return pagadoDePersonalPorMes(
      (pagos.data || []) as unknown as PagoDeNomina[],
      (sillas.data || []) as unknown as SillaDeNomina[],
      nombres,
    );
  }

  async findPagos(payrollId: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('payroll_people')
      .select('*')
      .eq('company_id', companyId)
      .eq('payroll_id', payrollId);
    if (error) throw error;
    return data as unknown as PayrollPerson[];
  }

  async upsertPago(
    companyId: number,
    payrollId: number,
    personId: number,
    cambios: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase.client
      .from('payroll_people')
      .upsert(
        [
          {
            company_id: companyId,
            payroll_id: payrollId,
            person_id: personId,
            ...cambios,
          },
        ],
        { onConflict: 'payroll_id,person_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as PayrollPerson;
  }

  // ================= LAS NOTAS DEL DÍA =================

  async findDayNotes(companyId: number, desde: string, hasta: string) {
    const { data, error } = await this.supabase.client
      .from('day_notes')
      .select('*')
      .eq('company_id', companyId)
      .gte('day', desde)
      .lte('day', hasta)
      .order('created_at');
    if (error) throw error;
    return data as unknown as DayNote[];
  }

  async createDayNote(row: Record<string, unknown>) {
    this.logger.info(`createDayNote ${JSON.stringify(row)}`);
    const { data, error } = await this.supabase.client
      .from('day_notes')
      .insert([row])
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as DayNote;
  }

  async updateDayNote(
    id: number,
    cambios: Record<string, unknown>,
    companyId: number,
  ) {
    const { data, error } = await this.supabase.client
      .from('day_notes')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('No existe esa nota');
    return data as unknown as DayNote;
  }

  /** Las cotizaciones cuya ficha de personal YA se cerró: sus jornadas
   *  y propinas son las únicas de evento que pueden ir a nómina. */
  async fichasCerradas(companyId: number, quotationIds: string[]) {
    if (quotationIds.length === 0) return new Set<string>();
    const { data, error } = await this.supabase.client
      .from('staff_sheets')
      .select('quotation_id')
      .eq('company_id', companyId)
      .in('quotation_id', quotationIds)
      .not('closed_at', 'is', null);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.quotation_id as string));
  }

  /** Los días de restaurante con la propina ya resuelta — repartida o
   *  marcada "sin propina". Las dos dejan distributed_at, y las dos
   *  significan lo mismo: ese día quedó liquidado. */
  async diasLiquidados(companyId: number, dias: string[]) {
    if (dias.length === 0) return new Set<string>();
    const { data, error } = await this.supabase.client
      .from('tip_pools')
      .select('day')
      .eq('company_id', companyId)
      .in('day', dias)
      .not('distributed_at', 'is', null);
    if (error) throw error;
    return new Set((data ?? []).map((r) => String(r.day).slice(0, 10)));
  }

  async removeDayNote(id: number, companyId: number) {
    const { error } = await this.supabase.client
      .from('day_notes')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { id };
  }
}
