import { QuotationStatus } from 'src/quotations/constants/constants';
import { UserRole, type User } from 'src/users/entities/user.entity';
import {
  conDia,
  diaDelEvento,
  diasEntre,
  ErrorDeHerramienta,
  pesos,
} from '../herramientas/comun';
import type { FotoGuardada, LineaDelCambio } from './editar-foto';
import { parcheDe, type CotizacionParaCambiar, type Parche } from './reglas';

// LAS PERSONAS DEL EVENTO Y EL DESCUENTO, COMO PROPUESTA (doc 20, regla 5
// y §11, pregunta 1; Felipe, 04-11-2026).
//
// - Las personas: *"creo que debería poder en una cotización aún no
//   aceptada"*. Las aceptadas siguen por Post-Venta → Servicios, con las
//   compras y el plan de pagos a la vista.
// - El descuento: *"vamos con la 1 a la 6"*. El que la persona pida, nunca
//   uno que ofrezca BelIA, con el tope de su cargo: el mismo del cotizador
//   y de Post-Venta (`getMaxDiscountForRole`).
//
// La cuenta es la del cotizador, para que guardar la cotización después en
// la pantalla no la mueva ni un peso.

export type CambioDeCabecera = {
  /** Las personas del evento: el total y cuántas son niños. */
  personas?: { total: number; ninos?: number };
  /** Por porcentaje o por monto, como el interruptor %/$ del cotizador. */
  descuento?: { porcentaje?: number; monto?: number };
  /** El primer día nuevo, AAAA-MM-DD: el evento entero se mueve (doc 20
   *  §17, mejora 3; solo en las no aceptadas). */
  fecha?: { inicio: string };
};

/** Lo que cambia de la cabecera, ya revisado, para la cuenta y el guardado. */
export type CabeceraNueva = {
  people_count?: number;
  children_count?: number;
  discount_percentage?: number;
  discount_amount?: number;
  /** AAAA-MM-DD. El último día solo si el evento es de varios días. */
  event_date?: string;
  event_end_date?: string;
};

/** El tope de descuento de cada cargo, calco de `getMaxDiscountForRole`
 *  (QuotationForm y Post-Venta → Servicios). */
export const topeDeDescuento = (rol: UserRole): number =>
  rol === UserRole.ADMINISTRADOR
    ? 40
    : rol === UserRole.VENDEDOR || rol === UserRole.OPERACIONES
      ? 15
      : 0;

const n = (v: unknown): number => Number(v) || 0;

/** Las casillas como las deja el cotizador al cambiar las personas del
 *  evento (`loadExistingItemsFromJSON` y `boxPeople`): la que tenía el total
 *  de su audiencia lo sigue; la que tenía otro número, un ajuste a mano, lo
 *  conserva. Una casilla antigua sin personas ya sigue al total. */
export const conPersonasNuevas = (
  foto: FotoGuardada,
  antes: { adultos: number; ninos: number },
  despues: { adultos: number; ninos: number },
): { foto: FotoGuardada; lineas: LineaDelCambio[] } => {
  const lineas: LineaDelCambio[] = [];
  const casillas = (foto.variable_services ?? []).map((c) => {
    if (typeof c.people !== 'number') return c;
    const deNinos = c.audience === 'ninos';
    const era = deNinos ? antes.ninos : antes.adultos;
    const sera = deNinos ? despues.ninos : despues.adultos;
    if (c.people !== era || era === sera) return c;
    lineas.push({
      dia: Math.max(1, n(c.day) || 1),
      que: `${c.category ?? 'Casilla'} · ${deNinos ? 'niños' : 'adultos'}`,
      quita: [],
      agrega: [],
      personas: { antes: era, despues: sera },
    });
    return { ...c, people: sera };
  });
  return { foto: { ...foto, variable_services: casillas }, lineas };
};

/** Los fijos que cobran por persona. El cotizador no les rehace el precio
 *  al cambiar las personas, y BelIA tampoco (la cuenta tiene que cuadrar
 *  con la pantalla): se avisa. */
export const fijosPorPersona = (foto: FotoGuardada): string[] =>
  (foto.fixed_services ?? [])
    .filter(
      (f) =>
        (f.tipo_calculo === 'fijo_variable' ||
          f.tipo_calculo === 'variable_con_limites') &&
        n(f.precio_por_persona) > 0,
    )
    .map((f) => f.nombre || String(f.codigo ?? '?'));

