// QUIÉN HACE CADA PAPEL QUE PIDEN LAS BASES (decisión 119, parte 3b, 08-11).
// Felipe: "me arma todos los documentos que necesito subir según las bases
// y según la ley... No quiero seguir autocompletando, rellenando y viendo".
// De cada papel que la sección 4 del análisis pide sin un formulario con
// archivo, quién lo hace:
// - Eventia: la cotización (el motor), la propuesta técnica (la IA) o una
//   declaración en el formato de la casa (el motor, con los datos de «Mi
//   empresa»: la IA llena datos, no declara, regla 1 del módulo);
// - Mercado Público, al ofertar: la declaración jurada de requisitos para
//   ofertar se genera sola al cargar la oferta desde el 22-03-2021, y desde
//   la Ley 21.634 (diciembre de 2023) trae también los conflictos de
//   interés (ChileCompra); el comprador ya no la pide en papel;
// - la empresa, que lo sube, con el porqué: las fotos, lo del vehículo, lo
//   del conductor, lo de los profesionales.
// Sin IA, para que salga igual cada vez. Lo fijan los 156 papeles de las 92
// licitaciones de Valle del Sol medidos el 08-11 (`los-papeles.spec.ts`).
// La pantalla tiene la misma copia (`quienHaceElPapel.ts`): si cambia aquí,
// cambia allá.

/** Las declaraciones que arma el motor en el formato de la casa. */
export type TipoDeDeclaracion =
  | 'inhabilidades'
  | 'ubicacion'
  | 'identificacion'
  | 'contacto'
  | 'banco'
  | 'pacto'
  | 'experiencia';

export type QuienLoHace =
  | { quien: 'cotizacion' }
  | { quien: 'propuesta' }
  | { quien: 'declaracion'; tipo: TipoDeDeclaracion }
  /** Se hace en Mercado Público al ofertar. */
  | { quien: 'portal' }
  /** Lo sube la empresa: Eventia no lo tiene ni lo puede hacer. */
  | { quien: 'empresa'; porque: string }
  | { quien: 'no_aplica'; porque: string };

export const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();

const empresa = (porque: string): QuienLoHace => ({ quien: 'empresa', porque });
const declaracion = (tipo: TipoDeDeclaracion): QuienLoHace => ({
  quien: 'declaracion',
  tipo,
});

/** Con el nombre y la condición: lo que no aplica y lo del portal. */
const POR_EL_NOMBRE_Y_LA_CONDICION: ReadonlyArray<[RegExp, QuienLoHace]> = [
  [
    /\butp\b|uniones? temporal(es)? de proveedores/,
    {
      quien: 'no_aplica',
      porque: 'Solo si postulas como Unión Temporal de Proveedores (UTP)',
    },
  ],
  [
    /^poder\b|si no firma el representante/,
    {
      quien: 'no_aplica',
      porque: 'Solo si firma alguien que no es el representante legal',
    },
  ],
  [
    /requisitos para ofertar|\ben linea\b|(ficha|formulario) electronic|disponible en (www\.)?mercado ?publico/,
    { quien: 'portal' },
  ],
];

