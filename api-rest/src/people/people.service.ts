import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { CreatePerson, UpdatePerson } from './interfaces/people.interfaces';
import { PeopleRepository } from './people.repository';
import { normalizarRut } from './utils/rut';
import type {
  CreateEventStaffDto,
  UpdateEventStaffDto,
} from './dto/event-staff.dto';

/** Deja el nombre sin espacios de sobra ni dobles espacios en el medio.
 *
 *  No es cosmética: en el Excel, "Valentina Salgado" y "Valentina Salgado "
 *  —con un espacio invisible al final— eran dos personas distintas, y sus
 *  $2.628.223 quedaron partidos en dos montones. */
const limpiarNombre = (valor: string): string =>
  (valor || '').trim().replace(/\s+/g, ' ');

@Injectable()
export class PeopleService {
  constructor(
    private readonly repo: PeopleRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PeopleService.name);
  }

  findAll(companyId: number) {
    return this.repo.findAll(companyId);
  }

  findOne(id: number, companyId: number) {
    return this.repo.findOne(id, companyId);
  }

  async create(dto: CreatePersonDto, companyId: number) {
    const persona = this.prepararDatos(dto);
    return this.repo.create({
      ...persona,
      company_id: companyId,
      name: limpiarNombre(dto.name),
      default_kind: persona.default_kind ?? 'freelance',
      status: persona.status ?? 'activa',
    } as CreatePerson);
  }

  async update(id: number, dto: UpdatePersonDto, companyId: number) {
    const cambios = this.prepararDatos(dto);
    if (dto.name !== undefined) cambios.name = limpiarNombre(dto.name);

    // Al desbloquear se borra el motivo: si queda escrito, el día que
    // vuelvas a bloquear a esa persona aparece el motivo viejo y engaña.
    if (dto.status !== undefined && dto.status !== 'bloqueada') {
      cambios.blocked_reason = null;
    }
    return this.repo.update(id, cambios as UpdatePerson, companyId);
  }

  remove(id: number, companyId: number) {
    return this.repo.remove(id, companyId);
  }

  /**
   * Las dos reglas que se aplican SIEMPRE, vengan de donde vengan los datos:
   *
   *  1. El RUT se guarda en forma limpia (sin puntos, guion, K mayúscula).
   *     Se escriba como se escriba en la pantalla, adentro queda igual.
   *  2. Si la cuenta es CuentaRUT de BancoEstado, el número ES el RUT sin
   *     el dígito verificador. Se llena solo, así no se puede equivocar.
   */
  private prepararDatos(
    dto: CreatePersonDto | UpdatePersonDto,
  ): Partial<CreatePerson> {
    const datos: Partial<CreatePerson> = { ...(dto as Partial<CreatePerson>) };

    if (dto.rut !== undefined) {
      const canonico = dto.rut ? normalizarRut(dto.rut) : null;
      if (dto.rut && !canonico) {
        throw new BadRequestException('Ese RUT no se puede leer');
      }
      datos.rut = canonico;
    }

    if (datos.account_type === 'cuenta_rut') {
      const base = datos.rut ?? null;
      if (!base) {
        throw new BadRequestException(
          'Para usar CuentaRUT hace falta el RUT de la persona',
        );
      }
      datos.account_number = base.split('-')[0];
      // La CuentaRUT es de BancoEstado y de nadie más.
      datos.bank_code = '012';
    }

    return datos;
  }

  // ------------------------------------------------------------------
  // CARGOS
  // ------------------------------------------------------------------

  findRoles(companyId: number, incluirInactivos = false) {
    return this.repo.findRoles(companyId, incluirInactivos);
  }

  createRole(companyId: number, name: string) {
    return this.repo.createRole(companyId, limpiarNombre(name));
  }

  updateRole(
    id: number,
    cambios: { name?: string; is_active?: boolean; list_price_fixed?: number | null },
    companyId: number,
  ) {
    const limpios = { ...cambios };
    if (limpios.name !== undefined) limpios.name = limpiarNombre(limpios.name);
    return this.repo.updateRole(id, limpios, companyId);
  }

  // ------------------------------------------------------------------
  // QUIÉN TRABAJA CADA DÍA
  // ------------------------------------------------------------------

  findStaff(companyId: number, quotationId: string) {
    return this.repo.findStaff(companyId, quotationId);
  }

  findStaffRange(companyId: number, desde: string, hasta: string) {
    return this.repo.findStaffRange(companyId, desde, hasta);
  }

  /**
   * Al poner a alguien en un día, el cargo y planta/freelance vienen POR
   * DEFECTO de su ficha, pero quedan guardados en el día — porque ahí se
   * pueden cambiar sin tocar a la persona.
   *
   * Y si es planta, la jornada es NULL: no cuesta un peso extra. El día
   * que un planta trabaje en su día libre se marca freelance en ESE día
   * y ahí sí se le paga.
   */
  async addStaff(dto: CreateEventStaffDto, companyId: number) {
    const persona = await this.repo.findOne(dto.person_id, companyId);
    const kind = dto.kind ?? persona.default_kind ?? 'freelance';
    return this.repo.addStaff({
      ...dto,
      quotation_id: dto.quotation_id ?? null,
      company_id: companyId,
      kind,
      role_id: dto.role_id ?? persona.default_role_id ?? null,
      amount: kind === 'planta' ? null : (dto.amount ?? null),
    });
  }

  updateStaff(id: number, dto: UpdateEventStaffDto, companyId: number) {
    const cambios: Record<string, unknown> = { ...dto };
    // Pasar a planta borra la jornada: deja de costar.
    if (dto.kind === 'planta') cambios.amount = null;
    return this.repo.updateStaff(id, cambios, companyId);
  }

  removeStaff(id: number, companyId: number) {
    return this.repo.removeStaff(id, companyId);
  }

  /**
   * Un cargo no se borra: se apaga.
   *
   * Si hay gente que lo tiene como cargo por defecto, borrarlo dejaría
   * esas fichas apuntando a la nada. Apagarlo lo saca de la lista para
   * elegir, pero no rompe nada de lo ya cargado.
   */
  async deactivateRole(id: number, companyId: number) {
    const cuantos = await this.repo.countPeopleWithRole(id, companyId);
    this.logger.info(`deactivateRole ${id}: lo usan ${cuantos} personas`);
    return this.repo.updateRole(id, { is_active: false }, companyId);
  }
}

