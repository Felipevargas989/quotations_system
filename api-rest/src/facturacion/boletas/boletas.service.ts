import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { armarBoleta } from '../archivo/boleta';
import { RUT_AUXILIAR } from '../archivo/comun';
import { textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle } from '../archivo/tipos';
import {
  EnvioSinRespuesta,
  type FacturacionCl,
  type RespuestaDeProcesar,
} from '../facturacion-cl/facturacion-cl';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import { guardarCopiaDelPdf } from '../facturas/copia-del-pdf';
import {
  DocumentosTributariosRepository,
  type DocumentoTributario,
} from '../facturas/documentos-tributarios.repository';
import { OrdenesDeCompraRepository } from '../ordenes-de-compra/ordenes-de-compra.repository';
import {
  BoletaSueltaDto,
  CrearCobroDto,
  EditarCobroDto,
  EditarItemDelTarifarioDto,
  EditarLineaDelCobroDto,
  ItemDelTarifarioDto,
  LineaDelCobroDto,
} from './boleta.dto';
import {
  BoletasRepository,
  type CobroGuardado,
  type LineaGuardada,
  type NuevoCambio,
} from './boletas.repository';
import {
  glosaDeLaBoleta,
  problemasParaEmitir,
  repartoDelCobro,
} from './reparto';
import { correoLimpio, lineasDeLaSuelta } from './suelta';

/**
 * LAS BOLETAS DE RECEPCIÓN (doc 19 §9.4, paso 3a).
 *
 * El administrador deja un cobro «por boletear» (desde el evento o
 * suelto); recepción lo reparte por cabaña, con el correo del huésped si lo
 * da, y emite una boleta por cabaña. Eventia no deja emitir si lo repartido
 * no suma el total. E3 (Felipe, 04-11): *"debe ser editable"*, y cada
 * cambio queda anotado con quién lo hizo.
 *
 * Cada boleta pasa por los candados de la factura (§5.3): el registro en
 * `enviando` antes de mandarla, `procesar` sin reintentos (si se corta,
 * «por confirmar», L5) y la línea amarrada a su boleta ANTES de mandarla,
 * para que un corte no la emita dos veces. La boleta va con folio 0: lo
 * pone facturacion.cl.
 */

const BOLETA = 39;

type Cambio = Omit<NuevoCambio, 'company_id' | 'cobro_id' | 'nombre'>;
const SE_BOLETEA = ['aceptada', 'realizada'];

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
/** «felipe@valledelsolquillon.cl» → «Felipe», cuando el perfil no trae
 *  nombre (como la bitácora, `QuotationFollowupsService`). */
const nombreDelCorreo = (correo?: string | null): string | null => {
  const base = (correo ?? '').split('@')[0].trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
};

/** El cobro como lo ve la pantalla. */
const vista = (c: CobroGuardado) => ({
  id: c.id,
  quotation_id: c.quotation_id,
  numero: c.cotizacion?.quotation_number ?? null,
  descripcion: c.descripcion,
  total: c.total,
  creado_por_nombre: c.creado_por_nombre,
  created_at: c.created_at,
  lineas: c.lineas.map((l) => ({
    id: l.id,
    cabana: l.cabana,
    monto: l.monto,
    correo: l.correo,
    folio: l.documento?.folio ?? null,
    estado: l.documento?.estado ?? null,
    pdf_path: l.documento?.pdf_path ?? null,
  })),
  cambios: c.cambios.map((x) => ({
    que: x.que,
    antes: x.antes,
    despues: x.despues,
    nombre: x.nombre,
    created_at: x.created_at,
    // La cabaña del cambio, si sigue en el reparto («El monto de Cabaña 5»).
    cabana:
      x.linea_id != null
        ? (c.lineas.find((l) => l.id === x.linea_id)?.cabana ?? null)
        : null,
  })),
  ...repartoDelCobro(c),
});

@Injectable()
export class BoletasService {
  constructor(
    private readonly repo: BoletasRepository,
    private readonly documentos: DocumentosTributariosRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly logger: PinoLogger,
    /** El emisor de la vista previa (§9.22, sprint 3). */
    private readonly ordenes: OrdenesDeCompraRepository,
  ) {
    this.logger.setContext(BoletasService.name);
  }

