/**
 * ¿Esa persona está pagada?
 *
 * UN SOLO MONTO, DOS ESTADOS (Felipe, 17-08): "como se carga el total,
 * no por separado, hay dos estados: pendiente y pagada, no existe el
 * parcial". Al banco sube UNA transferencia por persona —su total
 * consolidado—, así que no hay pago a medias que mostrar.
 *
 * En la base el pago sigue guardándose en dos marcas (jornada y
 * propina) porque así nació; acá se tratan como una sola cosa: pagada
 * cuando TODO lo que se le debe está marcado.
 */
export const estadoDelPago = (p: {
  totalJornada: number;
  totalPropina: number;
  pagos: readonly {
    jornada_paid?: boolean | null;
    propina_paid?: boolean | null;
  }[];
}): "pagada" | "pendiente" => {
  if (p.pagos.length === 0) return "pendiente";
  const jornadaLista =
    p.totalJornada === 0 || p.pagos.every((g) => !!g.jornada_paid);
  const propinaLista =
    p.totalPropina === 0 || p.pagos.every((g) => !!g.propina_paid);
  // Nada que pagar tampoco es "pagada": no hubo transferencia.
  if (p.totalJornada === 0 && p.totalPropina === 0) return "pendiente";
  return jornadaLista && propinaLista ? "pagada" : "pendiente";
};
