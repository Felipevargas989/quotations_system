import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { sanitize } from 'src/storage/storage.service';
import {
  type Adjunto,
  AdjuntosRepository,
} from '../adjuntos/adjuntos.repository';
import { sello } from '../adjuntos/adjuntos.service';
import { GeneracionService } from '../generacion/generacion.service';
import { OportunidadesRepository } from '../oportunidades.repository';
import { noSiEstaCongelada } from './congelada';
import {
  leerElWord,
  paraLaPantalla,
  type WordParaEditar,
} from './el-word-editable';
import {
  guardarCambios,
  NoSeGuarda,
  OtraVersion,
  type ParrafoEditado,
} from './guardar-el-word';
import { conLaLetraDelFormulario } from './la-letra-del-formulario';

// EL WORD SE EDITA EN EVENTIA (decisión 78 del doc 17, 24-10): abrir un Word
// de «Mi postulación» para editarlo y guardar lo editado en el mismo Word.
// Se edita lo que todavía no está firmado (lo firmado no se toca, decisión
// 36), y no con la licitación postulada (decisión 33) ni mientras la IA
// trabaja en sus documentos: lo que hace la IA reemplazaría lo editado, y
// una firma en curso firmaría la versión de antes.

const SOLO_SIN_FIRMA =
  'Aquí se editan los Word de «Mi postulación» que todavía no están firmados.';

const CAMBIO_ENTREMEDIO =
  'Este Word cambió mientras lo editabas: ciérralo y ábrelo de nuevo.';

@Injectable()
export class EditorDelWordService {
  constructor(
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly generacion: GeneracionService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EditorDelWordService.name);
  }

  private async elWord(
    companyId: number,
    oportunidadId: number,
    adjuntoId: number,
  ): Promise<Adjunto> {
    const a = await this.adjuntos.uno(companyId, oportunidadId, adjuntoId);
    if (!a) throw new NotFoundException('No encontramos ese archivo.');
    if (
      a.seccion !== 'postulacion' ||
      a.origen === 'firmado' ||
      !/\.docx$/i.test(a.nombre)
    ) {
      throw new BadRequestException(SOLO_SIN_FIRMA);
    }
    return a;
  }

  async abrir(
    companyId: number,
    oportunidadId: number,
    adjuntoId: number,
  ): Promise<WordParaEditar> {
    const a = await this.elWord(companyId, oportunidadId, adjuntoId);
    const lectura = leerElWord(await this.adjuntos.bajarArchivo(a.ruta));
    if (!lectura) {
      throw new BadRequestException(
        'Este Word no se puede editar aquí: descárgalo y edítalo en Word.',
      );
    }
    return paraLaPantalla(lectura);
  }

  /** Guarda los párrafos editados en un archivo nuevo, pasa la fila a él y
   *  borra el de antes (si la fila no pasa, se borra el nuevo). */
  async guardar(
    companyId: number,
    oportunidadId: number,
    adjuntoId: number,
    pedido: { version: string; parrafos: ParrafoEditado[] },
  ): Promise<Adjunto> {
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    noSiEstaCongelada((ficha as { estado?: string | null }).estado);
    const a = await this.elWord(companyId, oportunidadId, adjuntoId);
    const trabajos = await this.generacion.ultimas(companyId, oportunidadId);
    if (Object.values(trabajos).some((t) => t?.estado === 'procesando')) {
      throw new ConflictException(
        'La IA está trabajando en los documentos de esta licitación: guarda cuando termine.',
      );
    }
    if (pedido.parrafos.length === 0) return a;

    let nuevo: Buffer;
    try {
      nuevo = guardarCambios(
        await this.adjuntos.bajarArchivo(a.ruta),
        pedido.version,
        pedido.parrafos,
      );
    } catch (e) {
      if (e instanceof OtraVersion)
        throw new ConflictException(CAMBIO_ENTREMEDIO);
      if (e instanceof NoSeGuarda) throw new BadRequestException(e.message);
      throw e;
    }
    // Decisión 82: lo que quedó sin letra (lo escrito por la IA antes de
    // ella) toma la del formulario.
    nuevo = conLaLetraDelFormulario(nuevo).docx;

    const ruta = `c${companyId}/oportunidades/${oportunidadId}/postulacion/${sello()}_${sanitize(a.nombre)}`;
    await this.adjuntos.subirArchivo(ruta, nuevo, a.tipo);
    let guardado: Adjunto | null;
    try {
      guardado = await this.adjuntos.cambiarArchivo(
        companyId,
        oportunidadId,
        adjuntoId,
        a.ruta,
        { ruta, bytes: nuevo.length },
      );
    } catch (error) {
      await this.adjuntos.borrarArchivo(ruta);
      throw error;
    }
    if (!guardado) {
      await this.adjuntos.borrarArchivo(ruta);
      throw new ConflictException(CAMBIO_ENTREMEDIO);
    }
    if (!(await this.adjuntos.borrarArchivo(a.ruta))) {
      this.logger.warn(`no se pudo borrar del balde: ${a.ruta}`);
    }
    this.logger.info(
      `Word ${adjuntoId} editado en Eventia (oportunidad ${oportunidadId}, ${pedido.parrafos.length} párrafos)`,
    );
    return guardado;
  }
}