  /** Lo que queda por boletear. De un evento, todos sus cobros. */
  async porBoletear(companyId: number, quotationId?: string) {
    const cobros = (await this.repo.cobros(companyId, quotationId)).map(vista);
    const conexion = this.conexion.de(companyId);
    return {
      ambiente: conexion.ambiente,
      sin_conexion: conexion.sinConexion ?? null,
      cobros: quotationId
        ? cobros
        : cobros.filter((c) => c.porEmitir > 0 || c.falta !== 0),
    };
  }

  /** Las boletas de hoy, para el cierre del día de la casa (L18). */
  async emitidasHoy(companyId: number) {
    const fecha = hoyEnChile();
    const boletas = await this.repo.boletasDelDia(companyId, fecha);
    const conexion = this.conexion.de(companyId);
    return {
      fecha,
      ambiente: conexion.ambiente,
      sin_conexion: conexion.sinConexion ?? null,
      boletas: boletas.map((b) => ({
        id: b.id,
        folio: b.folio,
        estado: b.estado,
        ambiente: b.ambiente,
        total: Number(b.total),
        cabana:
          b.lineas?.[0]?.cabana ??
          (b.detalle?.[0] as { cabana?: string | null } | undefined)?.cabana ??
          null,
        descripcion: b.detalle?.[0]?.descripcion ?? null,
        correo: b.receptor?.correo ?? null,
        pdf_path: b.pdf_path,
        emitido_en: b.emitido_en,
      })),
    };
  }

  async crearCobro(user: User, dto: CrearCobroDto) {
    const companyId = user.company_id;
    if (dto.quotation_id) {
      const evento = await this.documentos.eventoAFacturar(
        dto.quotation_id,
        companyId,
      );
      if (!evento) throw new NotFoundException('Ese evento no existe');
      if (!SE_BOLETEA.includes(evento.estado))
        throw new BadRequestException(
          'Se boletea un evento aceptado o ya realizado',
        );
    }
    const id = await this.repo.crearCobro({
      company_id: companyId,
      quotation_id: dto.quotation_id ?? null,
      descripcion: textoLimpio(dto.descripcion),
      total: dto.total,
      creado_por: user.id ?? null,
      creado_por_nombre: await this.nombreDe(user),
    });
    return this.uno(id, companyId);
  }

  /** E3: el total y lo que se cobra se cambian, y queda anotado. */
  async editarCobro(user: User, id: number, dto: EditarCobroDto) {
    const companyId = user.company_id;
    const cobro = await this.cargar(id, companyId);
    const { boleteado } = repartoDelCobro(cobro);
    const cambios: { descripcion?: string; total?: number } = {};
    const anotados: Cambio[] = [];
    if (dto.descripcion !== undefined) {
      const descripcion = textoLimpio(dto.descripcion);
      if (descripcion !== cobro.descripcion) {
        // Va impresa en cada boleta: las que ya salieron no cambian.
        if (boleteado > 0)
          throw new ConflictException(
            'Con boletas emitidas, lo que se cobra ya no cambia: va impreso en ellas',
          );
        cambios.descripcion = descripcion;
        anotados.push(
          this.cambio(
            user,
            null,
            'descripcion',
            cobro.descripcion,
            descripcion,
          ),
        );
      }
    }
    if (dto.total !== undefined && dto.total !== cobro.total) {
      if (dto.total < boleteado)
        throw new BadRequestException(
          `Ya hay ${pesos(boleteado)} boleteados: el total no puede quedar bajo eso`,
        );
      cambios.total = dto.total;
      anotados.push(
        this.cambio(user, null, 'total', pesos(cobro.total), pesos(dto.total)),
      );
    }
    if (anotados.length) {
      await this.repo.editarCobro(id, companyId, cambios);
      await this.anotar(user, id, anotados);
    }
    return this.uno(id, companyId);
  }

  async borrarCobro(user: User, id: number) {
    const cobro = await this.cargar(id, user.company_id);
    if (cobro.lineas.some((l) => l.documento_id != null))
      throw new ConflictException(
        'Ese cobro ya tiene boletas: no se borra (un documento tributario no se borra)',
      );
    await this.repo.borrarCobro(id, user.company_id);
    return { borrado: id };
  }

  async agregarLinea(user: User, cobroId: number, dto: LineaDelCobroDto) {
    const companyId = user.company_id;
    await this.cargar(cobroId, companyId);
    const cabana = textoLimpio(dto.cabana);
    const lineaId = await this.repo.agregarLinea({
      company_id: companyId,
      cobro_id: cobroId,
      cabana,
      monto: dto.monto,
      correo: correoLimpio(dto.correo),
      creado_por: user.id ?? null,
    });
    await this.anotar(user, cobroId, [
      this.cambio(
        user,
        lineaId,
        'agrega',
        null,
        `${cabana} ${pesos(dto.monto)}`,
      ),
    ]);
    return this.uno(cobroId, companyId);
  }

