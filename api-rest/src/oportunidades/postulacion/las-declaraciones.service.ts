import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import type { User } from 'src/users/entities/user.entity';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { sello, TIPOS_POR_EXTENSION } from '../adjuntos/adjuntos.service';
import { AnalisisRepository } from '../analisis/analisis.repository';
import { fechaLarga } from '../generacion/instrucciones';
import { bajarLogo, urlDelLogo } from '../generacion/logo';
import { OferenteRepository } from '../oferente/oferente.repository';
import type { ExperienciaConfirmada } from './la-experiencia';
import {
  armarLaDeclaracion,
  contenidoDeLaDeclaracion,
  datosDeLaEmpresa,
  lasDeclaracionesPedidas,
} from './las-declaraciones';
import { nombreDelPapel, type TipoDeDeclaracion } from './los-papeles';
import { PostulacionRepository } from './postulacion.repository';
import { medidasDeLaImagen } from './word-de-la-casa';

// LAS DECLARACIONES EN «MI POSTULACIÓN» (decisión 119, parte 3b, 08-11).
// Las arma «Armar postulación» junto con lo demás: una por cada declaración
// o carta que las bases piden sin formato (`las-declaraciones.ts`), con el
// nombre que le dan las bases, sin firma y con la corrida de la oferta en
// `generacion_id`, como la cotización detallada. Se firman con «Firmar».

const TIPO_WORD = TIPOS_POR_EXTENSION.docx;

/** Lo que pasó al armarlas. */
export type DeclaracionesArmadas = {
  hechas: number;
  /** Las que no salieron, en palabras: «Datos bancarios para el pago»:
   *  completa los datos bancarios… */
  noSalieron: string[];
};

/** Los colores de la marca, RRGGBB; un color mal escrito no se usa. */
const hex = (c: string | null | undefined) =>
  /^#?[0-9a-f]{6}$/i.test(c?.trim() ?? '')
    ? (c as string).trim().replace('#', '').toUpperCase()
    : null;

@Injectable()
export class LasDeclaracionesService {
  constructor(
    private readonly repo: PostulacionRepository,
    private readonly oferente: OferenteRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly analisis: AnalisisRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LasDeclaracionesService.name);
  }

  /** Las arma y las guarda. `yaHechas`: las firmadas o subidas a mano, que
   *  no se rehacen (decisión 49), por su tipo; `reemplaza`: los borradores de antes,
   *  que se borran recién cuando las nuevas quedaron guardadas. Lanza solo
   *  si no se pudo leer lo necesario. */
  async armar(
    user: User,
    oportunidadId: number,
    ofertaId: number,
    opciones: {
      experiencia: ExperienciaConfirmada | null;
      reemplaza: number[];
      yaHechas: TipoDeDeclaracion[];
    },
  ): Promise<DeclaracionesArmadas> {
    const companyId = user.company_id;
    const o = await this.repo.oportunidad(companyId, oportunidadId);
    if (!o) throw new NotFoundException('No existe esa oportunidad.');
    const analisis = await this.analisis.ultimo(companyId, oportunidadId);
    const resultado = analisis?.estado === 'listo' ? analisis.resultado : null;
    const pedidas = lasDeclaracionesPedidas(resultado).filter(
      (p) => !opciones.yaHechas.includes(p.tipo),
    );
    if (pedidas.length === 0) return { hechas: 0, noSalieron: [] };

    const [oferente, empresa, perfil] = await Promise.all([
      this.oferente.oferente(companyId),
      this.oferente.empresa(companyId),
      this.adjuntos.perfilDe(companyId, user.id),
    ]);
    const datos = datosDeLaEmpresa(oferente, empresa);
    const licitacion = {
      proceso: `${o.proceso.tipo === 'compra_agil' ? 'Compra Ágil' : 'Licitación'} ${o.codigo}`,
      nombre: o.proceso.nombre,
      comprador: o.proceso.organismo,
    };
    const fecha = fechaLarga();
    const primario = hex(empresa?.colors?.primary);
    const secundario = hex(empresa?.colors?.secondary);
    const logo = await bajarLogo(
      urlDelLogo(empresa?.logo_url ?? null) ?? undefined,
      (m) => this.logger.warn(`declaraciones: ${m}`),
    );
    const medidas = logo ? medidasDeLaImagen(logo) : null;

    const noSalieron: string[] = [];
    let hechas = 0;
    for (const p of pedidas) {
      const contenido = contenidoDeLaDeclaracion(
        p.tipo,
        datos,
        licitacion,
        opciones.experiencia?.filas ?? [],
      );
      if ('falta' in contenido) {
        noSalieron.push(`«${p.nombre}»: ${contenido.falta}.`);
        continue;
      }
      const docx = armarLaDeclaracion({
        titulo: p.nombre,
        licitacion,
        lugarYFecha: datos.comuna ? `${datos.comuna}, ${fecha}` : fecha,
        contenido,
        firma: {
          nombre: datos.representante.nombre,
          razonSocial: datos.razonSocial,
        },
        marca: primario
          ? { primario, secundario: secundario ?? 'F3F4F6' }
          : null,
        logo: logo && medidas ? { datos: logo, tipo: medidas.tipo } : null,
      });
      const nombre = nombreDelPapel(p.nombre, o.codigo);
      const ruta = `c${companyId}/oportunidades/${oportunidadId}/postulacion/${sello()}_${sanitize(nombre)}`;
      try {
        await this.adjuntos.subirArchivo(ruta, docx, TIPO_WORD);
        try {
          await this.adjuntos.guardar({
            company_id: companyId,
            oportunidad_id: oportunidadId,
            nombre,
            ruta,
            tipo: TIPO_WORD,
            bytes: docx.length,
            seccion: 'postulacion',
            subido_por: perfil,
            origen: 'generado',
            viene_de: null,
            // La corrida de la oferta que la pidió: con otra, queda vieja.
            generacion_id: ofertaId,
          });
        } catch (error) {
          await this.adjuntos.borrarArchivo(ruta);
          throw error;
        }
        hechas++;
      } catch (error) {
        this.logger.warn(
          `declaración «${p.nombre}» de la oportunidad ${oportunidadId}: ${mensajeDe(error)}`,
        );
        noSalieron.push(`«${p.nombre}»: no se pudo guardar; vuelve a armar.`);
      }
    }
    if (hechas > 0 && opciones.reemplaza.length > 0) {
      await this.adjuntos
        .borrarBorradores(companyId, oportunidadId, opciones.reemplaza)
        .catch((error) =>
          this.logger.warn(
            `borradores de las declaraciones ${oportunidadId}: ${mensajeDe(error)}`,
          ),
        );
    }
    return { hechas, noSalieron };
  }
}
