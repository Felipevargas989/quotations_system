import type { Oferente } from '../oferente/oferente.repository';
import type { ComparacionDeOfertas, IncumplimientoGrave } from './comparacion';

// EL RECLAMO DE UNA OFERTA (decisión 59 del doc 17, 20-10). Felipe:
// "dejemos en el comparativo una función de que en caso de incumplimiento
// grave, genere un texto para hacer un reclamos en el centro de ayuda". Lo
// arma el motor, sin IA: lo que la comparación encontró en la oferta de un
// competidor (qué, dónde se ve y qué regla incumple) y los datos de «Mi
// empresa». La empresa lo copia y lo pega en el Centro de Ayuda de Mercado
// Público antes de que adjudiquen; Eventia no envía nada. Nació del caso
// Integra (1072229-25-L125): dos ofertas de la misma gente y una
// experiencia mal respaldada que la comisión no vio.

export type DatosDelReclamo = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  empresa: Oferente | null;
};

const limpio = (t: string | null | undefined): string => t?.trim() || '';

/** Termina en punto, si no termina ya en uno (o en «»», «)», «?»). */
const conPunto = (t: string): string => (/[.!?»)]$/.test(t) ? t : `${t}.`);

export function textoDelReclamo(
  competidor: string,
  graves: IncumplimientoGrave[],
  d: DatosDelReclamo,
): string {
  const e = d.empresa;
  const empresa = limpio(e?.razon_social) || 'Nuestra empresa';
  const rut = limpio(e?.rut);
  const nombre = limpio(d.nombre);
  const contacto = [
    limpio(e?.representante_correo) || limpio(e?.correo),
    limpio(e?.representante_telefono) || limpio(e?.telefono),
  ].filter(Boolean);
  return [
    'Señores',
    limpio(d.organismo) || 'Organismo comprador',
    'Presente',
    '',
    `Licitación ${d.codigo}${nombre ? `: «${nombre}»` : ''}.`,
    '',
    `${empresa}${rut ? `, RUT ${rut}` : ''}, oferente en esta licitación, presenta el siguiente reclamo sobre la oferta de ${competidor}, según los documentos publicados en el cuadro de ofertas de Mercado Público:`,
    '',
    ...graves.flatMap((g, i) => [
      `${i + 1}. ${conPunto(limpio(g.que))}`,
      `   Dónde se ve: ${conPunto(limpio(g.prueba))}`,
      `   Regla: ${conPunto(limpio(g.regla))}`,
      '',
    ]),
    `Por lo anterior, solicitamos a la comisión evaluadora revisar la oferta de ${competidor} y, si corresponde, declararla inadmisible antes de adjudicar.`,
    '',
    'Atentamente,',
    ...[
      limpio(e?.representante_nombre),
      [limpio(e?.representante_cargo), empresa].filter(Boolean).join(', '),
      contacto.join(' · '),
    ].filter(Boolean),
  ].join('\n');
}

/** A cada oferta de la competencia con incumplimientos graves le pone el
 *  texto de su reclamo; a la tuya y a las que cumplen, null. */
export const conReclamos = (
  c: ComparacionDeOfertas,
  d: DatosDelReclamo,
): ComparacionDeOfertas => ({
  ...c,
  oferentes: c.oferentes.map((o) => ({
    ...o,
    reclamo:
      !o.es_tuya && o.graves.length > 0
        ? textoDelReclamo(o.nombre, o.graves, d)
        : null,
  })),
});
