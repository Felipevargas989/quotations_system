import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { armarBoleta } from '../archivo/boleta';
import { textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle } from '../archivo/tipos';
import type { BoletaSueltaDto } from '../boletas/boleta.dto';
import { BoletasService } from '../boletas/boletas.service';
import { lineasDeLaSuelta } from '../boletas/suelta';
import { CajaRepository } from '../caja/caja.repository';
import { conIvaDe } from '../caja/cuadre';
import { CAJA_CERRADA } from '../caja/regla';
import type { DtePedido } from '../facturas/borrador';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import type { DocumentoTributario } from '../facturas/documentos-tributarios.repository';
import { FacturasService } from '../facturas/facturas.service';
import type { MedioDePago } from '../facturas/pago-de-la-factura';
import type { RechazarSolicitudDto } from './solicitudes.dto';
import {
  SolicitudesRepository,
  type Solicitud,
} from './solicitudes.repository';

const BOLETA = 39;
const FACTURA = 33;
/** Las resueltas que se siguen viendo en la lista. */
const DIAS_DE_RESUELTAS = 7;
const DIA = 24 * 60 * 60 * 1000;

/** Quién: el nombre del perfil de la sesión, como en la caja (§9.43). */
const nombreDelPerfil = (user: User) =>
  (textoLimpio(user.full_name) || 'Sin nombre').slice(0, 60);

/** Lo que guarda una solicitud de boleta para emitirla después. */
interface PedidoDeBoleta {
  lineas: LineaDeDetalle[];
  correo: string | null;
  cabana: string | null;
}

/** El día en Chile en que se pidió, para ver dos iguales el mismo día. */
const diaDe = (s: Solicitud) => hoyEnChile(new Date(s.created_at));

/**
 * La solicitud como la ven las pantallas: sus líneas con IVA, a quién va,
 * quién la mandó y cómo se resolvió. `igual_a`: otra solicitud del mismo
 * día con el mismo tipo, total y medio de pago (para no emitir dos veces).
 */
const vista = (s: Solicitud, todas: Solicitud[] = []) => {
  const pedido = s.pedido as Partial<DtePedido>;
  const igual = todas.find(
    (o) =>
      o.id !== s.id &&
      o.estado !== 'rechazada' &&
      o.tipo === s.tipo &&
      o.total === s.total &&
      o.medio_de_pago === s.medio_de_pago &&
      diaDe(o) === diaDe(s),
  );
  return {
    id: s.id,
    tipo: s.tipo,
    estado: s.estado,
    total: s.total,
    medio_de_pago: s.medio_de_pago,
    correo: s.correo,
    imprimir: s.imprimir,
    para: s.para,
    rut: s.tipo === FACTURA ? (pedido.receptor?.rut ?? null) : null,
    lineas: s.detalle.map((l) => ({
      descripcion: l.descripcion ?? '',
      cantidad: Number(l.cantidad ?? 0),
      monto: conIvaDe(s.tipo, l),
    })),
    turno_de_caja_id: s.turno_de_caja_id,
    solicitada_por_nombre: s.solicitada_por_nombre,
    solicitada_por_cargo: s.solicitada_por_cargo,
    created_at: s.created_at,
    resuelta_por_nombre: s.resuelta_por_nombre,
    resuelta_en: s.resuelta_en,
    motivo_rechazo: s.motivo_rechazo,
    error: s.error,
    documento:
      s.documento_id && s.documento
        ? { id: s.documento_id, ...s.documento }
        : null,
    igual_a: igual?.id ?? null,
  };
};

/**
 * LAS SOLICITUDES DE BOLETA Y FACTURA DE RECEPCIÓN (doc 19 §9.45).
 *
 * Felipe, 09-11: recepción deja de emitir al SII, para que no pueda
 * duplicar algo ya boleteado.
 * - Recepción arma la boleta o la factura al contado como siempre y, en vez
 *   de emitir, «Enviar solicitud»: se guarda con todo lo necesario para
 *   emitirla (las líneas con el precio del tarifario con que se cobró, el
 *   medio de pago, el correo o «la imprimo», quién la mandó) en el turno de
 *   la caja abierta. No va nada a facturacion.cl.
 * - Quien tiene «Aprobar y emitir solicitudes» la revisa y «Aprobar y
 *   emitir» corre la emisión de siempre, con ese mismo pedido y ese turno;
 *   o «Rechazar»: nunca va al SII.
 * - La caja cuenta la solicitud desde que se manda, se emita o no
 *   (`caja/cuadre.ts`, `conLasSolicitudes`).
 */
