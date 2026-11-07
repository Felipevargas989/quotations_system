import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import {
  EnvioSinRespuesta,
  type FacturacionCl,
  type RespuestaDeProcesar,
} from '../facturacion-cl/facturacion-cl';
import type {
  DocumentoTributario,
  DocumentosTributariosRepository,
  NuevoDocumentoTributario,
} from './documentos-tributarios.repository';

/**
 * MANDAR UN DOCUMENTO CON FOLIO (doc 19 §5.3 y §9.10): la factura (paso 2c)
 * y las notas de crédito y de débito (paso 4). Los candados de siempre:
 * - el registro en `enviando` antes de mandarlo (uno a la vez por evento,
 *   índice único de la 184);
 * - `procesar` nunca se reintenta solo: si se corta, queda «por confirmar»
 *   (L5) y se resuelve con «Comprobar»;
 * - solo si facturacion.cl dice que el folio ya existe (alguien emitió en
 *   su web, L3) o que está «fuera del rango que tiene autorizado» (hay
 *   varios rangos y usa otro, paso 0 del 06-11), se pide otro folio UNA vez
 *   más: el que sigue, o el de otro rango;
 * - si salió y no se pudo anotar, se dice con palabras: no se emite de nuevo.
 */
export async function mandarConFolio(p: {
  repo: DocumentosTributariosRepository;
  conexion: FacturacionCl;
  logger: PinoLogger;
  user: User;
  tipo: number;
  /** El documento sin su archivo: lo arma `armar` con el folio que toca. */
  fila: Omit<NuevoDocumentoTributario, 'archivo_enviado'>;
  /** El archivo con ese folio (lo que se vio en la vista previa). */
  armar: (folio: number) => string | null;
  /** El folio con que se revisó, si ya se pidió. */
  folio?: number;
  fecha: string;
  /** «La factura», «La nota de crédito»: para los avisos. */
  nombre: string;
}): Promise<{ documento: DocumentoTributario; porConfirmar: boolean }> {
  const { repo, conexion, user, tipo } = p;
  const companyId = user.company_id;
  const folio = p.folio ?? (await conexion.folioSiguiente(tipo));
  const archivo = p.armar(folio);
  if (!archivo) throw new BadRequestException(`${p.nombre} no se pudo armar`);

  let documento: DocumentoTributario;
  try {
    documento = await repo.crear({ ...p.fila, archivo_enviado: archivo });
  } catch (error) {
    if ((error as { code?: string })?.code === '23505')
      throw new ConflictException(
        'Ya se está emitiendo un documento de este evento: espera su respuesta.',
      );
    throw error;
  }

  let respuesta: RespuestaDeProcesar;
  try {
    respuesta = await conexion.procesar(archivo, tipo);
    const descartados =
      respuesta.resultado !== 'rechazado'
        ? null
        : /ya existe el documento/i.test(respuesta.mensaje)
          ? []
          : /fuera del rango/i.test(respuesta.mensaje)
            ? [folio]
            : null;
    if (descartados) {
      // Si no hay otro folio, o no responde, queda el rechazo tal cual: no
      // es un envío sin respuesta.
      const nuevo = await conexion
        .folioSiguiente(tipo, descartados)
        .catch(() => folio);
      const otro = nuevo !== folio ? p.armar(nuevo) : null;
      if (otro) {
        await repo.actualizar(documento.id, companyId, {
          archivo_enviado: otro,
        });
        respuesta = await conexion.procesar(otro, tipo);
      }
    }
  } catch (error) {
    // L5: no se sabe si salió. Nunca se reintenta solo.
    const motivo =
      error instanceof EnvioSinRespuesta
        ? error.message
        : `El envío falló sin respuesta: ${mensajeDe(error)}`;
    p.logger.warn(`documento ${documento.id} por confirmar: ${motivo}`);
    return {
      documento: await repo.actualizar(documento.id, companyId, {
        estado: 'por_confirmar',
        error: motivo,
      }),
      porConfirmar: true,
    };
  }

  if (respuesta.resultado === 'rechazado') {
    await repo.actualizar(documento.id, companyId, {
      estado: 'rechazado',
      error: respuesta.mensaje,
      respuesta: respuesta.crudo,
    });
    throw new BadRequestException(
      `facturacion.cl no la aceptó: ${respuesta.mensaje}`,
    );
  }

  try {
    return {
      documento: await repo.actualizar(documento.id, companyId, {
        estado: 'emitido',
        folio: respuesta.folio,
        fecha_emision: respuesta.fecha ?? p.fecha,
        respuesta: respuesta.crudo,
        url_original: respuesta.urlOriginal,
        url_cedible: respuesta.urlCedible,
        emitido_por: user.id ?? null,
        emitido_en: new Date().toISOString(),
      }),
      porConfirmar: false,
    };
  } catch (error) {
    // Salió, pero no quedó anotado: el registro sigue «enviando» y frena
    // otra emisión del evento hasta revisarlo.
    p.logger.error(
      `documento ${documento.id} (folio ${respuesta.folio}) emitido y SIN anotar: ${mensajeDe(error)}`,
    );
    throw new InternalServerErrorException(
      `${p.nombre} N° ${respuesta.folio} salió, pero Eventia no la pudo anotar. No la emitas de nuevo: avisa para revisarla.`,
    );
  }
}
