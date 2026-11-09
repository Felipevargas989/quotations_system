import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { permisosDelCargo, type Permiso } from 'src/auth/permisos';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { hoyEnChile } from '../../oportunidades/analisis/comun';
import { diasEntre, sumarDias } from '../../quotations/generar/fechas';
import { armarFactura } from '../archivo/factura';
import { netoParaElTotal } from '../archivo/montos';
import {
  fechaDelArchivo,
  folioDelArchivo,
  textoLimpio,
} from '../archivo/texto';
import type { LineaDeDetalle, Receptor } from '../archivo/tipos';
import { BoletasRepository } from '../boletas/boletas.repository';
import {
  NOTA_DEL_AMBIENTE,
  type AmbienteDeFacturacion,
} from '../facturacion-cl/facturacion-cl';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import {
  guardarCopiaDelPdf,
  guardarCopiaDelPdfAlEmitir,
} from '../facturas/copia-del-pdf';
import {
  DocumentosTributariosRepository,
  type DocumentoTributario,
} from '../facturas/documentos-tributarios.repository';
import { mandarConFolio } from '../facturas/emision';
import { nombreDelPdfDe } from '../facturas/nombre-del-pdf';
import { OrdenesDeCompraRepository } from '../ordenes-de-compra/ordenes-de-compra.repository';
import {
  Cadena,
  NOMBRE_CORTO,
  NOMBRE_LARGO,
  QUE_HACE,
  estadoCorto,
  facturadoDeLasOC,
  nombreDe,
  plazoDelSii,
} from './cadena';
import { NotaPedidaDto } from './nota.dto';

/**
 * LA LISTA DE FACTURACIÓN Y LAS NOTAS (doc 19 §9.5, paso 4; maqueta del
 * 04-11). Solo el administrador (E5).
 *
 * - La lista: todo lo emitido en un mes (facturas, boletas y notas), cada
 *   documento con su estado en la cadena («Anulada por NC 88», «Rebajada:
 *   queda $…», «Vigente»), lo facturado del mes y lo que espera «Comprobar».
 * - Las notas: la de crédito (61) anula (1), corrige un texto en $0 (2) o
 *   rebaja (3) una factura, y anula una nota de débito; la de débito (56)
 *   anula una nota de crédito. Cada una referencia UN documento y queda
 *   amarrada a él (`modifica_id`). Nunca pasa del saldo de lo que modifica.
 *   La nota de crédito de una boleta se prueba en el paso 0 (L21).
 * - «Comprobar»: lo que se cortó al mandarlo. Si el folio avanzó en
 *   facturacion.cl, salió; si no, no salió y se puede emitir de nuevo.
 */

const NC = 61;
const ND = 56;
const CON_NOTAS = new Set([33, ND, NC]);
const EN_PALABRAS: Record<AmbienteDeFacturacion, string> = {
  simulado: 'en el modo simulado',
  prueba: 'en el ambiente de prueba',
  produccion: 'en producción',
};
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const fechaCorta = (f: string) => f.slice(0, 10).split('-').reverse().join('-');

/** El primer y el siguiente día del mes (AAAA-MM-DD). */
const delMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const siguiente =
    m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return { desde: `${mes}-01`, hasta: `${siguiente}-01` };
};

/** Un mes (AAAA-MM) o un rango de fechas con las dos incluidas (§9.22). */
export type PeriodoDeLaLista =
  | string
  | { desde?: string; hasta?: string }
  | undefined;

/** Hasta un año de documentos por vez: lo que cabe en la pantalla y en el
 *  reporte de una sola pasada. */
const MAXIMO_DE_DIAS = 366;

/** ¿Es una fecha del calendario? (AAAA-MM-DD; el 31-02 no). */
const esFecha = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(f) &&
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === f
  );
};

/**
 * El período de la lista (doc 19 §9.22, sprint 2): el mes que se pide (el
 * de hoy si no se dice), o el rango «desde»–«hasta» de los filtros, con las
 * dos fechas incluidas. `hastaExcluido` es el día siguiente a «hasta», como
 * lo pide la consulta.
 */
