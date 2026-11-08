/**
 * LA FECHA DE EMISIÓN DE LA FACTURA (doc 19 §9.32; Felipe, 08-11: *"creo
 * que se puede elegir qué fecha ponerle dentro de ciertos límites (…)
 * revisa cómo funciona a nivel SII, cómo funciona a nivel facturacion.cl"*).
 *
 * Lo medido ese día:
 * - **El SII.** La fecha de emisión (`FchEmis`) es la «fecha de emisión
 *   contable» del documento, y el formato solo pide una fecha válida entre
 *   2003-04-01 y 2050-12-31 (Formato DTE v2.2). Su propio facturador la
 *   propone en el día y deja cambiarla (guía del Portal MIPYME). Aparte
 *   quedan la fecha y hora de la firma (`TmstFirma`, la pone facturacion.cl
 *   al firmar) y la de recepción en el SII, desde la que corren los 8 días
 *   para reclamar. La vigencia de los folios (6 meses) se mira contra la
 *   firma, no contra la emisión (rechazo CAF-3-517).
 * - **La ley del IVA** (DL 825, art. 55): la factura va en el momento de
 *   la venta y, en los servicios, en el mismo período tributario (el mes)
 *   en que se paga o se pone a disposición. Con guías de despacho, hasta
 *   el décimo día del mes siguiente, con fecha del mes de las entregas.
 * - **El Registro de Ventas** la pone en el mes de su fecha de emisión: una
 *   fecha del mes anterior cae en el IVA de ese mes, que se declara en el
 *   F29 hasta el día 20 (los facturadores electrónicos que declaran por
 *   internet; el resto, el 12).
 * - **facturacion.cl** la recibe en `FechaEmision` (AAAA-MM-DD) y su manual
 *   no le pone otro límite.
 *
 * El rango que deja Eventia, el más simple que respeta todo eso:
 * - nunca una fecha futura;
 * - hasta el día 20, desde el 1 del mes anterior (su IVA todavía se puede
 *   declarar); desde el 21, solo el mes en curso.
 * La boleta no elige: va con la fecha del día.
 */

/** El último día en que todavía se puede fechar en el mes anterior: el
 *  plazo del F29 de los facturadores electrónicos. */
export const DIA_DEL_F29 = 20;

const dos = (n: number) => String(n).padStart(2, '0');

const esFecha = (s: string | null | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** «DD-MM-AAAA», como la pantalla. */
const corta = (iso: string) => iso.split('-').reverse().join('-');

/** Desde y hasta qué día (AAAA-MM-DD) se puede fechar una factura hoy. */
export const rangoDeEmision = (
  hoy: string,
): { desde: string; hasta: string } => {
  const [anio, mes, dia] = hoy.split('-').map(Number);
  if (dia <= DIA_DEL_F29) {
    const anterior =
      mes === 1 ? { a: anio - 1, m: 12 } : { a: anio, m: mes - 1 };
    return { desde: `${anterior.a}-${dos(anterior.m)}-01`, hasta: hoy };
  }
  return { desde: `${anio}-${dos(mes)}-01`, hasta: hoy };
};

/**
 * La fecha con que sale: la elegida, o la de hoy si no se eligió. Si cae
 * fuera del rango, lo dice (y no se emite).
 */
export const fechaDeEmision = (
  elegida: string | null | undefined,
  hoy: string,
): {
  fecha: string;
  rango: { desde: string; hasta: string };
  problema: string | null;
} => {
  const rango = rangoDeEmision(hoy);
  const fecha = esFecha(elegida) ? elegida : hoy;
  const problema =
    fecha > rango.hasta
      ? 'La fecha de emisión no puede ser futura'
      : fecha < rango.desde
        ? `La fecha de emisión va del ${corta(rango.desde)} al ${corta(rango.hasta)}`
        : null;
  return { fecha, rango, problema };
};
