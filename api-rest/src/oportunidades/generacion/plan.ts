import type { Origen } from '../adjuntos/adjuntos.repository';
import type { TipoDeGeneracion } from './generacion.repository';
import type { Habilidad } from './taller';

// EL PEDIDO AL TALLER (doc 17, sprint 3, paso 4): qué recibe Claude, qué
// tiene que entregar y con qué modelo. Aparte de generacion.service.ts, que
// llegó al tope de 800 líneas del portero (19-10).

/** Lo que el taller recibe: un archivo del balde o el logo (URL pública). */
export type Entrada = {
  enElTaller: string;
  tipo: string;
  ruta?: string;
  url?: string;
  /** El logo es opcional: si no se puede bajar, se sigue sin él. */
  opcional?: boolean;
  /** Un formulario en PDF: además, la IA lo mira (taller.ts). */
  verComoDocumento?: boolean;
  /** De un PDF, solo esas páginas (recortar-pdf.ts). */
  paginas?: number[];
};

/** Lo que se espera que entregue, y cómo se guarda. */
export type Salida = {
  enElTaller: string;
  nombre: string;
  origen: Exclude<Origen, 'subido'>;
  viene_de: number | null;
  /** El firmado se compara con el documento que se firmó. */
  comparaCon?: string;
  /** Solo se revisa, no se guarda (el Word firmado: se guarda su PDF). */
  soloRevisar?: true;
  /** El PDF se guarda solo si ese Word pasó la revisión (revision.ts). */
  siPasa?: string;
  /** De un PDF, un Word por formulario: `concretarSalidas`. */
  prefijo?: true;
};

export type Plan = {
  tipo: TipoDeGeneracion;
  /** El modelo por tarea (Felipe, 17-10): Sonnet llena los anexos, Haiku
   *  firma y Opus escribe la propuesta técnica. */
  modelo: string;
  oportunidadId: number;
  perfil: string | null;
  sistema: string;
  texto: string;
  entradas: Entrada[];
  salidas: Salida[];
  esfuerzo: 'medium' | 'high';
  maxTokens: number;
  /** Sin decirlo, la de Word; con un PDF, también la de PDF. */
  habilidades?: readonly Habilidad[];
  /** «Volver a armar» (decisión 49): los borradores sin firma que este
   *  trabajo reemplaza; se borran recién cuando lo nuevo quedó guardado. */
  reemplaza?: number[];
};
