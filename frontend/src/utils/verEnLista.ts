// Deja visible la opción activa de un desplegable MOVIENDO SOLO SU LISTA.
//
// Antes se usaba `el.scrollIntoView({ block: "nearest" })`, que suena
// inofensivo pero le pide al navegador que mueva TODOS los contenedores
// con scroll que estén por encima —incluida la página—. Con el buscador
// abierto cerca del fondo, la pantalla se iba de golpe al final
// (07-08-2026, pillada de Felipe en el buscador de servicios).
//
// Acá se calcula a mano contra la lista y no se toca nada más. La lista
// se reconoce por el atributo `data-lista-scroll`.
export const verEnLista = (el: HTMLElement | null) => {
  if (!el) return;
  const lista = el.closest<HTMLElement>("[data-lista-scroll]");
  if (!lista) return;
  const arriba = el.offsetTop;
  const abajo = arriba + el.offsetHeight;
  if (arriba < lista.scrollTop) {
    lista.scrollTop = arriba;
  } else if (abajo > lista.scrollTop + lista.clientHeight) {
    lista.scrollTop = abajo - lista.clientHeight;
  }
};