export const periodoDeLaLista = (periodo: PeriodoDeLaLista, hoy: string) => {
  if (typeof periodo === 'object') {
    const { desde, hasta } = periodo;
    if (!desde || !hasta)
      throw new BadRequestException('Faltan las dos fechas: desde y hasta');
    if (!esFecha(desde) || !esFecha(hasta))
      throw new BadRequestException('Esa fecha no existe en el calendario');
    if (desde > hasta)
      throw new BadRequestException('La fecha «desde» va antes que «hasta»');
    if (diasEntre(desde, hasta) + 1 > MAXIMO_DE_DIAS)
      throw new BadRequestException(
        'El rango va hasta un año: acórtalo o bájalo por partes',
      );
    return {
      mes: desde.slice(0, 7),
      desde,
      hasta,
      hastaExcluido: sumarDias(hasta, 1),
    };
  }
  const mes = periodo ?? hoy.slice(0, 7);
  const { desde, hasta: hastaExcluido } = delMes(mes);
  return { mes, desde, hasta: sumarDias(hastaExcluido, -1), hastaExcluido };
};

/**
 * Cómo queda cada documento para el filtro «Estado» de la lista (§9.22):
 * vigente (también la corregida, que vale entera), rebajada, anulada o por
 * confirmar; una nota que no está anulada es solo una nota.
 */
/**
 * Lo que le queda a una factura rebajada (§9.42): lo emitido menos sus
 * rebajas vigentes, en el neto, el IVA y el total. La lista lo pone bajo lo
 * original tachado.
 */
export const quedaDe = (
  factura: { neto: unknown; iva: unknown; total: unknown },
  rebajas: ({ neto: number; iva: number; total: number } | undefined)[],
) => {
  const menos = (campo: 'neto' | 'iva' | 'total') =>
    Math.round(
      Number(factura[campo]) -
        rebajas.reduce((s, n) => s + (Number(n?.[campo]) || 0), 0),
    );
  return { neto: menos('neto'), iva: menos('iva'), total: menos('total') };
};

export type SituacionEnLaLista =
  | 'vigente'
  | 'rebajada'
  | 'anulada'
  | 'por_confirmar'
  | 'nota';

@Injectable()
export class NotasService {
  constructor(
    private readonly documentos: DocumentosTributariosRepository,
    private readonly boletas: BoletasRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
    /** El emisor de la vista previa (§9.22, sprint 3). */
    private readonly ordenes: OrdenesDeCompraRepository,
  ) {
    this.logger.setContext(NotasService.name);
  }