  async editarLinea(
    user: User,
    cobroId: number,
    lineaId: number,
    dto: EditarLineaDelCobroDto,
  ) {
    const companyId = user.company_id;
    const linea = this.lineaSinBoleta(
      await this.cargar(cobroId, companyId),
      lineaId,
    );
    const cambios: { cabana?: string; monto?: number; correo?: string | null } =
      {};
    const anotados: Cambio[] = [];
    if (dto.cabana !== undefined) {
      const cabana = textoLimpio(dto.cabana);
      if (cabana !== linea.cabana) {
        cambios.cabana = cabana;
        anotados.push(
          this.cambio(user, lineaId, 'cabana', linea.cabana, cabana),
        );
      }
    }
    if (dto.monto !== undefined && dto.monto !== linea.monto) {
      cambios.monto = dto.monto;
      anotados.push(
        this.cambio(
          user,
          lineaId,
          'monto',
          pesos(linea.monto),
          pesos(dto.monto),
        ),
      );
    }
    if (dto.correo !== undefined) {
      const correo = correoLimpio(dto.correo);
      if (correo !== (linea.correo ?? null)) {
        cambios.correo = correo;
        anotados.push(
          this.cambio(user, lineaId, 'correo', linea.correo, correo),
        );
      }
    }
    if (anotados.length) {
      await this.repo.editarLinea(lineaId, cobroId, companyId, cambios);
      await this.anotar(user, cobroId, anotados);
    }
    return this.uno(cobroId, companyId);
  }

  async quitarLinea(user: User, cobroId: number, lineaId: number) {
    const companyId = user.company_id;
    const linea = this.lineaSinBoleta(
      await this.cargar(cobroId, companyId),
      lineaId,
    );
    await this.repo.quitarLinea(lineaId, cobroId, companyId);
    await this.anotar(user, cobroId, [
      this.cambio(
        user,
        lineaId,
        'quita',
        `${linea.cabana} ${pesos(linea.monto)}`,
        null,
      ),
    ]);
    return this.uno(cobroId, companyId);
  }

  /** El tarifario (D3): lo que se boletea suelto. Recepción ve los
   *  activos para elegir; el administrador, todos. */
  async tarifario(companyId: number) {
    return this.repo.tarifario(companyId);
  }

  async crearItem(user: User, dto: ItemDelTarifarioDto) {
    await this.repo.crearItem({
      company_id: user.company_id,
      nombre: textoLimpio(dto.nombre),
      precio: dto.precio,
      unidad: dto.unidad,
      creado_por: user.id ?? null,
    });
    return this.repo.tarifario(user.company_id);
  }

  async editarItem(user: User, id: number, dto: EditarItemDelTarifarioDto) {
    const cambios: EditarItemDelTarifarioDto = { ...dto };
    if (dto.nombre !== undefined) cambios.nombre = textoLimpio(dto.nombre);
    if (!(await this.repo.editarItem(id, user.company_id, cambios)))
      throw new NotFoundException('Ese ítem del tarifario no existe');
    return this.repo.tarifario(user.company_id);
  }

  // Una boleta guarda su propia copia de lo cobrado: quitar un ítem no
  // cambia ninguna boleta.
  async borrarItem(user: User, id: number) {
    if (!(await this.repo.borrarItem(id, user.company_id)))
      throw new NotFoundException('Ese ítem del tarifario no existe');
    return this.repo.tarifario(user.company_id);
  }

