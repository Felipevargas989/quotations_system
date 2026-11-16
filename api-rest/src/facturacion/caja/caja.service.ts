import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CARGOS } from 'src/auth/permisos';
import { PermisosService } from 'src/auth/permisos.service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { textoLimpio } from '../archivo/texto';
// Import de verdad (no `import type`): Nest inyecta por la clase, y con
// `import type` la pieza opcional llega vacía sin avisar.
import { PulserasService } from '../pulseras/pulseras.service';
import { SolicitudesRepository } from '../solicitudes/solicitudes.repository';
import { compararApertura, turnoAnteriorEn } from './apertura';
import { cadenaDelTurno, desdeDelResumen, resumenDeLaCadena } from './cadena';
import type {
  AbrirCajaDto,
  CerrarCajaDto,
  CorregirMedioDto,
  IngresoDeCajaDto,
  LoVendidoQueryDto,
  RetiroDeCajaDto,
  RevisarCierreDto,
} from './caja.dto';
import {
  CajaRepository,
  type MovimientoDeCaja,
  type TipoDeMovimiento,
  type TurnoDeCaja,
} from './caja.repository';
import {
  conLasSolicitudes,
  cuadrar,
  cuentaLaSolicitud,
  vendidoPorItem,
} from './cuadre';

/** Quién abre o cierra: el nombre del perfil de la sesión (Felipe, 09-11:
 *  *"que no sea escrito a mano"*), hasta 60 como la base. */
const nombreDelPerfil = (user: User) =>
  (textoLimpio(user.full_name) || 'Sin nombre').slice(0, 60);

/** §9.51: cada movimiento como lo ve la pantalla. */
const comoMovimiento = (m: MovimientoDeCaja) => ({
  id: m.id,
  tipo: m.tipo,
  monto: m.monto,
  motivo: m.motivo,
  creado_por_nombre: m.creado_por_nombre,
  creado_en: m.created_at,
});

/** §9.51: `movimientos` (los dos tipos, por hora) y `retiros` (solo los
 *  retiros, como antes: la pantalla vieja los sigue leyendo mientras el
 *  motor nuevo ya está arriba). */
const losMovimientos = (movimientos: MovimientoDeCaja[]) => ({
  movimientos: movimientos.map(comoMovimiento),
  retiros: movimientos
    .filter((m) => m.tipo === 'retiro')
    .map((m) => ({
      id: m.id,
      monto: m.monto,
      motivo: m.motivo,
      creado_en: m.created_at,
    })),
});

/** La lista de cierres muestra los últimos 60. */
const CIERRES_EN_LA_LISTA = 60;

/** «Lo vendido» mira hasta un año de una vez. */
const DIAS_MAXIMOS = 366;
const DIA = 24 * 60 * 60 * 1000;

/**
 * LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2).
 *
 * Felipe, 09-11: *"la idea es que sea un cierre de caja ciego, donde ella
 * anote cuánto tienen en efectivo, débito, crédito y transferencia, y luego
 * Camila valide viendo qué se vendió y cuánto debería tener"*.
 *
 * - Quien opera la caja (permiso «Caja de recepción») la abre con su
 *   sencillo, anota los ingresos y retiros (§9.51) y la cierra declarando los cuatro montos.
 *   Nunca ve lo esperado ni la diferencia: las respuestas de este lado no
 *   los traen.
 * - Quien revisa (permiso «Revisar cierres de caja») ve cada cierre con lo
 *   declarado, lo esperado y la diferencia por medio de pago, sus
 *   documentos y lo vendido; corrige el medio de pago de un documento (queda
 *   anotado) y marca el cierre revisado.
 */
@Injectable()
export class CajaService {
  constructor(
    private readonly repo: CajaRepository,
    private readonly logger: PinoLogger,
    // Sprint 3: el resumen del cierre, por correo a quien revisa.
    private readonly permisos: PermisosService,
    private readonly email: EmailService,
    // §9.45: las solicitudes de recepción cuentan en su turno. Sin la pieza
    // (algunas pruebas), solo los documentos.
    @Optional() private readonly solicitudes?: SolicitudesRepository,
    // §9.49: las pulseras que recepción cuenta al cerrar. Sin la pieza
    // (algunas pruebas), el cierre de siempre.
    @Optional() private readonly pulseras?: PulserasService,
  ) {
    this.logger.setContext(CajaService.name);
  }

