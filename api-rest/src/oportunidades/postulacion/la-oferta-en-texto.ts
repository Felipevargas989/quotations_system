import type { Catalogo } from 'src/quotations/generar/catalogo';
import type { OfertaDeLaPropuesta } from '../generacion/oferta-de-la-propuesta';
import type { FilaDeLaMatriz } from './armar-la-oferta';

// LOS DOCUMENTOS SALEN DE LO POSTULADO (decisión 33 del doc 17, sprint H,
// 19-10). Felipe: "que ambos lean la cotización", y después: "se deberían
// generar siempre desde el módulo de oportunidades... al vincularla con una
// existente, se debe homogenizar a lo postulado; en caso de crear una nueva,
// traer todo desde lo postulado". La fuente es la oferta armada en
// Oportunidades: la matriz «lo que piden → lo que se ofrece» y sus
// productos. La cotización es su copia («Crear cotización» o «Vincular N°»
// la escriben desde aquí), y la propuesta técnica y los anexos la escriben
// tal cual: no deciden nada, así que no pueden contradecirse. Sin precios:
// la oferta económica va en su anexo, con las cifras del motor.

export type OfertaParaDocumentos = {
  matriz: FilaDeLaMatriz[];
  /** Los productos de lo postulado, en texto y sin precios. */
  productos: string[];
  /** La cotización que la copia, si ya se creó o vinculó. */
  cotizacion: number | null;
};

const conCantidad = (nombre: string, cantidad: number | undefined) =>
  `${nombre}${cantidad && cantidad > 1 ? ` ×${cantidad}` : ''}`;

/** Los productos de la oferta con sus nombres del catálogo: qué se sirve,
 *  a cuántos y qué día. */
export const textoDeLosProductos = (
  o: OfertaDeLaPropuesta,
  c: Catalogo,
): string[] => {
  const suelto = (id: number) =>
    c.servicios.get(id)?.nombre ?? `producto ${id}`;
  const fijo = (id: number) => c.fijos.get(id)?.nombre ?? `servicio ${id}`;
  return [
    ...o.cajas.map((k) => {
      const menu = k.menu_id ? c.menus.find((m) => m.id === k.menu_id) : null;
      const delMenu = (menu?.items ?? [])
        .filter((i) => !(k.quitar ?? []).includes(i.id))
        .map((i) => conCantidad(i.nombre, i.cantidad));
      const sueltos = k.servicios.map((s) =>
        conCantidad(suelto(s.id), s.cantidad),
      );
      return `- Día ${k.dia} · ${k.categoria} · ${k.personas} ${k.audiencia === 'ninos' ? 'niños' : 'personas'}: ${[...delMenu, ...sueltos].join(', ') || '(sin productos)'}`;
    }),
    ...(o.fijos.length > 0
      ? [
          `- Servicios: ${o.fijos
            .map(
              (f) =>
                `${conCantidad(fijo(f.id), f.cantidad)}${f.dia ? ` (día ${f.dia})` : ''}`,
            )
            .join(', ')}`,
        ]
      : []),
  ];
};

/** Lo postulado, para la propuesta y los anexos. */
export const laOfertaDecidida = (o: OfertaParaDocumentos): string[] => [
  'LO POSTULADO (la oferta armada en Oportunidades; escribe exactamente esto):',
  'Por cada punto de las bases, lo que se ofrece (el texto va tal cual):',
  ...o.matriz.map(
    (f, i) =>
      `${i + 1}. ${f.especificacion}${f.pagina > 0 ? ` (pág. ${f.pagina})` : ''} → ${f.como}`,
  ),
  ...(o.productos.length > 0
    ? ['', 'Sus productos (del catálogo, sin precios):', ...o.productos]
    : []),
  ...(o.cotizacion
    ? [`(La cotización N° ${o.cotizacion} es la copia de esto.)`]
    : []),
  '',
];

/** El formulario de calidad de la oferta lleva ahí mismo todo el detalle
 *  de lo postulado, aunque acepte un formato propio (decisión 40; Felipe,
 *  19-10: "en ese mismo formulario hubiese puesto todo el detalle... y no
 *  estar creando otra oferta técnica a partir de otro formato"). Antes
 *  (decisión 33) remitía a una propuesta técnica aparte y quedaba vacío.
 *  Con el título de cada punto en negrita y lo ofrecido sin ella (decisión
 *  51; Felipe: "en negrita los títulos y sin negrita el escrito... se ve muy
 *  mal como está": salía todo en negrita, con la página de las bases). */
export const EL_DETALLE_EN_EL_FORMULARIO =
  'El formulario de calidad de la oferta, de oferta técnica o de propuesta técnica lleva AHÍ MISMO todo el detalle de LO POSTULADO, punto por punto y con la estructura del formulario (si tiene una tabla, una fila por punto; si no, un párrafo por punto): cada servicio (coffee, desayuno, almuerzo, cena, cóctel, fiesta, show) con lo que se sirve o se presta y sus cantidades (la lista de productos de LO POSTULADO), horarios, lugar, equipamiento y personal. Aunque el formulario diga que se puede adjuntar un formato propio, no escribas «se adjunta propuesta técnica» ni remitas a otro documento: el formulario es la propuesta. Mantén su encabezado y su línea de firma. Presentación de cada punto: primero su título EN NEGRITA (el número y la especificación de las bases, sin decir en qué página está) y debajo, en un párrafo aparte y SIN negrita, lo que se ofrece. Si el lugar donde escribes trae la negrita puesta (la celda del formulario, por ejemplo), quítasela al texto de lo que se ofrece: explícitamente sin negrita, con la misma letra y el mismo tamaño del formulario.';

export const ESCRIBIR_LA_OFERTA =
  'La oferta ya está decidida (LO POSTULADO, arriba): escribe exactamente eso. El texto de cada punto va tal cual en el lugar de las bases o del formulario que le corresponde, con sus productos y cantidades. No decidas, no cambies ni agregues nada. Si las bases piden algo que no está en lo postulado, escríbelo como [COMPLETAR: qué falta] y anótalo en pendientes.';
