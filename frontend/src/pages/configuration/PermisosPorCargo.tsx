import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import Interruptor from "../../components/Interruptor";
import { toast } from "../../components/toast/Toast";
import { Permiso, UserRole } from "../../constants/permissions";
import {
  PantallaDePermisos,
  cambiarPermiso,
  cambiarTipo,
  getPermisos,
  volverAFabrica,
} from "../../services/permisos.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { NOMBRE_DEL_CARGO, textoDelUltimoCambio } from "./ultimoCambio";

// PERMISOS POR CARGO (doc 22, 05-11-2026): la maqueta que aprobó Felipe
// («si me parece perfecto»). Filas = permisos agrupados por área;
// columnas = los cuatro cargos; cada celda, un interruptor. Arriba
// «Volver a lo de fábrica»; abajo, el último cambio.
//
// Rige al instante: el motor guarda, anota quién y olvida su memoria. Lo
// que el plan no trae y lo que es fijo del administrador vienen con
// candado desde el motor, que además rechaza moverlos.
//
// Debajo, «Tipos de cliente» (doc 22 §9; Felipe, 05-11-2026: "un botón que
// prende y se apaga"): qué tipos trabaja cada cargo, en todas las
// secciones. Sin candados: los cuatro cargos se editan.

const NOMBRE_DEL_AREA: Record<string, string> = {
  comercial: "Comercial",
  operacion: "Operación",
  facturacion: "Facturación",
  administracion: "Administración",
};

const MOTIVO_DEL_CANDADO = {
  fijo: "Fijo: es del administrador y de nadie más",
  plan: "No está incluido en tu plan",
} as const;

/** Los 403 que ya avisó `services/api.ts` con su mensaje propio. */
const yaAvisado = (e: unknown): boolean =>
  ["SIN_DERECHO", "SIN_PERMISO", "SIN_CUPO", "PLAN_BLOQUEADO"].includes(
    String(
      (e as { response?: { data?: { codigo?: string } } })?.response?.data
        ?.codigo,
    ),
  );

export default function PermisosPorCargo() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["permisos-por-cargo"],
    queryFn: getPermisos,
  });
  const [guardando, setGuardando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [volviendo, setVolviendo] = useState(false);

  const alGuardar = (pantalla: PantallaDePermisos) => {
    queryClient.setQueryData(["permisos-por-cargo"], pantalla);
    // Si cambió algo del propio cargo, el menú se pone al día.
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  const cambiar = async (
    permiso: Permiso,
    cargo: UserRole,
    prendido: boolean,
  ) => {
    setGuardando(`${permiso}:${cargo}`);
    try {
      alGuardar(await cambiarPermiso({ cargo, permiso, prendido }));
    } catch (e) {
      if (!yaAvisado(e)) toast.error(humanizeApiError(e));
    } finally {
      setGuardando(null);
    }
  };

  const cambiarElTipo = async (
    tipo: number,
    cargo: UserRole,
    prendido: boolean,
  ) => {
    setGuardando(`tipo:${tipo}:${cargo}`);
    try {
      alGuardar(await cambiarTipo({ cargo, tipo, prendido }));
    } catch (e) {
      if (!yaAvisado(e)) toast.error(humanizeApiError(e));
    } finally {
      setGuardando(null);
    }
  };

  const aFabrica = async () => {
    setVolviendo(true);
    try {
      alGuardar(await volverAFabrica());
      setConfirmando(false);
    } catch (e) {
      if (!yaAvisado(e)) toast.error(humanizeApiError(e));
    } finally {
      setVolviendo(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-red-600">
        No se pudieron leer los permisos. Intenta de nuevo en un minuto.
      </p>
    );
  }

  const areas = [...new Set(data.permisos.map((p) => p.area))];
  const tipos = data.tipos ?? [];
  const nombreDe = (clave: string) => {
    if (clave.startsWith("tipo_cliente:")) {
      const t = tipos.find((x) => `tipo_cliente:${x.id}` === clave);
      return t ? `el tipo «${t.nombre}»` : "un tipo de cliente";
    }
    return data.permisos.find((p) => p.clave === clave)?.nombre ?? clave;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {confirmando ? (
          <ConfirmInline
            question="¿Volver todos los cargos a lo de fábrica?"
            yesLabel="Sí, volver"
            tono="normal"
            busy={volviendo}
            onYes={aFabrica}
            onNo={() => setConfirmando(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={data.deFabrica}
            title={data.deFabrica ? "Ya está todo de fábrica" : undefined}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            Volver a lo de fábrica
          </button>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                Permiso
              </th>
              {data.cargos.map((c) => (
                <th
                  key={c}
                  className="px-4 py-3 text-center font-medium text-gray-500"
                >
                  {NOMBRE_DEL_CARGO[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <Fragment key={area}>
                <tr className="bg-gray-50">
                  <td
                    colSpan={data.cargos.length + 1}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {NOMBRE_DEL_AREA[area] ?? area}
                  </td>
                </tr>
                {data.permisos
                  .filter((p) => p.area === area)
                  .map((p) => (
                    <tr key={p.clave} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-900">{p.nombre}</td>
                      {data.cargos.map((c) => (
                        <td key={c} className="px-4 py-3 text-center">
                          <Interruptor
                            prendido={p.celdas[c].prendido}
                            etiqueta={`${p.nombre} de ${NOMBRE_DEL_CARGO[c]}`}
                            candado={p.candado !== null}
                            motivo={
                              p.candado
                                ? MOTIVO_DEL_CANDADO[p.candado]
                                : undefined
                            }
                            ocupado={guardando === `${p.clave}:${c}`}
                            onCambiar={(prendido) =>
                              cambiar(p.clave, c, prendido)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
            {tipos.length > 0 && (
              <tr className="bg-gray-50">
                <td
                  colSpan={data.cargos.length + 1}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Tipos de cliente
                </td>
              </tr>
            )}
            {tipos.map((t) => (
              <tr key={`tipo-${t.id}`} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-900">{t.nombre}</td>
                {data.cargos.map((c) => (
                  <td key={c} className="px-4 py-3 text-center">
                    <Interruptor
                      prendido={t.celdas[c].prendido}
                      etiqueta={`${t.nombre} de ${NOMBRE_DEL_CARGO[c]}`}
                      ocupado={guardando === `tipo:${t.id}:${c}`}
                      onCambiar={(prendido) => cambiarElTipo(t.id, c, prendido)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500">
        {textoDelUltimoCambio(data.ultimoCambio, nombreDe)}
      </p>
    </div>
  );
}
