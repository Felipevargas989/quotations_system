import { esCorreoUtil, fechaEnChile } from './elegibles';
import { hiloDeLaCotizacion } from './hilo';
import type { MensajeDelBuzon, OutlookDeLaCasa } from './outlook';

// «¿DÓNDE ESTÁ EL ÚLTIMO CORREO CON ESTE CLIENTE?» (doc 20 §18, sprint 2;
// Felipe, 10-11-2026: «también indicar en dónde está el último correo (o
// seguimiento enviado)»).
//
// Solo lee: busca en los buzones de la casa, en el mismo orden y con la
// misma regla que «✉ Generar seguimiento» (`hiloDeLaCotizacion`), el hilo de
// la cotización y su último correo. Si no hay hilo de la cotización, dice
// cuál fue el último correo con el cliente en cualquier hilo. Nunca escribe
// ni mueve nada.

/** Lo justo de la cotización para buscar sus correos. */
export type CotizacionDelCorreo = {
  quotation_number: number;
  created_at: string | null;
  client_contact_id?: number | string | null;
  clients?: {
    email?: string | null;
    client_contacts?: Array<{
      id: number | string;
      email?: string | null;
    }> | null;
  } | null;
};

/** Los correos útiles del contacto de la cotización y del cliente. */
export const correosDeLaCotizacion = (q: CotizacionDelCorreo): string[] => {
  const contacto =
    q.clients?.client_contacts?.find((c) => c.id === q.client_contact_id) ??
    null;
  return [
    ...new Set(
      [contacto?.email, q.clients?.email]
        .filter(esCorreoUtil)
        .map((c) => c.trim().toLowerCase()),
    ),
  ];
};

export type CorreoResumido = {
  buzon: string;
  fecha: string;
  dia: string;
  de: string;
  de_la_casa: boolean;
  para: string[];
  asunto: string;
  /** Lo que decía, en texto, hasta 600 letras. */
  extracto: string;
};

export type UltimoCorreo =
  | {
      encontrado: 'hilo_de_la_cotizacion';
      buzon: string;
      correos_en_el_hilo: number;
      hay_borrador: boolean;
      ultimo: CorreoResumido;
      /** El último que mandó la casa, si el último es del cliente. */
      ultimo_de_la_casa: CorreoResumido | null;
    }
  | { encontrado: 'otro_hilo'; ultimo: CorreoResumido }
  | { encontrado: 'ninguno'; correos_buscados: string[] }
  | { encontrado: 'sin_correo' };

type Outlook = Pick<
  OutlookDeLaCasa,
  'buzones' | 'buscar' | 'leerTexto' | 'esDeLaCasa' | 'esDeEventia'
>;

const EXTRACTO = 600;

const resumir = async (
  outlook: Outlook,
  buzon: string,
  m: MensajeDelBuzon,
): Promise<CorreoResumido> => {
  let texto = m.adelanto ?? '';
  try {
    texto = (await outlook.leerTexto(buzon, m.id)) || texto;
  } catch {
    // Sin el texto completo, el adelanto.
  }
  return {
    buzon,
    fecha: m.fecha,
    dia: fechaEnChile(new Date(m.fecha)),
    de: m.de,
    de_la_casa: outlook.esDeLaCasa(m.de),
    para: m.para,
    asunto: m.asunto,
    extracto: texto.replace(/\s+/g, ' ').trim().slice(0, EXTRACTO),
  };
};

/** El último correo de la cotización (o con el cliente), sin escribir nada. */
export async function buscarUltimoCorreo(
  outlook: Outlook,
  q: CotizacionDelCorreo,
): Promise<UltimoCorreo> {
  const correos = correosDeLaCotizacion(q);
  if (correos.length === 0) return { encontrado: 'sin_correo' };
  const porBuzon: Array<{ buzon: string; mensajes: MensajeDelBuzon[] }> = [];
  for (const buzon of outlook.buzones) {
    const mensajes = (
      await Promise.all(correos.map((c) => outlook.buscar(buzon, c)))
    ).flat();
    const unicos = [...new Map(mensajes.map((m) => [m.id, m])).values()];
    porBuzon.push({ buzon, mensajes: unicos });
    const hilo = hiloDeLaCotizacion({
      mensajes: unicos,
      numero: q.quotation_number,
      creada: q.created_at,
      esDeEventia: (c) => outlook.esDeEventia(c),
    });
    if (hilo) {
      const enviados = hilo.filter((m) => !m.borrador);
      if (enviados.length === 0) continue;
      const ultimo = enviados[0];
      const ultimoDeLaCasa = outlook.esDeLaCasa(ultimo.de)
        ? null
        : (enviados.find((m) => outlook.esDeLaCasa(m.de)) ?? null);
      return {
        encontrado: 'hilo_de_la_cotizacion',
        buzon,
        correos_en_el_hilo: enviados.length,
        hay_borrador: hilo.some((m) => m.borrador),
        ultimo: await resumir(outlook, buzon, ultimo),
        ultimo_de_la_casa: ultimoDeLaCasa
          ? await resumir(outlook, buzon, ultimoDeLaCasa)
          : null,
      };
    }
  }
  // Sin hilo de la cotización: el último correo con el cliente, en
  // cualquier buzón y cualquier hilo.
  const todos = porBuzon
    .flatMap((b) =>
      b.mensajes.filter((m) => !m.borrador).map((m) => ({ ...b, m })),
    )
    .sort((a, b) => Date.parse(b.m.fecha) - Date.parse(a.m.fecha));
  if (todos.length === 0) {
    return { encontrado: 'ninguno', correos_buscados: correos };
  }
  return {
    encontrado: 'otro_hilo',
    ultimo: await resumir(outlook, todos[0].buzon, todos[0].m),
  };
}