/** «40 adultos y 10 niños», o «45 personas» si no hay niños. */
export const quienesSon = (total: number, ninos: number): string =>
  ninos > 0 ? `${total - ninos} adultos y ${ninos} niños` : `${total} personas`;

// LA FECHA DEL EVENTO (doc 20 §17, mejora 3; Felipe, 04-11-2026: «vamos con
// todas»). Solo en las no aceptadas, como las personas: el evento entero se
// mueve y el último día corre lo mismo. Los servicios van por día del evento
// (día 1, día 2…), así que siguen solos. El choque con un evento aceptado lo
// avisa el servicio, con la misma cuenta de «Crear evento».

const DIA = /^\d{4}-\d{2}-\d{2}$/;

const sumarDias = (dia: string, dias: number): string => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Las fechas nuevas del evento, o null si ya está en esa fecha. */
export const conFechaNueva = (
  actual: { inicio: string | null; fin: string | null },
  inicio: string,
  hoy: string,
): { event_date: string; event_end_date: string | null } | null => {
  if (!DIA.test(inicio) || sumarDias(inicio, 0) !== inicio) {
    throw new ErrorDeHerramienta(
      'La fecha nueva va en AAAA-MM-DD y tiene que existir.',
    );
  }
  if (inicio < hoy) throw new ErrorDeHerramienta('Esa fecha ya pasó.');
  if (actual.inicio === inicio) return null;
  const largo =
    actual.inicio && actual.fin && actual.fin > actual.inicio
      ? diasEntre(actual.inicio, actual.fin)
      : 0;
  return {
    event_date: inicio,
    event_end_date: largo > 0 ? sumarDias(inicio, largo) : null,
  };
};

/** «sáb 21-11-2026», o «sáb 21-11-2026 a lun 23-11-2026». */
const fechasEnPalabras = (inicio: string | null, fin: string | null) =>
  fin && inicio && fin > inicio
    ? `${conDia(inicio)} a ${conDia(fin)}`
    : (conDia(inicio) ?? 'sin fecha');

/** Los ítems con «temporada» en el nombre: su precio depende de la fecha
 *  (la cabaña de temporada alta, por ejemplo). */
export const deTemporada = (foto: FotoGuardada): string[] => {
  const nombres = [
    ...(foto.variable_services ?? []).flatMap((c) =>
      (c.items ?? []).map((i) => i.nombre),
    ),
    ...(foto.fixed_services ?? []).map((f) => f.nombre),
  ].filter((x): x is string => typeof x === 'string' && /temporada/i.test(x));
  return [...new Set(nombres)].slice(0, 4);
};

/** Las personas del evento, el descuento y la fecha que trae la propuesta
 *  (doc 20, regla 5 y §11, pregunta 1; la fecha, §17): revisados, con la
 *  foto como la deja el cotizador y sus líneas para la tarjeta. Vivía en
 *  `PropuestasService` hasta el 04-11 en la noche. */
