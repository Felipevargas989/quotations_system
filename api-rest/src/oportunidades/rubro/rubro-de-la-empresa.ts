// EL RUBRO DE CADA EMPRESA (Licita, 25-11). En una instalación «general»
// (`rubro-de-la-instalacion.ts`) la marca `del_rubro` del mercado no sirve:
// es una sola para toda la base y está hecha para eventos. Cada empresa
// guarda su propio filtro en `oportunidades_config`:
//  - `onu_familias`: prefijos de código ONU de 4, 6 u 8 dígitos;
//  - `palabras`: lo que aparece en el nombre de una compra de su rubro;
//  - `palabras_no`: lo que la deja fuera aunque calce con lo anterior;
//  - `rubro_leido_de`: la huella del perfil del que salió (si el perfil
//    cambió después, la pantalla lo avisa).
// Una compra es de la empresa si alguno de sus códigos ONU empieza con una
// de sus familias o su nombre calza con una de sus palabras, y no calza con
// ninguna de sus exclusiones. La base hace eso mismo en `mercado_texto` y
// `mercado_calza` (migración POR_NUMERAR_marcas_por_empresa): las dos
// normalizaciones tienen que ser IGUALES, y lo amarra una prueba.
//
// Módulo puro: sin SDK ni Nest.

import { createHash } from 'node:crypto';
import type { ReglasDelRubro } from '../datos-abiertos/datos-abiertos';

/** Lo que guarda cada empresa. */
export type RubroDeLaEmpresa = {
  onu_familias: string[];
  palabras: string[];
  palabras_no: string[];
};

/** Lo que llega de la base, de la pantalla o de la IA: cualquiera puede
 *  faltar o venir en null (una empresa que nunca guardó su rubro). */
export type RubroQueLlega = {
  onu_familias?: readonly string[] | null;
  palabras?: readonly string[] | null;
  palabras_no?: readonly string[] | null;
};

/** Topes de lo que se guarda (la pantalla y la IA no deberían llegar). */
export const TOPE_DE_FAMILIAS = 80;
export const TOPE_DE_PALABRAS = 60;
export const LARGO_DE_PALABRA = 60;

/** Un prefijo ONU que se puede guardar: 4, 6 u 8 dígitos (los largos en que
 *  `prefijosOnu` expande cada código de la base). */
export const FAMILIA_VALIDA = /^(\d{4}|\d{6}|\d{8})$/;

/** Las vocales y la eñe con tilde que la base traduce (`translate` de
 *  `mercado_texto`, la misma lista de `mercado_clave` de la 172). */
const CON_TILDE = 'ÁÉÍÓÚÜÑáéíóúüñ';
const SIN_TILDE = 'AEIOUUNaeiouun';

/** El texto como lo compara la base: sin tildes, en minúsculas y con todo
 *  lo que no es letra o número convertido en un espacio. Igual a
 *  `btrim(mercado_texto(t))`. */
