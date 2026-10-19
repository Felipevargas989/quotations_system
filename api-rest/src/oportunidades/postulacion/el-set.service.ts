import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { extensionDe } from '../adjuntos/adjuntos.service';
import { AnalisisRepository } from '../analisis/analisis.repository';
import { hoyEnChile } from '../analisis/comun';
import { textoDeDocx } from '../analisis/docx';
import { OferenteRepository } from '../oferente/oferente.repository';
import {
  armarElSet,
  type Carpeta,
  conLosRespaldos,
  type DatosDelSet,
  type FormularioDeLasBases,
  type PiezaDelSet,
  rutasEnElZip,
} from './el-set';
import { PostulacionRepository } from './postulacion.repository';
import { type ArchivoParaElZip, armarZip } from './zip';

// «DESCARGAR PARA MERCADO PÚBLICO» (decisión 34 del doc 17, sprint I,
// 19-10): lo que va en el ZIP y lo que falta (`revisar`, para mostrarlo
// antes de bajar) y el ZIP mismo (`zip`). Qué va lo decide `el-set.ts`;
// aquí se juntan los datos y se bajan los archivos del balde.

/** Todo pasa por la memoria del motor: un set normal pesa 10 a 30 MB. */
const MAX_BYTES_DEL_SET = 150 * 1024 * 1024;

export type PiezaParaMostrar = {
  nombre: string;
  /** Dónde queda dentro del ZIP: «2. Técnica/Respaldos de experiencia». */
  carpetas: string[];
  que_es: PiezaDelSet['que_es'];
  aviso: string | null;
};

export type SetParaMostrar = {
  piezas: PiezaParaMostrar[];
  faltan: string[];
  bytes: number;
};

const pesoDe = (piezas: PiezaDelSet[]) =>
  piezas.reduce((total, p) => total + p.bytes * p.carpetas.length, 0);

@Injectable()
export class ElSetService {
  constructor(
    private readonly repo: PostulacionRepository,
    private readonly analisis: AnalisisRepository,
    private readonly oferente: OferenteRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ElSetService.name);
  }

  async revisar(
    companyId: number,
    oportunidadId: number,
  ): Promise<SetParaMostrar> {
    const { set } = await this.armar(companyId, oportunidadId);
    const rutas = rutasEnElZip(set.piezas);
    return {
      piezas: set.piezas.map((p, i) => ({
        nombre: p.nombre,
        carpetas: rutas[i].map((r) => r.slice(0, r.lastIndexOf('/'))),
        que_es: p.que_es,
        aviso: p.aviso,
      })),
      faltan: set.faltan,
      bytes: pesoDe(set.piezas),
    };
  }

  async zip(
    companyId: number,
    oportunidadId: number,
  ): Promise<{ nombre: string; datos: Buffer }> {
    const { set, codigo, bajados } = await this.armar(companyId, oportunidadId);
    if (set.piezas.length === 0) {
      throw new BadRequestException(
        'Todavía no hay nada que bajar: genera los anexos o sube a «Mi postulación» lo que vas a presentar.',
      );
    }
    if (pesoDe(set.piezas) > MAX_BYTES_DEL_SET) {
      throw new BadRequestException(
        'El set pesa más de 150 MB: baja los archivos uno por uno desde «Mi postulación».',
      );
    }
    const rutas = rutasEnElZip(set.piezas);
    const archivos: ArchivoParaElZip[] = [];
    const sinBajar: string[] = [];
    for (const [i, p] of set.piezas.entries()) {
      const datos = bajados.get(p.ruta) ?? (await this.bajar(p.ruta));
      if (!datos) {
        sinBajar.push(p.nombre);
        continue;
      }
      for (const nombre of rutas[i]) archivos.push({ nombre, datos });
    }
    if (sinBajar.length > 0) {
      archivos.push({
        nombre: 'No se pudo bajar.txt',
        datos: Buffer.from(
          `Estos archivos no se pudieron bajar; bájalos desde Eventia:\r\n${sinBajar.map((n) => `- ${n}`).join('\r\n')}\r\n`,
          'utf8',
        ),
      });
    }
    this.logger.info(
      `set de la oportunidad ${oportunidadId} (empresa ${companyId}): ${archivos.length} archivos${sinBajar.length > 0 ? `, ${sinBajar.length} sin bajar` : ''}`,
    );
    return { nombre: `Postulación ${codigo}.zip`, datos: armarZip(archivos) };
  }

  private async bajar(ruta: string): Promise<Buffer | null> {
    try {
      return await this.analisis.descargar(ruta);
    } catch (error) {
      this.logger.warn(`set: no se pudo bajar ${ruta}: ${mensajeDe(error)}`);
      return null;
    }
  }

  /** Junta los datos, decide qué va y lee los Word que van para encontrar
   *  los respaldos de la experiencia declarada. */
  private async armar(companyId: number, oportunidadId: number) {
    const ficha = await this.repo.oportunidad(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No existe esa oportunidad.');
    const [archivos, trabajos, analisis, carpeta] = await Promise.all([
      this.repo.archivosDelSet(companyId, oportunidadId),
      this.repo.trabajosDeLaIA(companyId, oportunidadId),
      this.analisis.ultimo(companyId, oportunidadId),
      this.oferente.documentos(companyId),
    ]);
    if (analisis?.estado !== 'listo') {
      throw new BadRequestException(
        analisis?.estado === 'procesando'
          ? 'Las bases se están analizando: espera a que termine.'
          : 'Primero analiza las bases: de ahí sale qué va en cada carpeta.',
      );
    }
    const resultado = (analisis.resultado ?? {}) as {
      formularios?: FormularioDeLasBases[];
      requisitos?: Array<{ que: string }>;
    };
    const oferta = trabajos.find(
      (t) => t.tipo === 'oferta' && t.estado === 'listo',
    );
    const datos: DatosDelSet = {
      archivos,
      formularios: Array.isArray(resultado.formularios)
        ? resultado.formularios
        : [],
      requisitos: Array.isArray(resultado.requisitos)
        ? resultado.requisitos
        : [],
      carpeta,
      inicioDe: new Map(trabajos.map((t) => [t.id, t.creado_en])),
      ofertaLista: oferta ? (oferta.terminado_en ?? oferta.creado_en) : null,
      corte: hoyEnChile(
        ficha.proceso.fecha_cierre
          ? new Date(ficha.proceso.fecha_cierre)
          : new Date(),
      ),
    };
    const sinRespaldos = armarElSet(datos);
    const bajados = new Map<string, Buffer>();
    const textos: Array<{ texto: string; carpetas: Carpeta[] }> = [];
    for (const p of sinRespaldos.piezas) {
      if (extensionDe(p.nombre) !== 'docx') continue;
      const docx = await this.bajar(p.ruta);
      if (!docx) continue;
      bajados.set(p.ruta, docx);
      const texto = textoDeDocx(docx);
      if (texto) textos.push({ texto, carpetas: p.carpetas });
    }
    return {
      codigo: ficha.codigo,
      bajados,
      set: conLosRespaldos(sinRespaldos, textos, datos),
    };
  }
}