  /**
   * La boleta suelta (§9.4, 3b): lo del tarifario por su cantidad, con la
   * cabaña (la escribe recepción) en la observación. Escribir un monto a
   * mano es solo del administrador: los precios nunca a dedo.
   */
  /**
   * La boleta de «Nuevo documento» tal como saldrá (doc 19 §9.22, sprint
   * 3): las mismas líneas y el mismo armado que al emitirla
   * (`lineasDeLaSuelta` y `armarBoleta`), así que lo que se ve es lo que
   * sale. El N° es el que debería tocarle: lo pone facturacion.cl. No
   * guarda nada.
   */
  async revisarSuelta(user: User, dto: BoletaSueltaDto) {
    const companyId = user.company_id;
    const { lineas, correo } = await this.lineasDeLaSuelta(user, dto);
    const conexion = this.conexion.de(companyId);
    const fecha = hoyEnChile();
    const armado = armarBoleta({
      fecha,
      receptor: correo ? { correo } : null,
      lineas,
      observaciones: [],
      totalEsperado: null,
      ambiente: conexion.ambiente,
    });
    const [folio, emisor] = await Promise.all([
      conexion.folioSiguiente(BOLETA).catch(() => 0),
      this.ordenes.empresaQueVende(companyId),
    ]);
    return {
      ok: armado.ok,
      problemas: armado.ok ? [] : armado.problemas,
      avisos: armado.ok ? armado.avisos : [],
      faltan: [],
      folio,
      fecha,
      emisor,
      lineas: lineas.map((l) => ({
        descripcion: l.descripcion,
        descripcionLarga: l.descripcionLarga ?? null,
        cantidad: l.cantidad,
        precio: l.precio,
      })),
      montos: armado.ok ? armado.montos : null,
      observaciones: [],
      correo,
      ambiente: conexion.ambiente,
    };
  }

  async emitirSuelta(user: User, dto: BoletaSueltaDto) {
    const companyId = user.company_id;
    const { lineas, cabana, correo } = await this.lineasDeLaSuelta(user, dto);
    const conexion = this.conexion.de(companyId);
    const r = await this.emitirBoleta(user, conexion, hoyEnChile(), {
      lineas,
      correo,
      observaciones: [],
      quotationId: null,
      cabana,
      cual: 'la boleta',
      totalEsperado: null,
    });
    if (!r.emitido && !r.porConfirmar)
      throw new BadRequestException(r.alto ?? 'No se pudo emitir la boleta');
    this.logger.info(
      `boleta suelta ${r.emitido?.folio ?? 'por confirmar'} (${conexion.ambiente})`,
    );
    return {
      boleta: r.emitido
        ? {
            id: r.emitido.id,
            folio: r.emitido.folio,
            estado: r.emitido.estado,
            total: Number(r.emitido.total),
            pdf_path: r.emitido.pdf_path,
          }
        : null,
      aviso: r.alto,
    };
  }

  /** Las líneas de la boleta suelta (`suelta.ts`): las mismas para la vista
   *  previa y para emitirla. */
  private async lineasDeLaSuelta(user: User, dto: BoletaSueltaDto) {
    return lineasDeLaSuelta(
      await this.repo.tarifario(user.company_id),
      dto,
      user.role === UserRole.ADMINISTRADOR,
    );
  }

  /**
   * La boleta del evento (doc 19 §9.20): el DTE que el administrador emite
   * desde la pestaña Facturación, con sus líneas con IVA y el correo del
   * cliente. Ya viene revisada (`revisarDte`, la misma de la vista previa).
   * Devuelve la boleta emitida, o la que quedó «por confirmar» (L5).
   */
  async emitirDelEvento(
    user: User,
    conexion: FacturacionCl,
    b: {
      quotationId: string;
      lineas: LineaDeDetalle[];
      correo: string | null;
      observaciones: string[];
      totalEsperado: number;
    },
  ): Promise<DocumentoTributario> {
    const r = await this.emitirBoleta(user, conexion, hoyEnChile(), {
      lineas: b.lineas,
      correo: correoLimpio(b.correo),
      observaciones: b.observaciones,
      quotationId: b.quotationId,
      cabana: null,
      cual: 'la boleta',
      totalEsperado: b.totalEsperado,
    });
    if (r.emitido) return r.emitido;
    if (r.porConfirmar && r.documento) return r.documento;
    throw new BadRequestException(r.alto ?? 'No se pudo emitir la boleta');
  }

  /**
   * Una boleta por cada cabaña que falta, solo si lo repartido suma el
   * total. Si una se corta o facturacion.cl la rechaza, se detiene ahí y lo
   * dice: las que ya salieron quedan emitidas.
   */
  async emitir(user: User, cobroId: number) {
    const companyId = user.company_id;
    const cobro = await this.cargar(cobroId, companyId);
    const problemas = problemasParaEmitir(cobro);
    if (problemas.length) throw new BadRequestException(problemas.join('. '));
    const conexion = this.conexion.de(companyId);
    const fecha = hoyEnChile();
    const emitidas: number[] = [];
    let aviso: string | null = null;
    for (const linea of cobro.lineas.filter((l) => l.documento_id == null)) {
      const r = await this.emitirUna(user, cobro, linea, conexion, fecha);
      if (r.folio != null) emitidas.push(r.folio);
      if (r.alto) {
        aviso = r.alto;
        break;
      }
    }
    this.logger.info(
      `cobro ${cobroId}: ${emitidas.length} boletas (${conexion.ambiente})${aviso ? `; se detuvo: ${aviso}` : ''}`,
    );
    return { cobro: await this.uno(cobroId, companyId), emitidas, aviso };
  }

