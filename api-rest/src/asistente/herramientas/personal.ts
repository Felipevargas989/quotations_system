import { ADMIN_ONLY } from 'src/auth/roles.decorator';
import {
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  enlaceDe,
  entero,
  fecha,
  type Herramienta,
} from './comun';

// «¿Qué garzones van a la 500?», «¿quién trabaja el sábado?». Las sillas
// del personal: SOLO administración (SECTION_ROLES.people), con el derecho
// `personal`. Nunca el RUT, la cuenta ni la plata de nadie: solo quién,
// qué cargo, qué día y en qué horario.

const hora = (h: string | null): string | null => (h ? h.slice(0, 5) : null);

export const personal: Herramienta = {
  nombre: 'personal',
  descripcion:
    'El personal citado: el de un evento (con `numero`, o la cotización abierta) o el de un ' +
    'día en todos los eventos y el restaurante (con `dia`). Por persona: nombre, cargo, día, ' +
    'horario y estado de la silla; las sillas sin persona salen como vacías.',
  esquema: {
    type: 'object',
    properties: {
      numero: {
        type: 'integer',
        description: 'El N° de la cotización del evento.',
      },
      dia: {
        type: 'string',
        description: 'Un día (AAAA-MM-DD), en vez de un evento.',
      },
    },
  },
  cargos: ADMIN_ONLY,
  permiso: ['personal'],
  derecho: 'personal',
  async ejecutar(entrada, ctx) {
    const empresa = ctx.usuario.company_id;
    const dia = fecha(entrada.dia, 'dia');
    const numero = entero(entrada.numero, 1, 10_000_000);
    let por: { quotationId: string } | { dia: string };
    if (dia && !numero) {
      por = { dia };
    } else {
      const q = numero
        ? await ctx.repositorio.cotizacionPorNumero(empresa, numero)
        : ctx.cotizacionAbierta
          ? await ctx.repositorio.cotizacionVista(
              empresa,
              ctx.cotizacionAbierta,
            )
          : null;
      if (!q) {
        throw new ErrorDeHerramienta(
          numero
            ? `No hay ninguna cotización N° ${numero} en esta empresa.`
            : 'Falta el N° del evento o el día.',
        );
      }
      por = { quotationId: q.id };
    }
    const { turnos, personas, cargos, eventos } =
      await ctx.repositorio.personal(empresa, por);
    return {
      sillas: turnos.length,
      vacias: turnos.filter((t) => t.person_id == null).length,
      personal: turnos.map((t) => {
        const ev = t.quotation_id ? eventos.get(t.quotation_id) : undefined;
        return {
          persona:
            t.person_id != null
              ? (personas.get(t.person_id) ?? '(sin nombre)')
              : 'silla vacía',
          cargo: t.role_id != null ? (cargos.get(t.role_id) ?? null) : null,
          dia: t.day ? conDia(t.day) : 'por ubicar',
          horario:
            t.starts_at || t.ends_at
              ? `${hora(t.starts_at) ?? '?'} a ${hora(t.ends_at) ?? '?'}`
              : undefined,
          estado: t.status ?? undefined,
          planta_o_freelance: t.kind ?? undefined,
          evento: t.quotation_id
            ? {
                numero: ev?.quotation_number ?? null,
                enlace: ev ? enlaceDe(ev, ctx.usuario.role) : undefined,
                cliente: ev?.clients?.name ?? null,
                fecha: conDia(diaDelEvento(ev?.event_date)),
              }
            : 'restaurante (día de staff)',
        };
      }),
    };
  },
};
