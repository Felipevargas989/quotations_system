import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
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
// (doc 19 §9.20 y §9.22). Cada casilla con su contador: lo que cabe en la
// factura.
//
// EL RUT QUE LLENA TODO (§9.27; Felipe, 07-11: *"¿cómo lo podemos hacer
// para que al momento de facturar, el sistema cargue todo solo con el
// RUT?"*): con un RUT válido, busca la razón social guardada en Eventia y,
// si no, la de la nómina del SII, llena lo que está vacío (lo escrito a
// mano no se pisa) y dice de dónde salió.
//
// EL RUT ARRIBA (Felipe, 08-11: *"el rut debería aparecer arriba de los
// primeros para ingresar, así el resto se rellena solo y se achura"*; vio
// la maqueta y dijo *"hazlo así"*): primero el RUT, después la razón
// social, el giro, la dirección con la comuna y la ciudad, y los correos.
// - Lo que trajo el RUT queda achurado, para no tocarlo por error, y
//   «Corregir datos» lo abre: el SII puede estar atrasado, o el cliente
//   pide la dirección de una sucursal (el SII trae la casa matriz). Lo que
//   ya estaba o se escribe a mano queda abierto, y lo que no cabe en la
//   factura también.
// - Con más de una actividad en el SII, el giro se elige de una lista.
// - Otro RUT reemplaza lo que trajo el anterior (y si no lo encuentra, lo
//   vacía); lo escrito a mano se queda.
// - Los correos, siempre abiertos: si no venían, al emitir quedan en la
//   ficha del cliente y la próxima vez se llenan solos (`recordarReceptor`
//   en el motor).

type Campo = keyof Receptor;

/** Lo que trajo el RUT, casilla por casilla. */
type Llenados = Partial<Record<Campo, string>>;

const QUE_SE_LLENA: [Campo, keyof RazonSocialEncontrada][] = [
  ["razon_social", "razon_social"],
  ["giro", "giro"],
  ["direccion", "direccion"],
  ["comuna", "comuna"],
  ["ciudad", "ciudad"],
  ["correo", "correo_facturacion"],
];

/** Lo que se achura (los correos no) y lo que cabe en la factura. */
const ACHURABLES: [Campo, number][] = [
  ["razon_social", LARGO_MAXIMO.razon_social],
  ["giro", LARGO_MAXIMO.giro],
  ["direccion", LARGO_MAXIMO.direccion],
  ["comuna", LARGO_MAXIMO.comuna],
  ["ciudad", LARGO_MAXIMO.ciudad],
];