  /** La boleta de una cabaña del cobro, amarrada a su línea. */
  private async emitirUna(
    user: User,
    cobro: CobroGuardado,
    linea: LineaGuardada,
    conexion: FacturacionCl,
    fecha: string,
  ): Promise<{ folio: number | null; alto: string | null }> {
    const companyId = user.company_id;
    const glosa = glosaDeLaBoleta(cobro, linea);
    const r = await this.emitirBoleta(user, conexion, fecha, {
      lineas: [{ descripcion: glosa, cantidad: 1, precio: linea.monto }],
      correo: linea.correo,
      observaciones: cobro.cotizacion
        ? [`Cotización N° ${cobro.cotizacion.quotation_number}`]
        : [],
      quotationId: cobro.quotation_id,
      cabana: linea.cabana,
      cual: `la boleta de ${linea.cabana}`,
      totalEsperado: linea.monto,
      // Amarrada ANTES de mandarla: un corte no la emite dos veces.
      antesDeMandar: (docId) =>
        this.repo.editarLinea(linea.id, cobro.id, companyId, {
          documento_id: docId,
        }),
      // No salió: la cabaña vuelve a quedar por boletear.
      siLaRechazan: () =>
        this.repo.editarLinea(linea.id, cobro.id, companyId, {
          documento_id: null,
        }),
    });
    if (r.emitido)
      await this.anotar(user, cobro.id, [
        this.cambio(
          user,
          linea.id,
          'emite',
          null,
          `Boleta N° ${r.emitido.folio}`,
        ),
      ]).catch((e: unknown) =>
        this.logger.warn(`no pude anotar la boleta: ${mensajeDe(e)}`),
      );
    return { folio: r.emitido?.folio ?? null, alto: r.alto };
  }

