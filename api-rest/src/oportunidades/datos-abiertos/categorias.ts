// LAS CATEGORÍAS DE CHILECOMPRA DEL RUBRO (decisión 111 del doc 17).
//
// Cada empresa elige en Configuración las categorías de su rubro. Con ellas
// se arman «Se viene», los competidores, la ficha de cada competidor y «quién
// ganó el año anterior»; sin ninguna, vale la marca «del rubro» de la 101.
// La sección muestra cada categoría con cuántas licitaciones tuvo en las
// regiones de la empresa, con las sugeridas primero.

/** Las sugeridas para el rubro de la marca de la 101, el de eventos,
 *  alimentación y alojamiento: las que Felipe aprobó para Valle del Sol el
 *  29-10, medidas en Ñuble y Biobío. En «comercialización y distribución»
 *  caen los Días del Funcionario y del Profesor; las tarjetas de
 *  alimentación están casi todas en «ayuda y asistencia humanitaria», que
 *  no va. */
export const CATEGORIAS_SUGERIDAS: readonly string[] = [
  'SERVICIOS PARA LA COMERCIALIZACIÓN Y DISTRIBUCIÓN',
  'RESTAURANTES Y CATERING',
  'INSTALACIONES HOTELERAS, ALOJAMIENTOS Y CENTROS DE EVENTOS',
  'ASISTENCIA PARA VIAJES',
];

/** Una categoría con cuántas licitaciones tuvo en la zona. */
export type CategoriaDeLaZona = { categoria: string; licitaciones: number };

export type CategoriaParaElegir = CategoriaDeLaZona & { sugerida: boolean };

/** Lo que muestra la sección: las sugeridas primero, en su orden, y después
 *  las demás de más a menos licitaciones. Las ya elegidas que la zona no
 *  tiene también salen, con 0, para poder quitarlas. */
export const categoriasParaElegir = (
  enLaZona: readonly CategoriaDeLaZona[],
  elegidas: readonly string[],
): CategoriaParaElegir[] => {
  const cuantas = new Map(enLaZona.map((c) => [c.categoria, c.licitaciones]));
  const sugeridas = CATEGORIAS_SUGERIDAS.map((categoria) => ({
    categoria,
    licitaciones: cuantas.get(categoria) ?? 0,
    sugerida: true,
  }));
  const yaEstan = new Set<string>(CATEGORIAS_SUGERIDAS);
  const demas = [
    ...enLaZona,
    ...elegidas
      .filter((categoria) => !cuantas.has(categoria))
      .map((categoria) => ({ categoria, licitaciones: 0 })),
  ]
    .filter((c) => !yaEstan.has(c.categoria))
    .sort(
      (a, b) =>
        b.licitaciones - a.licitaciones ||
        a.categoria.localeCompare(b.categoria, 'es'),
    )
    .map((c) => ({ ...c, sugerida: false }));
  return [...sugeridas, ...demas];
};
