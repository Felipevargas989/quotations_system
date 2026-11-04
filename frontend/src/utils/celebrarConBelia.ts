// BELIA CELEBRA cuando algo sale bien (doc 20 §8b; Felipe, 03-11:
// "cuando completas tareas, confirmas una reserva o terminas de organizar
// un evento, se pone feliz"). Las pantallas no la conocen: el servicio de
// cada acción avisa al terminar bien, y la ventanilla escucha. Si BelIA no
// está (otra empresa, otro cargo), el aviso no lo oye nadie.

export const EVENTO_CELEBRAR = "belia:celebra";

export const celebrarConBelia = (): void => {
  try {
    window.dispatchEvent(new Event(EVENTO_CELEBRAR));
  } catch {
    // Sin ventana (una prueba, por ejemplo), no hay a quién avisar.
  }
};
