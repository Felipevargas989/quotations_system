import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { armarBoleta } from '../archivo/boleta';
import { RUT_AUXILIAR } from '../archivo/comun';
import { textoLimpio } from '../archivo/texto';
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
import {
  CrearCobroDto,
  EditarCobroDto,
  EditarLineaDelCobroDto,
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
const SE_BOLETEA = ['aceptada', 'realizada'];

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const nombreDe = (user: User) => user.full_name?.trim() || user.email || null;
const correoLimpio = (c: string | null | undefined) =>
  (c ?? '').trim().toLowerCase() || null;

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
  ) {
    this.logger.setContext(BoletasService.name);
  }

  /** Lo que queda por boletear. De un evento, todos sus cobros. */
  async porBoletear(companyId: number, quotationId?: string) {
    const cobros = (await this.repo.cobros(companyId, quotationId)).map(vista);
    return {
      ambiente: this.conexion.de(companyId).ambiente,
      cobros: quotationId
        ? cobros
        : cobros.filter((c) => c.porEmitir > 0 || c.falta !== 0),
    };
  }

  /** Las boletas de hoy, para el cierre del día de la casa (L18). */
  async emitidasHoy(companyId: number) {
    const fecha = hoyEnChile();
    const boletas = await this.repo.boletasDelDia(companyId, fecha);
    return {
      fecha,
      ambiente: this.conexion.de(companyId).ambiente,
      boletas: boletas.map((b) => ({
        id: b.id,
        folio: b.folio,
        estado: b.estado,
        ambiente: b.ambiente,
        total: Number(b.total),
        cabana: b.lineas?.[0]?.cabana ?? null,
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
      creado_por_nombre: nombreDe(user),
    });
    return this.uno(id, companyId);
  }

  /** E3: el total y lo que se cobra se cambian, y queda anotado. */
  async editarCobro(user: User, id: number, dto: EditarCobroDto) {
    const companyId = user.company_id;
    const cobro = await this.cargar(id, companyId);
    const { boleteado } = repartoDelCobro(cobro);
    const cambios: { descripcion?: string; total?: number } = {};
    const anotados: Omit<NuevoCambio, 'company_id' | 'cobro_id'>[] = [];
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
      await this.anotar(companyId, id, anotados);
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
    await this.anotar(companyId, cobroId, [
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
    const anotados: Omit<NuevoCambio, 'company_id' | 'cobro_id'>[] = [];
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
      await this.anotar(companyId, cobroId, anotados);
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
    await this.anotar(companyId, cobroId, [
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

  private async emitirUna(
    user: User,
    cobro: CobroGuardado,
    linea: LineaGuardada,
    conexion: FacturacionCl,
    fecha: string,
  ): Promise<{ folio: number | null; alto: string | null }> {
    const companyId = user.company_id;
    const glosa = glosaDeLaBoleta(cobro, linea);
    const armado = armarBoleta({
      fecha,
      receptor: linea.correo ? { correo: linea.correo } : null,
      lineas: [{ descripcion: glosa, cantidad: 1, precio: linea.monto }],
      observaciones: cobro.cotizacion
        ? [`Cotización N° ${cobro.cotizacion.quotation_number}`]
        : [],
      totalEsperado: linea.monto,
    });
    if (!armado.ok)
      return {
        folio: null,
        alto: `La boleta de ${linea.cabana} no se pudo armar: ${armado.problemas.join('. ')}`,
      };

    let doc: DocumentoTributario;
    try {
      doc = await this.documentos.crear({
        company_id: companyId,
        tipo: BOLETA,
        ambiente: conexion.ambiente,
        estado: 'enviando',
        receptor: {
          rut: RUT_AUXILIAR,
          razon_social: '',
          correo: linea.correo,
        },
        detalle: [{ descripcion: glosa, cantidad: 1, precio: linea.monto }],
        referencias: [],
        neto: armado.montos.neto,
        exento: 0,
        iva: armado.montos.iva,
        total: armado.montos.total,
        quotation_id: cobro.quotation_id,
        orden_de_compra_id: null,
        porcentaje: null,
        creado_por: user.id ?? null,
        archivo_enviado: armado.archivo,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505')
        return {
          folio: null,
          alto: 'Ya se está emitiendo un documento de este evento: espera su respuesta.',
        };
      throw error;
    }
    // Amarrada ANTES de mandarla: un corte no la emite dos veces.
    await this.repo.editarLinea(linea.id, cobro.id, companyId, {
      documento_id: doc.id,
    });

    let respuesta: RespuestaDeProcesar;
    try {
      respuesta = await conexion.procesar(armado.archivo, BOLETA);
    } catch (error) {
      const motivo =
        error instanceof EnvioSinRespuesta
          ? error.message
          : `El envío falló sin respuesta: ${mensajeDe(error)}`;
      await this.documentos.actualizar(doc.id, companyId, {
        estado: 'por_confirmar',
        error: motivo,
      });
      return {
        folio: null,
        alto: `La boleta de ${linea.cabana} quedó por confirmar: se cortó al mandarla. No la emitas de nuevo.`,
      };
    }
    if (respuesta.resultado === 'rechazado') {
      await this.documentos.actualizar(doc.id, companyId, {
        estado: 'rechazado',
        error: respuesta.mensaje,
        respuesta: respuesta.crudo,
      });
      // No salió: la cabaña vuelve a quedar por boletear.
      await this.repo.editarLinea(linea.id, cobro.id, companyId, {
        documento_id: null,
      });
      return {
        folio: null,
        alto: `facturacion.cl no aceptó la boleta de ${linea.cabana}: ${respuesta.mensaje}`,
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
        `boleta ${respuesta.folio} del cobro ${cobro.id} emitida y SIN anotar: ${mensajeDe(error)}`,
      );
      throw new InternalServerErrorException(
        `La boleta N° ${respuesta.folio} de ${linea.cabana} salió, pero Eventia no la pudo anotar. No la emitas de nuevo: avisa para revisarla.`,
      );
    }
    // Lo que sigue no cambia la boleta: si falla, se registra y sigue.
    await guardarCopiaDelPdf(
      this.documentos,
      conexion,
      emitido,
      companyId,
      cobro.quotation_id,
    ).catch((e: unknown) =>
      this.logger.warn(`PDF de la boleta ${emitido.folio}: ${mensajeDe(e)}`),
    );
    await this.anotar(companyId, cobro.id, [
      this.cambio(
        user,
        linea.id,
        'emite',
        null,
        `Boleta N° ${respuesta.folio}`,
      ),
    ]).catch((e: unknown) =>
      this.logger.warn(`no pude anotar la boleta: ${mensajeDe(e)}`),
    );
    return { folio: respuesta.folio, alto: null };
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
  ): Omit<NuevoCambio, 'company_id' | 'cobro_id'> {
    return {
      linea_id: lineaId,
      que,
      antes,
      despues,
      usuario: user.id ?? null,
      nombre: nombreDe(user),
    };
  }

  private anotar(
    companyId: number,
    cobroId: number,
    cambios: Omit<NuevoCambio, 'company_id' | 'cobro_id'>[],
  ) {
    return this.repo.anotar(
      cambios.map((c) => ({ ...c, company_id: companyId, cobro_id: cobroId })),
    );
  }
}