  /** La lista de Facturación de un mes, con la cadena. Anular, rebajar,
   *  corregir y «Comprobar» se ofrecen solo al administrador (E5); los
   *  demás miran, bajan el reporte y piden el PDF (§9.19). */
  async lista(
    companyId: number,
    periodo: PeriodoDeLaLista,
    cargo: UserRole,
    permisos: readonly Permiso[] = permisosDelCargo(cargo),
    tipos?: number[],
  ) {
    const hoy = hoyEnChile();
    const { mes, desde, hasta, hastaExcluido } = periodoDeLaLista(periodo, hoy);
    const [delPeriodo, todos] = await Promise.all([
      this.documentos.delPeriodo(companyId, desde, hastaExcluido, tipos),
      this.documentos.cadenaDeLaEmpresa(companyId),
    ]);
    const cadena = new Cadena(todos);
    const porId = new Map(todos.map((d) => [d.id, d]));
    const conexion = this.conexion.de(companyId);
    // Las notas salen en el ambiente de lo que modifican, y «Comprobar» y
    // «Pedir el PDF» necesitan la conexión de ese ambiente (§9.18): lo que
    // no se puede, no se ofrece.
    const aMano = (ambiente: AmbienteDeFacturacion) =>
      this.conexion.de(companyId, ambiente) != null;
    // Desde los permisos por cargo (doc 22 §7): anular o rebajar es
    // `facturacion_notas` y «Comprobar», `facturacion_ajustes`. De fábrica,
    // los dos son del administrador, como antes.
    const conNotasPermiso = permisos.includes('facturacion_notas');
    const conAjustes = permisos.includes('facturacion_ajustes');

    const documentos = delPeriodo.map((d) => {
      const total = Number(d.total);
      const emitido = d.estado === 'emitido';
      const conCadena = emitido && CON_NOTAS.has(d.tipo);
      const conNotas =
        conNotasPermiso && conCadena && d.ambiente === conexion.ambiente;
      const estado = conCadena
        ? cadena.estado(d.id)
        : { como: 'vigente' as const };
      const modifica = d.modifica_id ? porId.get(d.modifica_id) : undefined;
      // «reemplaza a la 1235»: otra factura de la misma OC, anulada, de antes.
      const reemplaza =
        d.tipo === 33 && d.orden_de_compra_id
          ? todos.find(
              (o) =>
                o.tipo === 33 &&
                o.id < d.id &&
                o.orden_de_compra_id === d.orden_de_compra_id &&
                !cadena.vigente(o.id),
            )
          : undefined;
      const esNota = d.tipo === NC || d.tipo === ND;
      const signo = d.tipo === NC ? -1 : 1;
      const nombre = nombreDe(d);
      // Lo que hace la nota («rebaja la 1235»): la lista lo pone junto a la
      // fecha (§9.22, 07-11), y el reporte y el buscador lo leen en el título.
      const queHace =
        esNota && modifica
          ? `${QUE_HACE[d.codigo_referencia ?? 0] ?? 'modifica'} la ${modifica.tipo === 33 ? modifica.folio : nombreDe(modifica)}`
          : null;
      const titulo = queHace ? `${nombre} · ${queHace}` : nombre;
      // El chip en una palabra y abajo lo que lo cambió (§9.22, 07-11). La
      // nota en pie también dice «Vigente»; lo que hace ya va en `que_hace`.
      const { texto: textoDelEstado, detalle: detalleDelEstado } = emitido
        ? estadoCorto(estado, total)
        : { texto: 'Por confirmar', detalle: null };
      const vigente = estado.como !== 'anulado';
      const detalle = (d.detalle ?? []) as { cabana?: string | null }[];
      const situacion: SituacionEnLaLista = !emitido
        ? 'por_confirmar'
        : estado.como === 'anulado'
          ? 'anulada'
          : esNota
            ? 'nota'
            : estado.como === 'rebajado'
              ? 'rebajada'
              : 'vigente';
      // La primera referencia de la factura (la OC, la HES…), para la
      // línea de abajo del documento (§9.22). La de una nota es lo que
      // modifica, y eso ya lo dice su título.
      const referencia =
        d.tipo === 33
          ? ((d.referencias ?? []) as { tipo?: string; folio?: string }[]).find(
              (r) => r?.tipo && r?.folio,
            )
          : undefined;
      const credito =
        d.tipo === 33 && d.forma_de_pago === 2 && d.vencimiento ? d : null;
      return {
        id: d.id,
        tipo: d.tipo,
        folio: d.folio,
        fecha_emision: d.fecha_emision,
        estado: d.estado,
        ambiente: d.ambiente,
        titulo,
        nombre,
        nombre_del_pdf: nombreDelPdfDe(d),
        traida: !!d.traida,
        que_hace: queHace,
        reemplaza: reemplaza ? nombreDe(reemplaza) : null,
        cliente:
          d.tipo === 39
            ? (detalle[0]?.cabana ?? 'Boleta')
            : (d.receptor?.razon_social ?? null),
        // La NC resta: total, neto e IVA en negativo, para que el reporte
        // sume bien en Excel.
        total: signo * total,
        neto: signo * Number(d.neto),
        iva: signo * Number(d.iva),
        numero: d.cotizacion?.quotation_number ?? null,
        quotation_id: d.quotation_id,
        oc: d.oc?.numero ?? null,
        modifica_id: d.modifica_id,
        cadena: {
          como: estado.como,
          texto: textoDelEstado,
          detalle: detalleDelEstado,
        },
        situacion,
        // El RUT del receptor, para buscar (la boleta no lo tiene).
        rut: d.tipo === 39 ? null : (d.receptor?.rut ?? null),
        referencia: referencia
          ? { tipo: String(referencia.tipo), folio: String(referencia.folio) }
          : null,
        // La condición de pago de la factura (§9.22, migración 189): el
        // contado, o el crédito con sus días y su vencimiento.
        forma_de_pago: d.tipo === 33 ? (d.forma_de_pago ?? null) : null,
        vencimiento: credito ? credito.vencimiento : null,
        plazo_dias:
          credito?.vencimiento && d.fecha_emision
            ? diasEntre(d.fecha_emision.slice(0, 10), credito.vencimiento)
            : null,
        pdf_path: d.pdf_path,
        error: d.error,
        acciones: {
          anular:
            conNotas &&
            vigente &&
            !(d.tipo === 33 && estado.como === 'rebajado'),
          rebajar:
            conNotas && d.tipo === 33 && vigente && cadena.saldo(d.id) > 0,
          corregir: conNotas && d.tipo === 33 && vigente,
          comprobar:
            conAjustes &&
            (d.estado === 'por_confirmar' || d.estado === 'enviando') &&
            aMano(d.ambiente),
          pedirPdf: emitido && !d.pdf_path && aMano(d.ambiente),
          // §9.33: el XML se pide a facturacion.cl con el botón.
          xml: emitido && d.folio != null && aMano(d.ambiente),
        },
        saldo: conCadena && d.tipo === 33 ? cadena.saldo(d.id) : null,
        // §9.42 (Felipe, 09-11: *"tachado el número original y abajo el
        // número restado sin tachar"*): lo que le queda a la rebajada en
        // las tres columnas.
        queda:
          conCadena && d.tipo === 33 && estado.como === 'rebajado'
            ? quedaDe(
                d,
                estado.por.map((n) => porId.get(n.id)),
              )
            : null,
        plazos:
          conCadena && d.fecha_emision
            ? {
                anular: plazoDelSii(d.fecha_emision, 'anular'),
                rebajar: plazoDelSii(d.fecha_emision, 'rebajar'),
              }
            : null,
      };
    });

    const emitidos = delPeriodo.filter((d) => d.estado === 'emitido');
    return {
      ambiente: conexion.ambiente,
      sin_conexion: conexion.sinConexion ?? null,
      mes,
      desde,
      hasta,
      hoy,
      resumen: {
        // Lo facturado neto del mes: las notas de crédito restan.
        facturado: emitidos.reduce(
          (s, d) => s + (d.tipo === NC ? -1 : 1) * Number(d.total),
          0,
        ),
        facturas: emitidos.filter((d) => d.tipo === 33).length,
        boletas: emitidos.filter((d) => d.tipo === 39).length,
        notas: emitidos.filter((d) => d.tipo === NC || d.tipo === ND).length,
        porConfirmar: delPeriodo.filter((d) => d.estado !== 'emitido').length,
      },
      documentos,
    };
  }

