import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CerrarFichaDto,
  CreateDayNoteDto,
  UpdateDayNoteDto,
  CreatePayrollDto,
  CreatePoolDto,
  CreateReviewDto,
  PagoDto,
  RepartirDto,
  UpdatePoolDto,
  UpsertSheetDto,
} from './dto/etapas.dto';
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
    const creada = await this.repo.create({
      ...persona,
      company_id: companyId,
      name: limpiarNombre(dto.name),
      default_kind: persona.default_kind ?? 'freelance',
      status: persona.status ?? 'activa',
    } as CreatePerson);
    // Recién creada de planta: su año queda proyectado al tiro.
    await this.proyectarSiCorresponde(companyId, creada.id);
    return creada;
  }

  async update(id: number, dto: UpdatePersonDto, companyId: number) {
    const cambios = this.prepararDatos(dto);
    if (dto.name !== undefined) cambios.name = limpiarNombre(dto.name);

    // Al desbloquear se borra el motivo: si queda escrito, el día que
    // vuelvas a bloquear a esa persona aparece el motivo viejo y engaña.
    if (dto.status !== undefined && dto.status !== 'bloqueada') {
      cambios.blocked_reason = null;
    }
    const guardada = await this.repo.update(
      id,
      cambios as UpdatePerson,
      companyId,
    );
    // LA FICHA MANDA HACIA ADELANTE (Felipe, 15-08): cambiar sus días
    // libres o sus horarios re-proyecta el año. El pasado no se toca.
    await this.proyectarSiCorresponde(companyId, id);
    return guardada;
  }

  /** Proyecta sin tumbar el guardado si algo falla: lo que el usuario
   *  pidió fue guardar la ficha, y eso ya está hecho. */
  private async proyectarSiCorresponde(companyId: number, personId: number) {
    try {
      await this.proyectarPlanta(companyId, personId);
    } catch (e) {
      this.logger.error(`No se pudo proyectar la planta de ${personId}: ${String(e)}`);
    }
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
      // Explícito SIEMPRE (el 15-08 llegó nulo y la base lo rechazó), y
      // nace POR CONFIRMAR: "yo planifico y luego las personas
      // confirman" (Felipe). El check de la casilla lo confirma.
      status: dto.status ?? 'por_confirmar',
      // EL HORARIO VIENE PUESTO. La escalera (15-08): lo del día manda
      // sobre el del DÍA DE LA SEMANA, ese sobre el horario único de la
      // ficha, y al final el estándar de la casa. Solo se toca la
      // excepción.
      ...horarioDelDia(persona, dto.day, dto),
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
   * Proyecta el año de TODA la planta activa. La sábana lo llama UNA
   * vez al abrirse; desplazarse por los meses ya no carga nada
   * (Felipe, 15-08: "no estar cargando y metiéndole sobrecarga cada vez
   * que pincho y me desplazo").
   */
  async proyectarTodaLaPlanta(companyId: number) {
    const personas = (await this.repo.findAll(companyId)).filter(
      (p) => p.status === 'activa' && p.default_kind === 'planta',
    );
    let creadas = 0;
    for (const p of personas) {
      const r = await this.proyectarPlanta(companyId, p.id);
      creadas += r.creados;
    }
    return { personas: personas.length, creadas };
  }

  /**
   * LA JORNADA DE PLANTA SE PROYECTA A 12 MESES (Felipe, 15-08).
   *
   * Antes se cargaba de a poco, cada vez que uno se desplazaba por el
   * calendario — "no es mejor proyectarlo doce meses por una sola vez
   * cuando defino el horario de la gente". Ahora se proyecta al guardar
   * la ficha y queda listo el año entero.
   *
   * Las reglas, tal como quedaron acordadas:
   *  · La ficha manda hacia adelante: si cambian sus días libres o sus
   *    horarios, el futuro se corrige entero. El pasado NUNCA se toca —
   *    eso ya es historia que se pagó.
   *  · Su jornada de planta es lo primero: a un evento se le asigna
   *    gente que está disponible. Por eso, si un día futuro YA tiene un
   *    evento, ese día se SALTA — no se le pone planta encima, para que
   *    nunca aparezca duplicada. En el calendario queda a la vista.
   *  · Un ajuste de un día suelto es de ese día; al re-proyectar la
   *    ficha, el horario vuelve a ser el que ella dice.
   */
  async proyectarPlanta(companyId: number, personId: number) {
    const persona = await this.repo.findOne(personId, companyId);
    const hoy = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Santiago',
    });
    // Un año hacia adelante, contado en días para no pelear con los
    // meses de 28, 30 y 31.
    const hasta = diaMas(hoy, 365);

    const suyas = await this.repo.findDePersonaDesde(companyId, personId, hoy);
    const conEvento = new Set(
      suyas.filter((a) => a.quotation_id !== null).map((a) => a.day.slice(0, 10)),
    );
    const dePlanta = new Map(
      suyas
        .filter((a) => a.quotation_id === null)
        .map((a) => [a.day.slice(0, 10), a]),
    );

    // Si dejó de ser de planta o se apagó, se le limpia el futuro.
    const activa =
      persona.status === 'activa' && persona.default_kind === 'planta';

    let creados = 0;
    let corregidos = 0;
    let quitados = 0;

    for (let d = hoy; d <= hasta; d = diaMas(d, 1)) {
      const diaSemana = new Date(`${d}T00:00:00Z`).getUTCDay();
      const libre = persona.days_off?.includes(diaSemana) ?? false;
      const debeVenir = activa && !libre && !conEvento.has(d);
      const yaEsta = dePlanta.get(d);

      if (!debeVenir) {
        // Ese día ya no le toca: se quita, salvo que sea el día donde
        // hay un evento (ahí nunca hubo planta que quitar).
        if (yaEsta) {
          await this.repo.removeStaff(yaEsta.id, companyId);
          quitados += 1;
        }
        continue;
      }

      const horario = horarioDelDia(persona, d);
      if (!yaEsta) {
        await this.repo.addStaff({
          company_id: companyId,
          quotation_id: null,
          person_id: personId,
          day: d,
          kind: 'planta',
          role_id: persona.default_role_id ?? null,
          amount: null,
          status: 'confirmado',
          ...horario,
        });
        creados += 1;
      } else if (
        yaEsta.starts_at?.slice(0, 5) !== horario.starts_at ||
        yaEsta.ends_at?.slice(0, 5) !== horario.ends_at ||
        (yaEsta.break_minutes ?? 0) !== horario.break_minutes
      ) {
        await this.repo.updateStaff(yaEsta.id, horario, companyId);
        corregidos += 1;
      }
    }

    this.logger.info(
      `proyectarPlanta ${personId}: +${creados} ~${corregidos} -${quitados}`,
    );
    return { creados, corregidos, quitados };
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

const diaSiguiente = (iso: string) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * Reparte un total entero según pesos, SIN SOBRANTES: piso primero y
 * los pesos que faltan de a uno, a los restos más grandes. Si todos
 * los pesos son cero (horas desconocidas), reparte parejo.
 */
export const repartirAlPeso = (
  total: number,
  pesos: number[],
): number[] => {
  const suma = pesos.reduce((t, p) => t + p, 0);
  const efectivos = suma > 0 ? pesos : pesos.map(() => 1);
  const sumaEf = suma > 0 ? suma : pesos.length;
  const exactos = efectivos.map((p) => (total * p) / sumaEf);
  const pisos = exactos.map(Math.floor);
  let faltan = total - pisos.reduce((t, p) => t + p, 0);
  const orden = exactos
    .map((e, i) => ({ resto: e - pisos[i], i }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of orden) {
    if (faltan <= 0) break;
    pisos[i] += 1;
    faltan -= 1;
  }
  return pisos;
};

/** Minutos trabajados descontando colación; 9 h si no hay horario
 *  (el estándar de la casa). Gemelo del cálculo del frontend. */
const minutosTrabajados = (
  entrada: string | null,
  salida: string | null,
  colacion: number | null,
): number => {
  if (!entrada || !salida) return 540;
  const [eh, em] = entrada.split(':').map(Number);
  const [sh, sm] = salida.split(':').map(Number);
  if ([eh, em, sh, sm].some(Number.isNaN)) return 540;
  let minutos = sh * 60 + sm - (eh * 60 + em);
  if (minutos < 0) minutos += 24 * 60;
  minutos -= colacion || 0;
  return Math.max(0, minutos);
};

/**
 * El horario que le toca a una persona un día dado, bajando la
 * escalera: lo que venga escrito para ese día > su horario de ESE día
 * de la semana > su horario único de la ficha > el estándar de la casa
 * (09:00 a 19:00 con una hora de colación).
 */
export const horarioDelDia = (
  persona: {
    weekly_schedule?: Record<
      string,
      { in?: string; out?: string; break?: number }
    > | null;
    default_starts_at?: string | null;
    default_ends_at?: string | null;
    default_break_minutes?: number | null;
  },
  dia: string,
  escrito?: {
    starts_at?: string | null;
    ends_at?: string | null;
    break_minutes?: number | null;
  },
) => {
  const diaSemana = String(new Date(`${dia}T00:00:00Z`).getUTCDay());
  const suyo = persona.weekly_schedule?.[diaSemana];
  return {
    starts_at:
      escrito?.starts_at ??
      suyo?.in ??
      persona.default_starts_at?.slice(0, 5) ??
      '09:00',
    ends_at:
      escrito?.ends_at ??
      suyo?.out ??
      persona.default_ends_at?.slice(0, 5) ??
      '19:00',
    break_minutes:
      escrito?.break_minutes ?? suyo?.break ?? persona.default_break_minutes ?? 60,
  };
};

/** El día siguiente (o el de N días más), sin pelear con los meses. */
const diaMas = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
