import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import {
  MAX_BYTES_ADJUNTO,
  TIPOS_POR_EXTENSION,
  extensionDe,
  nombreLimpio,
  sello,
} from '../adjuntos/adjuntos.service';
import { claveDelNombre } from '../adjuntos/licify.service';
import { normalizarRut } from '../historia/ganadores';
import { OferenteRepository } from '../oferente/oferente.repository';
import {
  type ArchivoDelAnexo,
  type Pedir,
  archivosDelAnexo,
  ofertasDeLaLicitacion,
  pedirPublico,
} from './ofertas-publicas';
import { ResultadosRepository } from './resultados.repository';

// TRAER LAS OFERTAS DE LA COMPETENCIA (decisión 96 del doc 17, 27-10).
// Cuando una licitación queda ganada o perdida (la 92, o a mano) y la
// empresa no subió ninguna oferta de la competencia, se traen del «Resumen
// de ofertas» público: los anexos de cada oferente que no es la empresa,
// a la sección «competencia» de la comparación (decisión 41), con su nombre.
// Los comprimidos (ZIP, RAR, 7z) no se traen: suelen repetir los PDF y la
// comparación no los lee.
//
// A PEDIDO (decisión 123, 10-11). Felipe, con la 5040-14-LE26 postulada y
// ya cerrada, en «Comparación de ofertas»: "acá eventia no me puede traer
// los documentos de la otra propuesta para compararlas" y "con un botón acá
// en eventia". El cuadro de ofertas es público desde la apertura, no desde
// la adjudicación: «Traer las ofertas» las trae cuando la empresa lo pide,
// sin esperar el resultado. Responde al tiro y sigue por detrás (son
// decenas de archivos, de a uno); la pantalla pregunta cómo va. Lo que ya
// está no se repite, así que se puede apretar de nuevo.

/** Por vuelta y por licitación, para no llenar el balde con una sola. */
const MAX_ARCHIVOS = 80;
const MAX_BYTES = 200 * 1024 * 1024;
const COMPRIMIDOS = new Set(['zip', 'rar', '7z']);
/** Lo más que dura una vuelta a pedido: Mercado Público entrega de a uno. */
export const DURACION_A_PEDIDO_MS = 15 * 60_000;
/** De cuántas licitaciones se recuerda cómo terminó la última vuelta. */
const MAX_ULTIMAS = 200;

/** Lo que dejó una vuelta sobre una licitación. */
export type OfertasTraidas = {
  /** false: Mercado Público todavía no muestra el cuadro de ofertas. */
  publicadas: boolean;
  /** Los demás oferentes del cuadro, sin contar a la empresa. */
  oferentes: number;
  /** Archivos que llegaron en esta vuelta. */
  traidos: number;
  /** Los que ya estaban, de una vuelta anterior o subidos a mano. */
  yaEstaban: number;
  /** No se traen: comprimidos, tipos que Eventia no guarda o de más de
   *  30 MB. */
  noSeTraen: number;
  /** Quedó algo sin traer (el tope de la vuelta, o Mercado Público no lo
   *  entregó): se puede pedir de nuevo. */
  incompleto: boolean;
};

export type UltimaVuelta = {
  terminada_en: string;
  /** Por qué no se pudo, para la pantalla; null si terminó bien. */
  error: string | null;
  resultado: OfertasTraidas | null;
};

export type EstadoDeTraerOfertas = {
  trayendo: boolean;
  /** Cómo terminó la última vuelta a pedido de esta licitación desde que
   *  partió el motor; null si no hubo. */
  ultima: UltimaVuelta | null;
};

const claveDe = (companyId: number, oportunidadId: number): string =>
  `${companyId}:${oportunidadId}`;

/** Por qué falló, dicho para una persona. */
const porQueFallo = (error: unknown): string => {
  const mensaje = mensajeDe(error);
  if (/Mercado Público respondió \d+/.test(mensaje)) return mensaje;
  return /timeout|aborted|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(
    mensaje,
  )
    ? 'Mercado Público no respondió'
    : mensaje;
};

