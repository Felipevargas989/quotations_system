import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CreatePersonDto } from './dto/create-person.dto';
import {
  CerrarFichaDto,
  CreateDayNoteDto,
  CreatePayrollDto,
  CreatePoolDto,
  CreateReviewDto,
  PagoDto,
  PreviaPreliminarDto,
  ReabrirLiquidacionDto,
  RepartirDto,
  SeleccionPayrollDto,
  SoloPropinaDto,
  UpdateDayNoteDto,
  UpdatePoolDto,
  UpsertSheetDto,
} from './dto/etapas.dto';
import type {
  CreateEventStaffDto,
  UpdateEventStaffDto,
} from './dto/event-staff.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import type {
  EventStaff,
  EventStaffConPersona,
} from './entities/person.entity';
import { CreatePerson, UpdatePerson } from './interfaces/people.interfaces';
import { PeopleRepository } from './people.repository';
import {
  cambiosParaRevivir,
  faltaElMontoDelFreelance,
  horarioDelDia,
} from './utils/alta-de-jornada';
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

  /**
   * UNA PERSONA QUE YA TRABAJÓ NO SE BORRA (revisión del 16-08).
   *
   * La base ya lo impedía —event_staff la referencia con RESTRICT— pero
   * el error salía crudo: Postgres devolvía 23503, NestJS lo convertía
   * en un 500 y la pantalla mostraba un mensaje genérico. La persona no
   * se borraba nunca y nadie entendía por qué.
   *
   * Ahora se explica antes de intentarlo, y se dice qué hacer en su
   * lugar: su historial de pagos es de ella y del evento donde estuvo,
   * así que lo correcto es marcarla "no disponible", no borrarla.
   */
  async remove(id: number, companyId: number) {
    const jornadas = await this.repo.cuantasJornadas(companyId, id);
    if (jornadas > 0) {
      throw new BadRequestException(
        `No se puede borrar: ya trabajó ${jornadas} ${jornadas === 1 ? 'día' : 'días'} y ese historial es parte de los pagos. Márcala "no disponible" y deja de aparecer en la planificación.`,
      );
    }
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
  /**
   * Los ids que llegan en el cuerpo tienen que ser de la empresa que
   * pide. El person_id ya se comprobaba —findOne filtra por empresa— y
   * el resto entraba derecho a la base (revisión del 16-08). Los ids son
   * enteros correlativos: adivinar uno ajeno no cuesta nada.
   */
  private async sonDeLaEmpresa(
    companyId: number,
    ids: { quotation_id?: string | null; role_id?: number | null },
  ) {
    if (
      ids.quotation_id &&
      !(await this.repo.esCotizacionDeLaEmpresa(companyId, ids.quotation_id))
    ) {
      throw new NotFoundException('No existe ese evento');
    }
    if (
      ids.role_id != null &&
      !(await this.repo.esRecursoDeLaEmpresa(companyId, ids.role_id))
    ) {
      throw new NotFoundException('No existe ese cargo');
    }
  }

  async addStaff(dto: CreateEventStaffDto, companyId: number) {
    await this.sonDeLaEmpresa(companyId, dto);

    // ---- SILLA VACÍA (migración 84): cupo sin nombre todavía ----
    // La pone Gestión al planificar: cargo, día (o "por ubicar") y el
    // valor estimado. Cuenta para el costo; jamás para la nómina.
    if (dto.person_id == null) {
      if (!dto.quotation_id) {
        throw new BadRequestException(
          'El restaurante no lleva sillas vacías: ahí siempre hay un nombre',
        );
      }
      if (dto.role_id == null) {
        throw new BadRequestException('Una silla vacía necesita su cargo');
      }
      return this.repo.addStaff({
        company_id: companyId,
        quotation_id: dto.quotation_id,
        person_id: null,
        day: dto.day ?? null,
        role_id: dto.role_id,
        kind: 'freelance',
        status: 'por_confirmar',
        amount: dto.amount ?? null,
        starts_at: null,
        ends_at: null,
        break_minutes: null,
        notes: dto.notes ?? null,
      });
    }

    if (!dto.day) {
      throw new BadRequestException('Una persona se pone en un día concreto');
    }
    const persona = await this.repo.findOne(dto.person_id, companyId);

    // ---- SENTAR EN UNA SILLA (migración 84) ----
    // Si el plan dejó una silla vacía de ese cargo (idealmente del mismo
    // día; si no, una "por ubicar"), la persona se sienta AHÍ: el cupo
    // se consume en vez de inflarse. La silla conserva su valor estimado
    // salvo que venga uno acordado. Si no hay silla, se crea una más —
    // planificaste 3 y pusiste 4: ahora son 4, como debe ser.
    if (dto.quotation_id) {
      const silla = await this.repo.findSillaVacia(
        companyId,
        dto.quotation_id,
        dto.role_id ?? persona.default_role_id ?? null,
        dto.day,
      );
      if (silla) {
        const kindS =
          dto.kind ??
          (esJornadaExtra(persona, dto) ? 'freelance' : persona.default_kind);
        return this.repo.updateStaff(
          silla.id,
          {
            person_id: dto.person_id,
            day: dto.day,
            // El sello de llegada (migración 90): la silla es vieja,
            // pero la persona se sienta AHORA.
            puesto_en: new Date().toISOString(),
            kind: kindS,
            role_id: dto.role_id ?? silla.role_id ?? null,
            amount:
              kindS === 'planta' ? null : (dto.amount ?? silla.amount ?? null),
            status: dto.status ?? 'por_confirmar',
            ...horarioDelDia(persona, dto.day, dto),
          },
          companyId,
        );
      }
    }
    // LA PREGUNTA DEL DÍA EXTRA (Felipe, 04-09, capítulo 11): para el
    // restaurante, el TIPO del día fuera de patrón lo elige el usuario
    // en pantalla y viaja explícito en dto.kind. El respaldo automático
    // queda para los flujos que no preguntan (eventos, imán).
    const kind =
      dto.kind ??
      (esJornadaExtra(persona, dto) ? 'freelance' : persona.default_kind) ??
      'freelance';

    // La pregunta del día extra (04-09, capítulo 11): reglas en
    // utils/alta-de-jornada — el freelance elegido exige monto, y toda
    // alta del restaurante revive la fila dormida en vez de chocar.
    if (faltaElMontoDelFreelance(dto, persona)) {
      throw new BadRequestException(
        'Un día freelance de una persona de planta necesita su monto',
      );
    }
    if (!dto.quotation_id) {
      const dormida = await this.repo.findDormida(
        companyId,
        dto.person_id,
        dto.day,
      );
      if (dormida) {
        return this.repo.updateStaff(
          dormida.id,
          {
            ...cambiosParaRevivir({
              kind,
              ajuste: dto.ajuste,
              role_id: dto.role_id,
              roleDormida: dormida.role_id,
              amount: dto.amount,
              status: dto.status,
            }),
            ...horarioDelDia(persona, dto.day, dto),
          },
          companyId,
        );
      }
    }
    return this.repo.addStaff({
      ...dto,
      quotation_id: dto.quotation_id ?? null,
      company_id: companyId,
      puesto_en: new Date().toISOString(),
      kind,
      role_id: dto.role_id ?? persona.default_role_id ?? null,
      amount: kind === 'planta' ? null : (dto.amount ?? null),
      // Explícito SIEMPRE (el 15-08 llegó nulo y la base lo rechazó), y
      // nace POR CONFIRMAR: "yo planifico y luego las personas
      // confirman" (Felipe). El check de la casilla lo confirma.
      // SU JORNADA NACE CONFIRMADA; EL DÍA EXTRA, POR CONFIRMAR (Felipe,
      // 18-08): poner a alguien de planta en su día normal y su cargo no
      // es una oferta, es su turno — no hay nada que confirmar. Lo que
      // sí pasa por confirmación es el día extra: su día libre, otro
      // cargo, o un evento. Es la misma regla que decide si se paga.
      // Y EL CAMBIO DE DÍA TAMBIÉN NACE CONFIRMADO (Felipe, 24-08,
      // migración 89): es su jornada normal movida de día, no una
      // oferta — "aún me sale por confirmar".
      status:
        dto.status ??
        (persona.default_kind === 'planta' &&
        (dto.ajuste === 'trabaja' || !esJornadaExtra(persona, dto))
          ? 'confirmado'
          : 'por_confirmar'),
      // EL HORARIO VIENE PUESTO. La escalera (15-08): lo del día manda
      // sobre el del DÍA DE LA SEMANA, ese sobre el horario único de la
      // ficha, y al final el estándar de la casa. Solo se toca la
      // excepción.
      ...horarioDelDia(persona, dto.day, dto),
    });
  }

  async updateStaff(id: number, dto: UpdateEventStaffDto, companyId: number) {
    const cambios: Record<string, unknown> = { ...dto };
    // Pasar a planta borra la jornada: deja de costar. Salvo que en el
    // mismo gesto venga un monto: esa es la ASIGNACIÓN EXTRA de la
    // planta (Felipe, 18-08), que sí se paga.
    if (dto.kind === 'planta' && dto.amount === undefined) {
      cambios.amount = null;
    }

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

  /**
   * SACAR A ALGUIEN NO PUEDE DEJAR PLATA EN EL AIRE (revisión del 16-08).
   *
   * En los eventos el descuadre lo atajaba el cierre de la ficha, que
   * compara lo repartido contra el pozo. En los días de restaurante no
   * había nada equivalente: se borraba la fila con su parte de la
   * propina, el día seguía marcado como liquidado, y esa plata del
   * cliente no se la llevaba nadie ni aparecía en ninguna pantalla.
   *
   * Ahora, sacar a alguien que ya tenía propina DESHACE el reparto del
   * día: el pozo vuelve a estar sin repartir y el día reaparece para
   * repartirlo de nuevo entre los que sí estuvieron. Lo que ya se fue a
   * una nómina no se toca: eso ya es un pago.
   */
  /**
   * `liberar` (migración 84): en un evento, sacar a la persona desde la
   * planificación NO borra la fila — la deja como silla vacía otra vez,
   * con su cargo, su día y su valor. El cupo sigue existiendo: se saca
   * al de la casilla, no la necesidad. Borrar de verdad (bajar el plan,
   * o "no se presentó" en la liquidación) sigue siendo el borrado.
   */
  async removeStaff(id: number, companyId: number, liberar = false) {
    const fila = await this.repo.findStaffRow(id, companyId);
    if (!fila) throw new NotFoundException('Esa asignación no existe');

    if (fila.payroll_id != null || fila.tip_payroll_id != null) {
      throw new BadRequestException(
        'Esa jornada ya está en una nómina: no se puede sacar',
      );
    }

    const teniaPropina = Number(fila.tip_amount ?? 0) > 0;
    const pozoId = fila.tip_pool_id ?? null;

    if (liberar && fila.quotation_id && fila.person_id != null) {
      await this.repo.updateStaff(
        id,
        {
          person_id: null,
          kind: 'freelance',
          status: 'por_confirmar',
          starts_at: null,
          ends_at: null,
          break_minutes: null,
          tip_amount: null,
          tip_pool_id: null,
        },
        companyId,
      );
    } else {
      await this.repo.removeStaff(id, companyId);
    }

    if (teniaPropina && pozoId) {
      await this.repo.clearTips(pozoId, companyId);
      await this.repo.updatePool(pozoId, { distributed_at: null }, companyId);
      this.logger.info(
        `sacar ${id}: tenía propina, el pozo ${pozoId} vuelve a repartirse`,
      );
    }

    // SI SE VA DEL EVENTO, SE VA DEL POZO DEL DÍA (24-08): su fila
    // solo-de-propina era por haber venido. Se borra, y si ya tenía
    // propina del día, ese pozo vuelve a repartirse.
    if (fila.quotation_id && fila.person_id != null) {
      const solo = (
        await this.repo.findPlantaDelDia(companyId, String(fila.day))
      ).find((f) => f.solo_propina && f.person_id === fila.person_id);
      if (solo && solo.tip_payroll_id == null) {
        const pozoDelDia = solo.tip_pool_id ?? null;
        const conPropina = Number(solo.tip_amount ?? 0) > 0;
        await this.repo.removeStaff(solo.id, companyId);
        if (conPropina && pozoDelDia) {
          await this.repo.clearTips(pozoDelDia, companyId);
          await this.repo.updatePool(
            pozoDelDia,
            { distributed_at: null },
            companyId,
          );
        }
        this.logger.info(
          `sacar ${id}: se va del evento, fuera también del pozo del día`,
        );
      }
    }
    return { id };
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
      suyas.filter(laMandaronAUnEvento).map((a) => a.day.slice(0, 10)),
    );
    const dePlanta = new Map(
      suyas
        .filter((a) => a.quotation_id === null)
        .map((a) => [a.day.slice(0, 10), a]),
    );

    // Si dejó de ser de planta o se apagó, se le limpia el futuro — pero
    // solo lo que la propia proyección haya puesto (ver
    // laPuedeQuitarLaProyeccion).
    const activa =
      persona.status === 'activa' && persona.default_kind === 'planta';

    let corregidos = 0;
    // EN LOTE (Felipe, 18-08: "se demora como 12 segundos en cerrar").
    // Un año son ~260 jornadas; crearlas de a una eran 260 viajes a la
    // base. Se juntan y van en uno solo. Las correcciones de horario
    // siguen de a una porque son pocas y cada una es distinta.
    const porCrear: Record<string, unknown>[] = [];
    const porQuitar: number[] = [];

    for (let d = hoy; d <= hasta; d = diaMas(d, 1)) {
      const diaSemana = new Date(`${d}T00:00:00Z`).getUTCDay();
      const libre = persona.days_off?.includes(diaSemana) ?? false;
      const debeVenir = activa && !libre && !conEvento.has(d);
      const yaEsta = dePlanta.get(d);

      // EL CAMBIO DE DÍA ES SAGRADO (Felipe, 24-08, migración 89): un
      // día agregado a mano ('trabaja') no se borra, y un día quitado
      // ('descansa') no se recrea ni se corrige. La proyección pasa de
      // largo en las dos direcciones.
      if (yaEsta?.ajuste) continue;

      if (!debeVenir) {
        // Solo se quita lo que puso la máquina: lo puesto a mano y lo
        // que ya tiene plata se queda donde está.
        if (yaEsta && laPuedeQuitarLaProyeccion(yaEsta)) {
          porQuitar.push(yaEsta.id);
        }
        continue;
      }

      const horario = horarioDelDia(persona, d);
      // EL CARGO DE LA FICHA MANDA EN LOS DÍAS QUE PUSO LA MÁQUINA
      // (Felipe, 18-08: cambió a Camila de Cocina a Administrador y sus
      // 260 días siguieron en Cocina). Solo se corrige lo que la
      // proyección puede tocar — sin plata ni nómina — igual que el
      // horario. Un cargo puesto a mano ese día (planta de garzón un
      // sábado) es freelance y no pasa por acá.
      const cargoFicha = persona.default_role_id ?? null;
      const cargoDistinto =
        yaEsta != null &&
        yaEsta.kind === 'planta' &&
        (yaEsta.role_id ?? null) !== cargoFicha;
      if (!yaEsta) {
        porCrear.push({
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
      } else if (
        // Tampoco se le corrige el horario a una fila con plata: la
        // propina se reparte POR HORAS, así que moverle la hora por
        // detrás le cambiaría el monto a alguien que ya cobró.
        laPuedeQuitarLaProyeccion(yaEsta) &&
        (cargoDistinto ||
          yaEsta.starts_at?.slice(0, 5) !== horario.starts_at ||
          yaEsta.ends_at?.slice(0, 5) !== horario.ends_at ||
          (yaEsta.break_minutes ?? 0) !== horario.break_minutes)
      ) {
        await this.repo.updateStaff(
          yaEsta.id,
          { ...horario, ...(cargoDistinto ? { role_id: cargoFicha } : {}) },
          companyId,
        );
        corregidos += 1;
      }
    }

    const [creados, quitados] = await Promise.all([
      this.repo.addStaffEnLote(porCrear),
      this.repo.removeStaffEnLote(porQuitar, companyId),
    ]);

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
    // EN PARALELO, no en fila india (Felipe, 18-08: la sábana tardaba
    // 3,1 segundos en abrir, medido en los logs de producción). Cada persona proyecta lo suyo — filas
    // propias, sin cruce entre ellas — así que pueden ir todas a la vez:
    // el total tarda lo que la más lenta, no la suma de todas.
    const resultados = await Promise.all(
      personas.map((p) => this.proyectarPlanta(companyId, p.id)),
    );
    const creadas = resultados.reduce((t, r) => t + r.creados, 0);
    return { personas: personas.length, creadas };
  }

  // ================= EL CICLO DE LA FICHA =================
  // armando → confirmado → trabajado → cerrada. "Cerrada" solo entra
  // por cerrarFicha(), que valida el candado de la plata.

  findSheets(companyId: number) {
    return this.repo.findSheets(companyId);
  }

  /**
   * LA PLANTA QUE TRABAJÓ ESOS DÍAS ENTRA AL EVENTO (Felipe, 18-08).
   *
   * "Puede pasar que la propina que deje un evento la repartamos con el
   * personal de planta, o que le demos una asignación de diez o veinte
   * mil a cada persona de planta." Y como en el restaurante: aparecen
   * todos, y se marca "sin propina" a quien no.
   *
   * Cada persona de planta con turno de restaurante en los días del
   * evento recibe una fila EN EL EVENTO: su cargo, su horario del día,
   * planta (su sueldo cubre la jornada), monto en cero — la casilla de
   * asignación extra— y con propina. Su turno de restaurante no se
   * toca: son dos pozos distintos. Quien ya está en el evento por
   * Planificación no se duplica. Idempotente: se puede llamar mil veces.
   */
  async traerPlantaAlEvento(quotationId: string, companyId: number) {
    await this.sonDeLaEmpresa(companyId, { quotation_id: quotationId });
    const dias = await this.repo.diasDeEvento(companyId, quotationId);
    if (dias.length === 0) return { traidos: 0 };
    const [planta, yaEnEvento] = await Promise.all([
      this.repo.plantaEnDias(companyId, dias),
      this.repo.findStaff(companyId, quotationId),
    ]);
    const ocupado = new Set(
      yaEnEvento
        .filter((f) => f.person_id != null)
        .map((f) => `${String(f.person_id)}|${String(f.day).slice(0, 10)}`),
    );
    const nuevas = planta
      .filter(
        (t) =>
          !ocupado.has(`${String(t.person_id)}|${String(t.day).slice(0, 10)}`),
      )
      .map((t) => ({
        company_id: companyId,
        quotation_id: quotationId,
        person_id: t.person_id,
        day: String(t.day).slice(0, 10),
        role_id: t.role_id ?? null,
        kind: 'planta',
        status: 'confirmado',
        amount: null, // la asignación extra, si la hay, se escribe acá
        starts_at: t.starts_at,
        ends_at: t.ends_at,
        break_minutes: t.break_minutes,
      }));
    const traidos = await this.repo.addStaffEnLote(nuevas);
    this.logger.info(`traerPlantaAlEvento ${quotationId}: +${traidos}`);
    return { traidos };
  }

  async upsertSheet(dto: UpsertSheetDto, companyId: number) {
    await this.sonDeLaEmpresa(companyId, dto);
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
    await this.sonDeLaEmpresa(companyId, dto);
    // Las sillas que quedaron vacías se van: no se contrató a nadie para
    // ese cupo y el costo del evento converge a lo real (migración 84).
    const vacias = await this.repo.deleteSillasVacias(
      companyId,
      dto.quotation_id,
    );
    if (vacias > 0) {
      this.logger.info(
        `cerrarFicha ${dto.quotation_id}: ${vacias} sillas vacías retiradas`,
      );
    }
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

  /** El costo de personal por evento y cargo, desde las sillas. */
  /** Lo pagado al equipo por mes (flujo de caja del panel). */
  pagadoDePersonalPorMes(companyId: number) {
    return this.repo.pagadoDePersonalPorMes(companyId);
  }

  costoPersonal(companyId: number) {
    return this.repo.costoPersonalPorEvento(companyId);
  }

  /** Desde cuándo hay días de restaurante: el piso de la ventana. */
  diaMasViejoDeRestaurante(companyId: number) {
    return this.repo.diaMasViejoDeRestaurante(companyId);
  }

  findPools(companyId: number) {
    return this.repo.findPools(companyId);
  }

  /**
   * UN EVENTO O UN DÍA TIENE UN SOLO POZO (migración 83). Si ya hay uno,
   * se devuelve ese en vez de crear otro: los pozos de sobra quedaban
   * invisibles en la pantalla y trababan el cierre de la ficha para
   * siempre. Pedirlo dos veces ahora es inofensivo.
   */
  async createPool(dto: CreatePoolDto, companyId: number) {
    await this.sonDeLaEmpresa(companyId, dto);
    if (!dto.quotation_id && !dto.day) {
      throw new BadRequestException(
        'Un pozo es de un evento o de un día de la planta',
      );
    }
    const existente = await this.repo.findPoolDe(companyId, {
      quotation_id: dto.quotation_id ?? null,
      day: dto.day ?? null,
    });
    if (existente) return existente;

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
   * LOS GRÁFICOS DEL HISTÓRICO (Felipe, 24-08): el mensual de barras
   * (jornadas vs propinas ya en nómina), el top de personas, y la
   * propina promedio por día de restaurante contando SOLO los días que
   * tuvieron propina ("tiene que considerar solo los días que hay
   * propinas").
   */
  async graficosHistorico(companyId: number) {
    const hoy = new Date().toISOString().slice(0, 10);
    const desde = mesesAtras(hoy, 11);
    const [filas, pozos] = await Promise.all([
      this.repo.filasEnNominaDesde(companyId, `${desde}-01`),
      this.repo.findPools(companyId),
    ]);
    return armarGraficosHistorico(filas, pozos, hoy);
  }

  /**
   * La fila solo-de-propina de UN invitado, creada o corregida desde la
   * tabla del día: ahí viven su "extra" (asignación optativa por las
   * mesas que atendió) y su "sin propina". El horario viene del evento.
   */
  async soloPropinaDelDia(dto: SoloPropinaDto, companyId: number) {
    const evento = await this.repo.findStaffPorId(
      dto.evento_staff_id,
      companyId,
    );
    if (!evento || !evento.quotation_id || evento.person_id == null) {
      throw new BadRequestException('Esa no es una jornada de evento');
    }
    const day = String(evento.day).slice(0, 10);
    const cambios: Record<string, unknown> = {};
    if (dto.amount !== undefined) cambios.amount = dto.amount;
    if (dto.no_tip !== undefined) cambios.no_tip = dto.no_tip;

    const ya = (await this.repo.findPlantaDelDia(companyId, day)).find(
      (f) => f.solo_propina && f.person_id === evento.person_id,
    );
    if (ya) {
      await this.repo.updateStaff(ya.id, cambios, companyId);
      return { id: ya.id };
    }
    await this.repo.addStaffEnLote([
      {
        company_id: companyId,
        quotation_id: null,
        person_id: evento.person_id,
        day,
        kind: 'freelance',
        role_id: evento.role_id ?? null,
        starts_at: evento.starts_at,
        ends_at: evento.ends_at,
        break_minutes: evento.break_minutes,
        amount: null,
        status: 'confirmado',
        solo_propina: true,
        ...cambios,
      },
    ]);
    return { id: null };
  }

  /**
   * LOS INVITADOS DEL EVENTO AL POZO DEL DÍA (Felipe, 24-08): "un
   * garzón que viene a un evento, si llegan un par de mesas, puede
   * atenderlas — son dos propinas distintas". La planificación no se
   * toca (un turno, una jornada, un calendario); al repartir el día,
   * la gente del evento aparece EN LA MISMA TABLA del día y entra al
   * pozo POR DEFECTO (se excluye con "sin propina") vía una fila
   * SOLO-DE-PROPINA: mismo horario del evento, sin pago de jornada
   * (salvo el extra optativo), invisible en planificación.
   *
   * Idempotente: volver a repartir con otra selección crea las que
   * falten y borra las que sobren (nunca una con propina ya en nómina).
   */
  /** Devuelve la lista del día lista para repartir cuando nada
   *  estructural cambió (nada creado ni borrado): se ahorra la segunda
   *  lectura (25-08). NULL = hay que volver a leer. */
  private async sincronizarInvitados(
    day: string,
    invitados: number[],
    companyId: number,
  ): Promise<EventStaffConPersona[] | null> {
    const delDia = await this.repo.findPlantaDelDia(companyId, day);
    const existentes = delDia.filter((f) => f.solo_propina);

    // EN PARALELO (Felipe, 25-08: "se demora mucho el cálculo de
    // propina"): eran viajes a la base uno tras otro.
    const filasTraidas = await Promise.all(
      invitados.map((id) => this.repo.findStaffPorId(id, companyId)),
    );
    const traidos = new Map<number, EventStaff>();
    for (const fila of filasTraidas) {
      if (!fila || !fila.quotation_id || fila.person_id == null) {
        throw new BadRequestException(
          'Un invitado no es una jornada de evento válida',
        );
      }
      if (String(fila.day).slice(0, 10) !== day) {
        throw new BadRequestException(
          'Un invitado no trabajó el día de este pozo',
        );
      }
      traidos.set(fila.person_id, fila);
    }

    // CINTURÓN (24-08, el 14-08 de la #423): la ficha trae a la planta
    // al evento (traer-planta), pero esa gente YA está en el pozo por
    // su jornada de restaurante — invitarla la repartiría doble. Quien
    // tiene jornada de restaurante ese día no puede ser invitado.
    const enLaPlanta = new Set(
      delDia.filter((f) => !f.solo_propina).map((f) => f.person_id),
    );
    for (const personId of [...traidos.keys()]) {
      if (enLaPlanta.has(personId)) traidos.delete(personId);
    }

    const sobran = existentes.filter(
      (f) => f.person_id != null && !traidos.has(f.person_id),
    );
    const pagada = sobran.find((f) => f.tip_payroll_id != null);
    if (pagada) {
      throw new BadRequestException(
        'Hay un invitado con propina ya en nómina: no se puede sacar',
      );
    }
    await this.repo.removeStaffEnLote(
      sobran.map((f) => f.id),
      companyId,
    );

    const porCrear: Record<string, unknown>[] = [];
    const correcciones: Promise<unknown>[] = [];
    for (const [personId, evento] of traidos) {
      const ya = existentes.find((f) => f.person_id === personId);
      const horario = {
        starts_at: evento.starts_at,
        ends_at: evento.ends_at,
        break_minutes: evento.break_minutes,
        role_id: evento.role_id ?? null,
      };
      if (ya) {
        // El horario manda el del evento: es el mismo turno.
        correcciones.push(this.repo.updateStaff(ya.id, horario, companyId));
      } else {
        porCrear.push({
          company_id: companyId,
          quotation_id: null,
          person_id: personId,
          day,
          kind: 'freelance',
          amount: null,
          status: 'confirmado',
          solo_propina: true,
          ...horario,
        });
      }
    }
    await Promise.all(correcciones);
    await this.repo.addStaffEnLote(porCrear);

    if (sobran.length === 0 && porCrear.length === 0) {
      // Nada nació ni murió: la lista leída sirve, con los horarios de
      // los invitados corregidos en memoria (lo mismo que se escribió).
      for (const f of delDia) {
        if (!f.solo_propina || f.person_id == null) continue;
        const evento = traidos.get(f.person_id);
        if (!evento) continue;
        f.starts_at = evento.starts_at;
        f.ends_at = evento.ends_at;
        f.break_minutes = evento.break_minutes;
        f.role_id = evento.role_id ?? null;
      }
      return delDia;
    }
    return null;
  }

  /**
   * EL REPARTO POR PUNTOS (Felipe, 21-08). El porcentaje de un cargo es
   * EL VALOR DE SU HORA, no su tajada del pozo: cada fila junta puntos
   * (minutos trabajados × % de su cargo) y el pozo se reparte entre los
   * puntos de todos. Mismas horas y mismo cargo = misma propina, sean
   * 1 o 10 en el cargo. Antes se partía la plata por cargo y recién ahí
   * se miraban las horas; en la #423 (Joker) cocina 45 / garzón 45
   * pagaba $767 y $712 la hora porque los garzones sumaban más horas.
   * "Es lo más defendible y refleja mejor el espíritu de cómo queremos
   * repartir esto."
   *
   * La pantalla no cambia: los mismos porcentajes, sumando 100, en el
   * mismo lugar ("es más familiar que hablar de puntos").
   *
   * Al peso y SIN SOBRANTES — el redondeo reparte los pesos que faltan
   * de a uno (en el Excel, Joker No 1 dejó $8 en el aire y 8 de 9
   * eventos descuadraban).
   *
   * Se puede volver a repartir mientras la ficha no esté cerrada y la
   * propina no haya caído en una nómina.
   */
  async repartir(poolId: number, dto: RepartirDto, companyId: number) {
    // El monto puede venir en el mismo viaje (25-08): un request menos.
    if (dto.monto != null) {
      await this.repo.updatePool(
        poolId,
        { first_amount: Math.round(dto.monto), second_amount: 0 },
        companyId,
      );
    }
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
      const listas = await this.sincronizarInvitados(
        pool.day!,
        dto.invitados ?? [],
        companyId,
      );
      filas =
        listas ?? (await this.repo.findPlantaDelDia(companyId, pool.day!));
    }
    if (filas.some((f) => f.tip_payroll_id !== null)) {
      throw new BadRequestException(
        'Hay propinas de este grupo ya liquidadas en una nómina',
      );
    }

    // QUIEN NO LLEVA PROPINA QUEDA FUERA (Felipe, 15-08). Medido en el
    // Excel: el 28 de septiembre trabajaron 10 y recibieron 4. Su
    // jornada se paga igual; sus horas no juntan puntos.
    filas = filas.filter((f) => !f.no_tip && f.person_id != null);

    const asignado = repartirPorPuntos(pozo, filas, dto.porcentajes);

    await this.repo.clearTips(poolId, companyId);
    // EN PARALELO (25-08): con nueve personas eran nueve viajes en fila.
    await Promise.all(
      [...asignado].map(([id, monto]) =>
        this.repo.updateStaff(
          id,
          { tip_amount: monto, tip_pool_id: poolId },
          companyId,
        ),
      ),
    );
    // LOS PORCENTAJES SE GUARDAN (21-08). Antes la pantalla los
    // deducía de cuánto se llevó cada cargo; con puntos esa cuenta ya
    // no devuelve lo que se escribió (45/45/10 se leería 45,5/49/5,4).
    await this.repo.updatePool(
      poolId,
      {
        distributed_at: new Date().toISOString(),
        porcentajes: dto.porcentajes.map((p) => ({
          role_id: p.role_id ?? null,
          pct: p.pct,
        })),
      },
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

  async createReview(dto: CreateReviewDto, companyId: number) {
    if (!dto.stars && !dto.note) {
      throw new BadRequestException('Una evaluación lleva estrellas o nota');
    }
    // La persona y el evento tienen que ser de quien evalúa.
    await this.repo.findOne(dto.person_id, companyId);
    await this.sonDeLaEmpresa(companyId, dto);
    return this.repo.createReview({ ...dto, company_id: companyId });
  }

  // ================= LA NÓMINA Y EL PAGO =================

  /**
   * LAS LIQUIDACIONES POR PAGAR (Felipe, 16-08).
   *
   * Cada evento liquidado y cada día de restaurante liquidado que
   * todavía no entró a ninguna nómina, con su gente y su plata. Es la
   * lista que se marca para armar una nómina: se elige por liquidación,
   * no por rango de fechas, porque la semana del restaurante y los
   * eventos de esa semana caen en las mismas fechas.
   *
   * Devuelve solo el identificador del evento: el nombre del cliente lo
   * pone la pantalla, que ya tiene el catálogo de eventos cargado.
   */
  /**
   * REABRIR UNA LIQUIDACIÓN (Felipe, 18-08): "que elimine la
   * liquidación por pagar y la regrese a liquidaciones para liquidarlo
   * otra vez (volver a repartir propina o ajustar pago por jornada)".
   *
   * Un evento vuelve de ficha cerrada a "trabajado"; un día de
   * restaurante vuelve a pozo sin repartir. Lo repartido queda escrito
   * en las filas hasta que se reparta de nuevo. REGLA DE FIERRO: solo
   * si nada de esa liquidación entró ya a una nómina — lo pagado no se
   * deshace; se corrige en la nómina siguiente.
   */
  async reabrirLiquidacion(dto: ReabrirLiquidacionDto, companyId: number) {
    if (!dto.quotation_id && !dto.day) {
      throw new BadRequestException('Falta el evento o el día a reabrir');
    }
    if (dto.quotation_id) {
      await this.sonDeLaEmpresa(companyId, { quotation_id: dto.quotation_id });
    }
    if (await this.repo.hayPagosEn(companyId, dto)) {
      throw new BadRequestException(
        'Ya hay pagos de esta liquidación en una nómina: no se puede reabrir. Lo que falte se ajusta en la nómina siguiente.',
      );
    }
    if (dto.quotation_id) {
      await this.repo.upsertSheet(companyId, dto.quotation_id, {
        status: 'trabajado',
        closed_at: null,
      });
      this.logger.info(`reabrirLiquidacion evento ${dto.quotation_id}`);
      return { reabierto: 'evento' as const, quotation_id: dto.quotation_id };
    }
    await this.repo.desrepartirPozoDelDia(companyId, dto.day!);
    this.logger.info(`reabrirLiquidacion dia ${dto.day!}`);
    return { reabierto: 'dia' as const, day: dto.day! };
  }

  async liquidacionesPendientes(companyId: number) {
    const filtro = {};
    const [jornadas, propinas] = await Promise.all([
      this.repo.jornadasPendientes(companyId, filtro),
      this.repo.propinasPendientes(companyId, filtro),
    ]);
    const candidatas = [...jornadas, ...propinas];
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

    const grupos = new Map<
      string,
      {
        tipo: 'evento' | 'dia';
        quotation_id: string | null;
        day: string | null;
        personas: Set<number>;
        sinRut: Map<number, string>;
        jornadas: number;
        propinas: number;
      }
    >();
    const meter = (
      fila: (typeof candidatas)[number],
      cuanto: number,
      cual: 'jornadas' | 'propinas',
    ) => {
      if (!estaLiquidado(fila, cerradas, diasListos)) return;
      const dia = fila.day ? String(fila.day).slice(0, 10) : null;
      const clave = fila.quotation_id ?? `dia:${dia ?? ''}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          tipo: fila.quotation_id ? 'evento' : 'dia',
          quotation_id: fila.quotation_id ?? null,
          day: fila.quotation_id ? null : dia,
          personas: new Set(),
          sinRut: new Map(),
          jornadas: 0,
          propinas: 0,
        });
      }
      const g = grupos.get(clave)!;
      g.personas.add(fila.person_id);
      // SIN RUT NO SE PUEDE SUBIR AL BANCO (Felipe, 16-08), así que la
      // pantalla tiene que poder decir a quién le falta — por nombre, no
      // "hay alguien sin RUT".
      const rut = (fila.people?.rut ?? '').trim();
      if (!rut) g.sinRut.set(fila.person_id, fila.people?.name ?? 'Sin nombre');
      g[cual] += cuanto;
    };
    for (const j of jornadas) meter(j, Number(j.amount ?? 0), 'jornadas');
    for (const t of propinas) meter(t, Number(t.tip_amount ?? 0), 'propinas');

    return [...grupos.values()]
      .map((g) => ({
        tipo: g.tipo,
        quotation_id: g.quotation_id,
        day: g.day,
        personas: g.personas.size,
        sin_rut: [...g.sinRut.values()],
        jornadas: g.jornadas,
        propinas: g.propinas,
        total: g.jornadas + g.propinas,
      }))
      .sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''));
  }

  /**
   * La nómina NO es una semana: es un selector de qué se liquida.
   * Toma todo lo PENDIENTE que calce con el filtro (jornadas y
   * propinas por separado), lo marca, y dice qué dejó fuera (pozos
   * sin repartir). No bloquea: quien bloquea es el cierre de la ficha.
   */
  /**
   * Lo liquidado que calza con la selección, listo para consolidar.
   * Vive aparte porque lo usan DOS caminos que no pueden diferir: la
   * vista previa que uno revisa antes de generar, y la nómina que se
   * genera. Si fueran dos consultas parecidas, un día mostrarían
   * distinto de lo que pagan.
   */
  private async reunirLiquidado(dto: SeleccionPayrollDto, companyId: number) {
    const filtro = {
      hasta: dto.hasta,
      desde: dto.desde,
      quotationIds: dto.quotation_ids,
      dias: dto.dias,
    };
    // EVENTOS Y DÍAS EN LA MISMA NÓMINA (Felipe, 16-08): se seleccionan
    // "estas liquidaciones", y una semana normal trae eventos Y días de
    // restaurante. Como cada fila es de un evento O de un día, las dos
    // consultas no se pisan: se piden por separado y se suman.
    const traer = (f: Partial<typeof filtro>) =>
      Promise.all([
        this.repo.jornadasPendientes(companyId, f),
        this.repo.propinasPendientes(companyId, f),
      ]);
    const mezcla = !!dto.dias?.length && !!dto.quotation_ids?.length;
    const [deDias, elResto] = await Promise.all([
      mezcla
        ? traer({ dias: dto.dias })
        : Promise.resolve([[], []] as [
            EventStaffConPersona[],
            EventStaffConPersona[],
          ]),
      traer(mezcla ? { quotationIds: dto.quotation_ids } : filtro),
    ]);
    const jornadasCrudas = [...deDias[0], ...elResto[0]];
    const propinasCrudas = [...deDias[1], ...elResto[1]];

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
    return { jornadas, propinas, sinLiquidar };
  }

  /**
   * LA REVISIÓN ANTES DE GENERAR (Felipe, 16-08): "igual es bueno poder
   * ver el detalle para confirmar sus datos bancarios".
   *
   * Devuelve exactamente lo que se va a pagar, ya consolidado por
   * persona, con los datos con que se sube al banco.
   */
  async previaPayroll(dto: SeleccionPayrollDto, companyId: number) {
    const { jornadas, propinas } = await this.reunirLiquidado(dto, companyId);
    const personas = consolidarPorRut(jornadas, propinas);
    return {
      personas,
      total: personas.reduce((t, p) => t + p.total, 0),
      sin_rut: personas.filter((p) => !p.rut).map((p) => p.nombre),
      sin_cuenta: personas
        .filter((p) => !p.account_number)
        .map((p) => p.nombre),
      fichas_repetidas: personas
        .filter((p) => p.person_ids.length > 1)
        .map((p) => p.nombre),
    };
  }

  /**
   * LA REVISIÓN ANTES DE LIQUIDAR (Felipe, 18-08): "cuando pincho
   * liquidar evento, podría traerme preliminarmente el mismo modal que
   * me mostrará después en nómina, así puedo tener una instancia de
   * revisión con los totales para aprobar."
   *
   * Es la MISMA tabla y el MISMO cálculo que previaPayroll, con una
   * sola diferencia: no pregunta si la ficha está cerrada — mira lo que
   * QUEDARÍA por pagar de este evento si se cierra ahora. Solo lo de
   * este evento, solo lo que no está ya en una nómina.
   */
  async previaPreliminar(dto: PreviaPreliminarDto, companyId: number) {
    await this.sonDeLaEmpresa(companyId, { quotation_id: dto.quotation_id });
    const filtro = { quotationIds: [dto.quotation_id] };
    const [jornadas, propinas] = await Promise.all([
      this.repo.jornadasPendientes(companyId, filtro),
      this.repo.propinasPendientes(companyId, filtro),
    ]);
    const personas = consolidarPorRut(jornadas, propinas);
    return {
      personas,
      total: personas.reduce((t, p) => t + p.total, 0),
      sin_rut: personas.filter((p) => !p.rut).map((p) => p.nombre),
      sin_cuenta: personas
        .filter((p) => !p.account_number)
        .map((p) => p.nombre),
      fichas_repetidas: personas
        .filter((p) => p.person_ids.length > 1)
        .map((p) => p.nombre),
    };
  }

  async createPayroll(dto: CreatePayrollDto, companyId: number) {
    const { jornadas, propinas, sinLiquidar } = await this.reunirLiquidado(
      dto,
      companyId,
    );
    // EL RUT ES REGLA DE AVANCE (Felipe, 16-08): "los RUT deben estar
    // antes de poder generar las nóminas, igual es necesario para cargar
    // a banco". Se corta acá y no solo en la pantalla, porque es la
    // condición para que el pago exista.
    const faltantes = [
      ...new Map(
        [...jornadas, ...propinas]
          .filter((f) => !(f.people?.rut ?? '').trim())
          .map((f) => [f.person_id, f.people?.name ?? 'Sin nombre']),
      ).values(),
    ];
    if (faltantes.length > 0) {
      throw new BadRequestException(
        faltantes.length === 1
          ? `${faltantes[0]} no tiene RUT cargado: sin RUT no se puede subir al banco`
          : `Sin RUT no se puede subir al banco. Falta el de: ${faltantes.join(', ')}`,
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
    const fuera = await this.repo.poolsSinRepartir(companyId, {
      hasta: dto.hasta,
      desde: dto.desde,
      quotationIds: dto.quotation_ids,
      dias: dto.dias,
    });
    this.logger.info(
      `nomina ${payroll.id}: ${jornadas.length} jornadas + ${propinas.length} propinas, ${sinLiquidar} fuera por no estar liquidadas`,
    );
    return { ...payroll, personas: personIds.length, fuera, sinLiquidar };
  }

  /**
   * La lista de nóminas con su estado. Sin columna nueva en la base: una
   * nómina está PAGADA cuando no le queda nadie por pagar, y mientras
   * tanto está EN EL BANCO (Felipe, 16-08: "quiere decir que ya está
   * subida a banco pendiente de aprobación").
   */
  async findPayrolls(companyId: number) {
    const nominas = await this.repo.findPayrolls(companyId);
    const ids = nominas.map((n) => n.id);
    const [pagos, montos] = await Promise.all([
      this.repo.pagosDeNominas(companyId, ids),
      this.repo.montosDeNominas(companyId, ids),
    ]);
    return nominas.map((n) => {
      const suyos = pagos.filter((p) => p.payroll_id === n.id);
      const pagadas = suyos.filter(
        (p) => p.jornada_paid && p.propina_paid,
      ).length;
      const total = montos.reduce(
        (t, f) =>
          t +
          (f.payroll_id === n.id ? Number(f.amount ?? 0) : 0) +
          (f.tip_payroll_id === n.id ? Number(f.tip_amount ?? 0) : 0),
        0,
      );
      return {
        ...n,
        personas: suyos.length,
        pagadas,
        total,
        estado:
          suyos.length > 0 && pagadas === suyos.length ? 'pagada' : 'banco',
      };
    });
  }

  async getPayroll(id: number, companyId: number) {
    const payroll = await this.repo.findPayroll(id, companyId);
    const { jornadas, propinas } = await this.repo.rowsDeNomina(id, companyId);
    const pagos = await this.repo.findPagos(id, companyId);
    return { ...payroll, jornadas, propinas, pagos };
  }

  /** "Ya la pagué" se marca EN EL MOMENTO, no después — por eso ahora
   *  existe "pendiente". Jornada y propina por separado. */
  /**
   * LA NÓMINA TIENE QUE SER SUYA (revisión del 16-08).
   *
   * Marcar un pago tomaba el id de la nómina de la URL y no comprobaba
   * de quién era. Y como la llave única de payroll_people es
   * (payroll_id, person_id) —sin la empresa—, el upsert no fallaba: le
   * cambiaba el dueño a la fila de la otra empresa. Cualquier usuario
   * con sesión podía marcar como pagada una nómina ajena probando
   * números en la URL.
   *
   * findPayroll ya filtra por empresa y responde "no existe" si no es
   * suya: preguntarle primero cierra el agujero.
   */
  async marcarPago(payrollId: number, dto: PagoDto, companyId: number) {
    await this.repo.findPayroll(payrollId, companyId);
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

  async createDayNote(dto: CreateDayNoteDto, companyId: number) {
    const texto = dto.text.trim();
    if (!texto) throw new BadRequestException('La nota viene vacía');
    await this.sonDeLaEmpresa(companyId, dto);
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
 * UN DÍA EXTRA ES DÍA EXTRA, TAMBIÉN EN EL RESTAURANTE (Felipe, 17-08).
 *
 * Su caso: quiso poner de Staff garzón a una cocinera de planta que
 * tenía libre el 18 de noviembre. El sistema le puso el tipo de su
 * ficha —planta—, sin monto, y la sábana subió el cargo Garzón entero
 * a la banda de planta. Sus palabras: "personal de planta es personal
 * de planta, no se tiene que mezclar con el staff… le estoy pagando un
 * día extra, viene como garzón y tengo que poder configurar el pago".
 *
 * La regla: una persona de planta trabaja como FREELANCE (día extra,
 * con pago diario) cuando va a un evento, cuando viene en su día
 * libre, o cuando viene con un cargo que no es el suyo. Su jornada de
 * planta es solo la de su cargo, en sus días.
 */
export const esJornadaExtra = (
  persona: {
    default_kind?: string | null;
    default_role_id?: number | null;
    days_off?: number[] | null;
  },
  jornada: {
    quotation_id?: string | null;
    day?: string | null;
    role_id?: number | null;
  },
): boolean => {
  if (persona.default_kind !== 'planta') return false;
  if (jornada.quotation_id != null) return true; // evento = día extra
  const libre =
    !!jornada.day &&
    (persona.days_off ?? []).includes(
      new Date(`${jornada.day}T00:00:00Z`).getUTCDay(),
    );
  const cargoAjeno =
    jornada.role_id != null &&
    persona.default_role_id != null &&
    jornada.role_id !== persona.default_role_id;
  return libre || cargoAjeno;
};

/**
 * LA PROYECCIÓN SOLO BORRA LO QUE ELLA MISMA PONE (revisión del 16-08).
 *
 * Al guardar una ficha, el sistema rehace la planta del futuro: crea los
 * días que faltan y quita los que sobran. El "quita los que sobran"
 * estaba ciego — no miraba ni el tipo ni la plata — así que guardar la
 * ficha de un freelance para cargarle el RUT le borraba sus días de
 * restaurante CON la propina ya repartida. Y el RUT es obligatorio para
 * poder pagarle: el camino al daño era el camino normal de trabajo.
 *
 * Una fila es de la proyección solo si es una jornada de planta que
 * todavía no tiene plata ni nómina. Cualquier otra cosa la puso alguien
 * a mano —un freelance del restaurante, un planta llamado en su día
 * libre, un día ya repartido— y la máquina no la toca.
 */
/**
 * ¿ESE DÍA LA MANDARON A UN EVENTO? (18-08). La regla del 15-08 —"si
 * ese día está en un evento, no viene al restaurante"— sigue valiendo
 * para la planta que se PONE en un evento desde la casilla: nace
 * freelance (día extra) y ese día no está en el restaurante. Pero la
 * fila que la FICHA de liquidación trae (planta con turno de restaurante
 * ese día, para propina y asignación) tiene `kind = 'planta'` y NO la
 * saca del restaurante: estuvo ahí, y además reparte. El 18-08 la
 * proyección vio esas filas, creyó que las habían mandado al evento y
 * les borró el turno de restaurante a las cuatro. Nunca más.
 */
export const laMandaronAUnEvento = (fila: {
  quotation_id: string | null;
  kind: string | null;
}): boolean => fila.quotation_id !== null && fila.kind !== 'planta';

export const laPuedeQuitarLaProyeccion = (fila: {
  kind?: string | null;
  amount?: number | null;
  tip_amount?: number | null;
  payroll_id?: number | null;
  tip_payroll_id?: number | null;
}) =>
  (fila.kind ?? 'planta') === 'planta' &&
  !Number(fila.amount ?? 0) &&
  !Number(fila.tip_amount ?? 0) &&
  fila.payroll_id == null &&
  fila.tip_payroll_id == null;

/**
 * CONSOLIDAR POR RUT (Felipe, 16-08).
 *
 * Sus palabras: *"si tengo esa semana cinco eventos y diez días de
 * restaurante y es la misma gente, no puedo subir diez veces al banco;
 * tengo que consolidar por persona cuánto se le va a pagar esa semana
 * por todos los servicios que prestó"*.
 *
 * Se junta por RUT y no por ficha porque la misma persona puede estar
 * cargada dos veces —por una tilde o un espacio— y entonces saldrían
 * DOS transferencias al mismo RUT, cada una con la mitad. En el Excel
 * había 11 pares así, por $9.520.018.
 *
 * Quien no tiene RUT va por ficha, nunca junto a otros sin RUT: serían
 * personas distintas metidas en un mismo pago. Hoy eso solo puede pasar
 * en la vista previa, porque generar exige RUT.
 */
/**
 * De dónde viene la plata de una línea: "Restaurante, 7 días" o "ese
 * evento, 3 días". Sin esto la nómina consolidada es un número sin
 * explicación, y al pagar en el banco hay que poder responder "¿por qué
 * $500.000?" (Felipe, 16-08).
 */
/** UN DÍA de una línea, para el desglose al pinchar (Felipe 27-08):
 *  la misma fecha puede traer jornada Y propina — va en una sola fila. */
export interface DiaDeLinea {
  day: string | null;
  quotation_id: string | null;
  area: string | null;
  jornada: number;
  propina: number;
}

export interface OrigenDeLinea {
  /** null = días sueltos de restaurante. */
  quotation_id: string | null;
  dias: number;
  jornadas: number;
  propinas: number;
}

/** Una línea de la nómina: lo que se le sube al banco a una persona. */
export interface LineaDeNomina {
  person_ids: number[];
  nombre: string;
  rut: string | null;
  bank_code: string | null;
  account_type: string | null;
  account_number: string | null;
  jornadas: number;
  propinas: number;
  total: number;
  detalle: OrigenDeLinea[];
  dias: DiaDeLinea[];
}

export const consolidarPorRut = (
  jornadas: readonly EventStaffConPersona[],
  propinas: readonly EventStaffConPersona[],
) => {
  const lineas = new Map<string, LineaDeNomina>();
  /** Días ya contados por línea: la fecha que trae jornada Y propina
   *  se cuenta una vez, y su fila de desglose es UNA sola. */
  const diasPorOrigen = new Map<string, Map<string, DiaDeLinea>>();
  const meter = (
    f: EventStaffConPersona,
    monto: number,
    cual: 'jornadas' | 'propinas',
  ) => {
    if (!monto) return;
    const rut = (f.people?.rut ?? '').trim();
    const llave = rut ? `rut:${rut}` : `ficha:${f.person_id}`;
    if (!lineas.has(llave)) {
      lineas.set(llave, {
        person_ids: [],
        nombre: f.people?.name ?? 'Sin nombre',
        rut: rut || null,
        bank_code: f.people?.bank_code ?? null,
        account_type: f.people?.account_type ?? null,
        account_number: f.people?.account_number ?? null,
        jornadas: 0,
        propinas: 0,
        total: 0,
        detalle: [],
        dias: [],
      });
      diasPorOrigen.set(llave, new Map());
    }
    const l = lineas.get(llave)!;
    if (!l.person_ids.includes(f.person_id)) l.person_ids.push(f.person_id);
    l[cual] += monto;
    l.total += monto;

    // De dónde viene: por evento, y todos los días sueltos juntos como
    // "Restaurante". Los días se cuentan sin repetir, porque una misma
    // fecha trae jornada Y propina.
    const origenId = f.quotation_id ?? null;
    let suyo = l.detalle.find((d) => d.quotation_id === origenId);
    if (!suyo) {
      suyo = { quotation_id: origenId, dias: 0, jornadas: 0, propinas: 0 };
      l.detalle.push(suyo);
    }
    suyo[cual] += monto;
    const vistos = diasPorOrigen.get(llave)!;
    const clave = `${origenId ?? 'dia'}|${String(f.day ?? '').slice(0, 10)}`;
    let dia = vistos.get(clave);
    if (!dia) {
      dia = {
        day: f.day ? String(f.day).slice(0, 10) : null,
        quotation_id: origenId,
        area: f.management_resources?.name ?? null,
        jornada: 0,
        propina: 0,
      };
      vistos.set(clave, dia);
      l.dias.push(dia);
      suyo.dias += 1;
    }
    dia[cual === 'jornadas' ? 'jornada' : 'propina'] += monto;
  };
  for (const j of jornadas) meter(j, Number(j.amount ?? 0), 'jornadas');
  for (const t of propinas) meter(t, Number(t.tip_amount ?? 0), 'propinas');
  return [...lineas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
};

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

/** 'YYYY-MM' de N meses atrás de una fecha ISO. */
export const mesesAtras = (hoyISO: string, n: number): string => {
  const [y, m] = hoyISO.split('-').map(Number);
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${String(yy)}-${String(mm).padStart(2, '0')}`;
};

/** Los tres gráficos del Histórico, puros para poder probarlos. */
export const armarGraficosHistorico = (
  filas: readonly {
    day: string;
    amount: number | null;
    tip_amount: number | null;
    payroll_id: number | null;
    tip_payroll_id: number | null;
    person_id: number | null;
    people: { name: string } | null;
  }[],
  pozos: readonly {
    day?: string | null;
    quotation_id?: string | null;
    first_amount: number;
    second_amount: number;
    distributed_at: string | null;
  }[],
  hoyISO: string,
) => {
  const meses: string[] = [];
  for (let i = 11; i >= 0; i--) meses.push(mesesAtras(hoyISO, i));

  // 1) En nóminas por mes: jornadas y propinas.
  const porMes = meses.map((mes) => {
    const delMes = filas.filter((f) => String(f.day).slice(0, 7) === mes);
    return {
      mes,
      jornadas: delMes.reduce(
        (t, f) => t + (f.payroll_id != null ? Number(f.amount ?? 0) : 0),
        0,
      ),
      propinas: delMes.reduce(
        (t, f) =>
          t + (f.tip_payroll_id != null ? Number(f.tip_amount ?? 0) : 0),
        0,
      ),
    };
  });

  // 2) Top 5 personas de los últimos 6 meses (jornadas + propinas).
  const desde6 = mesesAtras(hoyISO, 5);
  const porPersona = new Map<number, { nombre: string; total: number }>();
  for (const f of filas) {
    if (f.person_id == null || String(f.day).slice(0, 7) < desde6) continue;
    const plata =
      (f.payroll_id != null ? Number(f.amount ?? 0) : 0) +
      (f.tip_payroll_id != null ? Number(f.tip_amount ?? 0) : 0);
    if (plata <= 0) continue;
    const ya = porPersona.get(f.person_id);
    if (ya) ya.total += plata;
    else
      porPersona.set(f.person_id, {
        nombre: f.people?.name ?? 'Sin nombre',
        total: plata,
      });
  }
  const top = [...porPersona.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 3) Propina promedio por día de restaurante, SOLO días con propina.
  const promedioDia = meses.map((mes) => {
    const delMes = pozos.filter(
      (p) =>
        p.day &&
        !p.quotation_id &&
        p.distributed_at &&
        String(p.day).slice(0, 7) === mes &&
        Number(p.first_amount) + Number(p.second_amount) > 0,
    );
    const total = delMes.reduce(
      (t, p) => t + Number(p.first_amount) + Number(p.second_amount),
      0,
    );
    return {
      mes,
      dias: delMes.length,
      promedio: delMes.length > 0 ? Math.round(total / delMes.length) : 0,
    };
  });

  return { porMes, top, promedioDia };
};

/** Lo mínimo de una fila para repartirle propina. */
export interface FilaRepartible {
  id: number;
  role_id: number | null;
  starts_at: string | null;
  ends_at: string | null;
  break_minutes: number | null;
}

/**
 * El reparto por puntos, puro para poder probarlo: cada fila junta
 * minutos trabajados × porcentaje de su cargo, y el pozo se reparte al
 * peso entre esos puntos. Un cargo con porcentaje y sin nadie puesto es
 * un error (la pantalla lo evita; acá se cuida igual). Las filas de un
 * cargo en 0% — o sin porcentaje — no juntan puntos y quedan fuera.
 */
export const repartirPorPuntos = (
  pozo: number,
  filas: readonly FilaRepartible[],
  porcentajes: readonly { role_id?: number | null; pct: number }[],
): Map<number, number> => {
  const pctDe = new Map<number | null, number>();
  for (const p of porcentajes) {
    if (p.pct > 0) pctDe.set(p.role_id ?? null, p.pct);
  }
  for (const [roleId, pct] of pctDe) {
    if (!filas.some((f) => (f.role_id ?? null) === roleId)) {
      throw new BadRequestException(
        `Hay un ${String(pct)}% asignado a un cargo sin nadie puesto`,
      );
    }
  }
  const conPuntos = filas.filter((f) => pctDe.has(f.role_id ?? null));
  const puntos = conPuntos.map(
    (f) =>
      minutosTrabajados(f.starts_at, f.ends_at, f.break_minutes) *
      (pctDe.get(f.role_id ?? null) ?? 0),
  );
  const montos = repartirAlPeso(pozo, puntos);
  return new Map(conPuntos.map((f, i) => [f.id, montos[i]]));
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

/** El día siguiente (o el de N días más), sin pelear con los meses. */
const diaMas = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
