import type { Adjunto } from '../adjuntos/adjuntos.repository';
import { extensionDe, TIPOS_POR_EXTENSION } from '../adjuntos/adjuntos.service';
import { MODELO_OPUS, MODELO_SONNET } from '../analisis/comun';
import { mismoNombre } from './instrucciones';
import { HABILIDAD_DE_PDF, HABILIDAD_DE_WORD, type Habilidad } from './taller';

// LOS FORMULARIOS DEL COMPRADOR, DOS CAMINOS (Felipe, 18-10: "si bien en
// Word se rellena, si bien escaneado en PDF se reconvierte... y dejamos un
// protocolo más robusto cuando se reconvierta, cosa de que mantenga la
// originalidad del documento").
//
//  - Word (.docx, o .doc antiguo, que el taller convierte): se llena el
//    MISMO archivo del comprador.
//  - PDF (separado, escaneado o al final de las bases): se REESCRIBE cada
//    formulario en un Word nuevo, con el texto oficial al pie de la letra,
//    sus tablas, el logo del organismo, colores y tipografía parecida
//    (protocolo en instrucciones.ts). Llenar encima del PDF se descartó: en
//    el Día del Profesor los formularios venían escaneados, mezclados con el
//    decreto y bajo las firmas y timbres del alcalde.
//
// Aparte del servicio, que está en el tope de 800 líneas del portero.

export type ClaseDeFormulario = 'word' | 'doc' | 'pdf';

export const claseDeFormulario = (nombre: string): ClaseDeFormulario | null => {
  const ext = extensionDe(nombre);
  if (ext === 'docx') return 'word';
  if (ext === 'doc') return 'doc';
  if (ext === 'pdf') return 'pdf';
  return null;
};

/** Lo que los PDF elegidos pueden pesar juntos: los mira página por página. */
export const MAX_BYTES_DE_PDF_EN_FORMULARIOS = 40 * 1024 * 1024;

/** Qué archivos van al taller. Si la persona eligió, eso. Si no, los Word
 *  de las bases y los archivos donde el análisis encontró formularios que
 *  aplican, también los PDF (Felipe, 18-10: "que cuando la IA analice los
 *  documentos identifique dónde están los formularios... y deje listo el
 *  proceso de generación"). */
export const elegirArchivos = (
  bases: Adjunto[],
  pedidos: ReadonlySet<number>,
  delAnalisis: ReadonlyArray<{ archivo: string; aplica: boolean }>,
): Adjunto[] => {
  if (pedidos.size > 0) return bases.filter((a) => pedidos.has(a.id));
  const conFormularios = delAnalisis.filter((f) => f.aplica && f.archivo);
  return bases.filter((a) => {
    const clase = claseDeFormulario(a.nombre);
    if (!clase) return false;
    return (
      clase !== 'pdf' ||
      conFormularios.some((f) => mismoNombre(a.nombre, f.archivo))
    );
  });
};

export const sinExtension = (nombre: string) => {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(0, punto) : nombre;
};

const EXTENSION: Record<ClaseDeFormulario, string> = {
  word: 'docx',
  doc: 'doc',
  pdf: 'pdf',
};

export type FormularioEnElTaller = {
  adjunto: Adjunto;
  clase: ClaseDeFormulario;
  /** El nombre con que lo ve la IA: anexo_<id>.<docx|doc|pdf>. */
  enElTaller: string;
  tipo: string;
};

export const formulariosParaElTaller = (
  elegidos: Adjunto[],
): FormularioEnElTaller[] =>
  elegidos.map((adjunto) => {
    const clase = claseDeFormulario(adjunto.nombre) ?? 'word';
    return {
      adjunto,
      clase,
      enElTaller: `anexo_${adjunto.id}.${EXTENSION[clase]}`,
      tipo: TIPOS_POR_EXTENSION[EXTENSION[clase]],
    };
  });

const hayPdf = (formularios: FormularioEnElTaller[]) =>
  formularios.some((f) => f.clase === 'pdf');

/** Llenar un Word es casi copiar datos: Sonnet. Reescribir un PDF —leer un
 *  escaneo y rehacerlo igual, con el texto exacto— es nota fina: Opus. */
export const modeloParaFormularios = (formularios: FormularioEnElTaller[]) =>
  hayPdf(formularios) ? MODELO_OPUS : MODELO_SONNET;

export const habilidadesParaFormularios = (
  formularios: FormularioEnElTaller[],
): Habilidad[] =>
  hayPdf(formularios)
    ? [HABILIDAD_DE_WORD, HABILIDAD_DE_PDF]
    : [HABILIDAD_DE_WORD];

export type SalidaDeFormulario = {
  enElTaller: string;
  nombre: string;
  origen: 'generado';
  viene_de: number;
  /** De un PDF salen tantos Word como formularios traiga (no se sabe
   *  antes): se reconocen porque empiezan con `enElTaller`. */
  prefijo?: true;
};

/** Lo que se espera de vuelta: un Word lleno por cada Word (el .doc vuelve
 *  como .docx) y, de cada PDF, formulario_<id>_<n>.docx por formulario. */
export const salidasDeFormularios = (
  formularios: FormularioEnElTaller[],
): SalidaDeFormulario[] =>
  formularios.map(({ adjunto, clase }) =>
    clase === 'pdf'
      ? {
          enElTaller: `formulario_${adjunto.id}_`,
          nombre: sinExtension(adjunto.nombre),
          origen: 'generado',
          viene_de: adjunto.id,
          prefijo: true,
        }
      : {
          enElTaller: `lleno_${adjunto.id}.docx`,
          nombre: `${sinExtension(adjunto.nombre)} - lleno.docx`,
          origen: 'generado',
          viene_de: adjunto.id,
        },
  );

const numeroDelFormulario = (archivo: string): number => {
  const m = /_(\d+)\.docx$/i.exec(archivo);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

/** Las salidas con prefijo se vuelven una por cada Word que llegó con ese
 *  prefijo, en el orden de los formularios, nombradas con el título que la
 *  IA anotó en el informe («Formulario N°1 - Identificación del oferente -
 *  lleno.docx»). Si de un PDF no llegó ninguno, queda tal cual: así cuenta
 *  como no entregado. */
export const concretarSalidas = <
  S extends { enElTaller: string; nombre: string; prefijo?: true },
>(
  salidas: S[],
  entregados: string[],
  titulos: ReadonlyMap<string, string>,
): S[] =>
  salidas.flatMap((s) => {
    if (!s.prefijo) return [s];
    const hechos = entregados
      .filter(
        (n) => n.startsWith(s.enElTaller) && n.toLowerCase().endsWith('.docx'),
      )
      .sort((a, b) => numeroDelFormulario(a) - numeroDelFormulario(b));
    if (hechos.length === 0) return [s];
    return hechos.map((n) => {
      const titulo = titulos.get(n)?.trim();
      const numero = numeroDelFormulario(n);
      const base =
        titulo ||
        `${s.nombre} - formulario ${numero === Number.MAX_SAFE_INTEGER ? '' : numero}`.trim();
      return {
        ...s,
        enElTaller: n,
        nombre: `${base} - lleno.docx`,
        prefijo: undefined,
      };
    });
  });
