import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'node:crypto';
import { sanitize } from 'src/storage/storage.service';
import { type Adjunto, AdjuntosRepository } from './adjuntos.repository';

// LAS BASES Y ANEXOS DE UNA OPORTUNIDAD (doc 17 §12 punto 8, opción d).
// Felipe, 17-10: "ok dale con el botón y arrastro".
//
// Mercado Público protege su lista de adjuntos con un control antirrobots
// que esta casa no esquiva. Los archivos los baja una persona desde su
// navegador y los arrastra a la ficha. Pasan por la misma puerta que el
// resto de los archivos de Eventia (misión storage):
//  - el motor valida tipo y tamaño;
//  - arma la ruta con la empresa de la sesión, c<empresa>/oportunidades/<id>/;
//  - guarda con su propia llave en el balde privado;
//  - el visor pide un enlace firmado que caduca en minutos (/storage/signed-url).

/** Lo más que pesa un archivo. Las bases rara vez pasan de 10 MB; un ZIP
 *  con planos puede llegar a 30. */
export const MAX_BYTES_ADJUNTO = 30 * 1024 * 1024;

/** Lo que Mercado Público suele adjuntar: bases en PDF o Word, anexos en
 *  Word o Excel, a veces todo en un ZIP. El tipo se decide por la
 *  extensión, porque el navegador a veces manda "application/octet-stream".
 *  Con ese tipo se guarda, y así el visor sabe qué mostrar. Nada que un
 *  navegador ejecute (HTML, SVG). */
export const TIPOS_POR_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const LARGO_MAXIMO_DEL_NOMBRE = 150;

/** El nombre con que se mostrará: sin carpetas, sin espacios de más, y si
 *  es muy largo se corta antes de la extensión. */
export const nombreLimpio = (original: string): string => {
  const nombre =
    original.split(/[\\/]/).pop()?.replace(/\s+/g, ' ').trim() ?? '';
  if (nombre.length <= LARGO_MAXIMO_DEL_NOMBRE) return nombre;
  const punto = nombre.lastIndexOf('.');
  const ext = punto > 0 ? nombre.slice(punto) : '';
  return `${nombre.slice(0, LARGO_MAXIMO_DEL_NOMBRE - ext.length).trim()}${ext}`;
};

export const extensionDe = (nombre: string): string => {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : '';
};

/** Sello único de la subida: la hora y 4 letras al azar, por si llegan dos
 *  archivos del mismo nombre en el mismo instante. */
export const sello = () =>
  `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomBytes(2).toString('hex')}`;

@Injectable()
export class AdjuntosService {
  constructor(
    private readonly repo: AdjuntosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdjuntosService.name);
  }

  private async comprobar(companyId: number, oportunidadId: number) {
    if (!(await this.repo.esDeLaEmpresa(companyId, oportunidadId))) {
      throw new NotFoundException('No encontramos esa oportunidad.');
    }
  }

  async listar(companyId: number, oportunidadId: number): Promise<Adjunto[]> {
    await this.comprobar(companyId, oportunidadId);
    return this.repo.listar(companyId, oportunidadId);
  }

  /** `cuentaId` es el id de la sesión (`user.id`); quién lo subió se guarda
   *  con el perfil de esa cuenta en la empresa. */
  async subir(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
    archivo: Express.Multer.File | undefined,
  ): Promise<Adjunto> {
    if (!archivo) throw new BadRequestException('No llegó ningún archivo.');
    const nombre = nombreLimpio(archivo.originalname);
    const tipo = TIPOS_POR_EXTENSION[extensionDe(nombre)];
    if (!tipo) {
      throw new BadRequestException(
        `"${nombre}" no se puede subir: sirven PDF, Word, Excel, PowerPoint, ZIP, RAR, 7z, texto e imágenes.`,
      );
    }
    if (archivo.size <= 0) {
      throw new BadRequestException(`"${nombre}" está vacío.`);
    }
    if (archivo.size > MAX_BYTES_ADJUNTO) {
      throw new BadRequestException(`"${nombre}" pesa más de 30 MB.`);
    }
    await this.comprobar(companyId, oportunidadId);
    const subidoPor = await this.repo.perfilDe(companyId, cuentaId);

    const ruta = `c${companyId}/oportunidades/${oportunidadId}/${sello()}_${sanitize(nombre)}`;
    await this.repo.subirArchivo(ruta, archivo.buffer, tipo);
    try {
      return await this.repo.guardar({
        company_id: companyId,
        oportunidad_id: oportunidadId,
        nombre,
        ruta,
        tipo,
        bytes: archivo.size,
        subido_por: subidoPor,
      });
    } catch (error) {
      // Sin su fila nadie lo vería: que no quede un archivo huérfano.
      await this.repo.borrarArchivo(ruta);
      throw error;
    }
  }

  async borrar(
    companyId: number,
    oportunidadId: number,
    adjuntoId: number,
  ): Promise<{ borrado: true }> {
    const fila = await this.repo.borrarFila(
      companyId,
      oportunidadId,
      adjuntoId,
    );
    if (!fila) throw new NotFoundException('No encontramos ese archivo.');
    // Primero la fila, después el archivo: si el balde falla, queda un
    // archivo que nadie ve (inofensivo), nunca una fila que apunta a nada.
    if (!(await this.repo.borrarArchivo(fila.ruta))) {
      this.logger.warn(`no se pudo borrar del balde: ${fila.ruta}`);
    }
    return { borrado: true };
  }
}
