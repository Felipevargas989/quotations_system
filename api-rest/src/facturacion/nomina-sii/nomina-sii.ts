import { LARGO_MAXIMO } from '../datos-del-receptor';

/**
 * LA NÓMINA DEL SII: EL RUT QUE LLENA TODO (doc 19 §9.25 y §9.27).
 *
 * Felipe, 07-11-2026: *"¿cómo lo podemos hacer para que al momento de
 * facturar, el sistema cargue todo solo con el RUT? ¿se podrá?"*. La nómina
 * pública de personas jurídicas del SII trae, por RUT, la razón social
 * (`PUB_NOMBRES_PJ`), las actividades vigentes (`PUB_NOM_ACTECOS`) y los
 * domicilios (`PUB_NOM_DIRECCIONES`, la entrada `PUB_NOM_DOMICILIO.txt`).
 * Texto UTF-8 separado por tabuladores, con su cabecera. Medido el 07-11
 * con los archivos de agosto de 2026: 3,37 millones de nombres (uno por
 * RUT, sin orden), 3,8 millones de actividades de 1,71 millones de RUT
 * (ordenadas por RUT) y 4,46 millones de domicilios (ordenados por RUT).
 *
 * Acá lo puro: leer las filas, elegir el giro y la dirección, y cortar todo
 * a lo que cabe en la factura. La carga (bajar, juntar y guardar) está en
 * `nomina-sii.service.ts`.
 */

export const URL_DE_LA_NOMINA = 'https://www.sii.cl/estadisticas/nominas/';

export const ARCHIVOS_DE_LA_NOMINA = {
  nombres: { zip: 'PUB_NOMBRES_PJ.zip', entrada: 'PUB_NOMBRES_PJ.txt' },
  actividades: { zip: 'PUB_NOM_ACTECOS.zip', entrada: 'PUB_NOM_ACTECOS.txt' },
  domicilios: {
    zip: 'PUB_NOM_DIRECCIONES.zip',
    entrada: 'PUB_NOM_DOMICILIO.txt',
  },
} as const;

/** Una empresa de la nómina, como se guarda (migración 192). */
export interface ContribuyenteDelSii {
  rut: number;
  dv: string;
  razon_social: string;
  giro: string | null;
  /** Los códigos de todas sus actividades vigentes, en el orden en que se
   *  proponen: la del giro primero (§9.27, se eligen al facturar). */
  actividades: number[];
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
}

/** Una línea del archivo, por el nombre de su columna. */
export type FilaDeLaNomina = Record<string, string>;

/** Las columnas de la cabecera, para leer las líneas por nombre. */
export const columnasDe = (cabecera: string) =>
  cabecera
    .replace(/^\uFEFF/, '')
    .replace(/\r$/, '')
    .split('\t');

export const filaDe = (
  columnas: string[],
  linea: string,
  quedarse?: readonly string[],
): FilaDeLaNomina => {
  const valores = linea.replace(/\r$/, '').split('\t');
  const fila: FilaDeLaNomina = {};
  columnas.forEach((c, i) => {
    if (!quedarse || quedarse.includes(c)) fila[c] = (valores[i] ?? '').trim();
  });
  return fila;
};

/** Lo que se usa de cada archivo ordenado (lo demás no se guarda). */
export const COLUMNAS_DE_ACTIVIDADES = [
  'RUT',
  'CODIGO ACTIVIDAD',
  'DESC. ACTIVIDAD ECONOMICA',
  'FECHA',
  'AFECTA A IVA',
] as const;
export const COLUMNAS_DE_DOMICILIOS = [
  'RUT',
  'VIGENCIA',
  'FECHA',
  'CALLE',
  'NUMERO',
  'BLOQUE',
  'DEPARTAMENTO',
  'CIUDAD',
  'COMUNA',
] as const;

/** El RUT de la fila, o nulo si no es un número. */
export const rutDe = (fila: FilaDeLaNomina): number | null => {
  const n = Number(fila.RUT);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Corta un texto a lo que cabe, en una palabra y sin «…» (va a la factura).
 * Los espacios de sobra se van.
 */
export const cortar = (texto: string, largo: number): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= largo) return limpio;
  const corte = limpio.slice(0, largo);
  const espacio = corte.lastIndexOf(' ');
  let cortado = espacio > largo / 2 ? corte.slice(0, espacio) : corte;
  // Un paréntesis que queda abierto se va con lo que trae: «COMPRA, VENTA
  // Y ALQUILER (EXCEPTO» → «COMPRA, VENTA Y ALQUILER».
  const abre = cortado.lastIndexOf('(');
  if (abre > 0 && cortado.indexOf(')', abre) < 0)
    cortado = cortado.slice(0, abre);
  return cortado.replace(/[\s,.;:(-]+$/, '');
};

