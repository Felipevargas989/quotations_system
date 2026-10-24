import type { AnalisisRepository } from '../analisis/analisis.repository';
import { hoyEnChile } from '../analisis/comun';
import type { EventiaRepository } from '../eventia/eventia.repository';
import type { OferenteRepository } from '../oferente/oferente.repository';
import { OFERENTE_VACIO } from '../oferente/oferente.service';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { noSiEstaCongelada } from '../postulacion/congelada';
import { sePuedeMostrar } from '../postulacion/la-experiencia';
import type { LoPostuladoService } from '../postulacion/lo-postulado.service';
import {
  type Aclaracion,
  memoriaDeLaLicitacion,
} from '../preguntas/lo-aclarado';
import {
  type ContextoDeGeneracion,
  fechaLarga,
  loQuePidenLasBases,
} from './instrucciones';

// LO QUE LEE LA IA AL GENERAR LOS ANEXOS, LA PROPUESTA Y LA FIRMA. Salió de
// generacion.service.ts el 22-10 (decisión 68): al sumarle la memoria de la
// licitación, el servicio cruzaba las 800 líneas del portero de la casa.
// Lo que lee: la licitación, la empresa, el último análisis listo de las
// bases con lo aclarado en «Pregúntale a la IA» (lo aclarado manda) y,
// para los anexos y la propuesta, lo que la empresa tiene en Eventia.

export type FichaParaGenerar = NonNullable<
  Awaited<ReturnType<OportunidadesRepository['ficha']>>
>;

export type FuentesDelContexto = {
  analisis: Pick<AnalisisRepository, 'ultimo'>;
  oferente: Pick<OferenteRepository, 'oferente' | 'empresa' | 'respaldos'>;
  eventia: Pick<EventiaRepository, 'carta' | 'eventosRealizados'>;
  loPostulado: Pick<LoPostuladoService, 'paraDocumentos'>;
  /** La memoria de la licitación (decisión 68); sin ella, nada aclarado. */
  preguntas?: {
    aclarado(companyId: number, oportunidadId: number): Promise<Aclaracion[]>;
  };
  avisar: (mensaje: string) => void;
};

/** `conEventia`: también la carta y los eventos realizados de los últimos
 *  4 años (anexos y propuesta; la firma no los necesita). */
export async function contextoDeGeneracion(
  f: FuentesDelContexto,
  companyId: number,
  oportunidadId: number,
  ficha: FichaParaGenerar,
  conEventia = false,
) {
  noSiEstaCongelada(ficha.estado); // al postular, se congela (decisión 33)
  const hoy = hoyEnChile();
  const haceCuatroAnios = `${Number(hoy.slice(0, 4)) - 4}${hoy.slice(4)}`;
  const [
    analisis,
    oferente,
    empresa,
    carta,
    eventos,
    respaldos,
    oferta,
    aclarado,
  ] = await Promise.all([
    f.analisis.ultimo(companyId, oportunidadId),
    f.oferente.oferente(companyId),
    f.oferente.empresa(companyId),
    conEventia ? f.eventia.carta(companyId) : Promise.resolve(null),
    conEventia
      ? f.eventia.eventosRealizados(companyId, haceCuatroAnios)
      : Promise.resolve([]),
    conEventia ? f.oferente.respaldos(companyId) : Promise.resolve([]),
    conEventia
      ? f.loPostulado.paraDocumentos(companyId, oportunidadId)
      : Promise.resolve(null),
    memoriaDeLaLicitacion(f.preguntas, companyId, oportunidadId, f.avisar),
  ]);
  const listo =
    analisis?.estado === 'listo' && analisis.resultado ? analisis : null;
  const bases = loQuePidenLasBases(listo?.resultado ?? null);
  const datos: ContextoDeGeneracion = {
    codigo: ficha.codigo,
    nombre: ficha.proceso.nombre,
    organismo: ficha.proceso.organismo,
    fecha_cierre: ficha.proceso.fecha_cierre,
    hoy,
    hoyLargo: fechaLarga(),
    oferente: { ...OFERENTE_VACIO, ...(oferente ?? {}) },
    empresa,
    // La memoria de la licitación (decisión 68): lo aclarado manda.
    bases: bases ? { ...bases, aclarado } : null,
    carta,
    // Solo los clientes que se pueden mostrar (decisión 76): la IA no
    // nombra a un privado que la empresa no quiere mostrar.
    eventos: eventos.filter((e) =>
      sePuedeMostrar(
        { id: e.cliente_id, tipo: e.tipo_de_cliente },
        oferente?.clientes_que_se_muestran ?? [],
      ),
    ),
    respaldos,
    oferta,
  };
  return {
    datos,
    oferente: datos.oferente,
    analisisId: listo?.id ?? null,
    logoUrl: empresa?.logo_url ?? null,
  };
}