export default function CamposDelReceptor({
  receptor: r,
  onChange,
  onLlenar,
  rutFijo = false,
  faltan = [],
}: {
  readonly receptor: Receptor;
  readonly onChange: (campo: keyof Receptor, valor: string) => void;
  /** Varias casillas de una vez (lo que trae el RUT). Sin él, una por una
   *  con `onChange`. */
  readonly onLlenar?: (datos: Partial<Receptor>) => void;
  /** La razón social ya guardada: su RUT no se cambia acá. */
  readonly rutFijo?: boolean;
  /** §9.32: los campos que el SII pide y no están (`faltan` de la revisión
   *  del motor): van en rojo en su casilla. */
  readonly faltan?: readonly string[];
}) {
  const [encontrada, setEncontrada] = useState<RazonSocialEncontrada | null>(
    null,
  );
  const [lleno, setLleno] = useState(false);
  const [llenados, setLlenados] = useState<Llenados>({});
  const [abiertos, setAbiertos] = useState(false);
  const actual = useRef(r);
  actual.current = r;
  const deEsteRut = useRef<Llenados>({});
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
          const ahora = actual.current;
          const antes = deEsteRut.current;
          // Lo que trajo el RUT anterior y nadie cambió.
          const delAnterior = (campo: Campo) =>
            antes[campo] !== undefined && (ahora[campo] ?? "") === antes[campo];
          const datos: Partial<Receptor> = {};
          const nuevos: Llenados = {};
          for (const [campo, deDonde] of QUE_SE_LLENA) {
            const valor = e?.[deDonde];
            if (
              typeof valor === "string" &&
              valor &&
              (!ahora[campo]?.trim() || delAnterior(campo))
            ) {
              datos[campo] = valor as never;
              nuevos[campo] = valor;
            } else if (delAnterior(campo)) datos[campo] = "" as never;
          }
          deEsteRut.current = nuevos;
          setLlenados(nuevos);
          const trajo = Object.keys(nuevos).length > 0;
          setLleno(trajo);
          if (trajo) setAbiertos(false);
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

  /** Lo que trajo el RUT y sigue igual: achurado, salvo que no quepa en la
   *  factura. */
  const achurada = (campo: Campo) => {
    const trajo = llenados[campo];
    if (abiertos || trajo === undefined || (r[campo] ?? "") !== trajo)
      return false;
    const largo = ACHURABLES.find(([c]) => c === campo)?.[1];
    return !(largo && Array.from(trajo).length > largo);
  };

  // Con más de una actividad, el giro se elige de una lista (08-11).
  const actividades = encontrada?.giros ?? [];
  const giros = Array.from(new Set([r.giro ?? "", ...actividades])).filter(
    Boolean,
  );
  const conLista = !abiertos && giros.length > 1;
  const elegirGiro = (g: string) => {
    onChange("giro", g);
    // La actividad elegida sigue siendo de este RUT: otro RUT la reemplaza.
    const nuevos = { ...deEsteRut.current, giro: g };
    deEsteRut.current = nuevos;
    setLlenados(nuevos);
  };
  const hayQueCorregir =
    !abiertos && (conLista || ACHURABLES.some(([c]) => achurada(c)));
  const falta = (campo: Campo) => faltan.includes(campo);

  return (
    <div className="space-y-2">
      <div className="sm:max-w-xs">
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
      </div>
      {encontrada && lleno && (
        <p className="text-xs text-violet-700">
          {encontrada.origen === "sii"
            ? "Llenado con la nómina del SII."
            : `Llenado con la ficha${encontrada.cliente ? ` de ${encontrada.cliente}` : ""}.`}
        </p>
      )}
      <Casilla
        etiqueta="Razón social"
        valor={r.razon_social}
        largo={LARGO_MAXIMO.razon_social}
        bloqueada={achurada("razon_social")}
        falta={falta("razon_social")}
        onChange={(v) => onChange("razon_social", v)}
      />
      {conLista ? (
        <div>
          <span className={claseTitulo}>
            <span>
              Giro
              {falta("giro") && (
                <span className="font-semibold text-red-600"> · falta</span>
              )}
            </span>
            {actividades.length > 1 && (
              <span>{actividades.length} actividades en el SII</span>
            )}
          </span>
          <div
            className={falta("giro") ? "rounded-lg ring-1 ring-red-400" : ""}
          >
            <SelectWithSearch
              options={giros.map((g) => ({ value: g, label: g }))}
              value={r.giro ?? ""}
              onChange={(g) => g && elegirGiro(g)}
              placeholder="Elegir el giro"
              searchPlaceholder="Buscar la actividad..."
              tamano="sm"
              sinLimpiar
              mostrarConteo={false}
            />
          </div>
        </div>
      ) : (
        <Casilla
          etiqueta="Giro"
          valor={r.giro}
          largo={LARGO_MAXIMO.giro}
          bloqueada={achurada("giro")}
          falta={falta("giro")}
          onChange={(v) => onChange("giro", v)}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Casilla
          etiqueta="Dirección"
          valor={r.direccion}
          largo={LARGO_MAXIMO.direccion}
          bloqueada={achurada("direccion")}
          falta={falta("direccion")}
          onChange={(v) => onChange("direccion", v)}
        />
        <Casilla
          etiqueta="Comuna"
          valor={r.comuna}
          largo={LARGO_MAXIMO.comuna}
          bloqueada={achurada("comuna")}
          falta={falta("comuna")}
          onChange={(v) => onChange("comuna", v)}
        />
        <Casilla
          etiqueta="Ciudad"
          valor={r.ciudad}
          largo={LARGO_MAXIMO.ciudad}
          bloqueada={achurada("ciudad")}
          onChange={(v) => onChange("ciudad", v)}
        />
      </div>
      {hayQueCorregir && (
        <button
          type="button"
          onClick={() => setAbiertos(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          Corregir datos
        </button>
      )}
      <div>
        <Casilla
          etiqueta="Correos (facturacion.cl le manda la factura)"
          valor={r.correo}
          largo={LARGO_MAXIMO.correo_facturacion}
          onChange={(v) => onChange("correo", v)}
        />
        {!r.correo?.trim() && (
          <p className="mt-1 text-xs text-gray-500">
            Queda guardado en el cliente al emitir: la próxima vez se llena
            solo.
          </p>
        )}
      </div>
    </div>
  );
}
