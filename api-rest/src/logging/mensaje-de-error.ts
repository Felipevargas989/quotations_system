/**
 * EL MENSAJE DE UN ERROR, sea lo que sea (22-09-2026). Los errores de
 * Supabase (PostgrestError) no son `Error`: son objetos planos con
 * `message` y `code`. `String(e)` sobre ellos imprime "[object Object]",
 * y así quedaron ciegos el reloj del embudo, el respaldo y el resumen
 * semanal durante la caída del 21/22-09. Esta función siempre saca algo
 * legible.
 */
export const mensajeDe = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown };
    const partes = [
      typeof o.code === 'string' ? o.code : null,
      typeof o.message === 'string' ? o.message : null,
    ].filter(Boolean);
    if (partes.length) return partes.join(': ');
    try {
      return JSON.stringify(e).slice(0, 300);
    } catch {
      return '[error sin descripción]';
    }
  }
  return String(e);
};