/** «01-01-1993» o «1993-01-01» → «1993-01-01», para comparar. */
export const fechaComparable = (fecha: string): string => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(fecha.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : fecha.trim();
};

const DESCRIPCION = 'DESC. ACTIVIDAD ECONOMICA';
const CODIGO = 'CODIGO ACTIVIDAD';

/**
 * Las actividades vigentes en el orden en que se proponen como giro. El SII
 * no marca cuál es la principal (Valle del Sol tiene cuatro: hoteles,
 * residenciales para turistas, restaurantes y compraventa de inmuebles;
 * CCU, dos de oficina). Primero las afectas a IVA, que son las de lo que
 * vende y factura; entre ellas, la más antigua. La persona elige otra al
 * facturar.
 */
export const actividadesEnOrden = (
  actividades: FilaDeLaNomina[],
): FilaDeLaNomina[] =>
  actividades
    .filter((a) => (a[DESCRIPCION] ?? '').trim())
    .sort((a, b) => {
      const iva =
        (a['AFECTA A IVA'] === 'S' ? 0 : 1) -
        (b['AFECTA A IVA'] === 'S' ? 0 : 1);
      if (iva) return iva;
      const fa = fechaComparable(a.FECHA ?? '');
      const fb = fechaComparable(b.FECHA ?? '');
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });

/** El giro de la factura: la primera actividad en orden, cortada a 40. */
export const elegirGiro = (actividades: FilaDeLaNomina[]): string | null => {
  const [primera] = actividadesEnOrden(actividades);
  return primera ? cortar(primera[DESCRIPCION], LARGO_MAXIMO.giro) : null;
};

/** Los códigos de las actividades, en orden (para elegir otro giro). */
export const codigosDeActividades = (actividades: FilaDeLaNomina[]) =>
  actividadesEnOrden(actividades)
    .map((a) => Number(a[CODIGO]))
    .filter((c) => Number.isInteger(c) && c > 0);

/** El código y su descripción, para el diccionario de actividades. */
export const actividadDe = (fila: FilaDeLaNomina) => {
  const codigo = Number(fila[CODIGO]);
  const descripcion = (fila[DESCRIPCION] ?? '').trim();
  return Number.isInteger(codigo) && codigo > 0 && descripcion
    ? { codigo, descripcion }
    : null;
};

/**
 * La dirección de la factura: el domicilio vigente más reciente. La calle
 * con su número, el bloque y el departamento (o el local, la oficina); la
 * ciudad, o la comuna si no trae. Cortado a lo que cabe.
 */
export const elegirDomicilio = (
  domicilios: FilaDeLaNomina[],
): {
  direccion: string;
  comuna: string | null;
  ciudad: string | null;
} | null => {
  const vigentes = domicilios.filter(
    (d) => d.VIGENCIA === 'S' && (d.CALLE ?? '').trim(),
  );
  if (!vigentes.length) return null;
  const ultimo = vigentes.reduce((a, b) =>
    fechaComparable(b.FECHA ?? '') > fechaComparable(a.FECHA ?? '') ? b : a,
  );
  const partes = [
    ultimo.CALLE,
    ultimo.NUMERO,
    ultimo.BLOQUE ? `BLOCK ${ultimo.BLOQUE}` : '',
    ultimo.DEPARTAMENTO,
  ].filter((p) => p && p.trim());
  const comuna = ultimo.COMUNA
    ? cortar(ultimo.COMUNA, LARGO_MAXIMO.comuna)
    : null;
  const ciudad = ultimo.CIUDAD
    ? cortar(ultimo.CIUDAD, LARGO_MAXIMO.ciudad)
    : comuna;
  return {
    direccion: cortar(partes.join(' '), LARGO_MAXIMO.direccion),
    comuna,
    ciudad,
  };
};

/**
 * La empresa como se guarda: solo con nombre y actividades vigentes (la que
 * no tiene actividades vigentes dejó de operar). Sin domicilio vigente, va
 * sin dirección: se escribe al facturar.
 */
