import { catalogoComoTexto } from 'src/quotations/generar/catalogo';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import { ofrecible } from 'src/quotations/generar/reglas-valle-del-sol';
import type { CajaDelPlan, FijoDelPlan } from 'src/quotations/generar/tipos';

// LA PROPUESTA TÉCNICA Y LA COTIZACIÓN SON LA MISMA OFERTA (decisión 29 del
// doc 17, 19-10). Felipe: "lo que traigo del catálogo es lo que debe
// vaciarse en la nueva cotización o en la cotización que se vincula, porque
// tienen que ser equivalentes". La IA que escribe la propuesta deja, además
// del Word, la lista de lo que ofrece con los ids del catálogo, con la misma
// forma de cajas y fijos de «✨ Crear con IA» (quotations/generar/tipos.ts).
// La cotización se arma con esa lista y los precios del catálogo
// (armarFoto), sin otra IA de por medio.

export type OfertaDeLaPropuesta = {
  cajas: CajaDelPlan[];
  fijos: FijoDelPlan[];
};

const entero = (v: unknown, minimo: number): number | null => {
  const x = Number(v);
  return Number.isInteger(x) && x >= minimo ? x : null;
};

const objetos = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> =>
        Boolean(x && typeof x === 'object'),
      )
    : [];

/** La oferta del informe.json, leída con cuidado: lo que no tenga forma se
 *  bota; si no queda nada, no hay oferta. */
export const leerOferta = (v: unknown): OfertaDeLaPropuesta | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const cajas = objetos(o.cajas).flatMap((c): CajaDelPlan[] => {
    const dia = entero(c.dia, 1);
    const personas = entero(c.personas, 1);
    const categoria = typeof c.categoria === 'string' ? c.categoria.trim() : '';
    if (dia === null || personas === null || !categoria) return [];
    return [
      {
        dia,
        categoria,
        audiencia: c.audiencia === 'ninos' ? 'ninos' : 'adultos',
        personas,
        menu_id: entero(c.menu_id, 0) ?? 0,
        quitar: (Array.isArray(c.quitar) ? c.quitar : [])
          .map((q) => entero(q, 1))
          .filter((q): q is number => q !== null),
        servicios: objetos(c.servicios).flatMap((s) => {
          const id = entero(s.id, 1);
          const cantidad = entero(s.cantidad, 1);
          return id === null || cantidad === null ? [] : [{ id, cantidad }];
        }),
      },
    ];
  });
  const fijos = objetos(o.fijos).flatMap((f): FijoDelPlan[] => {
    const id = entero(f.id, 1);
    const cantidad = entero(f.cantidad, 1);
    return id === null || cantidad === null
      ? []
      : [{ dia: entero(f.dia, 0) ?? 0, id, cantidad }];
  });
  return cajas.length > 0 || fijos.length > 0 ? { cajas, fijos } : null;
};

/** Cuántos productos trae: lo que se ve en la pantalla antes de llevarla a
 *  la cotización. */
export const productosDeLaOferta = (o: OfertaDeLaPropuesta): number =>
  o.cajas.reduce(
    (suma, c) => suma + (c.menu_id > 0 ? 1 : 0) + c.servicios.length,
    0,
  ) + o.fijos.length;

/** Lo que la propuesta técnica le pide a la IA, además del Word. */
export const COMO_LISTAR_LA_OFERTA =
  'La propuesta y la cotización de la empresa en Eventia son LA MISMA oferta: en informe.json agrega "oferta" con exactamente lo que el Word ofrece, con los ids del catálogo de arriba. "cajas": una por cada comida o servicio por persona de cada día, {"dia": 1, "categoria": "el nombre EXACTO de la categoría", "audiencia": "adultos" o "ninos", "personas": cuántas, "menu_id": el id del menú guardado que es la base (0 si va sin menú), "quitar": [ids de platos de ese menú que se sacan], "servicios": [{"id": id de un suelto de ESA categoría, "cantidad": por persona}]}. "fijos": [{"dia": 0 para todo el evento (o el número del día), "id": id de un servicio fijo, "cantidad": cuántos}]. La sección fija de cada categoría entra sola: no la agregues. Usa solo ids que estén en el catálogo; lo que la empresa no tiene no va en la oferta: va en el Word como [POR CONFIRMAR] y en pendientes.';

/** El catálogo con ids para la propuesta técnica: el mismo texto que lee
 *  «✨ Crear con IA». */
export const catalogoParaLaOferta = async (
  catalogos: Pick<GenerarRepository, 'catalogo'>,
  companyId: number,
): Promise<string> =>
  catalogoComoTexto(await catalogos.catalogo(companyId), ofrecible);