  /** Los documentos de esos turnos con sus solicitudes (§9.45): cada venta
   *  una vez, se haya emitido o no. */
  private async delTurno(companyId: number, turnoIds: number[]) {
    const [documentos, solicitudes] = await Promise.all([
      this.repo.documentos(companyId, turnoIds),
      this.solicitudes?.delTurno(companyId, turnoIds) ?? Promise.resolve([]),
    ]);
    return turnoIds.length === 1
      ? conLasSolicitudes(documentos, solicitudes)
      : turnoIds.flatMap((id) =>
          conLasSolicitudes(
            documentos.filter((d) => d.turno_de_caja_id === id),
            solicitudes.filter((x) => x.turno_de_caja_id === id),
          ).map((d) => ({ ...d, turno_de_caja_id: id })),
        );
  }

  /** Lo que ve quien opera la caja: si está abierta, desde cuándo, con
   *  cuánto sencillo y sus ingresos y retiros. Sin lo vendido ni lo
   *  esperado (cierre ciego). */
  async estado(user: User) {
    const turno = await this.repo.turnoAbierto(user.company_id);
    if (!turno) return { abierta: null };
    const [movimientos, cuentaPulseras] = await Promise.all([
      this.repo.movimientos(user.company_id, [turno.id]),
      this.pideLasPulseras(user.company_id),
    ]);
    return {
      // §9.49: solo si se cuentan, nunca cuántas debería tener (ciego).
      cuenta_pulseras: cuentaPulseras,
      abierta: {
        id: turno.id,
        abierta_por_nombre: turno.abierta_por_nombre,
        abierta_en: turno.abierta_en,
        sencillo_inicial: turno.sencillo_inicial,
        ...losMovimientos(movimientos),
      },
    };
  }

  /**
   * §9.55: lo que debería haber en la caja abierta, por medio de pago, para
   * quien revisa los cierres (la puerta pide «Revisar cierres de caja»).
   * El efectivo: sencillo + vendido en efectivo + ingresos − retiros.
   * Recepción nunca lo recibe: el estado no lo trae.
   */
  async esperado(user: User) {
    const companyId = user.company_id;
    const turno = await this.repo.turnoAbierto(companyId);
    if (!turno) return { abierta: null };
    const [documentos, movimientos] = await Promise.all([
      this.delTurno(companyId, [turno.id]),
      this.repo.movimientos(companyId, [turno.id]),
    ]);
    const c = cuadrar(turno, documentos, movimientos);
    return {
      abierta: {
        id: turno.id,
        sencillo_inicial: turno.sencillo_inicial,
        ingresos: c.ingresos,
        retiros: c.retiros,
        lineas: c.lineas.map((l) => ({
          medio: l.medio,
          vendido: l.vendido,
          esperado: l.esperado,
        })),
      },
    };
  }

