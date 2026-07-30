// TELÉFONOS CHILENOS — se guardan pelados, se muestran vestidos (26-07-2026).
//
// La norma internacional (E.164) dice que un teléfono se guarda de UNA sola
// forma: el +, el código del país y los dígitos, todo pegado. Los espacios no
// son parte del número: son maquillaje para que un humano lo lea. Se ponen al
// mostrar y se sacan al guardar. Misma idea que la plata — en la base va
// 3225950 y en pantalla $3.225.950; a nadie se le ocurre guardar los puntos.
//
// POR QUÉ IMPORTA, y no es estética: si cada persona escribe el número como
// quiere, después no se puede buscar ni comparar. "+56 9 5095 5947" y
// "+56950955947" son el mismo señor, y para el computador son dos textos
// distintos. El backend ya se defiende de eso comparando clientes por los
// últimos 9 dígitos (clients.repository.ts, findMatch, 22-07). Acá evitamos
// que el problema llegue a existir.
//
// LA REGLA CHILENA, COMPLETA: desde el cambio de plan de numeración TODOS los
// números del país tienen 9 dígitos, fijos y celulares por igual. Lo único
// que cambia es dónde caen los espacios, y eso lo decide el primer dígito:
//
//   9    -> celular             +56 9 5095 5947    (1 + 4 + 4)
//   2    -> fijo de Santiago    +56 2 2345 6789    (1 + 4 + 4)
//   otro -> fijo de región      +56 42 234 5678    (2 + 3 + 4)
//
// Quillón y todo Ñuble es 42. Concepción 41. Valparaíso 32.
//
// SI ALGÚN DÍA EVENTIA SALE DE CHILE: se reemplaza este archivo por la
// librería de Google (libphonenumber-js) y no se toca nada más, porque todo
// el sistema pide el número por acá. No se instaló ahora porque pesa y sabe
// de 240 países para usar uno solo.

const soloDigitos = (v: string): string => (v || "").replace(/\D/g, "");

/**
 * Deja cualquier forma de escribir un número chileno en la forma canónica
 * +56XXXXXXXXX, que es como se guarda.
 *
 * Entiende "9 5095 5947", "950955947", "56950955947", "+56 9 5095 5947",
 * "(42) 234 5678" y el viejo "09 5095 5947".
 *
 * Si lo que llega NO calza con la regla chilena — un número extranjero, uno a
 * medio escribir — se devuelve tal cual se escribió, solo sin espacios en las
 * puntas. NUNCA se inventan ni se recortan dígitos: preferimos guardar algo
 * raro pero fiel antes que algo ordenado pero falso.
 */
export const normalizePhone = (raw: string): string => {
  const texto = (raw || "").trim();
  if (!texto) return "";
  const d = soloDigitos(texto);
  // 9 dígitos: el número nacional pelado, solo le falta el país.
  if (d.length === 9) return "+56" + d;
  // 10 dígitos partiendo en 0: el prefijo antiguo de larga distancia.
  if (d.length === 10 && d.startsWith("0")) return "+56" + d.slice(1);
  // 11 dígitos que ya traen el 56 adelante.
  if (d.length === 11 && d.startsWith("56")) return "+" + d;
  // Con el prefijo internacional pegado adelante: "0056..." y también el
  // "056..." de quien escribe un cero de menos.
  if (d.length === 13 && d.startsWith("0056")) return "+" + d.slice(2);
  if (d.length === 12 && d.startsWith("056")) return "+" + d.slice(1);
  return texto;
};

/**
 * Pinta un número guardado para que un humano lo lea, con los espacios donde
 * corresponde según sea celular, fijo de Santiago o fijo de región.
 *
 * Si el número no es chileno o no calza con la regla, se devuelve tal cual.
 * Mostrar fielmente lo que hay vale más que mostrarlo bonito.
 */
export const formatPhone = (stored?: string | null): string => {
  const texto = (stored || "").trim();
  if (!texto) return "";
  const canonico = normalizePhone(texto);
  const d = soloDigitos(canonico);
  if (!canonico.startsWith("+56") || d.length !== 11) return texto;
  const n = d.slice(2); // los 9 dígitos nacionales
  // Celular y fijo de Santiago comparten el corte: un dígito, luego 4 y 4.
  if (n[0] === "9" || n[0] === "2")
    return `+56 ${n[0]} ${n.slice(1, 5)} ${n.slice(5)}`;
  // Fijo de región: el código de área son dos dígitos.
  return `+56 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
};

/**
 * El número listo para un enlace de llamada. Va SIEMPRE pelado: el maquillaje
 * es para los ojos, no para el marcador del teléfono.
 */
export const telHref = (stored?: string | null): string =>
  `tel:${normalizePhone(stored || "")}`;

/**
 * PORTERO del campo teléfono (30-07): dice qué tiene de malo lo escrito,
 * o null si está bien (vacío incluido — el teléfono es opcional). Nació
 * de una pillada real: el campo aceptó un correo como teléfono.
 */
export const phoneProblem = (raw: string): string | null => {
  const texto = (raw || "").trim();
  if (!texto) return null;
  if (texto.includes("@"))
    return "Eso parece un correo, no un teléfono.";
  if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(texto))
    return "Un teléfono no lleva letras.";
  const digitos = soloDigitos(texto).length;
  if (digitos < 8) return "El teléfono está muy corto.";
  if (digitos > 15) return "El teléfono tiene demasiados dígitos.";
  return null;
};

/** PORTERO del campo correo: null si está bien (vacío = opcional). */
export const emailProblem = (raw: string): string | null => {
  const texto = (raw || "").trim();
  if (!texto) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto))
    return "Ese correo no parece válido.";
  return null;
};

/** Texto de ejemplo para los recuadros donde se escribe un teléfono. */
export const PHONE_PLACEHOLDER = "+56 9 1234 5678";