/** Con el nombre solo, en este orden: el primero que calza manda. */
const POR_EL_NOMBRE: ReadonlyArray<[RegExp, QuienLoHace]> = [
  // La técnica y la económica juntas: la propuesta técnica valorizada
  // (decisión 42), antes que la oferta económica.
  [/\btecnic[oa][ -]economic/, { quien: 'propuesta' }],
  [
    /^cotizacion\b|\boferta economica\b|\bpropuesta economica\b/,
    { quien: 'cotizacion' },
  ],
  [
    /^propuesta\b|\b(propuesta|oferta) tecnica\b|^anexo tecnico\b|^especificaciones\b|^menu\b|^programa\b(?! de integridad)|^detalle de (las )?prestaciones|^ficha (tecnica )?(del|de los) (servicio|productos)|^ficha tecnica complementaria/,
    { quien: 'propuesta' },
  ],
  [
    /^(set de )?(fotos?|fotografias?|imagenes)\b|^catalogo fotografico/,
    empresa('son tus fotos'),
  ],
  [
    /\bvehiculos?\b|\bbus(es)?\b|\bde la van\b|transporte de pasajeros|servicios de transporte|\bsoap\b|\bpadron\b|permiso de circulacion|revision tecnica|^seguros? (obligatorios?|del)\b|sello verde/,
    empresa('es del vehículo'),
  ],
  [
    /\bconductor(es)?\b|\bchofer(es)?\b|licencia de conducir/,
    empresa('es del conductor'),
  ],
  [
    /\bprofesional(es)?\b|expositor|relator(a|es)?\b|\bmonitor(a|es)?\b|\bguia\b|facilitador|capacitador|curriculum|\bcv\b|certificados? de titulo/,
    empresa('es de los profesionales'),
  ],
  [/trabajar con menores/, empresa('lo da el Registro Civil')],
  [/sernatur/, empresa('lo da Sernatur')],
  [
    /desinsectacion|desratizacion|fumigacion|sanitizacion/,
    empresa('lo da la empresa de control de plagas'),
  ],
  [
    /evaluacion favorable|cartas? de recomendacion|referencias? de (clientes|trabajos)/,
    empresa('lo da un cliente anterior'),
  ],
  [
    /^ficha (descriptiva y )?tecnica de (la |el |los |las )?(carpa|pista|iluminacion|pantalla|equipos?|equipamiento|sonido|amplificacion)/,
    empresa('es del proveedor del equipo'),
  ],
  [/cedula de identidad/, empresa('es la cédula del representante legal')],
  [
    /plan de (evacuacion|emergencia)/,
    empresa('Eventia no tiene tu plan de evacuación'),
  ],
  [
    /personal subcontratado|subcontratistas/,
    empresa('Eventia no sabe a quién subcontratas'),
  ],
  [
    /practicas ambientales|huella chile/,
    empresa('Eventia no tiene esos respaldos'),
  ],
  [
    /inhabilidad|conflictos? de interes|practicas antisindicales|delitos concursales/,
    declaracion('inhabilidades'),
  ],
  [
    /ubicacion del (local|recinto|establecimiento|inmueble)|direccion del (local|recinto)/,
    declaracion('ubicacion'),
  ],
  [
    /identificacion del (oferente|proveedor|participante)|antecedentes (generales )?del (oferente|proveedor)/,
    declaracion('identificacion'),
  ],
  [
    /datos de contacto|contacto del (oferente|proveedor)/,
    declaracion('contacto'),
  ],
  [
    /datos bancarios|cuenta bancaria|datos (para|de) (el )?pago/,
    declaracion('banco'),
  ],
  [/pacto de integridad/, declaracion('pacto')],
  [
    /experiencia del (oferente|proveedor|participante|postulante)|experiencia en el rubro/,
    declaracion('experiencia'),
  ],
];

/** Quién hace un papel que las bases piden sin formulario con archivo;
 *  null si no se reconoce (lo de «Mi empresa» lo reconoce su carpeta). */
export const quienLoHace = (
  nombre: string,
  condicion = '',
): QuienLoHace | null => {
  const n = normalizar(nombre);
  const conCondicion = normalizar(`${nombre} ${condicion}`);
  return (
    POR_EL_NOMBRE_Y_LA_CONDICION.find(([p]) => p.test(conCondicion))?.[1] ??
    POR_EL_NOMBRE.find(([p]) => p.test(n))?.[1] ??
    null
  );
};

/** Un papel de las bases sin formulario con archivo (la sección 4 del
 *  análisis y los formularios que no trajeron su formato). */
export type PapelSinFormato = {
  nombre: string;
  parte: 'administrativa' | 'tecnica' | 'economica' | 'otra';
  obligatorio: boolean;
  condicion: string;
  /** ¿Es un formulario sin su formato? (de la lista de formularios, o un
   *  documento que el análisis dejó en la carpeta «formulario»). */
  formulario: boolean;
  quien: QuienLoHace | null;
};

type Fila = Record<string, unknown>;

const filas = (v: unknown): Fila[] =>
  Array.isArray(v)
    ? v.filter((x): x is Fila => Boolean(x && typeof x === 'object'))
    : [];

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const PARTES = new Set(['administrativa', 'tecnica', 'economica', 'otra']);
const parteDe = (v: unknown): PapelSinFormato['parte'] =>
  PARTES.has(texto(v)) ? (texto(v) as PapelSinFormato['parte']) : 'otra';

