/**
 * EL SEGMENTO (Fase 3, Felipe 25-08: "quiero ver cómo crear audiencias
 * desde los datos que ya tengo"). Puro para poder probarlo: recibe los
 * clientes y las cotizaciones de la empresa y devuelve quiénes calzan.
 *
 * Cada condición del filtro es un Y (todas deben cumplirse); dentro de
 * una condición con lista (tipos, estados), la lista es un O.
 */
export interface FiltroSegmento {
  /** Tipos de cliente (client_type). Vacío/ausente = todos. */
  tipos_cliente?: string[];
  /** Tuvo cotización en estos estados… */
  con_estados?: ('realizada' | 'aceptada' | 'rechazada' | 'anulada')[];
  /** …con fecha de evento dentro del rango (opcional). */
  evento_desde?: string;
  evento_hasta?: string;
  /** Dormidos: SIN ninguna cotización creada desde esta fecha. */
  sin_cotizacion_desde?: string;
  /** Aniversario: evento realizado hace ~un año (11 a 13 meses). */
  aniversario?: boolean;
  /** Su mayor cotización (aceptada o realizada) fue al menos esto. */
  monto_min?: number;
  /** Tipos de evento de sus cotizaciones (event_type). */
  tipos_evento?: string[];
}

export interface ClienteSegmentable {
  id: number | string;
  name: string;
  email: string | null;
  client_type: string | null;
  contact_person?: string | null;
}

/** Una PERSONA de la ficha del cliente (client_contacts): a ellas se
 *  les escribe — el marketing le habla a gente, no a empresas. */
export interface ContactoDeCliente {
  client_id: number | string;
  name: string | null;
  email: string | null;
}

export interface CotizacionSegmentable {
  client_id: number | string | null;
  quotation_status: string;
  event_date: string | null;
  total_amount: number | string | null;
  event_type: string | null;
  created_at: string;
}

const dia = (iso: string | null | undefined): string =>
  (iso ?? '').slice(0, 10);

export const resolverSegmento = (
  clientes: readonly ClienteSegmentable[],
  cotizaciones: readonly CotizacionSegmentable[],
  contactos: readonly ContactoDeCliente[],
  filtro: FiltroSegmento,
  hoyISO: string,
): { email: string; name: string | null; empresa: string | null }[] => {
  const porCliente = new Map<string, CotizacionSegmentable[]>();
  for (const q of cotizaciones) {
    if (q.client_id == null) continue;
    const k = String(q.client_id);
    if (!porCliente.has(k)) porCliente.set(k, []);
    porCliente.get(k)!.push(q);
  }

  // La ventana del aniversario: evento realizado hace 11 a 13 meses.
  const hoy = new Date(`${hoyISO}T12:00:00Z`);
  const menosMeses = (n: number) => {
    const d = new Date(hoy);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 10);
  };
  const anivDesde = menosMeses(13);
  const anivHasta = menosMeses(11);

  // El FILTRO decide por la historia del CLIENTE; el correo ya no es
  // requisito acá — se resuelve al expandir a sus personas (26-08).
  const cumple = (c: ClienteSegmentable): boolean => {
    if (
      filtro.tipos_cliente?.length &&
      !filtro.tipos_cliente.includes(c.client_type ?? '')
    ) {
      return false;
    }
    const suyas = porCliente.get(String(c.id)) ?? [];

    if (filtro.con_estados?.length) {
      const enRango = suyas.filter(
        (q) =>
          filtro.con_estados!.includes(
            q.quotation_status as
              | 'realizada'
              | 'aceptada'
              | 'rechazada'
              | 'anulada',
          ) &&
          (!filtro.evento_desde || dia(q.event_date) >= filtro.evento_desde) &&
          (!filtro.evento_hasta || dia(q.event_date) <= filtro.evento_hasta),
      );
      if (enRango.length === 0) return false;
    }

    if (filtro.sin_cotizacion_desde) {
      const tieneReciente = suyas.some(
        (q) => dia(q.created_at) >= filtro.sin_cotizacion_desde!,
      );
      if (tieneReciente) return false;
    }

    if (filtro.aniversario) {
      const celebro = suyas.some(
        (q) =>
          q.quotation_status === 'realizada' &&
          dia(q.event_date) >= anivDesde &&
          dia(q.event_date) <= anivHasta,
      );
      if (!celebro) return false;
    }

    if (filtro.monto_min != null) {
      const mayor = Math.max(
        0,
        ...suyas
          .filter((q) => ['aceptada', 'realizada'].includes(q.quotation_status))
          .map((q) => Number(q.total_amount ?? 0)),
      );
      if (mayor < filtro.monto_min) return false;
    }

    if (filtro.tipos_evento?.length) {
      const tiene = suyas.some((q) =>
        filtro.tipos_evento!.includes(q.event_type ?? ''),
      );
      if (!tiene) return false;
    }

    return true;
  };

  // LA EXPANSIÓN A PERSONAS (Felipe, 26-08: "¿se envía uno a cada
  // uno?" — sí): cada cliente que calza se abre a TODOS sus contactos
  // con correo (client_contacts). {nombre} pasa a ser la persona y
  // {empresa} el cliente — se saluda a Sandra, no a la Municipalidad.
  // Cliente sin contactos con correo: respaldo al correo de la ficha.
  const personasPor = new Map<string, ContactoDeCliente[]>();
  for (const p of contactos) {
    if (!p.email?.trim()) continue;
    const k = String(p.client_id);
    if (!personasPor.has(k)) personasPor.set(k, []);
    personasPor.get(k)!.push(p);
  }

  const lista: { email: string; name: string | null; empresa: string }[] = [];
  for (const c of clientes) {
    if (!cumple(c)) continue;
    const personas = personasPor.get(String(c.id)) ?? [];
    if (personas.length > 0) {
      for (const p of personas) {
        lista.push({
          email: p.email!,
          name: p.name?.trim() || c.contact_person?.trim() || c.name,
          empresa: c.name,
        });
      }
    } else if (c.email?.trim()) {
      lista.push({
        email: c.email,
        name: c.contact_person?.trim() || c.name,
        empresa: c.name,
      });
    }
  }
  return lista;
};
