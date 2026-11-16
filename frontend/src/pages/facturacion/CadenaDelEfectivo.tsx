import { Fragment } from "react";
import type {
  CierreEnLaLista,
  ResumenDeLaCadena,
} from "../../services/caja.service";

// LA CADENA DEL EFECTIVO (doc 19 §9.54). Felipe, 16-11, mirando la lista de
// cierres: *"para que el abrió con tenga sentido necesitamos otra que diga
// cerró con o no? … mira cómo debo leer esto?"*. Cada turno en efectivo:
// con cuánto abrió, cuánto debía tener y con cuánto cerró; aparte, las
// tarjetas y transferencias. Entre un turno y el anterior, una franja dice si
// el efectivo pasó completo. Arriba, las tres cifras de los últimos 7 días.
// Solo la ve quien revisa los cierres.

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

/** La franja entre un turno y el anterior: si el efectivo pasó completo. */
function EntreTurnos({ c }: { readonly c: CierreEnLaLista }) {
  const a = c.apertura;
  if (!a) return null;
  const [clase, borde, texto] =
    a.diferencia === 0
      ? [
          VERDE,
          "border-green-300",
          `Pasaron completos los ${pesos(a.cierre_anterior)}`,
        ]
      : a.diferencia < 0
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
    <tr>
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

/** Las tres cifras de los últimos 7 días, en tarjetas blancas. */
export function CifrasDeLaCadena({
  resumen,
}: {
  readonly resumen: ResumenDeLaCadena | undefined;
}) {
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
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cifras.map((x) => (
        <div
          key={x.etiqueta}
          className="rounded-lg border border-gray-200 bg-white px-4 py-3"
        >
          <p className={`text-2xl font-semibold ${x.color}`}>{x.valor}</p>
          <p className="text-xs text-gray-500">{x.etiqueta}</p>
        </div>
      ))}
    </div>
  );
}

const th = "pb-1 font-normal whitespace-nowrap";

export default function CadenaDelEfectivo({
  lista,
  onAbrir,
}: {
  readonly lista: CierreEnLaLista[];
  readonly onAbrir: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className={th}>Turno</th>
            <th className={`${th} text-right`}>Abrió con</th>
            <th className={`${th} text-right`}>Debía tener</th>
            <th className={`${th} text-right`}>Cerró con</th>
            <th className={`${th} text-right`}>Efectivo</th>
            <th className={`${th} text-right`}>Tarjetas y transf.</th>
            <th className={`${th} text-right`}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => (
            <Fragment key={c.id}>
              <tr
                onClick={() => onAbrir(c.id)}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
              >
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
                <td className="py-1.5 text-right">
                  <Estado c={c} />
                </td>
              </tr>
              {/* Entre este turno y el anterior (el de abajo). */}
              {i < lista.length - 1 && <EntreTurnos c={c} />}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