  /** La vista previa de la nota: lo que sale y los plazos del SII. */
  async revisarNota(user: User, id: number, dto: NotaPedidaDto) {
    const [armada, emisor] = await Promise.all([
      this.armar(user, id, dto),
      this.ordenes.empresaQueVende(user.company_id),
    ]);
    return {
      ok: armada.armado.ok,
      problemas: armada.armado.ok ? [] : armada.armado.problemas,
      avisos: [
        ...armada.avisos,
        ...(armada.armado.ok ? armada.armado.avisos : []),
      ],
      tipo: armada.tipo,
      folio: armada.folio,
      fecha: armada.fecha,
      codigo: armada.codigo,
      modifica: nombreDe(armada.original),
      // Lo que modifica, como va en la nota: el tipo, el N°, la fecha, el
      // código y el motivo (§9.22: la vista previa lo muestra).
      referencia: armada.referencia,
      emisor,
      plazo: armada.plazo,
      montos: armada.armado.ok ? armada.armado.montos : null,
      lineas: armada.lineas,
      receptor: armada.receptor,
      ambiente: armada.conexion.ambiente,
    };
  }

  async emitirNota(user: User, id: number, dto: NotaPedidaDto) {
    const companyId = user.company_id;
    const armada = await this.armar(user, id, dto);
    const { armado, original, tipo, codigo, conexion, fecha } = armada;
    if (!armado.ok) throw new BadRequestException(armado.problemas.join('. '));

    const nombre = tipo === NC ? 'La nota de crédito' : 'La nota de débito';
    const enviado = await mandarConFolio({
      repo: this.documentos,
      conexion,
      logger: this.logger,
      user,
      tipo,
      fila: {
        company_id: companyId,
        tipo,
        ambiente: conexion.ambiente,
        estado: 'enviando',
        receptor: armada.receptor,
        detalle: armada.lineas,
        referencias: [armada.referencia],
        neto: armado.montos.neto,
        exento: 0,
        iva: armado.montos.iva,
        total: armado.montos.total,
        quotation_id: original.quotation_id,
        orden_de_compra_id: original.orden_de_compra_id,
        porcentaje: null,
        creado_por: user.id ?? null,
        modifica_id: original.id,
        codigo_referencia: codigo,
      },
      armar: (f) =>
        f === armada.folio ? armado.archivo : this.archivoCon(armada, f),
      folio: armada.folio,
      fecha,
      nombre,
    });
    if (enviado.porConfirmar) return enviado.documento;

    // §9.33: si el PDF todavía no está, se vuelve a pedir solo por detrás.
    const emitida = await guardarCopiaDelPdfAlEmitir(
      this.documentos,
      conexion,
      enviado.documento,
      companyId,
      original.quotation_id,
      this.logger,
    );
    if (original.quotation_id)
      await this.bitacora
        .crearComoBeliaAPedidoDe(user, {
          quotation_id: original.quotation_id,
          tipo: 'otro',
          next_contact_date: null,
          note: `Emitió ${tipo === NC ? 'la nota de crédito' : 'la nota de débito'} N° ${emitida.folio} que ${QUE_HACE[codigo]} ${NOMBRE_LARGO[original.tipo] ?? 'el documento'} N° ${original.folio} (${pesos(emitida.total)}): ${textoLimpio(dto.motivo)}.${NOTA_DEL_AMBIENTE[emitida.ambiente] ?? ''}`,
        })
        .catch((e: unknown) =>
          this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
        );
    this.logger.info(
      `nota ${tipo} N° ${emitida.folio} (${emitida.ambiente}) ${QUE_HACE[codigo]} el documento ${original.id}`,
    );
    return emitida;
  }

