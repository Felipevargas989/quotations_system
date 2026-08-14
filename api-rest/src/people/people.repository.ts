import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { JobRole, Person } from './entities/person.entity';
import { CreatePerson, UpdatePerson } from './interfaces/people.interfaces';

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
      .select('*, job_roles(id, name)')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return data as unknown as Person[];
  }

  async findOne(id: number, companyId: number) {
    this.logger.info(`findOne person ${id} with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('people')
      .select('*, job_roles(id, name)')
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
      .select('*, job_roles(id, name)')
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
      .select('*, job_roles(id, name)')
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
  // ------------------------------------------------------------------

  async findRoles(companyId: number, incluirInactivos = false) {
    this.logger.info(`findRoles with companyId ${companyId}`);
    let consulta = this.supabase.client
      .from('job_roles')
      .select('*')
      .eq('company_id', companyId);
    if (!incluirInactivos) consulta = consulta.eq('is_active', true);
    const { data, error } = await consulta.order('sort_order').order('name');
    if (error) throw error;
    return data as unknown as JobRole[];
  }

  async createRole(companyId: number, name: string, sortOrder: number) {
    this.logger.info(`createRole ${name} for companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('job_roles')
      .insert([{ company_id: companyId, name, sort_order: sortOrder }])
      .select()
      .single();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw new ConflictException(`Ya existe el cargo "${name}"`);
      }
      throw error;
    }
    return data as unknown as JobRole;
  }

  async updateRole(
    id: number,
    cambios: Partial<Pick<JobRole, 'name' | 'is_active' | 'sort_order'>>,
    companyId: number,
  ) {
    this.logger.info(`updateRole ${id} with ${JSON.stringify(cambios)}`);
    const { data, error } = await this.supabase.client
      .from('job_roles')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === YA_EXISTE) {
        throw new ConflictException(`Ya existe el cargo "${cambios.name}"`);
      }
      throw error;
    }
    if (!data) throw new NotFoundException('No existe ese cargo');
    return data as unknown as JobRole;
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
}