  /**
   * UNA boleta (39) con los candados de la factura (§5.3): `enviando` antes
   * de mandarla, `procesar` sin reintentos (si se corta, «por confirmar»,
   * L5) y, emitida, su copia del PDF. La usan el reparto de un cobro y la
   * boleta suelta.
   */
  private async emitirBoleta(
    user: User,
    conexion: FacturacionCl,
    fecha: string,
    b: {
      lineas: LineaDeDetalle[];
      correo: string | null;
      observaciones: string[];
      quotationId: string | null;
      /** La cabaña, para la pantalla (no va en el archivo). */
      cabana: string | null;
      /** «la boleta de Cabaña 4», para los avisos. */
      cual: string;
      totalEsperado: number | null;
      antesDeMandar?: (docId: number) => Promise<void>;
      siLaRechazan?: () => Promise<void>;
    },
  ): Promise<{
    emitido: DocumentoTributario | null;
    alto: string | null;
    /** Se cortó al mandarla: puede haber salido (L5). */
    porConfirmar?: boolean;
    /** La que quedó por confirmar. */
    documento?: DocumentoTributario;
  }> {
    const companyId = user.company_id;
    const Cual = b.cual.charAt(0).toUpperCase() + b.cual.slice(1);
    const armado = armarBoleta({
      fecha,
      receptor: b.correo ? { correo: b.correo } : null,
      lineas: b.lineas,
      observaciones: b.observaciones,
      totalEsperado: b.totalEsperado,
      ambiente: conexion.ambiente,
    });
    if (!armado.ok)
      return {
        emitido: null,
        alto: `${Cual} no se pudo armar: ${armado.problemas.join('. ')}`,
      };

    let doc: DocumentoTributario;
    try {
      doc = await this.documentos.crear({
        company_id: companyId,
        tipo: BOLETA,
        ambiente: conexion.ambiente,
        estado: 'enviando',
        receptor: { rut: RUT_AUXILIAR, razon_social: '', correo: b.correo },
        detalle: b.lineas.map((l) => ({ ...l, cabana: b.cabana })),
        referencias: [],
        neto: armado.montos.neto,
        exento: 0,
        iva: armado.montos.iva,
        total: armado.montos.total,
        quotation_id: b.quotationId,
        orden_de_compra_id: null,
        porcentaje: null,
        creado_por: user.id ?? null,
        archivo_enviado: armado.archivo,
        // La boleta va con folio 0: el que debería tocarle, para
        // «Comprobar» si se corta (L5).
        respuesta: { folio_esperado: await conexion.folioSiguiente(BOLETA) },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505')
        return {
          emitido: null,
          alto: 'Ya se está emitiendo un documento de este evento: espera su respuesta.',
        };
      throw error;
    }
    if (b.antesDeMandar) await b.antesDeMandar(doc.id);

    let respuesta: RespuestaDeProcesar;
    try {
      respuesta = await conexion.procesar(armado.archivo, BOLETA);
    } catch (error) {
      const motivo =
        error instanceof EnvioSinRespuesta
          ? error.message
          : `El envío falló sin respuesta: ${mensajeDe(error)}`;
      const porConfirmar = await this.documentos.actualizar(doc.id, companyId, {
        estado: 'por_confirmar',
        error: motivo,
      });
      return {
        emitido: null,
        alto: `${Cual} quedó por confirmar: se cortó al mandarla. No la emitas de nuevo.`,
        porConfirmar: true,
        documento: porConfirmar,
      };
    }
    if (respuesta.resultado === 'rechazado') {
      await this.documentos.actualizar(doc.id, companyId, {
        estado: 'rechazado',
        error: respuesta.mensaje,
        respuesta: respuesta.crudo,
      });
      if (b.siLaRechazan) await b.siLaRechazan();
      return {
        emitido: null,
        alto: `facturacion.cl no aceptó ${b.cual}: ${respuesta.mensaje}`,
      };
    }

    let emitido: DocumentoTributario;
    try {
      emitido = await this.documentos.actualizar(doc.id, companyId, {
        estado: 'emitido',
        folio: respuesta.folio,
        fecha_emision: respuesta.fecha ?? fecha,
        respuesta: respuesta.crudo,
        url_original: respuesta.urlOriginal,
        url_cedible: respuesta.urlCedible,
        emitido_por: user.id ?? null,
        emitido_en: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `boleta ${respuesta.folio} emitida y SIN anotar: ${mensajeDe(error)}`,
      );
      throw new InternalServerErrorException(
        `La boleta N° ${respuesta.folio} salió, pero Eventia no la pudo anotar. No la emitas de nuevo: avisa para revisarla.`,
      );
    }
    // Lo que sigue no cambia la boleta: si falla, se registra y sigue.
    const conPdf = await guardarCopiaDelPdf(
      this.documentos,
      conexion,
      emitido,
      companyId,
      b.quotationId,
    ).catch((e: unknown) => {
      this.logger.warn(`PDF de la boleta ${emitido.folio}: ${mensajeDe(e)}`);
      return emitido;
    });
    return { emitido: conPdf, alto: null };
  }

  private async cargar(id: number, companyId: number) {
    const cobro = await this.repo.cobro(id, companyId);
    if (!cobro) throw new NotFoundException('Ese cobro no existe');
    return cobro;
  }

  private async uno(id: number, companyId: number) {
    return vista(await this.cargar(id, companyId));
  }

  private lineaSinBoleta(cobro: CobroGuardado, lineaId: number) {
    const linea = cobro.lineas.find((l) => l.id === lineaId);
    if (!linea) throw new NotFoundException('Esa cabaña no está en este cobro');
    if (linea.documento_id != null)
      throw new ConflictException(
        'Esa cabaña ya tiene su boleta: no se cambia ni se quita',
      );
    return linea;
  }

  private cambio(
    user: User,
    lineaId: number | null,
    que: string,
    antes: string | null,
    despues: string | null,
  ): Cambio {
    return {
      linea_id: lineaId,
      que,
      antes,
      despues,
      usuario: user.id ?? null,
    };
  }

  /** El nombre de quien cambia: el de su perfil (`user_profiles`), como
   *  firma la bitácora; si no tiene, el de la sesión o el del correo. Lo
   *  usa también «Ya está facturado» de «Por facturar» (§9.24). */
  async nombreDe(user: User): Promise<string | null> {
    const delPerfil = user.id
      ? await this.repo
          .nombreDeLaPersona(user.company_id, user.id)
          .catch(() => null)
      : null;
    return delPerfil || user.full_name?.trim() || nombreDelCorreo(user.email);
  }

  private async anotar(user: User, cobroId: number, cambios: Cambio[]) {
    const nombre = await this.nombreDe(user);
    return this.repo.anotar(
      cambios.map((c) => ({
        ...c,
        company_id: user.company_id,
        cobro_id: cobroId,
        nombre,
      })),
    );
  }
}
