import { LARGO_MAXIMO } from "../../../constants/facturacion";
import type { Receptor } from "../../../services/facturas.service";
import { formatearRut } from "../../../utils/rut";
import Casilla, { CasillaDelRut } from "./CasillaDeLaFactura";
import { claseTitulo } from "./datosDeLaFactura";

// A QUIÉN VA LA FACTURA: los datos de facturación del receptor, los mismos
// en «Editar receptor y referencias» del evento y en «Nuevo documento»
// (doc 19 §9.20 y §9.22). El orden que aprobó Felipe (05-11): la razón
// social entera, el RUT con el giro, la dirección con la comuna y la
// ciudad, y los correos. Cada casilla con su contador: lo que cabe en la
// factura.

export default function CamposDelReceptor({
  receptor: r,
  onChange,
  rutFijo = false,
}: {
  readonly receptor: Receptor;
  readonly onChange: (campo: keyof Receptor, valor: string) => void;
  /** La razón social ya guardada: su RUT no se cambia acá. */
  readonly rutFijo?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Casilla
        etiqueta="Razón social"
        valor={r.razon_social}
        largo={LARGO_MAXIMO.razon_social}
        onChange={(v) => onChange("razon_social", v)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {rutFijo ? (
          <div>
            <span className={claseTitulo}>RUT</span>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {formatearRut(r.rut)}
            </p>
          </div>
        ) : (
          <CasillaDelRut
            valor={r.rut}
            onChange={(rut) => onChange("rut", rut)}
          />
        )}
        <Casilla
          etiqueta="Giro"
          valor={r.giro}
          largo={LARGO_MAXIMO.giro}
          onChange={(v) => onChange("giro", v)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Casilla
          etiqueta="Dirección"
          valor={r.direccion}
          largo={LARGO_MAXIMO.direccion}
          onChange={(v) => onChange("direccion", v)}
        />
        <Casilla
          etiqueta="Comuna"
          valor={r.comuna}
          largo={LARGO_MAXIMO.comuna}
          onChange={(v) => onChange("comuna", v)}
        />
        <Casilla
          etiqueta="Ciudad"
          valor={r.ciudad}
          largo={LARGO_MAXIMO.ciudad}
          onChange={(v) => onChange("ciudad", v)}
        />
      </div>
      <Casilla
        etiqueta="Correos (facturacion.cl le manda la factura)"
        valor={r.correo}
        largo={LARGO_MAXIMO.correo_facturacion}
        onChange={(v) => onChange("correo", v)}
      />
    </div>
  );
}
