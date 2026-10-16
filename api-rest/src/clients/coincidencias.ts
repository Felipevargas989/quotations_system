/**
 * EL AVISO DE CLIENTE PARECIDO (Felipe, 16-10-2026: "veamos cómo evitar
 * duplicidades" → "sí, ármalo así").
 *
 * Medido ese día en producción: Recepción y el cotizador creaban fichas
 * nuevas sin mirar si el cliente ya existía (René Neira y su club con el
 * mismo teléfono, dos "Nueva Esperanza" en dos minutos, IDHR e ID
 * Consulting). Este módulo decide, sin tocar la base, qué clientes de la
 * empresa se parecen a uno que se está por crear, y por qué:
 *
 *  - correo: el mismo correo, en la ficha o en una de sus personas;
 *  - telefono: el mismo teléfono (últimos 9 dígitos);
 *  - nombre: un nombre muy parecido ("espezanza") o que contiene al otro
 *    ("Nueva Esperanza" dentro de "Agrupación Nueva Esperanza");
 *  - dominio: el mismo correo de institución (@ubiobio.cl), nunca de un
 *    correo gratuito (gmail, hotmail…).
 *
 * OJO con la regla del 05-09 (mapa 09, regla 12): el formulario público y
 * las consultas enganchan a un cliente existente SOLO por correo, porque
 * la gente cambia de organización y se lleva su número. Acá el teléfono,
 * el nombre y el dominio solo sirven para PREGUNTAR: una persona decide en
 * pantalla. Nada de esto engancha solo.
 *
 * Todo es PURO: recibe los clientes y devuelve las coincidencias.
 */

export type MotivoCoincidencia = 'correo' | 'telefono' | 'nombre' | 'dominio';

export interface PersonaParaCoincidir {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ClienteParaCoincidir {
  id: string;
  name: string;
  client_type: string | null;
  email: string | null;
  phone: string | null;
  personas: PersonaParaCoincidir[];
  ultimaCotizacion: number | null;
}

export interface EntradaCoincidencia {
  nombre: string;
  correos: (string | null | undefined)[];
  telefonos: (string | null | undefined)[];
}

export interface CoincidenciaCliente {
  cliente_id: string;
  nombre: string;
  tipo: string | null;
  motivos: MotivoCoincidencia[];
  /** La persona del cliente cuyo correo o teléfono calzó. */
  persona: { id: number; nombre: string } | null;
  /** N° de la cotización más reciente del cliente, para reconocerlo. */
  cotizacion: number | null;
}

/** Correos gratuitos: comparten dominio millones de personas. */
export const PROVEEDORES_DE_CORREO = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.cl',
  'hotmail.es',
  'outlook.com',
  'outlook.cl',
  'outlook.es',
  'live.com',
  'live.cl',
  'msn.com',
  'yahoo.com',
  'yahoo.es',
  'yahoo.cl',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'mail.com',
  'zoho.com',
  'terra.cl',
  'vtr.net',
  'entelchile.net',
]);

const PESO: Record<MotivoCoincidencia, number> = {
  correo: 8,
  telefono: 4,
  nombre: 2,
  dominio: 1,
};
const ORDEN: MotivoCoincidencia[] = ['correo', 'telefono', 'nombre', 'dominio'];

