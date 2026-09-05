/** Gemela de urlAbsoluta en la plantilla de correos del motor: el
 *  sitio suele guardarse "www.algo.cl" y sin protocolo el navegador
 *  lo trata como ruta interna rota (quemadura del 05-09). */
export const urlAbsoluta = (u: string): string =>
  /^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`;
