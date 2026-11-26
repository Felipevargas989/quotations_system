// LOS DATOS ABIERTOS DE CHILECOMPRA (decisión 101 del doc 17, 28-10).
// Felipe: "traigamos todas las licitaciones de Chile", "licitaciones y
// compra agiles... :D". En vez de pedir de a una a la API (semanas, con
// tickets prestados), ChileCompra publica gratis un archivo por mes:
//  - licitaciones: lic-da/{año}-{mes}.zip, mes sin cero (2025-1), con cada
//    oferta; se actualiza todos los días.
//  - compra ágil: trnspchc/COT_{año}-{mes}.zip, mes con cero (2025-01), con
//    cada cotización; sale con un mes de atraso.
// Medido el 28-10 con octubre 2025: 9.043 licitaciones con 38.056 ofertas y
// 93.446 compras ágiles con 442.216 cotizaciones.

export const ARCHIVOS_DE_CHILECOMPRA =
  'https://transparenciachc.blob.core.windows.net';

export type Fuente = 'licitaciones' | 'compra_agil';
export const FUENTES: readonly Fuente[] = ['licitaciones', 'compra_agil'];

/** Las que la base resume en `mercado_compras` apenas se cargan (decisión
 *  109, migración 172): las demás fuentes no pasan por el resumen. */
export const FUENTES_RESUMIDAS: readonly Fuente[] = [
  'licitaciones',
  'compra_agil',
];

export type Mes = { anio: number; mes: number };

/** Cuántos meses hacia atrás se cargan: 3 años. */
export const MESES_DE_HISTORIA = 36;

export const urlDelArchivo = (fuente: Fuente, { anio, mes }: Mes): string =>
  fuente === 'licitaciones'
    ? `${ARCHIVOS_DE_CHILECOMPRA}/lic-da/${anio}-${mes}.zip`
    : `${ARCHIVOS_DE_CHILECOMPRA}/trnspchc/COT_${anio}-${String(mes).padStart(2, '0')}.zip`;

/** El primer día del mes, como lo guarda la base. */
export const diaUnoDe = ({ anio, mes }: Mes): string =>
  `${anio}-${String(mes).padStart(2, '0')}-01`;

/** Los meses desde el de hoy hacia atrás, el más nuevo primero: así el
 *  último año queda listo primero. En hora de Chile. */
export const mesesHaciaAtras = (
  hoy: Date,
  cuantos = MESES_DE_HISTORIA,
): Mes[] => {
  const [anio, mes] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  })
    .format(hoy)
    .split('-')
    .map(Number);
  const meses: Mes[] = [];
  for (let i = 0; i < cuantos; i++) {
    const total = anio * 12 + (mes - 1) - i;
    meses.push({ anio: Math.floor(total / 12), mes: (total % 12) + 1 });
  }
  return meses;
};

/** Un número de ChileCompra: coma decimal y a veces notación científica
 *  ("1,5e+08", "62213,2"). Vacío o "NA" = null. */
export const numero = (texto: string | undefined): number | null => {
  const t = (texto ?? '').trim();
  if (!t || t === 'NA') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Una fecha "2025-10-02" o "2025-10-02 12:00:00": solo el día. */
export const fecha = (texto: string | undefined): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((texto ?? '').trim());
  return m ? m[1] : null;
};

/** Una copia propia del texto. Un pedazo de un texto largo lo mantiene
 *  entero en memoria: guardar los códigos tal como salen del CSV retenía
 *  el archivo completo (1,1 GB con las compras ágiles de octubre 2025). */
export const plano = (texto: string): string => ` ${texto}`.slice(1);

/** El código de un proceso, listo para usarlo de llave. */
export const codigo = (texto: string | undefined): string =>
  plano((texto ?? '').trim());

/** Sin espacios de más (las regiones vienen con uno al final). */
export const limpio = (
  texto: string | undefined,
  largo = 300,
): string | null => {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  return t ? plano(t.slice(0, largo)) : null;
};

/** Pesos chilenos, como lo escribe cada archivo. */
export const esPeso = (moneda: string | undefined): boolean =>
  /^(clp|peso chileno)$/i.test((moneda ?? '').trim());

// EL RUBRO. Las reglas que prenden la marca `del_rubro` al cargar un mes.
// Hoy hay una sola empresa y unas solas reglas, las de eventos; el tipo
// existe para que el motor sirva a empresas de cualquier rubro (25-11-2026).

/** Las reglas de un rubro: los prefijos de código ONU (de 4, 6 u 8 dígitos,
 *  los largos en que `prefijosOnu` expande cada código para la base) y la
 *  expresión regular que reconoce el rubro en el nombre de la compra. */
export type ReglasDelRubro = {
  prefijosOnu: readonly string[];
  nombre: RegExp;
};