export const textoNormal = (texto: string | null | undefined): string => {
  let t = '';
  for (const c of texto ?? '') {
    const i = CON_TILDE.indexOf(c);
    t += i >= 0 ? SIN_TILDE[i] : c;
  }
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

/** ¿Calza el nombre con alguna palabra? Una palabra calza al comienzo de una
 *  palabra del nombre: «aseo» calza con «aseo industrial» y no con «paseo»;
 *  «banquet» calza con «banquetería». Igual a `mercado_calza`. */
export const calzaConPalabras = (
  nombre: string | null | undefined,
  palabras: readonly string[],
): boolean => {
  const t = ` ${textoNormal(nombre)} `;
  return palabras.some((p) => {
    const n = textoNormal(p);
    return n !== '' && t.includes(` ${n}`);
  });
};

/** ¿Es de la empresa? Lo mismo que decide la base al marcar. `onu` son los
 *  códigos de la compra ya expandidos a sus prefijos (`prefijosOnu`). */
export const esDeLaEmpresa = (
  compra: { nombre: string | null; onu: readonly string[] },
  rubro: RubroDeLaEmpresa,
): boolean => {
  const familias = new Set(rubro.onu_familias);
  const porCodigo = compra.onu.some((c) => familias.has(c));
  const porNombre = calzaConPalabras(compra.nombre, rubro.palabras);
  return (
    (porCodigo || porNombre) &&
    !calzaConPalabras(compra.nombre, rubro.palabras_no)
  );
};

/** Sin repetidas, sin vacías y normalizadas, hasta el tope. */
const palabrasLimpias = (
  palabras: readonly string[] | null | undefined,
): string[] => {
  const vistas = new Set<string>();
  for (const p of palabras ?? []) {
    const n = textoNormal(p).slice(0, LARGO_DE_PALABRA).trim();
    if (n) vistas.add(n);
    if (vistas.size >= TOPE_DE_PALABRAS) break;
  }
  return [...vistas];
};

/** Lo que se guarda: familias válidas sin repetir y palabras normalizadas.
 *  Las familias que no son de 4, 6 u 8 dígitos se botan (la base también
 *  las rechaza con un CHECK). */
export const rubroLimpio = (
  rubro: RubroQueLlega | null | undefined,
): RubroDeLaEmpresa => ({
  onu_familias: [
    ...new Set(
      (rubro?.onu_familias ?? [])
        .map((f) => String(f).trim())
        .filter((f) => FAMILIA_VALIDA.test(f)),
    ),
  ]
    .sort()
    .slice(0, TOPE_DE_FAMILIAS),
  palabras: palabrasLimpias(rubro?.palabras),
  palabras_no: palabrasLimpias(rubro?.palabras_no),
});

/** ¿Tiene algo con qué marcar? Solo las exclusiones no bastan. */
export const tieneReglas = (rubro: RubroDeLaEmpresa): boolean =>
  rubro.onu_familias.length > 0 || rubro.palabras.length > 0;

const huella = (texto: string): string =>
  createHash('sha256').update(texto).digest('hex').slice(0, 16);

/** La huella de un perfil (`rubro_leido_de`): cambia si cambia el texto,
 *  no si cambian los espacios de los bordes. Sin perfil, null. */
export const huellaDelPerfil = (perfil: string | null | undefined) => {
  const t = (perfil ?? '').trim();
  return t ? huella(t) : null;
};

// ─── la unión de todas las empresas: qué compras ágiles se guardan ────────

/** Una letra de una palabra normalizada, como la reconoce la base en un
 *  nombre sin normalizar. */
const LETRA: Readonly<Record<string, string>> = {
  a: '[aá]',
  e: '[eé]',
  i: '[ií]',
  o: '[oó]',
  u: '[uúü]',
  n: '[nñ]',
};
/** Lo que la base deja como letra o número; todo lo demás separa. */
const SEPARADOR = '[^a-z0-9áéíóúüñ]';

/** La expresión que reconoce, en el nombre tal como viene, lo mismo que
 *  `calzaConPalabras`. Sin palabras no reconoce nada. */
export const expresionDePalabras = (palabras: readonly string[]): RegExp => {
  const partes = palabrasLimpias(palabras)
    .sort()
    .map((p) =>
      [...p]
        .map((c) => (c === ' ' ? `${SEPARADOR}+` : (LETRA[c] ?? c)))
        .join(''),
    );
  return partes.length === 0
    ? /(?!)/
    : new RegExp(`(?:^|${SEPARADOR})(?:${partes.join('|')})`, 'i');
};

/** Las reglas de la carga mensual en una instalación «general»: la UNIÓN de
 *  lo que buscan todas las empresas (sus familias y sus palabras). Las
 *  exclusiones no entran: guardar de más no hace daño (cada empresa ve
 *  solo lo suyo por sus marcas); guardar de menos sí. `huella` anota con qué
 *  unión se cargó cada mes (`mercado_cargas.reglas_huella`). */
export const reglasDeLaUnion = (
  empresas: ReadonlyArray<RubroQueLlega>,
): { reglas: ReglasDelRubro; huella: string } => {
  const familias = new Set<string>();
  const palabras = new Set<string>();
  for (const e of empresas) {
    const limpio = rubroLimpio(e);
    limpio.onu_familias.forEach((f) => familias.add(f));
    limpio.palabras.forEach((p) => palabras.add(p));
  }
  const prefijosOnu = [...familias].sort();
  const lista = [...palabras].sort();
  return {
    reglas: { prefijosOnu, nombre: expresionDePalabras(lista) },
    huella: huella(JSON.stringify({ onu: prefijosOnu, palabras: lista })),
  };
};

// ─── el menú cerrado de familias para la IA ────────────────────────────────

/** Un producto del catálogo `mercado_productos_onu`. */
export type ProductoOnu = { codigo: string; nombre: string; veces: number };

export type FamiliaDelMenu = {
  /** 4 dígitos (la familia entera) o 6 (una clase). */
  codigo: string;
  /** Los productos más vistos de esa familia o clase. */
  ejemplos: string[];
  veces: number;
};

/** Cuántas clases de 6 dígitos van al menú, las más vistas primero. */
export const TOPE_DEL_MENU = 800;
const EJEMPLOS_POR_LINEA = 3;

/** El menú: las familias (4 dígitos) y sus clases (6) que el cargador vio,
 *  con sus productos más comunes de ejemplo. Solo entran códigos de 8
 *  dígitos o más (los de los archivos). Ordenado por familia y, dentro,
 *  por clase. */
export const menuDeFamilias = (
  catalogo: readonly ProductoOnu[],
  tope = TOPE_DEL_MENU,
): FamiliaDelMenu[] => {
  const juntar = (largo: number) => {
    const grupos = new Map<string, ProductoOnu[]>();
    for (const p of catalogo) {
      if (!/^\d{8,}$/.test(p.codigo)) continue;
      const clave = p.codigo.slice(0, largo);
      const g = grupos.get(clave);
      if (g) g.push(p);
      else grupos.set(clave, [p]);
    }
    return [...grupos].map(([codigo, productos]) => ({
      codigo,
      veces: productos.reduce((s, p) => s + Math.max(0, p.veces), 0),
      ejemplos: [...productos]
        .sort((a, b) => b.veces - a.veces)
        .map((p) => p.nombre.trim())
        .filter((n, i, todos) => n && todos.indexOf(n) === i)
        .slice(0, EJEMPLOS_POR_LINEA),
    }));
  };
  const clases = juntar(6)
    .sort((a, b) => b.veces - a.veces)
    .slice(0, tope);
  const conClase = new Set(clases.map((c) => c.codigo.slice(0, 4)));
  const familias = juntar(4).filter((f) => conClase.has(f.codigo));
  return [...familias, ...clases].sort((a, b) =>
    a.codigo.localeCompare(b.codigo),
  );
};

/** El menú como texto para la IA: una línea por código. */
export const textoDelMenu = (menu: readonly FamiliaDelMenu[]): string =>
  menu
    .map((f) =>
      f.codigo.length === 4
        ? `${f.codigo} (familia entera): ${f.ejemplos.join(' · ')}`
        : `  ${f.codigo}: ${f.ejemplos.join(' · ')}`,
    )
    .join('\n');

/** Lo que la IA propuso, quedándose solo con códigos del menú. */
export const propuestaValida = (
  propuesta: RubroQueLlega | null | undefined,
  menu: readonly FamiliaDelMenu[],
): RubroDeLaEmpresa => {
  const delMenu = new Set(menu.map((f) => f.codigo));
  const limpio = rubroLimpio(propuesta);
  return {
    ...limpio,
    onu_familias: limpio.onu_familias.filter((f) => delMenu.has(f)),
  };
};
