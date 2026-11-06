import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import { Plus, Trash2 } from "lucide-react";
import {
  LARGO_MAXIMO,
  REFERENCIAS_QUE_PIDE,
} from "../../../constants/facturacion";
import type {
  BorradorDelDte,
  DtePedido,
  Receptor,
  ReferenciaPedida,
} from "../../../services/facturas.service";
import { formatearRut } from "../../../utils/rut";
import Casilla, { CasillaDelRut } from "./CasillaDeLaFactura";
import { OTRA, claseCasilla } from "./datosDeLaFactura";

// Las referencias en UNA grilla: los títulos y cada referencia comparten
// las columnas, así cada título queda sobre su casilla. El tipo va en su
// caja, y «+ Agregar referencia» es un botón azul chico, como «+ Agregar
// línea» (Felipe, 05-11).
const COLUMNAS = "sm:grid-cols-[13rem_1fr_9.5rem_7.5rem_1.25rem]";
const TITULO = "hidden self-end text-xs leading-tight text-gray-500 sm:block";

/** «Editar receptor y referencias» de la factura (E4): a quién va y las
 *  referencias, antes de emitir. Las líneas se editan en el DTE mismo. */
export default function EditarReceptor({
  pedida,
  inicial,
  otra,
  elegirLaRazon,
  poner,
  ponerReceptor,
  ponerReferencia,
  siempre,
  elegirRazon,
}: {
  readonly pedida: DtePedido;
  readonly inicial: BorradorDelDte;
  readonly otra: boolean;
  readonly elegirLaRazon: boolean;
  readonly poner: (c: Partial<DtePedido>) => void;
  readonly ponerReceptor: (campo: keyof Receptor, valor: string) => void;
  readonly ponerReferencia: (i: number, c: Partial<ReferenciaPedida>) => void;
  readonly siempre: (codigo: string, si: boolean) => void;
  readonly elegirRazon: (rut: string) => void;
}) {
  const r = pedida.receptor;
  const sinUsar = REFERENCIAS_QUE_PIDE.filter(
    (x) => !pedida.referencias.some((y) => y.tipo === x.codigo),
  );
  // Otro tipo en la caja: la referencia lo toma, y si se pedía siempre,
  // se pide siempre el nuevo.
  const cambiarTipo = (antes: string, ahora: string) =>
    poner({
      referencias: pedida.referencias.map((y) =>
        y.tipo === antes ? { ...y, tipo: ahora } : y,
      ),
      pedir_siempre: pedida.pedir_siempre.map((c) => (c === antes ? ahora : c)),
    });
  return (
    <div className="space-y-3 rounded-lg bg-white p-3 border border-gray-200">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">A nombre de</p>
        {elegirLaRazon && (
          <SelectWithSearch
            options={[
              ...inicial.razones.map((x) => ({
                value: x.rut,
                label: x.razon_social,
                hint: formatearRut(x.rut),
              })),
              { value: OTRA, label: "Otra razón social…" },
            ]}
            value={
              otra
                ? OTRA
                : inicial.razones.some((x) => x.rut === r.rut)
                  ? r.rut
                  : ""
            }
            onChange={(v) => v && elegirRazon(v)}
            placeholder="Elegir la razón social"
            tamano="sm"
          />
        )}
        {/* El orden que aprobó Felipe (05-11): la razón social entera,
            el RUT con el giro, la dirección con la comuna y la ciudad. */}
        <Casilla
          etiqueta="Razón social"
          valor={r.razon_social}
          largo={LARGO_MAXIMO.razon_social}
          onChange={(v) => ponerReceptor("razon_social", v)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <CasillaDelRut
            valor={r.rut}
            onChange={(rut) => ponerReceptor("rut", rut)}
          />
          <Casilla
            etiqueta="Giro"
            valor={r.giro}
            largo={LARGO_MAXIMO.giro}
            onChange={(v) => ponerReceptor("giro", v)}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <Casilla
            etiqueta="Dirección"
            valor={r.direccion}
            largo={LARGO_MAXIMO.direccion}
            onChange={(v) => ponerReceptor("direccion", v)}
          />
          <Casilla
            etiqueta="Comuna"
            valor={r.comuna}
            largo={LARGO_MAXIMO.comuna}
            onChange={(v) => ponerReceptor("comuna", v)}
          />
          <Casilla
            etiqueta="Ciudad"
            valor={r.ciudad}
            largo={LARGO_MAXIMO.ciudad}
            onChange={(v) => ponerReceptor("ciudad", v)}
          />
        </div>
        <Casilla
          etiqueta="Correos (facturacion.cl le manda la factura)"
          valor={r.correo}
          largo={LARGO_MAXIMO.correo_facturacion}
          onChange={(v) => ponerReceptor("correo", v)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">Referencias</p>
        {pedida.referencias.length > 0 && (
          <div className={`grid items-center gap-2 ${COLUMNAS}`}>
            <span className={TITULO}>Tipo</span>
            <span className={TITULO}>N°</span>
            <span className={TITULO}>Fecha</span>
            <span className={TITULO}>Pedirla siempre a este cliente</span>
            <span className="hidden sm:block" />
            {pedida.referencias.map((x, i) => (
              <div key={x.tipo} className="contents">
                <SelectWithSearch
                  options={REFERENCIAS_QUE_PIDE.filter(
                    (t) =>
                      t.codigo === x.tipo ||
                      !pedida.referencias.some((y) => y.tipo === t.codigo),
                  ).map((t) => ({
                    value: t.codigo,
                    label: `${t.codigo} · ${t.nombre}`,
                  }))}
                  value={x.tipo}
                  onChange={(v) => v && cambiarTipo(x.tipo, v)}
                  tamano="sm"
                  sinLimpiar
                  mostrarConteo={false}
                />
                <input
                  type="text"
                  value={x.folio}
                  maxLength={18}
                  placeholder="N°"
                  onChange={(e) =>
                    ponerReferencia(i, { folio: e.target.value })
                  }
                  className={claseCasilla}
                />
                <input
                  type="date"
                  value={x.fecha}
                  onChange={(e) =>
                    ponerReferencia(i, { fecha: e.target.value })
                  }
                  className={claseCasilla}
                />
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    aria-label="Pedirla siempre a este cliente"
                    checked={pedida.pedir_siempre.includes(x.tipo)}
                    onChange={(e) => siempre(x.tipo, e.target.checked)}
                  />
                  <span className="sm:hidden">
                    Pedirla siempre a este cliente
                  </span>
                </label>
                <button
                  type="button"
                  title="Quitar la referencia"
                  onClick={() =>
                    poner({
                      referencias: pedida.referencias.filter((_, j) => j !== i),
                    })
                  }
                  className="text-gray-400 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {sinUsar.length > 0 && (
          <button
            type="button"
            onClick={() =>
              poner({
                referencias: [
                  ...pedida.referencias,
                  { tipo: sinUsar[0].codigo, folio: "", fecha: "" },
                ],
              })
            }
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <Plus size={13} /> Agregar referencia
          </button>
        )}
      </div>
    </div>
  );
}
