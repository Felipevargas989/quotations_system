import { useState } from "react";
import Modal from "../../components/Modal";
import type {
  CierreEnLaLista,
  GastoDeLaSemana,
  ResumenDeLaCadena,
} from "../../services/caja.service";
import { TIPO } from "./tipoDeMovimiento";

// LA CADENA DEL EFECTIVO (doc 19 §9.54). Felipe, 16-11, mirando la lista de
// cierres: *"para que el abrió con tenga sentido necesitamos otra que diga
// cerró con o no? … mira cómo debo leer esto?"*. Cada turno en efectivo:
// con cuánto abrió, cuánto debía tener y con cuánto cerró; aparte, las
// tarjetas y transferencias. Entre un turno y el anterior, una franja dice si
// el efectivo pasó completo. Arriba, las tres cifras de los últimos 7 días
// y, desde el §9.57, los gastos de esos 7 días, que al tocarlos dicen en qué
// se gastó. Solo la ve quien revisa los cierres.

const pesos = (n: number) =>
  `$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const dos = (n: number) => String(n).padStart(2, "0");
/** «19:11», siempre en 24 horas. */
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
};
/** «16-11». */
const fecha = (iso: string) => {
  const d = new Date(iso);
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}`;
};
/** «lun 16-11». */
const diaCorto = (iso: string) =>
  `${new Date(iso).toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "")} ${fecha(iso)}`;

/** «lun 16-11 · 11:22 a 19:11»; si cerró otro día, «a 17-11 02:10»;
 *  abierto, solo la hora de apertura. */
const horarioDelTurno = (
  c: Pick<CierreEnLaLista, "abierta_en" | "cerrada_en">,
) => {
  const inicio = `${diaCorto(c.abierta_en)} · ${hora(c.abierta_en)}`;
  if (!c.cerrada_en) return inicio;
  const otroDia = fecha(c.cerrada_en) !== fecha(c.abierta_en);
  return `${inicio} a ${otroDia ? `${fecha(c.cerrada_en)} ` : ""}${hora(c.cerrada_en)}`;
};

const chip =
  "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold";
const VERDE = `${chip} border-green-200 bg-green-50 text-green-700`;
const ROJO = `${chip} border-red-200 bg-red-50 text-red-700`;
const AMBAR = `${chip} border-amber-200 bg-amber-50 text-amber-800`;
const AZUL = `${chip} border-blue-200 bg-blue-50 text-blue-700`;

/** «Cuadra» verde, o «Faltan $X» / «Sobran $X» rojo; sin dato, «—». */
function Diferencia({ valor }: { readonly valor: number | null | undefined }) {
  if (valor == null) return <span className="text-gray-400">—</span>;
  if (valor === 0) return <span className={VERDE}>Cuadra</span>;
  return (
    <span className={ROJO}>
      {valor < 0 ? "Faltan" : "Sobran"} {pesos(valor)}
    </span>
  );
}

/** El estado en una palabra; el resultado de la revisión, en el title. */
function Estado({ c }: { readonly c: CierreEnLaLista }) {
  if (c.estado === "abierta") return <span className={AZUL}>Abierta</span>;
  if (c.estado === "por_revisar")
    return <span className={AMBAR}>Por revisar</span>;
  const d = c.diferencia ?? 0;
  const detalle = `Revisado · ${d === 0 ? "cuadra" : d < 0 ? `faltan ${pesos(d)}` : `sobran ${pesos(d)}`}`;
  return (
    <span className={VERDE} title={detalle}>
      Revisado
    </span>
  );
}

const monto = (n: number | null | undefined) =>
  n == null ? <span className="text-gray-400">—</span> : pesos(n);

/** La franja entre un turno y el anterior, solo si el efectivo NO pasó
 *  completo (Felipe, 16-11: si está ok, no muestra nada). */
function EntreTurnos({
  c,
  onAbrir,
}: {
  readonly c: CierreEnLaLista;
  readonly onAbrir: () => void;
}) {
  const a = c.apertura;
  if (!a || a.diferencia === 0) return null;
  const [clase, borde, texto] =
    a.diferencia < 0
      ? [
          ROJO,
          "border-red-300",
          `Faltan ${pesos(a.diferencia)} entre el cierre y la apertura`,
        ]
      : [
          AMBAR,
          "border-amber-300",
          `Aparecieron ${pesos(a.diferencia)} que el cierre anterior no declaró`,
        ];
  return (
    <tr onClick={onAbrir} className={fila}>
      <td colSpan={7} className="py-1 pl-6">
        <span
          className={`flex items-center gap-2 whitespace-nowrap border-l-4 pl-3 text-xs text-gray-600 ${borde}`}
        >
          <span className={clase}>Entre turnos</span>
          {texto}
        </span>
      </td>
    </tr>
  );
}

const tarjeta = "rounded-lg border border-gray-200 bg-white px-4 py-3";

/** §9.57: los gastos de caja de los 7 días, del más nuevo al más viejo,
 *  con el día, quién lo anotó, en qué se gastó y el monto. */
