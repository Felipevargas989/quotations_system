import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CARGOS } from 'src/auth/permisos';
import { PermisosService } from 'src/auth/permisos.service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { textoLimpio } from '../archivo/texto';
import type {
  AbrirCajaDto,
  CerrarCajaDto,
  CorregirMedioDto,
  LoVendidoQueryDto,
  RetiroDeCajaDto,
  RevisarCierreDto,
} from './caja.dto';
import { CajaRepository, type TurnoDeCaja } from './caja.repository';
import { cuadrar, vendidoPorItem } from './cuadre';

/** Quién abre o cierra: el nombre del perfil de la sesión (Felipe, 09-11:
 *  *"que no sea escrito a mano"*), hasta 60 como la base. */
const nombreDelPerfil = (user: User) =>
  (textoLimpio(user.full_name) || 'Sin nombre').slice(0, 60);

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
 *   sencillo, anota los retiros y la cierra declarando los cuatro montos.
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
  ) {
    this.logger.setContext(CajaService.name);
  }

  /** Lo que ve quien opera la caja: si está abierta, desde cuándo, con
   *  cuánto sencillo y sus retiros. Sin lo vendido (cierre ciego). */
  async estado(user: User) {
    const turno = await this.repo.turnoAbierto(user.company_id);
    if (!turno) return { abierta: null };
    const retiros = await this.repo.retiros(user.company_id, [turno.id]);
    return {
      abierta: {
        id: turno.id,
        abierta_por_nombre: turno.abierta_por_nombre,
        abierta_en: turno.abierta_en,
        sencillo_inicial: turno.sencillo_inicial,
        retiros: retiros.map((r) => ({
          id: r.id,
          monto: r.monto,
          motivo: r.motivo,
          creado_en: r.created_at,
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
    const turno = await this.abiertaO409(user.company_id);
    const motivo = textoLimpio(dto.motivo);
    if (!motivo) throw new BadRequestException('Falta el motivo del retiro');
    await this.repo.agregarRetiro({
      company_id: user.company_id,
      turno_id: turno.id,
      monto: dto.monto,
      motivo,
      creado_por: user.id ?? null,
    });
    return this.estado(user);
  }

  /** El cierre ciego: guarda lo declarado y responde solo que cerró. */
  async cerrar(user: User, dto: CerrarCajaDto) {
    const turno = await this.abiertaO409(user.company_id);
    const cerrado = await this.repo.cerrar(user.company_id, turno.id, {
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
      const [documentos, retiros, empresa] = await Promise.all([
        this.repo.documentos(companyId, [turno.id]),
        this.repo.retiros(companyId, [turno.id]),
        this.repo.nombreDeLaEmpresa(companyId),
      ]);
      const c = cuadrar(turno, documentos, retiros);
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
        retiros: c.retiros,
        diferencia: c.diferencia ?? 0,
        comentario: turno.comentario,
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
    const delPeriodo = (
      await this.repo.documentosDelPeriodo(companyId, q.desde, q.hasta)
    ).filter((d) => d.quotation_id == null && d.traida !== true);
    const turnos = [
      ...new Set(
        delPeriodo
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
    const vigentes = delPeriodo
      .filter((d) => !anulados.has(d.id))
      .map((d) => ({
        ...d,
        persona:
          (d.turno_de_caja_id != null
            ? deTurnos.get(d.turno_de_caja_id)
            : d.creado_por
              ? dePersonas.get(d.creado_por)
              : null) ?? null,
      }));
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

  /** Los cierres para revisar, del más nuevo al más viejo. */
  async cierres(user: User) {
    const companyId = user.company_id;
    const turnos = await this.repo.turnos(companyId);
    const ids = turnos.map((t) => t.id);
    const [documentos, retiros] = await Promise.all([
      this.repo.documentos(companyId, ids),
      this.repo.retiros(companyId, ids),
    ]);
    return turnos.map((t) => {
      const c = cuadrar(
        t,
        documentos.filter((d) => d.turno_de_caja_id === t.id),
        retiros.filter((r) => r.turno_id === t.id),
      );
      return {
        ...resumen(t),
        vendido: c.vendido,
        declarado: c.declarado,
        diferencia: c.diferencia,
        diferencias: c.lineas
          .filter((l) => l.diferencia != null && l.diferencia !== 0)
          .map((l) => ({ medio: l.medio, diferencia: l.diferencia })),
      };
    });
  }

  /** Un cierre entero, para revisarlo. */
  async cierre(user: User, id: number) {
    const companyId = user.company_id;
    const turno = await this.repo.turno(companyId, id);
    if (!turno) throw new NotFoundException('Ese cierre no existe');
    const [documentos, retiros, correcciones] = await Promise.all([
      this.repo.documentos(companyId, [id]),
      this.repo.retiros(companyId, [id]),
      this.repo.correcciones(companyId, id),
    ]);
    const c = cuadrar(turno, documentos, retiros);
    return {
      ...resumen(turno),
      comentario: turno.comentario,
      nota_revision: turno.nota_revision,
      cuadre: c,
      documentos: documentos.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        folio: d.folio,
        estado: d.estado,
        total: d.total,
        medio_de_pago: d.medio_de_pago,
        emitido_en: d.emitido_en,
      })),
      retiros: retiros.map((r) => ({
        id: r.id,
        monto: r.monto,
        motivo: r.motivo,
        creado_en: r.created_at,
      })),
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
