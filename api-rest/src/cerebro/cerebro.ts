import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { aprobadasDe, seccionDeLecciones } from './lecciones';

// EL CEREBRO COMÚN DE LA IA DE EVENTIA (doc 20 §15, etapa 2; Felipe,
// 04-11-2026: «tenemos una sola IA que conoce todo el sistema de operación
// del complejo», y «vamos con la etapa 2, cerebro en común»).
//
// Lo que sabe la IA vive en un solo lugar, en archivos que se corrigen a
// mano, al lado de este:
//  - LA_CASA.md: lo de todas las empresas (cómo funciona Eventia y las reglas
//    que antes repetía cada IA);
//  - empresas/<carpeta>/EL_COMPLEJO.md: lo propio de una empresa;
//  - empresas/<carpeta>/COMO_SE_ARMA.md y COMO_SE_ESCRIBE.md: las dos guías
//    de trabajo, con sus lecciones.
//
// Cada IA lee lo que le toca: BelIA, todo; «✨ Crear con IA», lo común y
// cómo se arma; «✉ Generar seguimiento», lo común y cómo se escribe. Las
// habilidades del chat (`armar-cotizacion`, `correos-cotizaciones-vds`) leen
// los mismos archivos. Una corrección se escribe UNA vez y la aplican todas.
//
// Al final van las lecciones que aprobó administración en Eventia (doc 20
// §17, `lecciones.ts`): lo que BelIA aprendió de una corrección, sin esperar
// a que alguien lo pase a estos archivos.

/** Para qué se lee: armar una cotización, escribir un correo, conversar o
 *  postular a una licitación (Oportunidades, doc 20 §17, mejora 6: lo
 *  común y lo del complejo, sin las guías de armar ni de escribir). */
export type Tarea = 'armar' | 'escribir' | 'conversar' | 'postular';

/** La empresa 1. Es la única con lo suyo escrito (el derecho de «Crear con
 *  IA» y del seguimiento con IA también es solo suyo). */
export const VALLE_DEL_SOL = 1;

/** La carpeta de cada empresa que tiene lo suyo escrito; las demás leen
 *  solo lo común, sin las reglas de otra. */
const CARPETAS: Record<number, string> = { [VALLE_DEL_SOL]: 'valle-del-sol' };

const leidos = new Map<string, string>();

/** Un archivo del cerebro, leído una vez. Los archivos viajan junto al
 *  código compilado (nest-cli.json, "assets"): si uno no llegó al
 *  despliegue, falla claro en vez de trabajar sin reglas. */
const leer = (ruta: string): string => {
  const ya = leidos.get(ruta);
  if (ya !== undefined) return ya;
  const archivo = join(__dirname, ruta);
  if (!existsSync(archivo)) {
    throw new Error(
      `Falta ${archivo}: la IA no trabaja sin las reglas de la casa.`,
    );
  }
  const texto = readFileSync(archivo, 'utf8');
  leidos.set(ruta, texto);
  return texto;
};

/** Lo que lee una IA de esta empresa para esta tarea, en orden: lo común,
 *  lo de la empresa y la guía de la tarea. */
export function cerebroPara(
  companyId: number | null | undefined,
  tarea: Tarea,
): string {
  const partes = [leer('LA_CASA.md')];
  const carpeta = companyId ? CARPETAS[companyId] : undefined;
  if (carpeta) {
    partes.push(leer(`empresas/${carpeta}/EL_COMPLEJO.md`));
    if (tarea === 'armar' || tarea === 'conversar') {
      partes.push(leer(`empresas/${carpeta}/COMO_SE_ARMA.md`));
    }
    if (tarea === 'escribir' || tarea === 'conversar') {
      partes.push(leer(`empresas/${carpeta}/COMO_SE_ESCRIBE.md`));
    }
  }
  const aprendido = companyId
    ? seccionDeLecciones(aprobadasDe(companyId), tarea)
    : null;
  if (aprendido) partes.push(aprendido);
  return partes.join('\n\n---\n\n');
}