function GastosDeLaSemana({
  total,
  lista,
  onCerrar,
}: {
  readonly total: number;
  readonly lista: GastoDeLaSemana[];
  readonly onCerrar: () => void;
}) {
  return (
    <Modal
      titulo="Gastos de 7 días"
      subtitulo={`−${pesos(total)} en ${lista.length} ${lista.length === 1 ? "gasto" : "gastos"}`}
      ancho="max-w-md"
      lado="derecha"
      onCerrar={onCerrar}
    >
      <ul className="divide-y divide-gray-100 text-sm">
        {lista.map((g) => (
          <li key={g.id} className="flex items-start gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{g.motivo}</p>
              <p className="text-xs text-gray-500">
                {diaCorto(g.creado_en)} · {hora(g.creado_en)}
                {g.creado_por_nombre ? ` · ${g.creado_por_nombre}` : ""}
              </p>
            </div>
            <span
              className={`whitespace-nowrap font-semibold ${TIPO.gasto.claseMonto}`}
            >
              −{pesos(g.monto)}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Las tres cifras de los últimos 7 días, en tarjetas blancas; desde el
 *  §9.57, la cuarta: los gastos, que se tocan para ver en qué se gastó. */
export function CifrasDeLaCadena({
  resumen,
}: {
  readonly resumen: ResumenDeLaCadena | undefined;
}) {
  const [verGastos, setVerGastos] = useState(false);
  if (!resumen) return null;
  const falta = resumen.efectivo_que_falta;
  const perdido = resumen.perdido_entre_turnos;
  const cifras: { etiqueta: string; valor: string; color: string }[] = [
    {
      etiqueta: "Efectivo que falta, 7 días",
      valor: falta === 0 ? "$0" : `${falta < 0 ? "−" : "+"}${pesos(falta)}`,
      color:
        falta === 0
          ? "text-green-700"
          : falta < 0
            ? "text-red-700"
            : "text-amber-700",
    },
    {
      etiqueta: "Perdido entre turnos",
      valor: perdido === 0 ? "$0" : `−${pesos(perdido)}`,
      color: perdido === 0 ? "text-green-700" : "text-red-700",
    },
    {
      etiqueta: "Turnos por revisar",
      valor: String(resumen.por_revisar),
      color: resumen.por_revisar === 0 ? "text-green-700" : "text-amber-700",
    },
  ];
  // §9.57: sin el dato (el motor de antes), solo las tres de siempre.
  const gastos = resumen.gastos;
  const lista = resumen.lista_de_gastos ?? [];
  const conGastos = gastos != null && gastos > 0 && lista.length > 0;
  const contenidoDeGastos = gastos != null && (
    <>
      <p
        className={`text-2xl font-semibold ${conGastos ? "text-amber-700" : "text-green-700"}`}
      >
        {gastos === 0 ? "$0" : `−${pesos(gastos)}`}
      </p>
      <p className="text-xs text-gray-500">Gastos de 7 días</p>
    </>
  );
  return (
    <div
      className={`grid gap-3 ${gastos != null ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      {cifras.map((x) => (
        <div key={x.etiqueta} className={tarjeta}>
          <p className={`text-2xl font-semibold ${x.color}`}>{x.valor}</p>
          <p className="text-xs text-gray-500">{x.etiqueta}</p>
        </div>
      ))}
      {gastos != null &&
        (conGastos ? (
          <button
            type="button"
            onClick={() => setVerGastos(true)}
            aria-haspopup="dialog"
            className={`${tarjeta} text-left hover:border-amber-300 hover:bg-amber-50/40`}
          >
            {contenidoDeGastos}
          </button>
        ) : (
          <div className={tarjeta}>{contenidoDeGastos}</div>
        ))}
      {verGastos && conGastos && (
        <GastosDeLaSemana
          total={gastos}
          lista={lista}
          onCerrar={() => setVerGastos(false)}
        />
      )}
    </div>
  );
}

const th = "pb-1 font-normal whitespace-nowrap";
// §9.55: el turno y su franja se resaltan juntos (un <tbody> por turno).
const fila = "cursor-pointer group-hover:bg-blue-50/60";

export default function CadenaDelEfectivo({
  lista,
  onAbrir,
  ciego = false,
}: {
  readonly lista: CierreEnLaLista[];
  readonly onAbrir: (id: number) => void;
  /** §9.55: quien no revisa los cierres ve solo con cuánto se abrió y el
   *  estado; nada de lo que dice el sistema. */
  readonly ciego?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full text-sm ${ciego ? "min-w-[28rem]" : "min-w-[52rem]"}`}
      >
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className={th}>Turno</th>
            <th className={`${th} text-right`}>Abrió con</th>
            {!ciego && (
              <>
                <th className={`${th} text-right`}>Debía tener</th>
                <th className={`${th} text-right`}>Cerró con</th>
                <th className={`${th} text-right`}>Efectivo</th>
                <th className={`${th} text-right`}>Tarjetas y transf.</th>
              </>
            )}
            <th className={`${th} text-right`}>Estado</th>
          </tr>
        </thead>
        {lista.map((c, i) => (
          <tbody key={c.id} className="group border-t border-gray-100">
            <tr onClick={() => onAbrir(c.id)} className={fila}>
              <td className="whitespace-nowrap py-1.5 pr-2">
                <button
                  type="button"
                  className="text-left text-blue-700 hover:underline"
                >
                  {horarioDelTurno(c)}
                </button>
                <span className="block text-xs text-gray-500">
                  {c.cerrada_por_nombre ?? c.abierta_por_nombre}
                </span>
              </td>
              <td className="whitespace-nowrap py-1.5 text-right">
                {pesos(c.sencillo_inicial)}
              </td>
              {!ciego && (
                <>
                  <td className="whitespace-nowrap py-1.5 text-right">
                    {monto(c.debia_tener)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right">
                    {monto(c.cerro_con)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Diferencia valor={c.diferencia_efectivo} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Diferencia valor={c.diferencia_otros} />
                  </td>
                </>
              )}
              <td className="py-1.5 text-right">
                <Estado c={c} />
              </td>
            </tr>
            {/* Entre este turno y el anterior (el de abajo): pincharla abre
                el mismo detalle. */}
            {!ciego && i < lista.length - 1 && (
              <EntreTurnos c={c} onAbrir={() => onAbrir(c.id)} />
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}