export const revisarCabecera = (
  q: CotizacionParaCambiar,
  usuario: User,
  fotoDeServicios: FotoGuardada,
  cabecera: CambioDeCabecera | undefined,
  hoy: string,
) => {
  let foto = fotoDeServicios;
  const nueva: CabeceraNueva = {};
  const lineas: LineaDelCambio[] = [];
  const avisos: string[] = [];
  const diasTocados: number[] = [];
  const personas = n(q.people_count);
  const ninos = n(q.children_count);

  if (cabecera?.personas) {
    if (q.quotation_status === QuotationStatus.ACEPTADA) {
      throw new ErrorDeHerramienta(
        `La N° ${q.quotation_number} está aceptada: sus personas se cambian en Post-Venta → Servicios, donde se ven las compras y las cuotas.`,
      );
    }
    const total = cabecera.personas.total;
    const deNinos = cabecera.personas.ninos ?? ninos;
    if (!(total >= 1)) {
      throw new ErrorDeHerramienta('Faltan las personas del evento (1 o más).');
    }
    if (deNinos < 0 || deNinos > total) {
      throw new ErrorDeHerramienta(
        'Los niños van dentro del total de personas.',
      );
    }
    if (total !== personas || deNinos !== ninos) {
      const r = conPersonasNuevas(
        foto,
        { adultos: Math.max(0, personas - ninos), ninos },
        { adultos: total - deNinos, ninos: deNinos },
      );
      foto = r.foto;
      nueva.people_count = total;
      nueva.children_count = deNinos;
      lineas.push(
        {
          dia: 0,
          que: `Personas del evento: ${quienesSon(personas, ninos)} → ${quienesSon(total, deNinos)}`,
          quita: [],
          agrega: [],
        },
        ...r.lineas,
      );
      diasTocados.push(...r.lineas.map((l) => l.dia));
      const porPersona = fijosPorPersona(foto);
      if (porPersona.length > 0) {
        avisos.push(
          `${porPersona.join(', ')} cobra por persona y queda con el precio de antes, como hace el cotizador: si corresponde, ajústalo en la pantalla.`,
        );
      }
    }
  }

  if (cabecera?.descuento) {
    const tope = topeDeDescuento(usuario.role);
    if (tope <= 0) {
      throw new ErrorDeHerramienta('Con tu cargo no se aplican descuentos.');
    }
    const { porcentaje, monto } = cabecera.descuento;
    const subtotal = parcheDe(q, foto, nueva).parche.subtotal_amount;
    if (porcentaje != null) {
      if (porcentaje < 0 || porcentaje > tope) {
        throw new ErrorDeHerramienta(
          `Tu cargo descuenta hasta ${tope} %: ese descuento lo aplica un administrador.`,
        );
      }
      nueva.discount_percentage = porcentaje;
      nueva.discount_amount = 0;
    } else if (monto != null) {
      const maximo = Math.round((subtotal * tope) / 100);
      if (monto < 0 || monto > maximo) {
        throw new ErrorDeHerramienta(
          `Tu cargo descuenta hasta ${tope} %: ${pesos(maximo)} sobre el subtotal de ${pesos(subtotal)}.`,
        );
      }
      nueva.discount_percentage = 0;
      nueva.discount_amount = monto;
    } else {
      throw new ErrorDeHerramienta(
        'El descuento va en `porcentaje` o en `monto`.',
      );
    }
    const antes = descuentoEnPalabras(parcheDe(q, q.items ?? {}, {}).parche);
    const despues = descuentoEnPalabras(parcheDe(q, foto, nueva).parche);
    if (antes !== despues) {
      lineas.push({
        dia: 0,
        que: `Descuento: ${antes} → ${despues}`,
        quita: [],
        agrega: [],
      });
    } else {
      delete nueva.discount_percentage;
      delete nueva.discount_amount;
    }
  }
  if (cabecera?.fecha) {
    if (q.quotation_status === QuotationStatus.ACEPTADA) {
      throw new ErrorDeHerramienta(
        `La N° ${q.quotation_number} está aceptada: su fecha se cambia en la pantalla, donde se ven las compras, el personal y las cuotas.`,
      );
    }
    const desde = {
      inicio: diaDelEvento(q.event_date),
      fin: diaDelEvento(q.event_end_date),
    };
    const fechas = conFechaNueva(desde, cabecera.fecha.inicio, hoy);
    if (fechas) {
      nueva.event_date = fechas.event_date;
      if (fechas.event_end_date) nueva.event_end_date = fechas.event_end_date;
      lineas.push({
        dia: 0,
        que: `Fecha del evento: ${fechasEnPalabras(desde.inicio, desde.fin)} → ${fechasEnPalabras(fechas.event_date, fechas.event_end_date)}`,
        quita: [],
        agrega: [],
      });
      const temporada = deTemporada(foto);
      if (temporada.length > 0) {
        avisos.push(
          `Trae ítems de temporada (${temporada.join(', ')}): revisa que calcen con la fecha nueva. BelIA no los cambia sola.`,
        );
      }
    }
  }
  return { foto, nueva, lineas, avisos, diasTocados };
};

/** «10 % ($44.300)», «$50.000» o «sin descuento», con la plata que hizo
 *  la cuenta de la casa: total = (subtotal − descuento) + propina. */
const descuentoEnPalabras = (p: Parche): string => {
  const pesosDelDescuento = p.subtotal_amount - (p.total_amount - p.tip_amount);
  if (pesosDelDescuento <= 0) return 'sin descuento';
  return p.discount_percentage > 0
    ? `${p.discount_percentage} % (${pesos(pesosDelDescuento)})`
    : pesos(pesosDelDescuento);
};
