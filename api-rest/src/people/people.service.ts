import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CreatePersonDto } from './dto/create-person.dto';
import {
  CerrarFichaDto,
  CreateDayNoteDto,
  CreatePayrollDto,
  CreatePoolDto,
  CreateReviewDto,
  PagoDto,
  RepartirDto,
  UpdateDayNoteDto,
  UpdatePoolDto,
  UpsertSheetDto,
} from './dto/etapas.dto';
import type {
  CreateEventStaffDto,
  UpdateEventStaffDto,
} from './dto/event-staff.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { CreatePerson, UpdatePerson } from './interfaces/people.interfaces';
import { PeopleRepository } from './people.repository';
import { normalizarRut } from './utils/rut';

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
      this.logger.error(
        `No se pudo proyectar la planta de ${personId}: ${String(e)}`,
      );
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
    cambios: {
      name?: string;
      is_active?: boolean;
      list_price_fixed?: number | null;
    },
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
    // UN PLANTA QUE VA A UN EVENTO ES UN DÍA EXTRA (Felipe, 15-08): su
    // sueldo cubre su jornada, no esto. Ese día nace FREELANCE para que
    // se le pague aparte. Mover sus días desde su calendario es otra
    // cosa —ahí sigue siendo su jornada normal— y por eso la regla mira
    // si hay evento, no el día.
    const esDiaExtra =
      dto.quotation_id != null && persona.default_kind === 'planta';
    const kind =
      dto.kind ??
      (esDiaExtra ? 'freelance' : persona.default_kind) ??
      'freelance';
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

  async updateStaff(id: number, dto: UpdateEventStaffDto, companyId: number) {
    const cambios: Record<string, unknown> = { ...dto };
    // Pasar a planta borra la jornada: deja de costar.
    if (dto.kind === 'planta') cambios.amount = null;

    // SIN MONTO NO SE CONFIRMA (Felipe, 15-08). Una jornada confirmada
    // sin monto es justo la que después aparece en la nómina sin saber
    // cuánto pagarle — el problema que este módulo vino a resolver.
    // La planta en su jornada normal no lleva monto: su sueldo no se
    // carga al día, así que la regla es solo para lo que SÍ se paga.
    if (dto.status === 'confirmado') {
      const actual = await this.repo.findStaffPorId(id, companyId);
      const kind = dto.kind ?? actual.kind;
      const monto = dto.amount ?? actual.amount;
      if (kind !== 'planta' && !monto) {
        throw new BadRequestException(
          'Ponle el monto del día antes de confirmarla',
        );
      }
    }
    return this.repo.updateStaff(id, cambios, companyId);
  }

  removeStaff(id: number, companyId: number) {
    return this.repo.removeStaff(id, companyId);
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
    const hasta = diaMas(hoy, 365);

    const suyas = await this.repo.findDePersonaDesde(companyId, personId, hoy);
    const conEvento = new Set(
      suyas
        .filter((a) => a.quotation_id !== null)
        .map((a) => a.day.slice(0, 10)),
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
   * Proyecta el año de TODA la planta activa. La sábana lo llama UNA
   * vez al abrirse; desplazarse por los meses ya no carga nada.
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

  // ================= EL CICLO DE LA FICHA =================
  // armando → confirmado → trabajado → cerrada. "Cerrada" solo entra
  // por cerrarFicha(), que valida el candado de la plata.

  findSheets(companyId: number) {
    return this.repo.findSheets(companyId);
  }

  upsertSheet(dto: UpsertSheetDto, companyId: number) {
    return this.repo.upsertSheet(companyId, dto.quotation_id, {
      status: dto.status,
      closed_at: null,
    });
  }

  /**
   * EL CANDADO ES INTERNO (la lección del 24 de enero: $15.715 en el
   * aire con la casilla en verde): se revisa que LA PLATA repartida
   * sume el pozo, no que los porcentajes sumen 100. Si no cuadra, el
   * botón no se puede apretar — acá se rechaza, sin semáforos.
   */
  async cerrarFicha(dto: CerrarFichaDto, companyId: number) {
    // NO HAY PASOS PREVIOS (Felipe, 15-08): "el armado se hace en la
    // planificación; acá solo la gente que vino, lo que se le paga y la
    // propina". La liquidación es una sola pantalla, así que se cierra
    // directo — lo único que se valida es que la plata cuadre.
    const pools = (await this.repo.findPools(companyId)).filter(
      (p) => p.quotation_id === dto.quotation_id,
    );
    const sinRepartir = pools.filter(
      (p) =>
        Number(p.first_amount) + Number(p.second_amount) > 0 &&
        !p.distributed_at,
    );
    if (sinRepartir.length > 0) {
      throw new BadRequestException(
        'Hay un pozo de propina sin repartir: se reparte y recién ahí se cierra',
      );
    }
    const staff = await this.repo.findStaff(companyId, dto.quotation_id);
    const repartido = staff.reduce((t, a) => t + Number(a.tip_amount ?? 0), 0);
    const pozo = pools.reduce(
      (t, p) => t + Number(p.first_amount) + Number(p.second_amount),
      0,
    );
    if (Math.round(repartido) !== Math.round(pozo)) {
      throw new BadRequestException(
        `La plata repartida ($${repartido}) no suma el pozo ($${pozo})`,
      );
    }
    return this.repo.upsertSheet(companyId, dto.quotation_id, {
      status: 'cerrada',
      closed_at: new Date().toISOString(),
    });
  }

  // ================= LOS POZOS Y EL REPARTO =================

  findPools(companyId: number) {
    return this.repo.findPools(companyId);
  }

  createPool(dto: CreatePoolDto, companyId: number) {
    if (!dto.quotation_id && !dto.day) {
      throw new BadRequestException(
        'Un pozo es de un evento o de un día de la planta',
      );
    }
    return this.repo.createPool({
      company_id: companyId,
      quotation_id: dto.quotation_id ?? null,
      day: dto.day ?? null,
      area: dto.area ?? null,
      first_amount: dto.first_amount ?? 0,
      second_amount: dto.second_amount ?? 0,
    });
  }

  updatePool(id: number, dto: UpdatePoolDto, companyId: number) {
    return this.repo.updatePool(id, { ...dto }, companyId);
  }

  async removePool(id: number, companyId: number) {
    await this.repo.clearTips(id, companyId);
    return this.repo.removePool(id, companyId);
  }

  /**
   * EL REPARTO: por cargo según los porcentajes, y DENTRO del cargo
   * por horas trabajadas. Al peso y SIN SOBRANTES — el redondeo
   * reparte los pesos que faltan de a uno (en el Excel, Joker No 1
   * dejó $8 en el aire y 8 de 9 eventos descuadraban).
   *
   * Se puede volver a repartir mientras la ficha no esté cerrada y la
   * propina no haya caído en una nómina.
   */
  async repartir(poolId: number, dto: RepartirDto, companyId: number) {
    const pool = await this.repo.findPool(poolId, companyId);
    const pozo = Math.round(
      Number(pool.first_amount) + Number(pool.second_amount),
    );
    if (pozo <= 0) throw new BadRequestException('El pozo está en cero');

    const totalPct = dto.porcentajes.reduce((t, p) => t + p.pct, 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      throw new BadRequestException(
        `Los porcentajes suman ${totalPct}, no 100`,
      );
    }

    let filas: Awaited<ReturnType<typeof this.repo.findStaff>>;
    if (pool.quotation_id) {
      const sheet = await this.repo.findSheetByQuotation(
        companyId,
        pool.quotation_id,
      );
      if (sheet?.status === 'cerrada') {
        throw new BadRequestException('La ficha ya está cerrada');
      }
      filas = await this.repo.findStaff(companyId, pool.quotation_id);
    } else {
      filas = await this.repo.findPlantaDelDia(companyId, pool.day!);
    }
    if (filas.some((f) => f.tip_payroll_id !== null)) {
      throw new BadRequestException(
        'Hay propinas de este grupo ya liquidadas en una nómina',
      );
    }

    // El pozo por cargo (mayor resto), y dentro del cargo por horas.
    // QUIEN NO LLEVA PROPINA QUEDA FUERA (Felipe, 15-08). Medido en el
    // Excel: el 28 de septiembre trabajaron 10 y recibieron 4. Su
    // jornada se paga igual; lo que le toca al cargo se divide entre
    // los que sí llevan.
    filas = filas.filter((f) => !f.no_tip);

    const conPct = dto.porcentajes.filter((p) => p.pct > 0);
    const montosCargo = repartirAlPeso(
      pozo,
      conPct.map((p) => p.pct),
    );
    const asignado = new Map<number, number>();
    conPct.forEach((p, i) => {
      const delCargo = filas.filter(
        (f) => (f.role_id ?? null) === (p.role_id ?? null),
      );
      if (delCargo.length === 0) {
        throw new BadRequestException(
          `Hay un ${String(p.pct)}% asignado a un cargo sin nadie puesto`,
        );
      }
      const montos = repartirAlPeso(
        montosCargo[i],
        delCargo.map((f) =>
          minutosTrabajados(f.starts_at, f.ends_at, f.break_minutes),
        ),
      );
      delCargo.forEach((f, j) =>
        asignado.set(f.id, (asignado.get(f.id) ?? 0) + montos[j]),
      );
    });

    await this.repo.clearTips(poolId, companyId);
    for (const [id, monto] of asignado) {
      await this.repo.updateStaff(
        id,
        { tip_amount: monto, tip_pool_id: poolId },
        companyId,
      );
    }
    await this.repo.updatePool(
      poolId,
      { distributed_at: new Date().toISOString() },
      companyId,
    );
    const repartido = [...asignado.values()].reduce((t, m) => t + m, 0);
    this.logger.info(
      `repartir pozo ${poolId}: $${repartido} en ${asignado.size} filas`,
    );
    return { repartido, filas: asignado.size };
  }

  /**
   * UN DÍA SIN PROPINA TAMBIÉN SE LIQUIDA (Felipe, 15-08): si no se
   * pudiera marcar, los días flojos quedarían eternamente como
   * pendientes. Solo vale con el pozo en cero — si hay plata, se
   * reparte, no se salta.
   */
  async marcarSinPropina(poolId: number, companyId: number) {
    const pool = await this.repo.findPool(poolId, companyId);
    const pozo = Number(pool.first_amount) + Number(pool.second_amount);
    if (pozo > 0) {
      throw new BadRequestException(
        'Ese día tiene pozo: repártelo, no lo saltes',
      );
    }
    return this.repo.updatePool(
      poolId,
      { distributed_at: new Date().toISOString() },
      companyId,
    );
  }

  // ================= LAS ESTRELLAS =================

  /** El historial de pagos de una persona: sus jornadas y sus propinas,
   *  con el evento donde fueron y si ya se liquidaron. */
  findHistorial(companyId: number, personId: number) {
    return this.repo.findHistorialDePersona(companyId, personId);
  }

  findReviews(companyId: number, personId?: number) {
    return this.repo.findReviews(companyId, personId);
  }

  createReview(dto: CreateReviewDto, companyId: number) {
    if (!dto.stars && !dto.note) {
      throw new BadRequestException('Una evaluación lleva estrellas o nota');
    }
    return this.repo.createReview({ ...dto, company_id: companyId });
  }

  // ================= LA NÓMINA Y EL PAGO =================

  /**
   * La nómina NO es una semana: es un selector de qué se liquida.
   * Toma todo lo PENDIENTE que calce con el filtro (jornadas y
   * propinas por separado), lo marca, y dice qué dejó fuera (pozos
   * sin repartir). No bloquea: quien bloquea es el cierre de la ficha.
   */
  async createPayroll(dto: CreatePayrollDto, companyId: number) {
    const filtro = {
      hasta: dto.hasta,
      desde: dto.desde,
      quotationIds: dto.quotation_ids,
      dias: dto.dias,
    };
    const jornadasCrudas = await this.repo.jornadasPendientes(
      companyId,
      filtro,
    );
    const propinasCrudas = await this.repo.propinasPendientes(
      companyId,
      filtro,
    );

    // El filtro de fechas dice QUÉ MIRAR; estaLiquidado dice qué de eso
    // puede pagarse. Las dos listas se cruzan contra las mismas fichas
    // y los mismos días, así que se preguntan una sola vez.
    const candidatas = [...jornadasCrudas, ...propinasCrudas];
    const [cerradas, diasListos] = await Promise.all([
      this.repo.fichasCerradas(companyId, [
        ...new Set(
          candidatas.map((f) => f.quotation_id).filter((q): q is string => !!q),
        ),
      ]),
      this.repo.diasLiquidados(companyId, [
        ...new Set(
          candidatas
            .filter((f) => !f.quotation_id && f.day)
            .map((f) => String(f.day).slice(0, 10)),
        ),
      ]),
    ]);
    const jornadas = jornadasCrudas.filter((f) =>
      estaLiquidado(f, cerradas, diasListos),
    );
    const propinas = propinasCrudas.filter((f) =>
      estaLiquidado(f, cerradas, diasListos),
    );
    const sinLiquidar =
      jornadasCrudas.length -
      jornadas.length +
      (propinasCrudas.length - propinas.length);

    if (jornadas.length === 0 && propinas.length === 0) {
      throw new BadRequestException(
        sinLiquidar > 0
          ? `Con ese filtro no hay nada liquidado todavía: ${sinLiquidar} ${sinLiquidar === 1 ? 'jornada quedó' : 'jornadas quedaron'} esperando que se cierre su evento o su día`
          : 'No hay nada pendiente que liquidar con ese filtro',
      );
    }
    const payroll = await this.repo.createPayroll({
      company_id: companyId,
      label: dto.label,
    });
    await this.repo.stampRows(
      jornadas.map((j) => j.id),
      { payroll_id: payroll.id },
      companyId,
    );
    await this.repo.stampRows(
      propinas.map((p) => p.id),
      { tip_payroll_id: payroll.id },
      companyId,
    );
    const personIds = [
      ...new Set([...jornadas, ...propinas].map((r) => r.person_id)),
    ];
    await this.repo.insertPagos(
      personIds.map((person_id) => ({
        company_id: companyId,
        payroll_id: payroll.id,
        person_id,
      })),
    );
    const fuera = await this.repo.poolsSinRepartir(companyId, filtro);
    this.logger.info(
      `nomina ${payroll.id}: ${jornadas.length} jornadas + ${propinas.length} propinas, ${sinLiquidar} fuera por no estar liquidadas`,
    );
    return { ...payroll, personas: personIds.length, fuera, sinLiquidar };
  }

  findPayrolls(companyId: number) {
    return this.repo.findPayrolls(companyId);
  }

  async getPayroll(id: number, companyId: number) {
    const payroll = await this.repo.findPayroll(id, companyId);
    const { jornadas, propinas } = await this.repo.rowsDeNomina(id, companyId);
    const pagos = await this.repo.findPagos(id, companyId);
    return { ...payroll, jornadas, propinas, pagos };
  }

  /** "Ya la pagué" se marca EN EL MOMENTO, no después — por eso ahora
   *  existe "pendiente". Jornada y propina por separado. */
  marcarPago(payrollId: number, dto: PagoDto, companyId: number) {
    const cambios: Record<string, unknown> = {
      paid_at: new Date().toISOString(),
    };
    if (dto.jornada_paid !== undefined) cambios.jornada_paid = dto.jornada_paid;
    if (dto.propina_paid !== undefined) cambios.propina_paid = dto.propina_paid;
    return this.repo.upsertPago(companyId, payrollId, dto.person_id, cambios);
  }

  // ================= LAS NOTAS DEL DÍA =================

  findDayNotes(companyId: number, desde: string, hasta: string) {
    return this.repo.findDayNotes(companyId, desde, hasta);
  }

  createDayNote(dto: CreateDayNoteDto, companyId: number) {
    const texto = dto.text.trim();
    if (!texto) throw new BadRequestException('La nota viene vacía');
    return this.repo.createDayNote({
      company_id: companyId,
      day: dto.day,
      quotation_id: dto.quotation_id ?? null,
      text: texto,
    });
  }

  updateDayNote(id: number, dto: UpdateDayNoteDto, companyId: number) {
    const cambios: Record<string, unknown> = { ...dto };
    if (dto.text !== undefined) {
      const texto = dto.text.trim();
      if (!texto) throw new BadRequestException('La nota viene vacía');
      cambios.text = texto;
    }
    return this.repo.updateDayNote(id, cambios, companyId);
  }

  removeDayNote(id: number, companyId: number) {
    return this.repo.removeDayNote(id, companyId);
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
/**
 * A LA NÓMINA SOLO ENTRA LO LIQUIDADO (Felipe, 16-08).
 *
 * Antes bastaba con tener monto y no estar pagado, así que una jornada
 * de un evento a medio liquidar ya se iba a la nómina. Medido en
 * laboratorio ese día: de lo pendiente, $100.000 en 4 filas venían de
 * eventos SIN liquidar. La nómina es el destino de lo liquidado, no la
 * bandeja de todo lo que existe.
 *
 * Liquidado quiere decir dos cosas distintas según de dónde venga la
 * fila, y por eso no es una sola condición en la consulta:
 *  - de un evento  → su ficha de personal está cerrada;
 *  - de un día de restaurante → la propina de ese día ya se resolvió.
 */
export const estaLiquidado = (
  fila: { quotation_id?: string | null; day?: string | null },
  fichasCerradas: ReadonlySet<string>,
  diasLiquidados: ReadonlySet<string>,
) =>
  fila.quotation_id
    ? fichasCerradas.has(fila.quotation_id)
    : !!fila.day && diasLiquidados.has(String(fila.day).slice(0, 10));

/**
 * Reparte un total entero según pesos, SIN SOBRANTES: piso primero y
 * los pesos que faltan de a uno, a los restos más grandes. Si todos
 * los pesos son cero (horas desconocidas), reparte parejo.
 */
export const repartirAlPeso = (total: number, pesos: number[]): number[] => {
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
      escrito?.break_minutes ??
      suyo?.break ??
      persona.default_break_minutes ??
      60,
  };
};

/** El día siguiente (o el de N días más), sin pelear con los meses. */
const diaMas = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * El horario que le toca a una persona un día dado, bajando la
 * escalera: lo que venga escrito para ese día > su horario de ESE día
 * de la semana > su horario único de la ficha > el estándar de la casa
 * (09:00 a 19:00 con una hora de colación).
 */
