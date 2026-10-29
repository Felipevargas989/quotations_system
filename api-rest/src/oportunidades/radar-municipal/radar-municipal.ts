// EL RADAR MUNICIPAL (decisión 108 del doc 17, solo en el laboratorio).
// Felipe: "la idea de esto es generar un spinoff de una empresa que será un
// radar municipal para detectar irregularidades de usos de dineros publicos
// inspirados en zorro de ukrania". La pestaña lee todo de una función de la
// base (`radar_tablero`, migración 171), calculada con las compras de los
// municipios; aquí solo se arma lo que se le pregunta.

/** Lo que devuelve `radar_tablero`: el año, la ventana de las señales, el
 *  promedio nacional, cada municipio con su gasto y sus señales, quién gana,
 *  en qué meses se compra y dónde no está la empresa. */
export type TableroDelRadar = Record<string, unknown>;

/** Los RUT como los escribe ChileCompra: con puntos y sin ellos
 *  («76.111.111-1» y «76111111-1»). Sin RUT, ninguno. */
export const variantesDelRut = (rut: string | null | undefined): string[] => {
  const digitos = (rut ?? '').toUpperCase().replace(/[^0-9K]/g, '');
  if (digitos.length < 2) return [];
  const cuerpo = digitos.slice(0, -1);
  const dv = digitos.slice(-1);
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return [...new Set([`${conPuntos}-${dv}`, `${cuerpo}-${dv}`])];
};

/** El año en curso, en hora de Chile. */
export const anioEnChile = (hoy: Date): number =>
  Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
    }).format(hoy),
  );

/** «chile» = todo el país; sin región = las de la empresa. */
export const TODO_CHILE = 'chile';