/** «Anexo N°3», «Formulario 2», «Formato N°1»: su número. */
const numeroDe = (t: string): string | null =>
  /\b(?:anexo|formulario|formato)\s*(?:n\s*[°º.o]*\s*)?(\d+)/.exec(
    normalizar(t),
  )?.[1] ?? null;

/** ¿Es el mismo formulario? Por su número si los dos lo tienen; si no,
 *  porque un nombre contiene al otro. */
const mismo = (a: string, b: string): boolean => {
  const x = numeroDe(a);
  const y = numeroDe(b);
  if (x && y) return x === y;
  const p = normalizar(a);
  const q = normalizar(b);
  return p.length >= 6 && q.length >= 6 && (p.includes(q) || q.includes(p));
};

/** Lo que las bases piden con la oferta y nadie llena desde un archivo del
 *  comprador: los documentos de la sección 4 que el análisis dejó en
 *  «otro» o que son un formulario sin su formato, y los formularios que
 *  aplican y no trajeron archivo. Sin repetir. Los formularios con archivo
 *  los llena la IA, y lo de «Mi empresa» lo dice su carpeta. */
export const papelesSinFormato = (
  resultado: Record<string, unknown> | null | undefined,
): PapelSinFormato[] => {
  const formularios = filas(resultado?.formularios).filter(
    (f) => f.aplica !== false && texto(f.nombre),
  );
  // Un análisis muy antiguo no dice el archivo: se le cree que lo trae.
  const sinArchivo = (f: Fila) =>
    typeof f.archivo === 'string' && !f.archivo.trim();
  const conArchivo = formularios.filter((f) => !sinArchivo(f));
  const papeles: PapelSinFormato[] = [];
  const agregar = (p: Omit<PapelSinFormato, 'quien'>) => {
    if (papeles.some((x) => normalizar(x.nombre) === normalizar(p.nombre))) {
      return;
    }
    papeles.push({ ...p, quien: quienLoHace(p.nombre, p.condicion) });
  };
  for (const d of filas(resultado?.documentos)) {
    const nombre = texto(d.nombre);
    if (!nombre) continue;
    if (d.cuando !== undefined && d.cuando !== 'con_la_oferta') continue;
    const carpeta = texto(d.carpeta) || 'otro';
    if (carpeta !== 'otro' && carpeta !== 'formulario') continue;
    if (conArchivo.some((f) => mismo(texto(f.nombre), nombre))) continue;
    agregar({
      nombre,
      parte: parteDe(d.parte),
      obligatorio: d.obligatorio !== false,
      condicion: texto(d.condicion),
      formulario: carpeta === 'formulario',
    });
  }
  for (const f of formularios) {
    if (!sinArchivo(f)) continue;
    agregar({
      nombre: texto(f.nombre),
      parte: parteDe(f.se_entrega_en),
      obligatorio: true,
      condicion: '',
      formulario: true,
    });
  }
  return papeles;
};

/** El nombre del papel en «Mi postulación»: como lo llaman las bases, con
 *  el código de la licitación (Felipe aprobó el 08-11: "sale con ese
 *  nombre y cuenta como ese papel"). Sin barras y, si es muy largo, sin lo
 *  que va entre paréntesis y cortado en una palabra. */
/** Sin la extensión de un archivo: «www.mercadopublico.cl» no la tiene. */
const sinExtension = (t: string) => t.replace(/\.(docx?|pdf|xlsx?|odt)$/i, '');

export const nombreDelPapel = (nombre: string, codigo: string): string => {
  const limpio = (t: string) =>
    t
      .replace(/[\\/]+/g, ' - ')
      .replace(/:/g, ' -')
      .replace(/\s+/g, ' ')
      .trim();
  let corto = limpio(sinExtension(nombre));
  if (corto.length > 90) corto = limpio(corto.replace(/\([^)]*\)?/g, ' '));
  if (corto.length > 90) {
    corto = corto
      .slice(0, 90)
      .replace(/\s+\S*$/, '')
      .replace(/[\s,;-]+$/, '');
  }
  return `${corto} ${codigo}.docx`;
};