  /**
   * «Comprobar» (§9.10, L5): lo que se cortó al mandarlo. Si en
   * facturacion.cl el folio ya pasó el que se mandó, salió con ese folio; si
   * no, no salió, y lo que esperaba (la cabaña de un cobro) vuelve a quedar
   * por emitir.
   */
  async comprobar(user: User, id: number) {
    const companyId = user.company_id;
    const doc = await this.documentos.documento(id, companyId);
    if (!doc) throw new NotFoundException('Ese documento no existe');
    if (doc.estado !== 'por_confirmar' && doc.estado !== 'enviando')
      throw new BadRequestException('Ese documento no está por confirmar');
    if (
      doc.estado === 'enviando' &&
      Date.now() - new Date(doc.created_at).getTime() < 5 * 60 * 1000
    )
      throw new BadRequestException(
        'Se está emitiendo: espera unos minutos y vuelve a comprobar',
      );
    const conexion = this.delMismoAmbiente(companyId, doc);
    const siguiente = await conexion.folioSiguiente(doc.tipo);
    const enviado =
      doc.tipo === 39 || doc.tipo === 41
        ? Number(
            (doc.respuesta as { folio_esperado?: number } | null)
              ?.folio_esperado ?? 0,
          ) || null
        : folioDelArchivo(doc.archivo_enviado);
    if (enviado != null && siguiente > enviado) {
      const emitido = await this.documentos.actualizar(id, companyId, {
        estado: 'emitido',
        folio: enviado,
        fecha_emision: fechaDelArchivo(doc.archivo_enviado) ?? hoyEnChile(),
        error: null,
        emitido_por: user.id ?? null,
        emitido_en: new Date().toISOString(),
      });
      return guardarCopiaDelPdfAlEmitir(
        this.documentos,
        conexion,
        emitido,
        companyId,
        emitido.quotation_id,
        this.logger,
      );
    }
    const noSalio = await this.documentos.actualizar(id, companyId, {
      estado: 'rechazado',
      error: `No salió: comprobado con facturacion.cl el ${hoyEnChile()}. Se puede emitir de nuevo.`,
    });
    if (doc.tipo === 39) await this.boletas.desamarrarDeLaBoleta(id, companyId);
    return noSalio;
  }

