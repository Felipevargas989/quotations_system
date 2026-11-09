import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import { textoLimpio } from '../archivo/texto';
import type {
  AbrirCajaDto,
  CerrarCajaDto,
  CorregirMedioDto,
  RetiroDeCajaDto,
  RevisarCierreDto,
} from './caja.dto';
import { CajaRepository, type TurnoDeCaja } from './caja.repository';
import { cuadrar } from './cuadre';

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
    const quien = textoLimpio(dto.quien);
    if (!quien) throw new BadRequestException('Falta quién abre la caja');
    try {
      await this.repo.abrir({
        company_id: user.company_id,
        abierta_por: user.id ?? null,
        abierta_por_nombre: quien,
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
    const quien = textoLimpio(dto.quien);
    if (!quien) throw new BadRequestException('Falta quién cierra la caja');
    const cerrado = await this.repo.cerrar(user.company_id, turno.id, {
      cerrada_por: user.id ?? null,
      cerrada_por_nombre: quien,
      declarado_efectivo: dto.efectivo,
      declarado_debito: dto.debito,
      declarado_credito: dto.credito,
      declarado_transferencia: dto.transferencia,
      comentario: textoLimpio(dto.comentario) || null,
    });
    if (!cerrado) throw new ConflictException('La caja ya se había cerrado');
    this.logger.info(`caja de recepción cerrada (turno ${turno.id})`);
    return { cerrada_en: cerrado.cerrada_en };
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