@Injectable()
export class SolicitudesService {
  constructor(
    private readonly repo: SolicitudesRepository,
    private readonly boletas: BoletasService,
    private readonly facturas: FacturasService,
    private readonly caja: CajaRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SolicitudesService.name);
  }

  /** Solo recepción solicita, y con la caja abierta: es el turno al que
   *  entra la plata. */
  private async turnoDeRecepcion(user: User): Promise<number> {
    if (user.role !== UserRole.RECEPCION)
      throw new ForbiddenException(
        'Las solicitudes son de recepción: tu cargo emite directo',
      );
    const turno = await this.caja.turnoAbierto(user.company_id);
    if (!turno) throw new ConflictException(CAJA_CERRADA);
    return turno.id;
  }

  private quien(user: User) {
    return {
      solicitada_por: user.id ?? null,
      solicitada_por_nombre: nombreDelPerfil(user),
      solicitada_por_cargo: String(user.role),
    };
  }

  /** La boleta de «Nuevo DTE» que manda recepción: armada igual que al
   *  emitirla (así no se guarda una que después no se pueda emitir). */
  async solicitarBoleta(user: User, dto: BoletaSueltaDto) {
    const companyId = user.company_id;
    const turnoId = await this.turnoDeRecepcion(user);
    const { lineas, cabana, correo } = lineasDeLaSuelta(
      await this.boletas.tarifario(companyId),
      dto,
      false,
    );
    const armado = armarBoleta({
      fecha: hoyEnChile(),
      receptor: correo ? { correo } : null,
      lineas,
      observaciones: [],
      totalEsperado: null,
      ambiente: this.conexion.de(companyId).ambiente,
    });
    if (!armado.ok)
      throw new BadRequestException(
        `La boleta no se pudo armar: ${armado.problemas.join('. ')}`,
      );
    const pedido: PedidoDeBoleta = { lineas, correo, cabana };
    const s = await this.repo.crear({
      company_id: companyId,
      tipo: BOLETA,
      pedido: pedido as unknown as Record<string, unknown>,
      detalle: lineas,
      total: armado.montos.total,
      medio_de_pago: dto.medio_de_pago,
      correo,
      imprimir: !correo,
      para: cabana,
      turno_de_caja_id: turnoId,
      ...this.quien(user),
    });
    this.logger.info(`solicitud de boleta ${s.id} (turno ${turnoId})`);
    return vista(s);
  }

  /** La factura al contado que manda recepción, revisada igual que al
   *  emitirla. A crédito no pasa por la caja: se emite como siempre. */
  async solicitarFactura(user: User, dto: DtePedido) {
    const turnoId = await this.turnoDeRecepcion(user);
    if (dto.forma_de_pago !== 1)
      throw new BadRequestException(
        'Solo la factura al contado va como solicitud',
      );
    const { pedida, revision } = await this.facturas.revisadaParaSolicitar(
      user,
      dto,
    );
    if (!revision.ok || !revision.montos || !pedida.medio_de_pago)
      throw new BadRequestException(
        revision.faltan.length
          ? `Falta ${revision.faltan.map((f) => f.texto).join(', ')}`
          : revision.problemas.join('. ') || 'Falta el medio de pago',
      );
    const s = await this.repo.crear({
      company_id: user.company_id,
      tipo: FACTURA,
      pedido: pedida as unknown as Record<string, unknown>,
      detalle: revision.lineas,
      total: revision.montos.total,
      medio_de_pago: pedida.medio_de_pago,
      correo: pedida.receptor.correo ?? null,
      imprimir: false,
      para: (pedida.receptor.razon_social || '').slice(0, 100) || null,
      turno_de_caja_id: turnoId,
      ...this.quien(user),
    });
    this.logger.info(`solicitud de factura ${s.id} (turno ${turnoId})`);
    return vista(s);
  }

  /** Las por resolver y las resueltas de los últimos días, para quien
   *  aprueba. */
  async lista(user: User) {
    const desde = new Date(Date.now() - DIAS_DE_RESUELTAS * DIA).toISOString();
    const todas = await this.repo.lista(user.company_id, desde);
    return {
      pendientes: todas.filter((s) => s.estado === 'pendiente').length,
      solicitudes: todas.map((s) => vista(s, todas)),
    };
  }

  /** Las del turno abierto, para que recepción vea cómo van las suyas (y
   *  el PDF de la que se imprime, cuando se emita). */
  async delTurno(user: User) {
    const turno = await this.caja.turnoAbierto(user.company_id);
    if (!turno) return { solicitudes: [] };
    const todas = await this.repo.lista(user.company_id, turno.abierta_en);
    return {
      solicitudes: todas
        .filter((s) => s.turno_de_caja_id === turno.id)
        .map((s) => vista(s)),
    };
  }

  /**
   * «Aprobar y emitir»: la toma (de pendiente a emitiendo, así nadie más la
   * emite) y corre la emisión de siempre con lo guardado y su turno. Si no
   * salió (no se pudo armar o facturacion.cl la rechazó), vuelve a esperar
   * con el porqué. Si no se sabe si salió, se queda «emitiendo» con el
   * error: no vuelve a pendiente, para no emitirla dos veces.
   */
  async aprobar(user: User, id: number) {
    const companyId = user.company_id;
    const s = await this.repo.tomar(companyId, id, {
      resuelta_por: user.id ?? null,
      resuelta_por_nombre: nombreDelPerfil(user),
    });
    if (!s) throw await this.yaNoEspera(companyId, id);
    let documento: DocumentoTributario;
    let aviso: string | null = null;
    try {
      if (s.tipo === BOLETA) {
        const pedido = s.pedido as unknown as PedidoDeBoleta;
        const r = await this.boletas.emitirSolicitada(user, {
          lineas: pedido.lineas,
          correo: pedido.correo,
          cabana: pedido.cabana,
          medioDePago: s.medio_de_pago as MedioDePago,
          turnoDeCajaId: s.turno_de_caja_id,
        });
        documento = r.documento;
        aviso = r.aviso;
      } else
        documento = await this.facturas.emitirPedida(
          user,
          {
            ...(s.pedido as unknown as DtePedido),
            // El medio que quedó (la revisión de la caja pudo corregirlo).
            medio_de_pago: s.medio_de_pago as MedioDePago,
          },
          s.turno_de_caja_id,
        );
    } catch (error) {
      const motivo = mensajeDe(error);
      if (error instanceof BadRequestException)
        await this.repo.devolver(companyId, id, motivo);
      else await this.repo.anotarError(companyId, id, motivo);
      this.logger.warn(`solicitud ${id} sin emitir: ${motivo}`);
      throw error;
    }
    await this.repo.aprobar(companyId, id, documento.id);
    this.logger.info(
      `solicitud ${id} aprobada: ${s.tipo === BOLETA ? 'boleta' : 'factura'} ${documento.folio ?? 'por confirmar'}`,
    );
    const aprobada = await this.repo.una(companyId, id);
    return {
      solicitud: aprobada ? vista(aprobada) : null,
      documento: {
        id: documento.id,
        tipo: documento.tipo,
        folio: documento.folio,
        estado: documento.estado,
        total: Number(documento.total),
        ambiente: documento.ambiente,
        pdf_path: documento.pdf_path ?? null,
      },
      aviso:
        aviso ??
        (documento.estado === 'por_confirmar'
          ? 'Se cortó la conexión con facturacion.cl: queda por confirmar. No la emitas de nuevo: compruébala en «Documentos».'
          : null),
    };
  }

  /** «Rechazar»: nunca va al SII. Su plata sigue contando en la caja. */
  async rechazar(user: User, id: number, dto: RechazarSolicitudDto) {
    const companyId = user.company_id;
    const r = await this.repo.rechazar(companyId, id, {
      resuelta_por: user.id ?? null,
      resuelta_por_nombre: nombreDelPerfil(user),
      motivo_rechazo: textoLimpio(dto.motivo) || null,
    });
    if (!r) throw await this.yaNoEspera(companyId, id);
    this.logger.info(`solicitud ${id} rechazada`);
    return vista(r);
  }

  /** Por qué ya no se puede aprobar ni rechazar. */
  private async yaNoEspera(companyId: number, id: number) {
    const s = await this.repo.una(companyId, id);
    if (!s) return new NotFoundException('Esa solicitud no existe');
    const quien = s.resuelta_por_nombre ? ` (${s.resuelta_por_nombre})` : '';
    return new ConflictException(
      s.estado === 'emitiendo'
        ? `Esa solicitud ya se está emitiendo${quien}`
        : s.estado === 'aprobada'
          ? `Esa solicitud ya se aprobó y emitió${quien}`
          : `Esa solicitud ya se rechazó${quien}`,
    );
  }
}
