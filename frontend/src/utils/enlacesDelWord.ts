// Los enlaces de un Word que se muestra en Eventia (VisorDeWord, decisión 46
// del doc 17): un Word puede venir de afuera y traer un enlace
// `javascript:` que, con un clic, correría con los permisos de Eventia.

/** Un ancla interna (#...), http(s) o correo. */
export const esEnlaceSeguro = (href: string): boolean =>
  href.startsWith("#") || /^(https?:|mailto:)/i.test(href.trim());

/** Los enlaces del Word: solo http(s) y correo, en otra pestaña; lo demás
 *  (javascript:, file:...) se desactiva. Devuelve cuántos desactivó. */
export function controlarEnlaces(raiz: ParentNode): number {
  let desactivados = 0;
  for (const a of Array.from(raiz.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) continue;
    if (esEnlaceSeguro(href)) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    } else {
      a.removeAttribute("href");
      desactivados++;
    }
  }
  return desactivados;
}