  /** La copia propia del PDF que no alcanzó a llegar (L10). */
  async pedirPdf(user: User, id: number) {
    const companyId = user.company_id;
    const doc = await this.documentos.documento(id, companyId);
    if (!doc) throw new NotFoundException('Ese documento no existe');
    if (doc.estado !== 'emitido')
      throw new BadRequestException('Solo un documento emitido tiene PDF');
    if (doc.pdf_path) return doc;
    const conPdf = await guardarCopiaDelPdf(
      this.documentos,
      this.delMismoAmbiente(companyId, doc),
      doc,
      companyId,
      doc.quotation_id,
    );
    if (!conPdf.pdf_path)
      throw new BadRequestException(
        'facturacion.cl todavía no tiene el PDF: prueba en unos minutos',
      );
    return conPdf;
  }

  /**
   * §9.33: el XML tributario, solo cuando se pide (Felipe, 08-11: *"el XML
   * debería ser solo en los pocos casos donde lo pide el cliente, con un
   * botón"*). Se le pide a facturacion.cl (`getXMLDte`, con costo
   * adicional) cada vez: no se guarda.
   */
  async pedirXml(user: User, id: number) {
    const companyId = user.company_id;
    const doc = await this.documentos.documento(id, companyId);
    if (!doc) throw new NotFoundException('Ese documento no existe');
    if (doc.estado !== 'emitido' || doc.folio == null)
      throw new BadRequestException('Solo un documento emitido tiene XML');
    const r = await this.delMismoAmbiente(companyId, doc).obtenerXml(
      doc.tipo,
      doc.folio,
    );
    if (!r.base64)
      throw new BadRequestException(
        // En producción no está contratado (08-11): Felipe consulta el precio.
        /servicio adicional/i.test(r.mensaje ?? '')
          ? 'El XML es un servicio adicional de facturacion.cl y no está contratado.'
          : `facturacion.cl no entregó el XML: ${r.mensaje ?? 'sin respuesta'}`,
      );
    const nombre =
      {
        33: 'factura',
        39: 'boleta',
        56: 'nota_de_debito',
        61: 'nota_de_credito',
      }[doc.tipo] ?? `dte_${doc.tipo}`;
    return { nombre: `${nombre}_${doc.folio}.xml`, base64: r.base64 };
  }

  /** «Probar la conexión» (paso 0): no emite nada. */
  conexionConFacturacionCl(companyId: number) {
    return this.conexion.probar(companyId);
  }

  /** «Comprobar» y «Pedir el PDF» le preguntan al ambiente que emitió el
   *  documento: un folio simulado no es un folio de prueba. */
  private delMismoAmbiente(
    companyId: number,
    doc: { ambiente: AmbienteDeFacturacion },
  ) {
    const conexion = this.conexion.de(companyId, doc.ambiente);
    if (!conexion)
      throw new ConflictException(
        `Ese documento salió ${EN_PALABRAS[doc.ambiente]}: se revisa en la plataforma de facturacion.cl`,
      );
    return conexion;
  }

