// LOS EVENTOS DE UNA RESPUESTA EN VIVO (text/event-stream): cada uno es
// «event: <nombre>» y «data: <json>», separado del siguiente por una línea
// en blanco. Lo usa la respuesta en vivo de BelIA (doc 20 §9). El texto
// llega de a poco: se lee lo completo y se recuerda hasta dónde.

/** Lee los eventos completos (separados por una línea en blanco) desde
 *  `desde`; devuelve hasta dónde leyó. Puro: se prueba sin red. */
export const leerEventos = (
  texto: string,
  desde: number,
  alLeer: (evento: string, datos: unknown) => void,
): number => {
  let leido = desde;
  for (;;) {
    const corte = texto.indexOf("\n\n", leido);
    if (corte < 0) return leido;
    const bloque = texto.slice(leido, corte);
    leido = corte + 2;
    const evento = /^event: (.+)$/m.exec(bloque)?.[1];
    const datos = /^data: (.*)$/m.exec(bloque)?.[1];
    if (!evento || datos == null) continue;
    try {
      alLeer(evento, JSON.parse(datos));
    } catch {
      // Un evento que no se puede leer se salta: el «fin» trae todo.
    }
  }
};
