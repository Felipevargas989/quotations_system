// EL LOGO DE LA EMPRESA PARA LA PROPUESTA TÉCNICA. Solo se baja del balde
// público de la casa: una URL cualquiera haría que el motor le pida cosas a
// quien sea. Aparte del servicio, que está en el tope de 800 líneas.

/** Las imágenes que recibe el taller: el logo y la firma. Viven aquí
 *  desde el 08-11, para que el servicio no pase las 800 líneas. */
export const TIPOS_DE_IMAGEN: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** El logo pesa poco; uno de más de esto no es un logo. */
const MAX_BYTES_LOGO = 3 * 1024 * 1024;

export const urlDelLogo = (url: string | null): string | null => {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  if (!url || !base) return null;
  return url.startsWith(`${base}/storage/v1/object/public/`) ? url : null;
};

/** null si no se pudo: la propuesta sale igual, sin logo. */
export const bajarLogo = async (
  url: string | undefined,
  avisar: (mensaje: string) => void,
): Promise<Buffer | null> => {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const datos = Buffer.from(await r.arrayBuffer());
    return datos.length > 0 && datos.length <= MAX_BYTES_LOGO ? datos : null;
  } catch (error) {
    avisar(
      `no se pudo bajar el logo: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};
