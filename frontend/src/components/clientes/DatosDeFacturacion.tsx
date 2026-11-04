import { useState } from "react";
import { Pencil, Receipt } from "lucide-react";
import { toast } from "../toast/Toast";
import RutInput from "../inputs/RutInput";
import MultiSelect from "../MultiSelect";
import { updateClient } from "../../services/clients.service";
import { ClientFormData } from "../../types/clients.types";
import { formatearRut } from "../../utils/rut";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  BorradorDeFacturacion,
  ClienteConFacturacion,
  borradorDeFacturacion,
  cambiosDeFacturacion,
  problemaDeCorreos,
} from "../../utils/datosDeFacturacion";
import {
  LARGO_MAXIMO,
  REFERENCIAS_QUE_PIDE,
  nombreDeReferencia,
} from "../../constants/facturacion";

// DATOS DE FACTURACIÓN DEL CLIENTE (migración 184, doc 19 §5.1 y §9.3).
//
// Es lo que va en la factura de facturacion.cl: el RUT con su dígito
// verificador, la razón social, el giro, la dirección y los correos a los
// que facturacion.cl le manda el documento. Y las referencias que exige el
// cliente (CCU: la orden de compra y la nota de pedido), para que la
// factura no salga sin ellas.
//
// Cada casilla tiene el largo que cabe en la factura y lo cuenta mientras
// se escribe: nada se corta a escondidas al facturar (doc 19 §9.10).

const claseCasilla =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function Casilla({
  etiqueta,
  valor,
  largo,
  placeholder,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  largo: number;
  placeholder?: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-gray-500">
        {etiqueta}
        <span className={valor.length >= largo ? "text-amber-600" : ""}>
          {valor.length}/{largo}
        </span>
      </span>
      <input
        type="text"
        value={valor}
        maxLength={largo}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={claseCasilla}
      />
    </label>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-gray-500">{etiqueta}</dt>
      <dd className="text-gray-900 break-words min-w-0">{valor}</dd>
    </div>
  );
}

export default function DatosDeFacturacion({
  cliente,
  puedeEditar,
  alGuardar,
}: {
  cliente: ClienteConFacturacion;
  puedeEditar: boolean;
  /** Para refrescar la ficha y la lista tras guardar. */
  alGuardar: () => void;
}) {
  const [borrador, setBorrador] = useState<BorradorDeFacturacion | null>(null);
  const [rutValido, setRutValido] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const referencias = cliente.referencias_exigidas || [];
  const direccion = [
    cliente.direccion_facturacion,
    cliente.comuna,
    cliente.ciudad,
  ]
    .filter(Boolean)
    .join(", ");
  const vacio =
    !cliente.rut &&
    !cliente.razon_social &&
    !cliente.giro &&
    !direccion &&
    !cliente.correo_facturacion &&
    referencias.length === 0;

  const editar = () => {
    setBorrador(borradorDeFacturacion(cliente));
    setRutValido(true);
  };
  const poner = (
    campo: keyof BorradorDeFacturacion,
    valor: string | string[],
  ) => setBorrador((b) => b && { ...b, [campo]: valor });

  const problemaCorreos = borrador
    ? problemaDeCorreos(borrador.correo_facturacion)
    : null;
  const rutMalo = !!borrador?.rut && !rutValido;

  const guardar = async () => {
    if (!borrador || rutMalo || problemaCorreos) return;
    const cambios = cambiosDeFacturacion(cliente, borrador);
    if (Object.keys(cambios).length === 0) {
      setBorrador(null);
      return;
    }
    setGuardando(true);
    try {
      await updateClient(cambios as unknown as ClientFormData, cliente.id);
      alGuardar();
      toast.success("Datos de facturación guardados.");
      setBorrador(null);
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudieron guardar los datos."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Receipt size={18} /> Datos de facturación
        </h2>
        {puedeEditar && !borrador && (
          <button
            type="button"
            onClick={editar}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <Pencil size={13} /> {vacio ? "Agregar" : "Editar"}
          </button>
        )}
      </div>

      {borrador ? (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-gray-500">RUT</span>
            <RutInput
              value={borrador.rut}
              onChange={(rut, valido) => {
                poner("rut", rut);
                setRutValido(valido);
              }}
              placeholder="90.413.000-1"
              className="text-sm"
            />
          </label>
          <Casilla
            etiqueta="Razón social"
            valor={borrador.razon_social}
            largo={LARGO_MAXIMO.razon_social}
            onChange={(v) => poner("razon_social", v)}
          />
          <Casilla
            etiqueta="Giro"
            valor={borrador.giro}
            largo={LARGO_MAXIMO.giro}
            onChange={(v) => poner("giro", v)}
          />
          <Casilla
            etiqueta="Dirección"
            valor={borrador.direccion_facturacion}
            largo={LARGO_MAXIMO.direccion_facturacion}
            onChange={(v) => poner("direccion_facturacion", v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Casilla
              etiqueta="Comuna"
              valor={borrador.comuna}
              largo={LARGO_MAXIMO.comuna}
              onChange={(v) => poner("comuna", v)}
            />
            <Casilla
              etiqueta="Ciudad"
              valor={borrador.ciudad}
              largo={LARGO_MAXIMO.ciudad}
              onChange={(v) => poner("ciudad", v)}
            />
          </div>
          <Casilla
            etiqueta="Correos para la factura"
            valor={borrador.correo_facturacion}
            largo={LARGO_MAXIMO.correo_facturacion}
            placeholder="facturas@empresa.cl, pagos@empresa.cl"
            onChange={(v) => poner("correo_facturacion", v)}
          />
          {problemaCorreos && (
            <p className="text-xs text-red-600 font-medium">
              {problemaCorreos}
            </p>
          )}
          <div>
            <span className="text-xs text-gray-500">Referencias que pide</span>
            <MultiSelect
              options={REFERENCIAS_QUE_PIDE.map((r) => ({
                value: r.codigo,
                label: `${r.nombre} (${r.codigo})`,
              }))}
              value={borrador.referencias_exigidas}
              onChange={(v) => poner("referencias_exigidas", v)}
              placeholder="Ninguna"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={guardando || rutMalo || !!problemaCorreos}
              onClick={guardar}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setBorrador(null)}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : vacio ? (
        <p className="text-sm text-gray-500">Sin datos de facturación.</p>
      ) : (
        <dl className="space-y-1 text-sm">
          {cliente.rut && (
            <Dato etiqueta="RUT" valor={formatearRut(cliente.rut)} />
          )}
          {cliente.razon_social && (
            <Dato etiqueta="Razón social" valor={cliente.razon_social} />
          )}
          {cliente.giro && <Dato etiqueta="Giro" valor={cliente.giro} />}
          {direccion && <Dato etiqueta="Dirección" valor={direccion} />}
          {cliente.correo_facturacion && (
            <Dato etiqueta="Correos" valor={cliente.correo_facturacion} />
          )}
          {referencias.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-gray-500">Pide</dt>
              <dd className="flex flex-wrap gap-1">
                {referencias.map((codigo) => (
                  <span
                    key={codigo}
                    className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                  >
                    {nombreDeReferencia(codigo)}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