// Eventos, banquetería, alimentación y alojamiento. Por el código ONU de lo
// que se compra (medido en octubre 2025: catering 90101603, banquetes
// 90101601, hoteles 9011…, producción de eventos 80141607, cocina 91111603,
// suministro de alimentos 93131608) o por el nombre de la compra.
const FAMILIAS_DEL_RUBRO = ['9010', '9011', '801416', '911116', '931316'];

const NOMBRE_DEL_RUBRO = new RegExp(
  [
    'banquet',
    'c[oó]ctel',
    'cocteler',
    'catering',
    '\\bcenas?\\b',
    'almuerzo',
    'coffee',
    'buffet',
    'producci[oó]n de eventos?',
    'celebraci[oó]n',
    'aniversario',
    'fiesta',
    'd[ií]a del funcionari',
    'camarader',
    'conmemoraci[oó]n',
    'centro de eventos',
    'sal[oó]n de eventos',
    'alojamiento',
    'hospedaje',
  ].join('|'),
  'i',
);

/** Las reglas de Eventia (Valle del Sol), tal como estaban. */
export const REGLAS_DE_EVENTOS: ReglasDelRubro = {
  prefijosOnu: FAMILIAS_DEL_RUBRO,
  nombre: NOMBRE_DEL_RUBRO,
};

export const codigoDelRubro = (
  codigo: string | undefined,
  reglas: ReglasDelRubro = REGLAS_DE_EVENTOS,
): boolean => {
  const c = (codigo ?? '').trim();
  return reglas.prefijosOnu.some((f) => c.startsWith(f));
};

export const nombreDelRubro = (
  nombre: string | undefined,
  reglas: ReglasDelRubro = REGLAS_DE_EVENTOS,
): boolean => reglas.nombre.test(nombre ?? '');

// EL ONU POR FILA. Cada licitación y compra ágil guarda sus códigos ONU
// para filtrar por empresa en la base. El operador de arreglos `&&` de
// Postgres compara elementos enteros, no prefijos, y las reglas son
// prefijos (`9010`, `801416`): por eso cada código va con sus prefijos de 4,
// 6 y 8 dígitos (90101603 → 9010, 901016, 90101603).

/** Junta un código ONU de una fila en el `Set` de su proceso. Copia el
 *  texto solo si es nuevo (`plano`), para no retener el CSV en memoria. */
export const juntarOnu = (
  codigos: Set<string>,
  texto: string | undefined,
): void => {
  const c = (texto ?? '').trim();
  if (c && !codigos.has(c)) codigos.add(plano(c));
};

// EL CATÁLOGO DE PRODUCTOS ONU (Licita, 25-11). En una instalación
// «general» el cargador anota cada código ONU que ve con el nombre genérico
// de su producto (`NombreProductoGenerico` en las compras ágiles, `Nombre
// producto genrico` —así, sin la é— en las licitaciones) y en cuántos
// procesos del mes salió: con eso se arma el menú de familias que la IA
// ofrece a cada empresa (`rubro/rubro-de-la-empresa.ts`). Lo llenan los
// lectores del mes solo si se les pasa el catálogo: sin él, nada cambia.

export type ProductoVisto = {
  nombre: string | null;
  /** En cuántos procesos del mes salió. */
  veces: number;
  /** El último proceso que lo contó: las filas de un mismo proceso vienen
   *  juntas en el archivo, así cada proceso se cuenta una vez. */
  ultimo: string;
};

export type CatalogoOnu = Map<string, ProductoVisto>;

/** Anota un código ONU de una fila del proceso `proceso`. */
export const anotarProducto = (
  catalogo: CatalogoOnu,
  codigoOnu: string | undefined,
  nombre: string | undefined,
  proceso: string,
): void => {
  const c = (codigoOnu ?? '').trim();
  if (!/^\d{4,}$/.test(c)) return;
  let visto = catalogo.get(c);
  if (!visto) {
    visto = { nombre: null, veces: 0, ultimo: '' };
    catalogo.set(plano(c), visto);
  }
  if (visto.nombre === null) visto.nombre = limpio(nombre, 200);
  if (visto.ultimo !== proceso) {
    visto.ultimo = proceso;
    visto.veces++;
  }
};

/** Los códigos de un proceso expandidos a sus prefijos de 4, 6 y 8 dígitos,
 *  sin repetidos y ordenados. Lo que no es un número de 4 dígitos o más no
 *  es un código ONU y no entra. */
export const prefijosOnu = (codigos: Iterable<string>): string[] => {
  const prefijos = new Set<string>();
  for (const codigo of codigos) {
    const c = codigo.trim();
    if (!/^\d{4,}$/.test(c)) continue;
    for (const largo of [4, 6, 8]) {
      if (c.length >= largo) prefijos.add(c.slice(0, largo));
    }
  }
  return [...prefijos].sort();
};
