// EL COMENTARIO INTERNO DE LA COTIZACIÓN DE UNA LICITACIÓN (decisión 57 del
// doc 17, 20-10). Felipe: "no puedo hacer un producto por cada variación del
// principal... si me piden carne con un topping de cilantro, no puedo
// crearla, sino que un comentario que tiene que ir en los comentarios
// internos para yo poder hacer seguimiento". Y lo que se subcontrata, "con
// el checklist de todas las cosas que se necesita pedir al proveedor
// externo". Al armar la postulación, el comentario interno de su cotización
// lleva los detalles de lo postulado y el pedido al proveedor. Lo que la
// persona escribió aparte se queda: solo se reemplaza este bloque.

export const FIN_DEL_BLOQUE =
  '(Hasta aquí lo anota Eventia al armar la postulación.)';

const inicioDelBloque = (codigo: string) =>
  `Postulación a la licitación ${codigo}`;

export function bloqueDeLaLicitacion(d: {
  codigo: string;
  nombre: string;
  detalles: string[];
  subcontratar: string[];
}): string {
  return [
    `${inicioDelBloque(d.codigo)}: ${d.nombre}.`,
    ...(d.detalles.length > 0
      ? ['', 'Detalles de lo postulado:', ...d.detalles.map((x) => `- ${x}`)]
      : []),
    ...(d.subcontratar.length > 0
      ? [
          '',
          'Subcontratar (pedir al proveedor):',
          ...d.subcontratar.map((x) => `- ${x}`),
        ]
      : []),
    '',
    FIN_DEL_BLOQUE,
  ].join('\n');
}

/** El comentario con el bloque de la licitación al día: si ya estaba, se
 *  reemplaza (también la línea sola que se escribía antes de la decisión
 *  57); si no, va arriba de lo que ya había. */
export function comentarioConLaLicitacion(
  anterior: string | null | undefined,
  bloque: string,
  codigo: string,
): string {
  const texto = (anterior ?? '').trim();
  if (!texto) return bloque;
  const inicio = texto.indexOf(inicioDelBloque(codigo));
  if (inicio === -1) return `${bloque}\n\n${texto}`;
  const fin = texto.indexOf(FIN_DEL_BLOQUE, inicio);
  const finDeLinea = texto.indexOf('\n', inicio);
  const hasta =
    fin !== -1
      ? fin + FIN_DEL_BLOQUE.length
      : finDeLinea === -1
        ? texto.length
        : finDeLinea;
  return `${texto.slice(0, inicio)}${bloque}${texto.slice(hasta)}`.trim();
}
