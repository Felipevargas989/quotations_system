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

export const ESCRIBIR_LA_OFERTA =
  'La oferta ya está decidida (LO POSTULADO, arriba): escribe exactamente eso. El texto de cada punto va tal cual en el lugar de las bases o del formulario que le corresponde, con sus productos y cantidades. No decidas, no cambies ni agregues nada. Si las bases piden algo que no está en lo postulado, escríbelo como [COMPLETAR: qué falta] y anótalo en pendientes.';
