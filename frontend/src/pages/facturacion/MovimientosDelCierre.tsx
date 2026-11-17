import type { CierreDeCaja } from "../../services/caja.service";
import { movimientosDe, TIPO } from "./tipoDeMovimiento";
import { Seccion } from "./PiezasDelDocumento";

// LOS INGRESOS Y LOS RETIROS DE UN CIERRE, PARA REVISARLOS (doc 19 §9.51).
// Los totales en líneas separadas y, por hora, cada movimiento con su chip,
// su motivo, la hora y quién lo anotó (si se sabe), y el monto con signo.
// Un ingreso no es venta: va aparte de «Lo vendido».

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function MovimientosDelCierre({
  cierre: c,
}: {
  readonly cierre: CierreDeCaja;
}) {
  const movimientos = movimientosDe(c);
  const ingresos = c.cuadre.ingresos ?? 0;
  return (
    <Seccion titulo="Movimientos del turno">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Ingresos{" "}
          <span className={`font-medium ${TIPO.ingreso.claseMonto}`}>
            +{clp(ingresos)}
          </span>
        </span>
        <span>
          Retiros{" "}
          <span className={`font-medium ${TIPO.retiro.claseMonto}`}>
            −{clp(c.cuadre.retiros)}
          </span>
        </span>
        {/* §9.56: lo gastado, aparte de los retiros. */}
        <span>
          Gastos{" "}
          <span className={`font-medium ${TIPO.gasto.claseMonto}`}>
            −{clp(c.cuadre.gastos ?? 0)}
          </span>
        </span>
      </div>
      {movimientos.length === 0 ? (
        <p className="text-xs text-gray-400">Sin movimientos.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {movimientos.map((m) => {
            const t = TIPO[m.tipo];
            return (
              <li
                key={`${m.tipo}-${m.id}`}
                className="flex items-center gap-2 py-1.5"
              >
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${t.claseChip}`}
                >
                  {t.chip}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate" title={m.motivo}>
                    {m.motivo}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {hora(m.creado_en)}
                    {m.creado_por_nombre ? ` · ${m.creado_por_nombre}` : ""}
                  </span>
                </span>
                <span
                  className={`whitespace-nowrap text-right font-medium ${t.claseMonto}`}
                >
                  {t.signo}
                  {clp(m.monto)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}
