/**
 * EL RUT CHILENO
 *
 * ⚠ GEMELO: existe una copia idéntica en
 *   `frontend/src/utils/rut.ts`
 * Este repo no tiene paquete compartido entre backend y frontend, así que
 * la regla vive dos veces a propósito. **Si se corrige acá, se corrige
 * allá.** Las dos tienen las mismas pruebas.
 *
 * Se guarda SIEMPRE en forma limpia: sin puntos, con guion y la K en
 * mayúscula — `15402881-3`, `19221045-K`. En pantalla se puede mostrar
 * con puntos, pero eso es maquillaje: lo que se guarda es esto.
 * (El SII exige la K en mayúscula y sin puntos ni comas.)
 */

/** Deja solo números y la K, en mayúscula. Bota puntos, guiones y espacios. */
export const limpiarRut = (valor: string): string =>
  (valor || '').replace(/[^0-9kK]/g, '').toUpperCase();

/**
 * Calcula el dígito verificador por módulo 11.
 * `numero` va sin el dígito: '15402881' → '3'.
 */
export const digitoVerificador = (numero: string): string => {
  let suma = 0;
  let multiplicador = 2;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    suma += Number(numero[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
};

/**
 * RUT que pasan la revisión matemática pero NO son de nadie.
 *
 * El `55555555-5` es el que el SII reserva para "extranjero sin RUT" y es
 * el más peligroso, porque se ve perfectamente normal. Los de un solo
 * dígito repetido también dan válidos: por la forma del cálculo, del
 * 11111111-1 al 99999999-9 TODOS calzan.
 */
const RESERVADOS = new Set([
  '55555555-5',
  '11111111-1',
  '22222222-2',
  '33333333-3',
  '44444444-4',
  '66666666-6',
  '77777777-7',
  '88888888-8',
  '99999999-9',
]);

/** La forma canónica, o `null` si no se puede leer como RUT. */
export const normalizarRut = (valor: string): string | null => {
  const limpio = limpiarRut(valor);
  if (limpio.length < 8 || limpio.length > 9) return null;
  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^[0-9]+$/.test(numero)) return null;
  return `${numero}-${dv}`;
};

export type ProblemaRut = 'vacio' | 'forma' | 'digito' | 'reservado' | null;

/** Qué tiene de malo, o `null` si está bien. */
export const revisarRut = (valor: string): ProblemaRut => {
  if (!valor || !valor.trim()) return 'vacio';
  const canonico = normalizarRut(valor);
  if (!canonico) return 'forma';
  if (RESERVADOS.has(canonico)) return 'reservado';
  const [numero, dv] = canonico.split('-');
  if (digitoVerificador(numero) !== dv) return 'digito';
  return null;
};

export const rutEsValido = (valor: string): boolean =>
  revisarRut(valor) === null;

/** El mensaje que ve la persona. Sin jerga. */
export const mensajeRut = (problema: ProblemaRut): string => {
  switch (problema) {
    case 'vacio':
      return 'Falta el RUT';
    case 'forma':
      return 'Ese RUT no tiene la forma de un RUT (ej: 15.402.881-3)';
    case 'digito':
      return 'El RUT está mal escrito: el último dígito no corresponde';
    case 'reservado':
      return 'Ese RUT no es de una persona real';
    default:
      return '';
  }
};

/** Con puntos, solo para mostrar: `15402881-3` → `15.402.881-3`. */
export const formatearRut = (valor: string): string => {
  const canonico = normalizarRut(valor);
  if (!canonico) return valor;
  const [numero, dv] = canonico.split('-');
  return `${numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};