  /** Arma la nota con el folio que sigue: lo usan la vista previa y emitir. */
  private async armar(user: User, id: number, dto: NotaPedidaDto) {
    const companyId = user.company_id;
    const original = await this.documentos.documento(id, companyId);
    if (!original) throw new NotFoundException('Ese documento no existe');
    if (
      original.estado !== 'emitido' ||
      original.folio == null ||
      !original.fecha_emision
    )
      throw new BadRequestException('Solo se modifica un documento emitido');
    if (!CON_NOTAS.has(original.tipo))
      throw new BadRequestException(
        'La nota de crédito de una boleta se prueba con facturacion.cl en el paso 0 (L21)',
      );
    // Una nota sale donde salió lo que modifica: una nota de prueba no
    // anula una factura simulada (§9.18).
    const conexion = this.conexion.de(companyId);
    if (original.ambiente !== conexion.ambiente)
      throw new ConflictException(
        `${nombreDe(original)} salió ${EN_PALABRAS[original.ambiente]} y hoy se emite ${EN_PALABRAS[conexion.ambiente]}: no se le emiten notas`,
      );
    const todos = (await this.documentos.cadenaDeLaEmpresa(companyId)).filter(
      (d) => d.ambiente === original.ambiente,
    );
    const cadena = new Cadena(todos);
    if (!cadena.vigente(id))
      throw new ConflictException(`${nombreDe(original)} ya está anulada`);
    if (dto.accion !== 'anular' && original.tipo !== 33)
      throw new BadRequestException('A una nota solo se la anula');
    const motivo = textoLimpio(dto.motivo);
    if (!motivo)
      throw new BadRequestException('Falta el motivo: va en la nota');

    // La ND anula una NC; la NC, todo lo demás (la factura o una ND).
    const tipo: 56 | 61 = original.tipo === NC ? ND : NC;
    if (tipo === ND) await this.sinPasarDeLaOC(companyId, original, todos);
    const codigo: 1 | 2 | 3 =
      dto.accion === 'anular' ? 1 : dto.accion === 'corregir' ? 2 : 3;
    const saldo = cadena.saldo(id);
    let receptor: Receptor = { ...original.receptor };
    let lineas: LineaDeDetalle[];
    let totalEsperado: number;
    if (dto.accion === 'anular') {
      if (original.tipo === 33 && saldo < Number(original.total))
        throw new ConflictException(
          `${nombreDe(original)} tiene rebajas: rebaja lo que le queda (${pesos(saldo)})`,
        );
      // Las líneas tal cual salieron, con su descuento (§9.22): la nota
      // anula el total de verdad.
      lineas = ((original.detalle ?? []) as LineaDeDetalle[]).map((l) => ({
        descripcion: l.descripcion,
        descripcionLarga: l.descripcionLarga ?? null,
        cantidad: l.cantidad,
        precio: l.precio,
        ...(l.descuento ? { descuento: l.descuento } : {}),
      }));
      totalEsperado = Number(original.total);
    } else if (dto.accion === 'rebajar') {
      if (!dto.monto) throw new BadRequestException('Falta cuánto se rebaja');
      if (dto.monto > saldo)
        throw new BadRequestException(
          `A ${nombreDe(original)} le quedan ${pesos(saldo)}: la rebaja no puede pasar de eso`,
        );
      lineas = [
        {
          descripcion: Array.from(`Rebaja: ${motivo}`).slice(0, 80).join(''),
          cantidad: 1,
          precio: netoParaElTotal(dto.monto).neto,
        },
      ];
      totalEsperado = dto.monto;
    } else {
      lineas = [
        {
          descripcion: Array.from(`Corrige: ${motivo}`).slice(0, 80).join(''),
          cantidad: 1,
          precio: 0,
        },
      ];
      totalEsperado = 0;
      if (dto.receptor)
        receptor = {
          ...receptor,
          razon_social:
            textoLimpio(dto.receptor.razon_social) || receptor.razon_social,
          giro: textoLimpio(dto.receptor.giro) || receptor.giro,
          direccion: textoLimpio(dto.receptor.direccion) || receptor.direccion,
          comuna: textoLimpio(dto.receptor.comuna) || receptor.comuna,
          ciudad: textoLimpio(dto.receptor.ciudad) || receptor.ciudad,
        };
    }

    const fecha = hoyEnChile();
    const plazo = plazoDelSii(original.fecha_emision, dto.accion);
    const avisos: string[] = [];
    if (fecha > plazo)
      avisos.push(
        dto.accion === 'rebajar'
          ? `Pasaron los 6 meses para rebajar (hasta el ${fechaCorta(plazo)}): la nota sale sin derecho a rebajar el débito del IVA.`
          : `Venció el plazo del SII (hasta el ${fechaCorta(plazo)}): el débito ya pagado solo se recupera con el formulario 2117.`,
      );
    const folio = await conexion.folioSiguiente(tipo);
    const referencia = {
      tipo: String(original.tipo),
      folio: String(original.folio),
      fecha: original.fecha_emision,
      codigo,
      razon: motivo,
    };
    const ambiente = conexion.ambiente;
    const base = {
      tipo,
      fecha,
      receptor,
      lineas,
      referencia,
      totalEsperado,
      ambiente,
    };
    const armado = armarFactura({
      tipo,
      folio,
      fecha,
      receptor,
      lineas,
      referencias: [referencia],
      totalEsperado,
      ambiente,
    });
    return {
      ...base,
      original,
      codigo,
      folio,
      plazo,
      avisos,
      conexion,
      armado,
      nombre: NOMBRE_CORTO[tipo],
    };
  }

