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

// EL RUBRO: eventos, banquetería, alimentación y alojamiento. Por el código
// ONU de lo que se compra (medido en octubre 2025: catering 90101603,
// banquetes 90101601, hoteles 9011…, producción de eventos 80141607, cocina
// 91111603, suministro de alimentos 93131608) o por el nombre de la compra.
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

export const codigoDelRubro = (codigo: string | undefined): boolean => {
  const c = (codigo ?? '').trim();
  return FAMILIAS_DEL_RUBRO.some((f) => c.startsWith(f));
};

export const nombreDelRubro = (nombre: string | undefined): boolean =>
  NOMBRE_DEL_RUBRO.test(nombre ?? '');
