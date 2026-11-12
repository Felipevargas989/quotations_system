import type { OferenteComparado } from "../../services/comparacion.service";

// LOS INCUMPLIMIENTOS GRAVES (decisión 59 del doc 17, 20-10). Lo que según
// las bases o la ley deja fuera una oferta, con su prueba y su regla.
//
// Desde la decisión 125 (11-11) es la tercera columna de cada oferta, «Lo
// puede dejar fuera», siempre en su lugar aunque esté vacía.
//
// Desde la decisión 128 (11-11) aquí ya no se reclama. Felipe: "el reclamo
// creo que debe ser post resolución, si gano no reclamo, si pierdo sí, y
// debería ser una sección abajo para generar reclamos". El reclamo vive en
// `Reclamos`, al final de la pestaña y solo en una perdida.

/** «Lo puede dejar fuera»: cada incumplimiento con dónde se ve y la regla
 *  de las bases. */
export default function IncumplimientosGraves({
  oferente: o,
}: {
  readonly oferente: OferenteComparado;
}) {
  const graves = o.graves ?? [];
  return (
    <div className="space-y-1.5">
      <span className="inline-block px-1.5 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">
        Lo puede dejar fuera
      </span>
      {graves.length === 0 ? (
        <p className="text-sm text-gray-500">Nada a la vista</p>
      ) : (
        <ul className="space-y-2">
          {graves.map((g) => (
            <li key={g.que} className="space-y-0.5">
              <p className="text-sm text-gray-900">{g.que}</p>
              <p className="text-xs text-gray-600">Dónde se ve: {g.prueba}</p>
              <p className="text-xs text-gray-600">Regla: {g.regla}</p>
              {g.por_ausencia && (
                <p className="text-xs text-amber-800">
                  Es porque no aparece entre lo que llegó de este oferente.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
