import { useEffect, useRef, type ReactNode } from "react";
import { PLAZOS_DE_PAGO } from "../../constants/facturacion";
import type {
  DtePedido,
  TipoDeDte,
  VistaPrevia,
} from "../../services/facturas.service";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import {
  claseCasilla,
  claseTitulo,
} from "../postventa/facturacion/datosDeLaFactura";
import { Seccion } from "./PiezasDelDocumento";

// LA SECCIÓN «DOCUMENTO» DEL DTE QUE SE ARMA (doc 19 §9.32; Felipe, 08-11:
// *"no me gustan todos estos chip... se pueden mejorar"* y *"si arreglas
// esta pieza también se arregla desde el botón + nuevo DTE"*). La misma en
// la factura de «Nuevo DTE» y en «Corregir» de la revisión: el tipo, de
// dónde se llena (solo el evento), la fecha de emisión y la condición de
// pago, cada uno en su lista, sin chips. Debajo, solo el vencimiento.
//
// La fecha de emisión (§9.32): la de hoy si no se elige, y se puede elegir
// dentro del rango que da el motor (`emision` de la revisión: nunca futura;
// hasta el día 20, también el mes anterior). La boleta va con la del día.

const NOMBRE: Record<TipoDeDte, string> = {
  33: "Factura electrónica",
  39: "Boleta electrónica",
};

const claseFija =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600";

function Campo({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className={claseTitulo}>{titulo}</span>
      {children}
    </label>
  );
}

/**
 * La fecha de emisión, sin control de React mientras se escribe: al ir
 * escribiendo el día y el mes la fecha pasa por estados que no existen
 * («31-11»), el navegador da un valor vacío, y una casilla controlada
 * volvía sola a la fecha de antes (medido en el laboratorio el 08-11). Sube
 * solo una fecha completa, y toma la de afuera cuando no se está
 * escribiendo en ella.
 */
function FechaDeEmision({
  valor,
  rango,
  onElegir,
}: {
  readonly valor: string;
  readonly rango: { desde: string; hasta: string };
  readonly onElegir: (fecha: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.value !== valor)
      el.value = valor;
  }, [valor]);
  return (
    <input
      ref={ref}
      type="date"
      defaultValue={valor}
      min={rango.desde}
      max={rango.hasta}
      title={`Del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`}
      onChange={(e) => {
        if (e.target.value) onElegir(e.target.value);
      }}
      onBlur={(e) => {
        // A medio escribir: vuelve a la que vale.
        if (!e.target.value) e.target.value = valor;
      }}
      className={claseCasilla}
    />
  );
}

/** «contado», o los días del crédito («30», «45», «60»). */
const condicionDe = (p: DtePedido) =>
  p.forma_de_pago === 1 ? "contado" : String(p.plazo_dias ?? 30);

export default function SeccionDocumento({
  pedida,
  vista,
  onChange,
  onTipo,
  fuentes,
  fuente,
  onFuente,
}: {
  readonly pedida: DtePedido;
  /** La revisión del motor: la fecha que sale, su rango y el vencimiento. */
  readonly vista: VistaPrevia | null;
  readonly onChange: (cambios: Partial<DtePedido>) => void;
  /** Con él, el tipo se elige (el evento); sin él, va fijo. */
  readonly onTipo?: (tipo: TipoDeDte) => void;
  /** De dónde se llena (el evento): sus OC con saldo y la cotización. */
  readonly fuentes?: readonly { valor: string; etiqueta: string }[];
  readonly fuente?: string;
  readonly onFuente?: (valor: string) => void;
}) {
  const factura = pedida.tipo === 33;
  const rango = factura ? (vista?.emision ?? null) : null;
  const contado = pedida.forma_de_pago === 1;
  const dias = pedida.plazo_dias ?? 30;
  const vencimiento = vista?.pago?.vencimiento ?? null;
  return (
    <Seccion titulo="Documento">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo titulo="Tipo">
          {onTipo ? (
            <select
              value={pedida.tipo}
              onChange={(e) => onTipo(Number(e.target.value) as TipoDeDte)}
              className={claseCasilla}
            >
              <option value={33}>{NOMBRE[33]}</option>
              <option value={39}>{NOMBRE[39]}</option>
            </select>
          ) : (
            <p className={claseFija}>{NOMBRE[pedida.tipo]}</p>
          )}
        </Campo>
        {onFuente && fuentes && fuentes.length > 0 && (
          <Campo titulo="Se llena desde">
            <select
              value={fuente}
              onChange={(e) => onFuente(e.target.value)}
              className={claseCasilla}
            >
              {fuentes.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo titulo="Fecha de emisión">
          {rango ? (
            <FechaDeEmision
              valor={pedida.fecha_emision ?? vista?.fecha ?? ""}
              rango={rango}
              onElegir={(fecha) => onChange({ fecha_emision: fecha })}
            />
          ) : (
            <p className={claseFija}>{vista ? fechaCorta(vista.fecha) : "—"}</p>
          )}
        </Campo>
        {factura && (
          <Campo titulo="Condición de pago">
            <select
              value={condicionDe(pedida)}
              onChange={(e) =>
                onChange(
                  e.target.value === "contado"
                    ? { forma_de_pago: 1, plazo_dias: null }
                    : { forma_de_pago: 2, plazo_dias: Number(e.target.value) },
                )
              }
              className={claseCasilla}
            >
              {PLAZOS_DE_PAGO.map((d) => (
                <option key={d} value={String(d)}>
                  Crédito {d} días
                </option>
              ))}
              <option value="contado">Contado</option>
            </select>
          </Campo>
        )}
      </div>
      {factura && !contado && vencimiento && (
        <p className="text-right text-xs text-gray-500">
          vence {fechaCorta(vencimiento)}
        </p>
      )}
      {factura && !contado && dias > 30 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Más de 30 días solo si lo dicen las bases de una licitación pública
          (hasta 60), o con un acuerdo escrito inscrito en el Ministerio de
          Economía (Ley 19.983).
        </p>
      )}
    </Seccion>
  );
}
