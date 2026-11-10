import {
  type ArchivoDelSet,
  type FormularioDeLasBases,
  mismoFormulario,
  normalizar,
} from './el-set';
import { esLaCotizacionDetallada } from './la-cotizacion-detallada';
import { quienLoHace, type TipoDeDeclaracion } from './los-papeles';

// «VOLVER A ARMAR» (decisión 49 del doc 17, 19-10). Felipe: "no necesitamos
// llenarnos de documentos: si pongo volver a generar está bien que borre
// todo lo anterior (que no esté firmado); si tengo el 1, 2 y 3 firmados, en
// este caso debe volver a crear solo 4 y 5, y si yo borro todo, que cree
// todo de nuevo". Sin IA: qué está firmado, qué se rehace y qué borradores
// se reemplazan. Lo firmado (o subido a mano, que se firma por fuera) nunca
// se borra solo.

export type LaVueltaAnterior = {
  /** Los formularios de las bases que ya están firmados y no se rehacen. */
  yaFirmados: string[];
  /** ¿Están firmados todos los que aplican? No hay anexos que rehacer. */
  todoFirmado: boolean;
  /** Los borradores de la IA sin firma: los formularios llenos... */
  borradoresDeFormularios: number[];
  /** ...y las propuestas técnicas. */
  borradoresDePropuesta: number[];
  /** ¿Ya hay una propuesta técnica firmada o subida a mano? */
  propuestaFirmada: boolean;
  /** Los borradores de la cotización detallada (decisión 119): los
   *  reemplaza la nueva. */
  borradoresDeCotizacion: number[];
  /** La cotización detallada que ya hay: subida a mano (no se rehace),
   *  firmada con el mismo precio (tampoco), firmada con otro precio (se
   *  rehace y se avisa) o ninguna. */
  cotizacion: 'no_hay' | 'firmada' | 'otro_precio' | 'subida';
  /** Los borradores de las declaraciones (decisión 119, parte 3b): los
   *  reemplazan las nuevas. */
  borradoresDeDeclaraciones?: number[];
  /** Las declaraciones firmadas o subidas a mano: no se rehacen. */
  declaracionesHechas?: TipoDeDeclaracion[];
};

const PROPUESTA = /propuesta tecnica|oferta tecnica/;

/** Qué es un archivo que no viene de un formulario del comprador. */
type DeLaCasa = 'cotizacion' | 'declaracion' | 'propuesta';

export function laVueltaAnterior(d: {
  /** Los archivos de «Mi postulación». */
  postulacion: ArchivoDelSet[];
  formularios: FormularioDeLasBases[];
  /** El precio de esta vuelta, con IVA. */
  total: number;
  /** El precio con que se hizo cada trabajo de anexos, por su id. */
  totalDe: ReadonlyMap<number, number | null>;
  /** El precio de la vuelta anterior de «Armar postulación»: con el que se
   *  firmó la cotización detallada (su Word se borra al firmar). */
  precioAnterior?: number | null;
  /** El tipo de cada trabajo, por su id (decisión 119, parte 3b): lo que
   *  hizo el motor con la oferta (la cotización y las declaraciones) y la
   *  propuesta técnica se reconocen por su corrida, porque desde la parte
   *  3b llevan el nombre que les dan las bases. Sin el dato, por el nombre,
   *  como antes. */
  tipoDe?: ReadonlyMap<number, string>;
}): LaVueltaAnterior {
  const generados = d.postulacion.filter((a) => a.origen === 'generado');
  const firmados = d.postulacion.filter((a) => a.origen === 'firmado');
  const subidos = d.postulacion.filter((a) => a.origen === 'subido');
  const padreDe = (a: ArchivoDelSet) =>
    generados.find((g) => g.id === a.viene_de);
  const conFirma = new Set(firmados.map((f) => f.viene_de));
  const borradores = generados.filter((g) => !conFirma.has(g.id));

  /** Qué es lo que hizo Eventia sin un formulario del comprador: por su
   *  corrida si se sabe, si no por el nombre. El firmado, por su Word si
   *  sigue ahí (desde la decisión 58 el firmado toma la corrida del Word). */
  const deLaCasa = (a: ArchivoDelSet): DeLaCasa | null => {
    const w = a.origen === 'firmado' ? (padreDe(a) ?? a) : a;
    if (w.viene_de !== null) return null;
    const tipo =
      w.generacion_id != null ? d.tipoDe?.get(w.generacion_id) : undefined;
    if (tipo === 'oferta') {
      return quienLoHace(w.nombre)?.quien === 'declaracion'
        ? 'declaracion'
        : 'cotizacion';
    }
    if (tipo === 'propuesta') return 'propuesta';
    if (esLaCotizacionDetallada(w.nombre)) return 'cotizacion';
    if (w === a && a.origen === 'firmado') {
      return PROPUESTA.test(normalizar(a.nombre)) ? 'propuesta' : null;
    }
    return 'propuesta';
  };
  const cotizacion = (a: ArchivoDelSet) => deLaCasa(a) === 'cotizacion';
  /** El tipo de una declaración del motor, o subida a mano con su nombre. */
  const declaracion = (a: ArchivoDelSet): TipoDeDeclaracion | null => {
    if (a.origen !== 'subido' && deLaCasa(a) !== 'declaracion') return null;
    const q = quienLoHace(a.nombre);
    return q?.quien === 'declaracion' ? q.tipo : null;
  };

  // Un formulario firmado de la parte económica con otro precio se rehace:
  // si no, la oferta saldría con el precio de antes.
  const firmadoVigente = (f: FormularioDeLasBases): boolean =>
    subidos.some((s) => mismoFormulario(f.nombre, s.nombre)) ||
    firmados.some((x) => {
      if (!mismoFormulario(f.nombre, x.nombre)) return false;
      if (normalizar(f.se_entrega_en ?? '') !== 'economica') return true;
      // Desde la decisión 58 el Word se borra al firmar: el firmado trae la
      // corrida de su Word.
      const padre = padreDe(x);
      const corrida = padre ? padre.generacion_id : x.generacion_id;
      const precio = corrida != null ? d.totalDe.get(corrida) : null;
      return precio == null || precio === d.total;
    });

  const aplican = d.formularios.filter((f) => f.aplica);
  const yaFirmados = aplican.filter(firmadoVigente).map((f) => f.nombre);
  const hechas = [...firmados, ...subidos]
    .map(declaracion)
    .filter((t): t is TipoDeDeclaracion => t !== null);
  return {
    yaFirmados,
    todoFirmado: aplican.length > 0 && yaFirmados.length === aplican.length,
    borradoresDeFormularios: borradores
      .filter((g) => g.viene_de !== null)
      .map((g) => g.id),
    borradoresDePropuesta: borradores
      .filter((g) => g.viene_de === null && deLaCasa(g) === 'propuesta')
      .map((g) => g.id),
    borradoresDeCotizacion: borradores.filter(cotizacion).map((g) => g.id),
    cotizacion: subidos.some((s) => esLaCotizacionDetallada(s.nombre))
      ? 'subida'
      : firmados.some(cotizacion)
        ? d.precioAnterior != null && d.precioAnterior !== d.total
          ? 'otro_precio'
          : 'firmada'
        : 'no_hay',
    propuestaFirmada:
      firmados.some((f) => deLaCasa(f) === 'propuesta') ||
      subidos.some((s) => PROPUESTA.test(normalizar(s.nombre))),
    borradoresDeDeclaraciones: borradores
      .filter((g) => deLaCasa(g) === 'declaracion')
      .map((g) => g.id),
    declaracionesHechas: [...new Set(hechas)],
  };
}