export const contribuyenteDe = (
  rut: number,
  nombre: { dv: string; razon_social: string } | undefined,
  actividades: FilaDeLaNomina[],
  domicilios: FilaDeLaNomina[],
): ContribuyenteDelSii | null => {
  if (!nombre || !nombre.razon_social.trim() || !actividades.length)
    return null;
  const domicilio = elegirDomicilio(domicilios);
  return {
    rut,
    dv: (nombre.dv || '').toUpperCase().slice(0, 1),
    razon_social: cortar(nombre.razon_social, LARGO_MAXIMO.razon_social),
    giro: elegirGiro(actividades),
    actividades: codigosDeActividades(actividades),
    direccion: domicilio?.direccion ?? null,
    comuna: domicilio?.comuna ?? null,
    ciudad: domicilio?.ciudad ?? null,
  };
};

/** El tramo de RUT de una empresa, para juntar los nombres por partes: cien
 *  mil RUT por tramo (las personas jurídicas van del 45 al 99 millones, y
 *  las SpA de los últimos años se apiñan en el 76 y el 77: un tramo de un
 *  millón tendría cientos de miles en memoria). */
export const TAMANO_DEL_TRAMO = 100_000;
export const TRAMOS = 1000;
export const tramoDe = (rut: number) =>
  Math.min(TRAMOS - 1, Math.floor(rut / TAMANO_DEL_TRAMO));

/**
 * Las líneas de un flujo de bytes en UTF-8, de a una y con freno: pide el
 * pedazo siguiente solo cuando se acabaron las líneas del anterior. Así,
 * con dos archivos abiertos a la vez (actividades y domicilios), el que
 * espera no se acumula en memoria (readline sí lo hacía).
 */
export async function* lineasDelFlujo(
  flujo: AsyncIterable<Buffer | string>,
): AsyncGenerator<string> {
  const decodificador = new TextDecoder('utf-8');
  let resto = '';
  for await (const pedazo of flujo) {
    const texto =
      resto +
      (typeof pedazo === 'string'
        ? pedazo
        : decodificador.decode(pedazo, { stream: true }));
    const lineas = texto.split('\n');
    resto = lineas.pop() ?? '';
    for (const linea of lineas) yield linea.replace(/\r$/, '');
  }
  resto += decodificador.decode();
  if (resto) yield resto.replace(/\r$/, '');
}

/**
 * Las filas seguidas de un mismo RUT, de un archivo ordenado por RUT
 * (actividades y domicilios). Las líneas sin RUT se saltan.
 */
export async function* porRut(
  lineas: AsyncIterable<string>,
  /** Solo estas columnas (el resto no se guarda en memoria). */
  quedarse?: readonly string[],
): AsyncGenerator<{ rut: number; filas: FilaDeLaNomina[] }> {
  let columnas: string[] | null = null;
  let rut: number | null = null;
  let filas: FilaDeLaNomina[] = [];
  for await (const linea of lineas) {
    if (!columnas) {
      columnas = columnasDe(linea);
      continue;
    }
    if (!linea.trim()) continue;
    const fila = filaDe(columnas, linea, quedarse);
    const suRut = rutDe(fila);
    if (suRut == null) continue;
    if (rut != null && suRut !== rut) {
      yield { rut, filas };
      filas = [];
    }
    rut = suRut;
    filas.push(fila);
  }
  if (rut != null && filas.length) yield { rut, filas };
}

/**
 * Para recorrer un archivo ordenado de a tramos: entrega los grupos de RUT
 * menores que el límite y se queda con el primero que lo pasa.
 */
export class GruposEnOrden {
  private siguiente: { rut: number; filas: FilaDeLaNomina[] } | null = null;
  private terminado = false;
  private readonly iterador: AsyncIterator<{
    rut: number;
    filas: FilaDeLaNomina[];
  }>;

  constructor(grupos: AsyncIterable<{ rut: number; filas: FilaDeLaNomina[] }>) {
    this.iterador = grupos[Symbol.asyncIterator]();
  }

  /** Los grupos con RUT menor que `limite`, por RUT. */
  async hasta(limite: number): Promise<Map<number, FilaDeLaNomina[]>> {
    const grupos = new Map<number, FilaDeLaNomina[]>();
    for (;;) {
      if (!this.siguiente) {
        if (this.terminado) break;
        const paso = await this.iterador.next();
        if (paso.done) {
          this.terminado = true;
          break;
        }
        this.siguiente = paso.value;
      }
      if (this.siguiente.rut >= limite) break;
      grupos.set(this.siguiente.rut, this.siguiente.filas);
      this.siguiente = null;
    }
    return grupos;
  }
}