  /**
   * La ND que anula una NC le devuelve a la factura lo que la NC anuló o
   * rebajó. Si esa OC ya se volvió a facturar, nunca más del 100 % (§5.3):
   * primero se anula la factura que la reemplazó. Se mira la cadena con la
   * ND puesta, como quedaría; $1 de redondeo se tolera, como en la factura.
   */
  private async sinPasarDeLaOC(
    companyId: number,
    nc: Pick<
      DocumentoTributario,
      'id' | 'total' | 'quotation_id' | 'orden_de_compra_id'
    >,
    todos: Awaited<
      ReturnType<DocumentosTributariosRepository['cadenaDeLaEmpresa']>
    >,
  ) {
    const ocId = nc.orden_de_compra_id;
    if (ocId == null || !nc.quotation_id) return;
    const oc = (
      await this.documentos.ordenesDelEvento(nc.quotation_id, companyId)
    ).find((o) => o.id === ocId);
    if (!oc) return;
    const conLaND = facturadoDeLasOC([
      ...todos,
      {
        id: 0,
        tipo: ND,
        folio: null,
        estado: 'emitido',
        total: Number(nc.total),
        fecha_emision: null,
        modifica_id: nc.id,
        codigo_referencia: 1,
        orden_de_compra_id: ocId,
      },
    ]).porOC.get(ocId);
    if ((conLaND ?? 0) > Number(oc.total) + 1)
      throw new ConflictException(
        `Con la nota de débito, la OC N° ${oc.numero} volvería a sumar ${pesos(conLaND ?? 0)} facturados de ${pesos(Number(oc.total))}: ya se volvió a facturar. Anula primero la factura que la reemplazó.`,
      );
  }

  private archivoCon(
    a: {
      tipo: 56 | 61;
      fecha: string;
      receptor: Receptor;
      lineas: LineaDeDetalle[];
      referencia: {
        tipo: string;
        folio: string;
        fecha: string;
        codigo: 1 | 2 | 3;
        razon: string;
      };
      totalEsperado: number;
      ambiente: AmbienteDeFacturacion;
    },
    folio: number,
  ) {
    const r = armarFactura({
      tipo: a.tipo,
      folio,
      fecha: a.fecha,
      receptor: a.receptor,
      lineas: a.lineas,
      referencias: [a.referencia],
      totalEsperado: a.totalEsperado,
      ambiente: a.ambiente,
    });
    return r.ok ? r.archivo : null;
  }
}