  async abrir(user: User, dto: AbrirCajaDto) {
    try {
      await this.repo.abrir({
        company_id: user.company_id,
        abierta_por: user.id ?? null,
        abierta_por_nombre: nombreDelPerfil(user),
        sencillo_inicial: dto.sencillo,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505')
        throw new ConflictException('La caja de recepción ya está abierta');
      throw error;
    }
    this.logger.info(`caja de recepción abierta (empresa ${user.company_id})`);
    return this.estado(user);
  }

  async retiro(user: User, dto: RetiroDeCajaDto) {
    return this.anotar(user, 'retiro', dto);
  }

  /** §9.51: la plata que mandan el dueño o la administradora. No es venta:
   *  solo suma al efectivo esperado del cierre. */
  async ingreso(user: User, dto: IngresoDeCajaDto) {
    return this.anotar(user, 'ingreso', dto);
  }

  /** Un ingreso o un retiro al turno abierto, con quién (el perfil de la
   *  sesión) y la hora. */
  private async anotar(
    user: User,
    tipo: TipoDeMovimiento,
    dto: { monto: number; motivo: string },
  ) {
    const turno = await this.abiertaO409(user.company_id);
    const motivo = textoLimpio(dto.motivo);
    if (!motivo) throw new BadRequestException(`Falta el motivo del ${tipo}`);
    await this.repo.agregarMovimiento({
      company_id: user.company_id,
      turno_id: turno.id,
      tipo,
      monto: dto.monto,
      motivo,
      creado_por: user.id ?? null,
      creado_por_nombre: nombreDelPerfil(user),
    });
    return this.estado(user);
  }

  /** El cierre ciego: guarda lo declarado y responde solo que cerró. */
  async cerrar(user: User, dto: CerrarCajaDto) {
    const turno = await this.abiertaO409(user.company_id);
    // §9.49: si la empresa cuenta pulseras, el cierre las pide.
    const cuentaPulseras = await this.pideLasPulseras(user.company_id);
    if (cuentaPulseras && dto.pulseras == null)
      throw new BadRequestException('Falta cuántas pulseras te quedan');
    const cerrado = await this.repo.cerrar(user.company_id, turno.id, {
      ...(cuentaPulseras ? { pulseras_contadas: dto.pulseras ?? null } : {}),
      cerrada_por: user.id ?? null,
      cerrada_por_nombre: nombreDelPerfil(user),
      declarado_efectivo: dto.efectivo,
      declarado_debito: dto.debito,
      declarado_credito: dto.credito,
      declarado_transferencia: dto.transferencia,
      comentario: textoLimpio(dto.comentario) || null,
    });
    if (!cerrado) throw new ConflictException('La caja ya se había cerrado');
    this.logger.info(`caja de recepción cerrada (turno ${turno.id})`);
    await this.avisarElCierre(user.company_id, cerrado);
    return { cerrada_en: cerrado.cerrada_en };
  }

  /**
   * El resumen del cierre por correo (sprint 3, como el de Fudo) a las
   * personas de los cargos con «Revisar cierres de caja». Quien cerró no lo
   * recibe si su cargo no revisa: el cierre es ciego. Si falla, la caja
   * queda cerrada igual y se anota en el registro.
   */
  private async avisarElCierre(companyId: number, turno: TurnoDeCaja) {
    try {
      const cargos: string[] = [];
      for (const cargo of CARGOS)
        if (
          (await this.permisos.delCargo(companyId, cargo)).includes(
            'caja_revision',
          )
        )
          cargos.push(cargo);
      const correos = await this.repo.correosDe(companyId, cargos);
      if (!correos.length) return;
      const [documentos, movimientos, empresa, pulseras, apertura] =
        await Promise.all([
          this.delTurno(companyId, [turno.id]),
          this.repo.movimientos(companyId, [turno.id]),
          this.repo.nombreDeLaEmpresa(companyId),
          this.pulserasDelCierre(companyId, turno.id),
          // Si la consulta falla, el correo sale igual, sin la comparación.
          this.aperturaDe(companyId, turno).catch(() => null),
        ]);
      const c = cuadrar(turno, documentos, movimientos);
      await this.email.sendEmail(correos, EmailStructure.CIERRE_DE_CAJA, {
        companyName: empresa,
        quien: turno.cerrada_por_nombre ?? turno.abierta_por_nombre,
        abierta: turno.abierta_en,
        cerrada: turno.cerrada_en ?? new Date().toISOString(),
        lineas: c.lineas.map((l) => ({
          medio: l.medio,
          declarado: l.declarado ?? 0,
          esperado: l.esperado,
          diferencia: l.diferencia ?? 0,
        })),
        vendido: c.vendido,
        ingresos: c.ingresos,
        retiros: c.retiros,
        diferencia: c.diferencia ?? 0,
        comentario: turno.comentario,
        pulseras,
        // §9.53: con cuánto se abrió y si calzó con el cierre anterior.
        apertura: { sencillo: turno.sencillo_inicial, comparada: apertura },
      });
    } catch (error) {
      this.logger.warn(
        `el resumen del cierre ${turno.id} no salió por correo: ${mensajeDe(error)}`,
      );
    }
  }

  /**
   * «Lo vendido» (sprint 3; Felipe, 09-11: *"también debo poder ver
   * cuántos tickets, cuántas tinajas, etc. se han vendido"*): lo vendido en
   * «Nuevo DTE» (las boletas y facturas emitidas del período sin evento, sin
   * las traídas de facturacion.cl ni lo que anuló una nota de crédito), por
   * ítem del tarifario y, las líneas a mano, por lo que dicen («A mano ·
   * …»; Felipe: *"sí, hazlo"*); y, si se elige, por persona (quien abrió la
   * caja; fuera de la caja, quien emitió).
   */
  async vendido(user: User, q: LoVendidoQueryDto) {
    const desde = Date.parse(`${q.desde}T00:00:00Z`);
    const hasta = Date.parse(`${q.hasta}T00:00:00Z`);
    if (Number.isNaN(desde) || Number.isNaN(hasta) || hasta < desde)
      throw new BadRequestException('El período no es válido');
    if ((hasta - desde) / DIA > DIAS_MAXIMOS)
      throw new BadRequestException(
        'Lo vendido se mira hasta un año de una vez',
      );
    const companyId = user.company_id;
    const [emitidos, pedidas] = await Promise.all([
      this.repo.documentosDelPeriodo(companyId, q.desde, q.hasta),
      this.solicitudesDelPeriodo(companyId, q.desde, q.hasta),
    ]);
    const delPeriodo = emitidos.filter(
      (d) => d.quotation_id == null && d.traida !== true,
    );
    const turnos = [
      ...new Set(
        [...delPeriodo, ...pedidas]
          .map((d) => d.turno_de_caja_id)
          .filter((t): t is number => t != null),
      ),
    ];
    const personas = [
      ...new Set(
        delPeriodo
          .filter((d) => d.turno_de_caja_id == null && d.creado_por)
          .map((d) => d.creado_por as string),
      ),
    ];
    const [anulados, deTurnos, dePersonas, tarifario] = await Promise.all([
      this.repo.anulados(
        companyId,
        delPeriodo.map((d) => d.id),
      ),
      this.repo.nombresDeTurnos(companyId, turnos),
      this.repo.nombresDePersonas(companyId, personas),
      this.repo.tarifario(companyId),
    ]);
    const vigentes = [
      ...delPeriodo
        .filter((d) => !anulados.has(d.id))
        .map((d) => ({
          tipo: d.tipo,
          detalle: d.detalle,
          persona:
            (d.turno_de_caja_id != null
              ? deTurnos.get(d.turno_de_caja_id)
              : d.creado_por
                ? dePersonas.get(d.creado_por)
                : null) ?? null,
        })),
      // §9.45: lo que pidió recepción y no se ha emitido (o se rechazó)
      // también se vendió; la aprobada cuenta por su documento.
      ...pedidas.map((x) => ({
        tipo: x.tipo,
        detalle: x.detalle,
        persona: deTurnos.get(x.turno_de_caja_id) ?? null,
      })),
    ];
    const persona = textoLimpio(q.persona);
    const items = vendidoPorItem(
      persona ? vigentes.filter((d) => d.persona === persona) : vigentes,
    ).map((i) => {
      const item = tarifario.find((t) => t.id === i.tarifario_id);
      return {
        ...i,
        nombre:
          i.tarifario_id == null
            ? `A mano · ${i.nombre}`
            : (item?.nombre ?? i.nombre),
        unidad: item?.unidad ?? 'unidad',
      };
    });
    return {
      desde: q.desde,
      hasta: q.hasta,
      personas: [
        ...new Set(
          vigentes.map((d) => d.persona).filter((p): p is string => !!p),
        ),
      ].sort((a, b) => a.localeCompare(b, 'es')),
      items,
      total: items.reduce((s, i) => s + i.monto, 0),
    };
  }

  /** §9.45: las solicitudes del período (por el día en Chile en que se
   *  pidieron) que cuentan por sí mismas: no la aprobada ya emitida. */
  private async solicitudesDelPeriodo(
    companyId: number,
    desde: string,
    hasta: string,
  ) {
    if (!this.solicitudes) return [];
    // Un día de holgura a cada lado (Chile va 3 o 4 horas detrás de UTC) y
    // después el día exacto en Chile.
    const antes = new Date(Date.parse(`${desde}T00:00:00Z`) - DIA);
    const despues = new Date(Date.parse(`${hasta}T00:00:00Z`) + 2 * DIA);
    const filas = await this.solicitudes.delPeriodo(
      companyId,
      antes.toISOString(),
      despues.toISOString(),
    );
    return filas.filter((x) => {
      const dia = hoyEnChile(new Date(x.created_at));
      return dia >= desde && dia <= hasta && cuentaLaSolicitud(x);
    });
  }

  /** §9.53: la apertura de un turno contra el cierre anterior (una
   *  consulta). */
  private async aperturaDe(companyId: number, turno: TurnoDeCaja) {
    return compararApertura(
      turno,
      await this.repo.turnoAnterior(companyId, turno.caja, turno.abierta_en),
    );
  }

  /** Los cierres para revisar, del más nuevo al más viejo. §9.53: se lee
   *  uno más de los que se muestran, para que el último de la lista
   *  también tenga su anterior, en la misma consulta. §9.54: cada uno con
   *  su cadena del efectivo (abrió con, debía tener, cerró con). */
  async cierres(user: User) {
    return (await this.laCadena(user.company_id, new Date())).lista;
  }

  /** §9.54: las tres cifras de arriba, sobre los 7 días corridos reales
   *  (no sobre la página de 60). */
  async resumenDeCierres(user: User) {
    return (await this.laCadena(user.company_id, new Date())).resumen;
  }

  /**
   * La cadena del efectivo (§9.54): la lista (los 60 más nuevos) y las tres
   * cifras de los últimos 7 días. Lee los 61 más nuevos en una consulta; si
   * no alcanzan a cubrir los 7 días (más de 60 turnos en una semana), trae
   * además los de la ventana y el anterior del más viejo de ella. Lo vendido
   * y los movimientos de todos, en una consulta cada uno: nada por fila.
   */
  private async laCadena(companyId: number, ahora: Date) {
    const desde = desdeDelResumen(ahora).toISOString();
    const enLaVentana = (t: TurnoDeCaja) =>
      Date.parse(t.abierta_en) >= Date.parse(desde);
    const leidos = await this.repo.turnos(companyId, CIERRES_EN_LA_LISTA + 1);
    const visibles = leidos.slice(0, CIERRES_EN_LA_LISTA);
    let conocidos = leidos;
    const masViejo = leidos[leidos.length - 1];
    if (leidos.length > CIERRES_EN_LA_LISTA && enLaVentana(masViejo)) {
      const ventana = await this.repo.turnosDesde(companyId, desde);
      const primero = ventana[ventana.length - 1] ?? masViejo;
      const anterior = await this.repo.turnoAnterior(
        companyId,
        primero.caja,
        primero.abierta_en,
      );
      const porId = new Map(
        [...leidos, ...ventana, ...(anterior ? [anterior] : [])].map((t) => [
          t.id,
          t,
        ]),
      );
      conocidos = [...porId.values()];
    }
    const idsVisibles = new Set(visibles.map((t) => t.id));
    const aCuadrar = conocidos.filter(
      (t) => idsVisibles.has(t.id) || enLaVentana(t),
    );
    const ids = aCuadrar.map((t) => t.id);
    const [documentos, movimientos] = await Promise.all([
      this.delTurno(companyId, ids),
      this.repo.movimientos(companyId, ids),
    ]);
    const filas = new Map(
      aCuadrar.map((t) => {
        const c = cuadrar(
          t,
          documentos.filter(
            (d) =>
              (d as { turno_de_caja_id?: number }).turno_de_caja_id === t.id,
          ),
          movimientos.filter((r) => r.turno_id === t.id),
        );
        const r = resumen(t);
        return [
          t.id,
          {
            ...r,
            apertura: compararApertura(t, turnoAnteriorEn(t, conocidos)),
            ...cadenaDelTurno(r.estado !== 'abierta', c.lineas),
            vendido: c.vendido,
            declarado: c.declarado,
            diferencia: c.diferencia,
            diferencias: c.lineas
              .filter((l) => l.diferencia != null && l.diferencia !== 0)
              .map((l) => ({ medio: l.medio, diferencia: l.diferencia })),
          },
        ] as const;
      }),
    );
    return {
      lista: visibles.map((t) => filas.get(t.id)!),
      resumen: resumenDeLaCadena([...filas.values()], ahora),
    };
  }

  /** Un cierre entero, para revisarlo. */
  async cierre(user: User, id: number) {
    const companyId = user.company_id;
    const turno = await this.repo.turno(companyId, id);
    if (!turno) throw new NotFoundException('Ese cierre no existe');
    const [documentos, movimientos, correcciones, pulseras, apertura] =
      await Promise.all([
        this.delTurno(companyId, [id]),
        this.repo.movimientos(companyId, [id]),
        this.repo.correcciones(companyId, id),
        this.pulserasDelCierre(companyId, id),
        this.aperturaDe(companyId, turno),
      ]);
    const c = cuadrar(turno, documentos, movimientos);
    return {
      ...resumen(turno),
      comentario: turno.comentario,
      nota_revision: turno.nota_revision,
      // §9.53: nula en el primer turno de la historia.
      apertura,
      cuadre: c,
      // §9.49: deberían quedar, contadas y la diferencia (solo quien revisa).
      pulseras,
      documentos: documentos.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        folio: d.folio,
        estado: d.estado,
        total: d.total,
        medio_de_pago: d.medio_de_pago,
        emitido_en: d.emitido_en,
        // §9.45: la solicitud de recepción que esta fila representa.
        solicitud_id: d.solicitud_id ?? null,
      })),
      ...losMovimientos(movimientos),
      correcciones,
    };
  }

  /** La revisión corrige el medio de pago de un documento del turno. */
  async corregirMedio(
    user: User,
    turnoId: number,
    documentoId: number,
    dto: CorregirMedioDto,
  ) {
    const companyId = user.company_id;
    const turno = await this.repo.turno(companyId, turnoId);
    if (!turno) throw new NotFoundException('Ese cierre no existe');
    const cambio = await this.repo.cambiarMedio(
      companyId,
      turnoId,
      documentoId,
      dto.medio,
    );
    if (!cambio)
      throw new NotFoundException('Ese documento no es de este cierre');
    if (cambio.medio_antes !== dto.medio)
      await this.repo.anotarCorreccion({
        company_id: companyId,
        turno_id: turnoId,
        documento_id: documentoId,
        medio_antes: cambio.medio_antes,
        medio_despues: dto.medio,
        corregido_por: user.id ?? null,
        corregido_por_nombre: user.full_name ?? null,
      });
    return this.cierre(user, turnoId);
  }

  /** §9.45: la revisión corrige el medio de una solicitud del turno (la
   *  pendiente o la rechazada cuentan en la caja; la aprobada lo lleva a su
   *  documento). */
  async corregirMedioDeSolicitud(
    user: User,
    turnoId: number,
    solicitudId: number,
    dto: CorregirMedioDto,
  ) {
    const companyId = user.company_id;
    const turno = await this.repo.turno(companyId, turnoId);
    if (!turno || !this.solicitudes)
      throw new NotFoundException('Ese cierre no existe');
    const cambio = await this.solicitudes.cambiarMedio(
      companyId,
      turnoId,
      solicitudId,
      dto.medio,
    );
    if (!cambio)
      throw new NotFoundException('Esa solicitud no es de este cierre');
    if (cambio.medio_antes !== dto.medio)
      await this.repo.anotarCorreccion({
        company_id: companyId,
        turno_id: turnoId,
        documento_id: null,
        solicitud_id: solicitudId,
        medio_antes: cambio.medio_antes,
        medio_despues: dto.medio,
        corregido_por: user.id ?? null,
        corregido_por_nombre: user.full_name ?? null,
      });
    return this.cierre(user, turnoId);
  }

  async revisar(user: User, id: number, dto: RevisarCierreDto) {
    const revisado = await this.repo.revisar(user.company_id, id, {
      revisado_por: user.id ?? null,
      revisado_por_nombre: user.full_name ?? null,
      nota_revision: textoLimpio(dto.nota) || null,
    });
    if (!revisado)
      throw new ConflictException('Solo se revisa una caja cerrada');
    return this.cierre(user, id);
  }

  /** §9.49: si el cierre pide las pulseras. Si falla la consulta, no
   *  frena la caja: el cierre de siempre. */
  private async pideLasPulseras(companyId: number) {
    if (!this.pulseras) return false;
    try {
      return await this.pulseras.pideAlCerrar(companyId);
    } catch (error) {
      this.logger.warn(
        `las pulseras no se pudieron mirar: ${mensajeDe(error)}`,
      );
      return false;
    }
  }

  private async pulserasDelCierre(companyId: number, turnoId: number) {
    if (!this.pulseras) return null;
    try {
      return await this.pulseras.delCierre(companyId, turnoId);
    } catch (error) {
      this.logger.warn(
        `las pulseras del cierre ${turnoId} no se pudieron contar: ${mensajeDe(error)}`,
      );
      return null;
    }
  }

  private async abiertaO409(companyId: number) {
    const turno = await this.repo.turnoAbierto(companyId);
    if (!turno)
      throw new ConflictException('La caja de recepción no está abierta');
    return turno;
  }
}

/** Lo de cada turno que va en la lista y en el detalle. */
const resumen = (t: TurnoDeCaja) => ({
  id: t.id,
  abierta_por_nombre: t.abierta_por_nombre,
  abierta_en: t.abierta_en,
  sencillo_inicial: t.sencillo_inicial,
  cerrada_por_nombre: t.cerrada_por_nombre,
  cerrada_en: t.cerrada_en,
  revisado_por_nombre: t.revisado_por_nombre,
  revisado_en: t.revisado_en,
  estado: !t.cerrada_en
    ? ('abierta' as const)
    : t.revisado_en
      ? ('revisada' as const)
      : ('por_revisar' as const),
});
