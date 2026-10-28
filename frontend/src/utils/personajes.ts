// EL PERSONAJE Y EL COLOR DE CADA UNO (Felipe, 27-10-2026; migración 167).
//
// "Me gustaría poder elegir personajes para cada perfil ... también poder
// elegir un color personal." Eligió la opción B (la letra en su color y
// el personaje al lado del nombre) y el estilo «tipo Netflix»: los
// personajes 3D de Microsoft Fluent Emoji (licencia MIT, copiada en
// public/personajes/LICENCIA.txt), guardados dentro de la app para no
// depender de otra página.
//
// La base guarda solo la clave del personaje y el color #rrggbb: esta
// lista es la única copia. Una clave que ya no esté acá no muestra nada,
// y la nota se ve como antes.

export type Personaje = { readonly clave: string; readonly nombre: string };

export const PERSONAJES: readonly Personaje[] = [
  { clave: "zorro", nombre: "Zorro" },
  { clave: "buho", nombre: "Búho" },
  { clave: "panda", nombre: "Panda" },
  { clave: "leon", nombre: "León" },
  { clave: "tigre", nombre: "Tigre" },
  { clave: "koala", nombre: "Koala" },
  { clave: "pinguino", nombre: "Pingüino" },
  { clave: "unicornio", nombre: "Unicornio" },
  { clave: "dragon", nombre: "Dragón" },
  { clave: "robot", nombre: "Robot" },
  { clave: "extraterrestre", nombre: "Extraterrestre" },
  { clave: "fantasma", nombre: "Fantasma" },
  { clave: "rana", nombre: "Rana" },
  { clave: "pulpo", nombre: "Pulpo" },
  { clave: "mono", nombre: "Mono" },
  { clave: "gato", nombre: "Gato" },
  { clave: "perro", nombre: "Perro" },
  { clave: "llama", nombre: "Llama" },
  { clave: "loro", nombre: "Loro" },
  { clave: "aguila", nombre: "Águila" },
  { clave: "ciervo", nombre: "Ciervo" },
  { clave: "cocinero", nombre: "Cocinero" },
  { clave: "ninja", nombre: "Ninja" },
  { clave: "campesino", nombre: "Campesino" },
  { clave: "informatico", nombre: "Informático" },
];

// Los ocho primeros son los del color automático de siempre (el mismo
// nombre pinta siempre igual); el naranjo y la mostaza se sumaron para
// elegir. La mostaza es el amarillo que pidió Felipe (28-10-2026): uno
// claro no deja leer la letra blanca, y este se lee como el ámbar.
export const COLORES_PERSONALES: readonly {
  readonly hex: string;
  readonly nombre: string;
}[] = [
  { hex: "#2563eb", nombre: "Azul" },
  { hex: "#7c3aed", nombre: "Morado" },
  { hex: "#059669", nombre: "Verde" },
  { hex: "#d97706", nombre: "Ámbar" },
  { hex: "#dc2626", nombre: "Rojo" },
  { hex: "#0891b2", nombre: "Celeste" },
  { hex: "#db2777", nombre: "Rosado" },
  { hex: "#4f46e5", nombre: "Índigo" },
  { hex: "#ea580c", nombre: "Naranjo" },
  { hex: "#b8860b", nombre: "Mostaza" },
];

// El gris grafito es SOLO del Asistente (Felipe, 27-10-2026): con el
// verde automático de su nombre, una persona podía quedar igual que él.
// Por eso no está en la lista de arriba, y si alguien lo tuviera guardado
// igual se le muestra el color automático.
export const COLOR_ASISTENTE = "#475569";

/**
 * El color automático de siempre (vivía en SeguimientoPanel): el mismo
 * nombre pinta siempre igual. Usa los ocho primeros colores, en el mismo
 * orden y con el mismo módulo, para que a nadie le cambie el color.
 */
export const colorAutomatico = (nombre: string): string => {
  let h = 0;
  for (let i = 0; i < nombre.length; i++)
    h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return COLORES_PERSONALES[h % 8].hex;
};

/**
 * El autor legible de una nota (vivía en SeguimientoPanel): si es un
 * correo, la parte antes del @, con la primera letra en mayúscula.
 */
export const nombreDeAutor = (raw?: string | null): string => {
  const s = (raw || "").trim();
  if (!s) return "—";
  const base = s.includes("@") ? s.split("@")[0] : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/** El personaje fijo del Asistente: las notas que deja la IA. */
export const PERSONAJE_ASISTENTE = "robot";

/** La imagen de un personaje, o null si la clave no es de la lista. */
export const imagenDePersonaje = (clave?: string | null): string | null =>
  clave && PERSONAJES.some((p) => p.clave === clave)
    ? `/personajes/${clave}.png`
    : null;

/** Nombre legible del personaje, para el title y el texto alternativo. */
export const nombreDePersonaje = (clave?: string | null): string =>
  PERSONAJES.find((p) => p.clave === clave)?.nombre ?? "";

/** Un color solo se usa si viene con la forma que guarda la base. */
export const colorValido = (color?: string | null): string | null =>
  color && /^#[0-9a-f]{6}$/.test(color) ? color : null;

/** El color de una persona: el que eligió, salvo el del Asistente. */
export const colorDePersona = (color?: string | null): string | null => {
  const c = colorValido(color);
  return c === COLOR_ASISTENTE ? null : c;
};

/** Lo que trae GET /users/apariencias por cada persona de la empresa. */
export type Apariencia = {
  user_id: string;
  full_name?: string | null;
  personaje?: string | null;
  color?: string | null;
};

/**
 * Lo que pinta una nota del Seguimiento según su autor:
 * - la persona de la nota: lo que eligió en Mi cuenta;
 * - el Asistente (nota sin persona, a nombre de «Asistente»): su robot y
 *   su gris grafito;
 * - el resto: nada, y la nota se ve como antes.
 */
export const aparienciaDeAutor = (
  autorUserId: string | null | undefined,
  autorNombre: string | null | undefined,
  apariencias: ReadonlyMap<string, Apariencia>,
): { personaje: string | null; color: string | null } => {
  const a = autorUserId ? apariencias.get(autorUserId) : undefined;
  if (a)
    return {
      personaje: imagenDePersonaje(a.personaje) ? (a.personaje ?? null) : null,
      color: colorDePersona(a.color),
    };
  if (!autorUserId && (autorNombre ?? "").trim() === "Asistente")
    return { personaje: PERSONAJE_ASISTENTE, color: COLOR_ASISTENTE };
  return { personaje: null, color: null };
};