@Injectable()
export class OfertasDeLaCompetenciaService {
  /** Lo que se está trayendo ahora, por empresa y oportunidad, y cómo
   *  terminó la última vuelta a pedido de cada una (decisión 123). Vive en
   *  la memoria del motor, como «Traer los documentos» (decisión 65): si el
   *  motor se reinicia, la vuelta se corta y deja de decir que trae; lo que
   *  alcanzó a llegar queda guardado y la próxima vuelta no lo repite. */
  private readonly enCurso = new Set<string>();
  private readonly ultimas = new Map<string, UltimaVuelta>();

  constructor(
    private readonly resultados: ResultadosRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oferente: OferenteRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OfertasDeLaCompetenciaService.name);
  }

  /** Devuelve cuántos archivos se trajeron. */
  async traer(
    companyId: number,
    hasta: number,
    pedir: Pedir = pedirPublico,
  ): Promise<number> {
    const pendientes =
      await this.resultados.licitacionesSinCompetencia(companyId);
    if (pendientes.length === 0) return 0;
    const rut = normalizarRut(
      (await this.oferente.oferente(companyId))?.rut ?? '',
    );
    let traidos = 0;
    for (const p of pendientes) {
      if (Date.now() > hasta) break;
      const clave = claveDe(companyId, p.id);
      // Una vuelta a la vez: si la empresa la está trayendo a pedido
      // (decisión 123), el reloj no la toca.
      if (this.enCurso.has(clave)) continue;
      this.enCurso.add(clave);
      try {
        const r = await this.deUnaLicitacion(companyId, p, rut, hasta, pedir);
        traidos += r.traidos;
      } catch (error) {
        this.logger.warn(
          `ofertas de ${p.codigo}: no se pudieron traer: ${mensajeDe(error)}`,
        );
      } finally {
        this.enCurso.delete(clave);
      }
    }
    return traidos;
  }

  /** ¿Está trayendo las ofertas de esa oportunidad, y cómo terminó la
   *  última vuelta? Lo pregunta la pantalla al entrar a «Comparación de
   *  ofertas» y cada 3 segundos mientras trae. Sin base ni Mercado
   *  Público. */
  estado(companyId: number, oportunidadId: number): EstadoDeTraerOfertas {
    const clave = claveDe(companyId, oportunidadId);
    return {
      trayendo: this.enCurso.has(clave),
      ultima: this.ultimas.get(clave) ?? null,
    };
  }

  /** «Traer las ofertas» (decisión 123): las de los demás oferentes de una
   *  licitación de la empresa, cuando ella lo pide. Responde al tiro con
   *  «trayendo» y sigue por detrás; cómo terminó se lee en `estado`. Si ya
   *  las está trayendo, 409: no se larga otra vuelta. */
  async traerAPedido(
    companyId: number,
    oportunidadId: number,
    pedir: Pedir = pedirPublico,
  ): Promise<EstadoDeTraerOfertas> {
    const p = await this.resultados.procesoDe(companyId, oportunidadId);
    if (!p) throw new NotFoundException('No encontramos esa oportunidad.');
    if (p.tipo !== 'licitacion') {
      throw new BadRequestException(
        'Solo una licitación tiene cuadro de ofertas con documentos: en una compra ágil no hay qué traer.',
      );
    }
    const rut = normalizarRut(
      (await this.oferente.oferente(companyId))?.rut ?? '',
    );
    if (!rut) {
      throw new BadRequestException(
        'Falta el RUT de tu empresa en «Mi empresa»: sin él no se sabe cuál de las ofertas es la tuya.',
      );
    }
    const clave = claveDe(companyId, oportunidadId);
    // Mirar y anotar sin ninguna espera entremedio: así dos clics seguidos
    // no pasan los dos.
    if (this.enCurso.has(clave)) {
      throw new ConflictException(
        'Ya estoy trayendo las ofertas de esta licitación: aparecen solas al terminar.',
      );
    }
    this.enCurso.add(clave);
    this.ultimas.delete(clave);
    void this.vuelta(
      companyId,
      { id: p.id, codigo: p.codigo },
      rut,
      Date.now() + DURACION_A_PEDIDO_MS,
      pedir,
    );
    return this.estado(companyId, oportunidadId);
  }

  /** La vuelta a pedido, por detrás. Nunca lanza: cómo terminó queda
   *  anotado para la pantalla. */
  private async vuelta(
    companyId: number,
    p: { id: number; codigo: string },
    rut: string,
    hasta: number,
    pedir: Pedir,
  ): Promise<void> {
    const clave = claveDe(companyId, p.id);
    let ultima: UltimaVuelta;
    try {
      const resultado = await this.deUnaLicitacion(
        companyId,
        p,
        rut,
        hasta,
        pedir,
      );
      ultima = {
        terminada_en: new Date().toISOString(),
        error: null,
        resultado,
      };
    } catch (error) {
      this.logger.warn(
        `ofertas de ${p.codigo}, a pedido: no se pudieron traer: ${mensajeDe(error)}`,
      );
      ultima = {
        terminada_en: new Date().toISOString(),
        error: `No se pudieron traer las ofertas: ${porQueFallo(error)}. Inténtalo en un rato; lo que alcanzó a llegar no se repite.`,
        resultado: null,
      };
    }
    this.ultimas.delete(clave);
    this.ultimas.set(clave, ultima);
    if (this.ultimas.size > MAX_ULTIMAS) {
      const [masVieja] = this.ultimas.keys();
      this.ultimas.delete(masVieja);
    }
    this.enCurso.delete(clave);
  }

  private async deUnaLicitacion(
    companyId: number,
    p: { id: number; codigo: string },
    rutDeLaEmpresa: string,
    hasta: number,
    pedir: Pedir,
  ): Promise<OfertasTraidas> {
    const todas = await ofertasDeLaLicitacion(p.codigo, pedir);
    const ofertas = todas.filter(
      (o) => normalizarRut(o.rut) !== rutDeLaEmpresa,
    );
    const r: OfertasTraidas = {
      publicadas: todas.length > 0,
      oferentes: new Set(ofertas.map((o) => normalizarRut(o.rut))).size,
      traidos: 0,
      yaEstaban: 0,
      noSeTraen: 0,
      incompleto: false,
    };
    if (ofertas.length === 0) return r;

    // Lo que ya está en «La competencia» no se repite (decisión 123). Tres
    // maneras de reconocerlo, por el nombre sin tildes ni signos (el
    // navegador guarda «N°_120.pdf» donde el motor guarda «N° 120.pdf»):
    //  - del mismo oferente, con el mismo peso exacto;
    //  - subido a mano por una persona, con el nombre de oferente que haya
    //    escrito, con el mismo peso exacto;
    //  - y, antes de bajarlo, del mismo oferente con el peso de la lista.
    // Entre dos oferentes traídos del cuadro no se cruza: el mismo
    // formulario lleno por dos empresas se llama igual y pesa parecido.
    const yaEstan = await this.adjuntos.listar(companyId, p.id, 'competencia');
    const exactos = new Set<string>();
    const aMano = new Set<string>();
    const porNombre = new Map<string, number[]>();
    for (const a of yaEstan) {
      const quien = a.competidor ?? '';
      const nombre = claveDelNombre(a.nombre);
      exactos.add(`${quien}|${nombre}|${a.bytes}`);
      if (a.subido_por !== null) aMano.add(`${nombre}|${a.bytes}`);
      const delOferente = `${quien}|${nombre}`;
      porNombre.set(delOferente, [
        ...(porNombre.get(delOferente) ?? []),
        a.bytes,
      ]);
    }
    /** La lista dice el peso en KB, redondeado: se compara con holgura. Si
     *  no lo dice, basta el nombre. Si la holgura no alcanza, el archivo se
     *  baja y lo decide el peso exacto. */
    const yaEsta = (quien: string, a: ArchivoDelAnexo): boolean => {
      const pesos = porNombre.get(
        `${quien}|${claveDelNombre(nombreLimpio(a.nombre))}`,
      );
      if (!pesos) return false;
      const kb = a.kb;
      if (kb === null) return true;
      return pesos.some(
        (bytes) => Math.abs(bytes / 1024 - kb) <= Math.max(2, kb * 0.05),
      );
    };

    let archivos = 0;
    let bytes = 0;
    // El tope de la vuelta: archivos, peso o tiempo. Lo que falte queda
    // para la próxima.
    let cortado = false;
    const seguir = () => !cortado;

    for (const o of ofertas) {
      if (cortado) break;
      const quien = o.proveedor;
      for (const url of Object.values(o.anexos)) {
        if (cortado) break;
        let pedidos = 0;
        let llegados = 0;
        const aceptar = (a: ArchivoDelAnexo): boolean => {
          if (cortado) return false;
          const extension = extensionDe(a.nombre);
          if (
            COMPRIMIDOS.has(extension) ||
            !TIPOS_POR_EXTENSION[extension] ||
            (a.kb !== null && a.kb * 1024 > MAX_BYTES_ADJUNTO)
          ) {
            r.noSeTraen += 1;
            return false;
          }
          if (yaEsta(quien, a)) {
            r.yaEstaban += 1;
            return false;
          }
          if (
            archivos >= MAX_ARCHIVOS ||
            bytes > MAX_BYTES ||
            Date.now() > hasta
          ) {
            cortado = true;
            return false;
          }
          pedidos += 1;
          return true;
        };
        // Si Mercado Público falla en un anexo, se sigue con el próximo. Si
        // lo que falla es guardar, la vuelta se corta: es de esta casa.
        let noSeGuardo: { error: unknown } | null = null;
        try {
          for await (const a of archivosDelAnexo(url, aceptar, pedir, seguir)) {
            llegados += 1;
            const nombre = nombreLimpio(a.nombre);
            const tipo = TIPOS_POR_EXTENSION[extensionDe(nombre)];
            const peso = a.contenido.length;
            if (!tipo || peso === 0 || peso > MAX_BYTES_ADJUNTO) {
              r.noSeTraen += 1;
              continue;
            }
            const clave = claveDelNombre(nombre);
            if (
              exactos.has(`${quien}|${clave}|${peso}`) ||
              aMano.has(`${clave}|${peso}`)
            ) {
              r.yaEstaban += 1;
              continue;
            }
            try {
              await this.guardar(
                companyId,
                p.id,
                nombre,
                tipo,
                a.contenido,
                quien,
              );
            } catch (error) {
              noSeGuardo = { error };
              break;
            }
            exactos.add(`${quien}|${clave}|${peso}`);
            archivos += 1;
            bytes += peso;
            r.traidos += 1;
          }
        } catch (error) {
          this.logger.warn(
            `ofertas de ${p.codigo}: un anexo de ${quien} quedó a medias: ${mensajeDe(error)}`,
          );
          r.incompleto = true;
        }
        if (noSeGuardo) {
          throw noSeGuardo.error instanceof Error
            ? noSeGuardo.error
            : new Error(mensajeDe(noSeGuardo.error));
        }
        // Aceptado en la lista y Mercado Público no lo entregó.
        if (llegados < pedidos) r.incompleto = true;
      }
    }
    if (cortado) r.incompleto = true;
    this.logger.info(
      `ofertas de ${p.codigo}: ${r.oferentes} de la competencia, ${r.traidos} archivos traídos, ${r.yaEstaban} ya estaban${r.incompleto ? ', quedó algo sin traer' : ''}`,
    );
    return r;
  }

  private async guardar(
    companyId: number,
    oportunidadId: number,
    nombre: string,
    tipo: string,
    contenido: Buffer,
    competidor: string,
  ): Promise<void> {
    const ruta = `c${companyId}/oportunidades/${oportunidadId}/competencia/${sello()}_${sanitize(nombre)}`;
    await this.adjuntos.subirArchivo(ruta, contenido, tipo);
    try {
      await this.adjuntos.guardar({
        company_id: companyId,
        oportunidad_id: oportunidadId,
        nombre,
        ruta,
        tipo,
        bytes: contenido.length,
        seccion: 'competencia',
        subido_por: null,
        competidor,
      });
    } catch (error) {
      // Sin su fila nadie lo vería: que no quede un archivo huérfano.
      await this.adjuntos.borrarArchivo(ruta);
      throw error;
    }
  }
}