/** Minúsculas, sin tildes y sin signos: "Bío-Bío" → "bio bio". */
export const normalizarTexto = (s?: string | null): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const trigramas = (s: string): Set<string> => {
  const t = ` ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
};

/** Parecido entre dos nombres, de 0 a 1 (trigramas, como pg_trgm). */
export const similitud = (a?: string | null, b?: string | null): number => {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigramas(na);
  const tb = trigramas(nb);
  let comunes = 0;
  ta.forEach((x) => {
    if (tb.has(x)) comunes++;
  });
  return comunes / (ta.size + tb.size - comunes);
};

/**
 * Un nombre de al menos dos palabras (8 letras) metido entero en el otro:
 * "Nueva Esperanza" en "Agrupación Nueva Esperanza", o "Universidad del
 * Bío-Bío" en "Universidad del bio bio Concepción".
 */
export const contieneNombre = (
  a?: string | null,
  b?: string | null,
): boolean => {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  const [corto, largo] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (corto.split(' ').length < 2 || corto.length < 8) return false;
  return ` ${largo} `.includes(` ${corto} `);
};

/** El umbral se midió el 16-10 con los duplicados reales de Valle del Sol. */
export const nombreParecido = (a?: string | null, b?: string | null): boolean =>
  similitud(a, b) >= 0.75 || contieneNombre(a, b);

/** Últimos 9 dígitos; vacío si no alcanza o si es un número de relleno. */
export const digitosTelefono = (v?: string | null): string => {
  const d = (v || '').replace(/\D/g, '');
  if (d.length < 8) return '';
  const ultimos = d.slice(-9);
  if (/^(\d)\1+$/.test(ultimos)) return '';
  if (['12345678', '123456789', '987654321'].includes(ultimos)) return '';
  return ultimos;
};

/** Correo en minúsculas; vacío si es de relleno ("noindica@…"). */
export const correoUtil = (v?: string | null): string => {
  const c = (v || '').trim().toLowerCase();
  const arroba = c.indexOf('@');
  if (arroba < 1) return '';
  const local = c.slice(0, arroba).replace(/[._-]/g, '');
  if (
    /^(no|sin|na|x+|ninguno|noindica|noaplica|notiene|sincorreo|nocorreo|sinmail|nomail|test|prueba)\d*$/.test(
      local,
    )
  ) {
    return '';
  }
  return c;
};

const dominioDe = (correo: string): string => correo.split('@')[1] || '';

/** El dominio de una institución, o null si es un correo gratuito o del equipo. */
export const dominioInstitucional = (
  correo: string,
  dominiosPropios: Set<string>,
): string | null => {
  const d = dominioDe(correo);
  if (!d || PROVEEDORES_DE_CORREO.has(d) || dominiosPropios.has(d)) return null;
  return d;
};

export const buscarCoincidencias = (
  entrada: EntradaCoincidencia,
  clientes: ClienteParaCoincidir[],
  dominiosDelEquipo: string[] = [],
  limite = 3,
): CoincidenciaCliente[] => {
  const propios = new Set(dominiosDelEquipo.map((d) => d.toLowerCase()));
  // Los correos del propio equipo no identifican a un cliente: Recepción
  // los usa de relleno cuando el cliente no tiene correo.
  const correos = new Set(
    entrada.correos
      .map(correoUtil)
      .filter((c) => c && !propios.has(dominioDe(c))),
  );
  const fonos = new Set(entrada.telefonos.map(digitosTelefono).filter(Boolean));
  const dominios = new Set(
    [...correos]
      .map((c) => dominioInstitucional(c, propios))
      .filter((d): d is string => Boolean(d)),
  );

  const resultado: { peso: number; coincidencia: CoincidenciaCliente }[] = [];
  for (const cliente of clientes) {
    const motivos = new Set<MotivoCoincidencia>();
    let persona: PersonaParaCoincidir | null = null;

    for (const p of cliente.personas) {
      const calzaCorreo = correos.has(correoUtil(p.email));
      const calzaFono = fonos.has(digitosTelefono(p.phone));
      if (calzaCorreo) motivos.add('correo');
      if (calzaFono) motivos.add('telefono');
      if ((calzaCorreo || calzaFono) && !persona) persona = p;
    }
    if (correos.has(correoUtil(cliente.email))) motivos.add('correo');
    if (fonos.has(digitosTelefono(cliente.phone))) motivos.add('telefono');
    if (nombreParecido(entrada.nombre, cliente.name)) motivos.add('nombre');
    if (!motivos.has('correo') && dominios.size > 0) {
      const suyos = [cliente.email, ...cliente.personas.map((p) => p.email)]
        .map((c) => dominioInstitucional(correoUtil(c), propios))
        .filter((d): d is string => Boolean(d));
      if (suyos.some((d) => dominios.has(d))) motivos.add('dominio');
    }
    if (motivos.size === 0) continue;

    const lista = ORDEN.filter((m) => motivos.has(m));
    resultado.push({
      peso: lista.reduce((s, m) => s + PESO[m], 0),
      coincidencia: {
        cliente_id: cliente.id,
        nombre: cliente.name,
        tipo: cliente.client_type,
        motivos: lista,
        persona: persona ? { id: persona.id, nombre: persona.name } : null,
        cotizacion: cliente.ultimaCotizacion,
      },
    });
  }

  return resultado
    .sort(
      (a, b) =>
        b.peso - a.peso ||
        (b.coincidencia.cotizacion ?? 0) - (a.coincidencia.cotizacion ?? 0),
    )
    .slice(0, limite)
    .map((r) => r.coincidencia);
};
