import { useEffect, useRef, useState } from "react";
import { LARGO_MAXIMO } from "../../../constants/facturacion";
import {
  buscarRazonSocial,
  type RazonSocialEncontrada,
  type Receptor,
} from "../../../services/facturas.service";
import { formatearRut, normalizarRut, rutEsValido } from "../../../utils/rut";
import Casilla, { CasillaDelRut } from "./CasillaDeLaFactura";
import { claseTitulo } from "./datosDeLaFactura";

// A QUIÉN VA LA FACTURA: los datos de facturación del receptor, los mismos
// en «Editar receptor y referencias» del evento y en «Nuevo documento»
// (doc 19 §9.20 y §9.22). El orden que aprobó Felipe (05-11): la razón
// social entera, el RUT con el giro, la dirección con la comuna y la
// ciudad, y los correos. Cada casilla con su contador: lo que cabe en la
// factura.
//
// EL RUT QUE LLENA TODO (§9.27; Felipe, 07-11: *"¿cómo lo podemos hacer
// para que al momento de facturar, el sistema cargue todo solo con el
// RUT?"*): con un RUT válido, busca la razón social guardada en Eventia y,
// si no, la de la nómina del SII, y llena SOLO lo que está vacío (lo
// escrito a mano no se pisa). Del SII, sus otras actividades se ofrecen
// como giro con un clic, y se dice de dónde salió.

type Campo = keyof Receptor;
const QUE_SE_LLENA: [Campo, keyof RazonSocialEncontrada][] = [
  ["razon_social", "razon_social"],
  ["giro", "giro"],
  ["direccion", "direccion"],
  ["comuna", "comuna"],
  ["ciudad", "ciudad"],
  ["correo", "correo_facturacion"],
];

export default function CamposDelReceptor({
  receptor: r,
  onChange,
  onLlenar,
  rutFijo = false,
}: {
  readonly receptor: Receptor;
  readonly onChange: (campo: keyof Receptor, valor: string) => void;
  /** Varias casillas de una vez (lo que trae el RUT). Sin él, una por una
   *  con `onChange`. */
  readonly onLlenar?: (datos: Partial<Receptor>) => void;
  /** La razón social ya guardada: su RUT no se cambia acá. */
  readonly rutFijo?: boolean;
}) {
  const [encontrada, setEncontrada] = useState<RazonSocialEncontrada | null>(
    null,
  );
  const [lleno, setLleno] = useState(false);
  const actual = useRef(r);
  actual.current = r;
  const llenar = useRef(onLlenar ?? null);
  llenar.current = onLlenar ?? null;
  const cambiar = useRef(onChange);
  cambiar.current = onChange;
  const buscado = useRef<string | null>(null);

  const canonico =
    !rutFijo && r.rut && rutEsValido(r.rut) ? normalizarRut(r.rut) : null;
  useEffect(() => {
    if (!canonico || canonico === buscado.current) return;
    const espera = setTimeout(() => {
      buscado.current = canonico;
      // Dentro de la promesa: si la búsqueda no está (o falla), no pasa
      // nada y se escribe a mano.
      Promise.resolve()
        .then(() => buscarRazonSocial(canonico))
        .then((e) => {
          setEncontrada(e);
          if (!e) return setLleno(false);
          const ahora = actual.current;
          const datos: Partial<Receptor> = {};
          for (const [campo, deDonde] of QUE_SE_LLENA) {
            const valor = e[deDonde];
            if (typeof valor === "string" && valor && !ahora[campo]?.trim())
              datos[campo] = valor as never;
          }
          setLleno(Object.keys(datos).length > 0);
          if (!Object.keys(datos).length) return;
          if (llenar.current) llenar.current(datos);
          else
            for (const [campo, valor] of Object.entries(datos))
              cambiar.current(campo as Campo, valor as string);
        })
        .catch(() => setEncontrada(null));
    }, 350);
    return () => clearTimeout(espera);
  }, [canonico]);

  const otrosGiros = (encontrada?.giros ?? []).filter((g) => g !== r.giro);

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
      {encontrada && lleno && (
        <p className="text-xs text-violet-700">
          {encontrada.origen === "sii"
            ? "Llenado con la nómina del SII: revisa el giro y la dirección."
            : `Llenado con la ficha${encontrada.cliente ? ` de ${encontrada.cliente}` : ""}.`}
        </p>
      )}
      {encontrada?.origen === "sii" && otrosGiros.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-500">Otras actividades en el SII:</span>
          {otrosGiros.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange("giro", g)}
              className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50"
            >
              {g}
            </button>
          ))}
        </div>
      )}
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
