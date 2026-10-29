import { useQuery } from "@tanstack/react-query";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Bar } from "react-chartjs-2";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  getRadarMunicipal,
  type TableroDelRadar,
} from "../../services/radarMunicipal.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { REGIONES_DE_CHILE } from "./oportunidades.utils";
import {
  MESES,
  mesesDelAnio,
  millones,
  pesos,
  porcentaje,
} from "./radarMunicipal.utils";
import SenalesDelRadar from "./SenalesDelRadar";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

// EL RADAR MUNICIPAL (decisión 108 del doc 17, solo en el laboratorio).
// Felipe: "la idea de esto es generar un spinoff de una empresa que será un
// radar municipal para detectar irregularidades de usos de dineros publicos
// inspirados en zorro de ukrania", con las vistas que eligió: "Cuánto se
// gasta, Quién gana, Cuándo compran, Dónde no estás" y los indicadores de
// transparencia del informe que trajo. Todo sale de los datos abiertos de
// ChileCompra: las órdenes de compra de los municipios, sus licitaciones y
// sus compras ágiles. «El rubro» es eventos, banquetería, alimentación y
// alojamiento, el mismo de la decisión 101.

const VISTAS = [
  ["gasto", "Cuánto se gasta"],
  ["quien", "Quién gana"],
  ["cuando", "Cuándo compran"],
  ["donde", "Dónde no estás"],
  ["senales", "Transparencia"],
] as const;

type Vista = (typeof VISTAS)[number][0];

const TODO_CHILE = "chile";

/** «Ñuble y Biobío», de «Región del Ñuble» y «Región del Biobío». */
const nombresCortos = (regiones: string[]) =>
  regiones
    .map((r) => r.replace(/^Regi[oó]n (de la |del |de los |de )?/i, ""))
    .join(" y ");

export default function RadarMunicipal() {
  const [region, setRegion] = useState("");
  const [anio, setAnio] = useState<number | undefined>(undefined);
  const [vista, setVista] = useState<Vista>("gasto");
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["oportunidades", "radar-municipal", region, anio],
    queryFn: () =>
      getRadarMunicipal({ region: region || undefined, anio }),
    staleTime: 10 * 60 * 1000,
  });

  const opcionesDeRegion = [
    {
      value: "",
      label: data?.zona.length
        ? `Mi zona: ${nombresCortos(data.zona)}`
        : "Mi zona",
    },
    ...REGIONES_DE_CHILE.map((r) => ({ value: r, label: r })),
    { value: TODO_CHILE, label: "Todo Chile" },
  ];
  const opcionesDeAnio = (data?.anios ?? []).map((a) => ({
    value: String(a),
    label: String(a),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Radar municipal
        </h2>
        <p className="text-sm text-gray-500">
          Lo que compran los municipios, con los datos abiertos de
          ChileCompra: sus órdenes de compra, licitaciones y compras ágiles.
          En el laboratorio.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <span className="mb-1 block text-xs font-semibold text-gray-600">
            Región
          </span>
          <SelectWithSearch
            options={opcionesDeRegion}
            value={region}
            onChange={setRegion}
            placeholder="Mi zona"
            mostrarConteo={false}
            tamano="sm"
            sinLimpiar
          />
        </div>
        <div className="w-32">
          <span className="mb-1 block text-xs font-semibold text-gray-600">
            Año
          </span>
          <SelectWithSearch
            options={opcionesDeAnio}
            value={String(data?.anio ?? anio ?? "")}
            onChange={(v) => setAnio(v ? Number(v) : undefined)}
            placeholder="Año"
            mostrarConteo={false}
            tamano="sm"
            sinLimpiar
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Radar municipal"
        className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-0.5"
      >
        {VISTAS.map(([clave, nombre]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={vista === clave}
            onClick={() => setVista(clave)}
            className={`px-3 py-1.5 text-sm rounded-md ${
              vista === clave
                ? "bg-white font-semibold text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {nombre}
          </button>
        ))}
      </div>

      {isPending && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Leyendo el mercado…
        </p>
      )}
      {isError && (
        <p className="text-sm text-red-700">{humanizeApiError(error)}</p>
      )}
      {data && vista === "gasto" && <CuantoSeGasta tablero={data} />}
      {data && vista === "quien" && <QuienGana tablero={data} />}
      {data && vista === "cuando" && <CuandoCompran tablero={data} />}
      {data && vista === "donde" && <DondeNoEstas tablero={data} />}
      {data && vista === "senales" && (
        <SenalesDelRadar
          municipios={data.municipios}
          desde={data.ventana.desde}
          hasta={data.ventana.hasta}
        />
      )}
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  nota,
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly nota?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-semibold text-gray-900">{valor}</p>
      {nota && <p className="text-xs text-gray-400">{nota}</p>}
    </div>
  );
}

const TOPE_DE_FILAS = 15;

function CuantoSeGasta({ tablero }: { readonly tablero: TableroDelRadar }) {
  const [todos, setTodos] = useState(false);
  const conRubro = tablero.municipios.filter((m) => (m.rubro ?? 0) > 0);
  const total = conRubro.reduce((s, m) => s + (m.rubro ?? 0), 0);
  const filas = todos
    ? tablero.municipios
    : tablero.municipios.slice(0, TOPE_DE_FILAS);
  const porHabitantePais = tablero.nacional?.rubro_por_habitante ?? null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          titulo={`Eventos y alimentación, ${tablero.anio}`}
          valor={millones(total)}
          nota={
            mesesDelAnio(tablero.meses_del_anio)
              ? `${mesesDelAnio(tablero.meses_del_anio)}, en los municipios mirados`
              : "lo que compraron los municipios mirados"
          }
        />
        <Cifra
          titulo="Municipios que compraron del rubro"
          valor={`${conRubro.length} de ${tablero.municipios.length}`}
        />
        <Cifra
          titulo="Promedio por municipio en Chile"
          valor={millones(tablero.nacional?.rubro_promedio)}
        />
        <Cifra
          titulo="Por habitante en Chile"
          valor={pesos(porHabitantePais)}
          nota="población del Censo 2024"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Municipio</th>
              <th className="px-3 py-2 text-right">Eventos y alimentación</th>
              <th className="px-3 py-2 text-right">Por habitante</th>
              <th className="px-3 py-2 text-right">Todo lo que compró</th>
              <th className="px-3 py-2 text-right">Trato directo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((m) => {
              const veces =
                porHabitantePais && m.rubro_por_habitante
                  ? m.rubro_por_habitante / porHabitantePais
                  : null;
              return (
                <tr key={m.organismo_codigo}>
                  <td className="px-3 py-2 text-gray-900">
                    {m.comuna ?? m.nombre}
                  </td>
                  <td className="px-3 py-2 text-right">{millones(m.rubro)}</td>
                  <td className="px-3 py-2 text-right">
                    {pesos(m.rubro_por_habitante)}
                    {veces !== null && veces >= 2 && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">
                        {veces.toLocaleString("es-CL", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        veces Chile
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{millones(m.total)}</td>
                  <td className="px-3 py-2 text-right">
                    {porcentaje(m.cuota_trato_directo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tablero.municipios.length > TOPE_DE_FILAS && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          {todos
            ? "Ver menos"
            : `Ver los ${tablero.municipios.length} municipios`}
        </button>
      )}
    </div>
  );
}

function QuienGana({ tablero }: { readonly tablero: TableroDelRadar }) {
  if (tablero.quien_gana.length === 0)
    return <Vacio>Nadie le vendió eventos ni alimentación a estos municipios en {tablero.anio}.</Vacio>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        A quién le compraron eventos y alimentación los municipios en{" "}
        {tablero.anio}, por monto de sus órdenes de compra.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2 text-right">Le compraron</th>
              <th className="px-3 py-2 text-right">Órdenes</th>
              <th className="px-3 py-2 text-right">Municipios</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tablero.quien_gana.map((p) => (
              <tr key={p.rut}>
                <td className="px-3 py-2">
                  <span className="block text-gray-900">
                    {p.nombre ?? p.rut}
                  </span>
                  {p.actividad && (
                    <span className="block text-xs text-gray-400">
                      {p.actividad}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{millones(p.monto)}</td>
                <td className="px-3 py-2 text-right">{p.ordenes}</td>
                <td className="px-3 py-2 text-right">{p.municipios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CuandoCompran({ tablero }: { readonly tablero: TableroDelRadar }) {
  const meses = tablero.cuando_compran;
  const mayor = [...meses].sort((a, b) => b.ordenes - a.ordenes)[0];
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Órdenes de compra de eventos y alimentación de los municipios, mes a
        mes, en {tablero.anio}
        {mesesDelAnio(tablero.meses_del_anio) &&
          ` (${mesesDelAnio(tablero.meses_del_anio)})`}
        .
        {mayor && mayor.ordenes > 0 &&
          ` El mes con más compras fue ${MESES[mayor.mes - 1].toLowerCase()}.`}
      </p>
      <div className="h-72 rounded-lg border border-gray-200 p-3">
        <Bar
          data={{
            labels: [...MESES],
            datasets: [
              {
                label: "Órdenes de compra",
                data: meses.map((m) => m.ordenes),
                backgroundColor: "rgba(37, 99, 235, 0.7)",
              },
            ],
          }}
          options={{
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  afterLabel: (c) => millones(meses[c.dataIndex]?.monto ?? 0),
                },
              },
            },
            scales: { y: { beginAtZero: true } },
          }}
        />
      </div>
    </div>
  );
}

function DondeNoEstas({ tablero }: { readonly tablero: TableroDelRadar }) {
  const compran = tablero.municipios.filter((m) => (m.rubro ?? 0) > 0);
  const estas = compran.filter((m) => m.presente).length;
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        Estás en {estas} de los {compran.length} municipios que compraron
        eventos y alimentación en {tablero.anio}: ofertaste, cotizaste o les
        vendiste en los últimos 3 años. Estos son los que faltan, del que más
        compró al que menos.
      </p>
      {tablero.donde_no_estas.length === 0 ? (
        <Vacio>Estás en todos.</Vacio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">Municipio</th>
                <th className="px-3 py-2 text-right">Compró</th>
                <th className="px-3 py-2 text-right">Órdenes</th>
                <th className="px-3 py-2">Quién le vende más</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tablero.donde_no_estas.map((m) => (
                <tr key={m.organismo_codigo}>
                  <td className="px-3 py-2 text-gray-900">
                    {m.comuna ?? m.nombre}
                  </td>
                  <td className="px-3 py-2 text-right">{millones(m.rubro)}</td>
                  <td className="px-3 py-2 text-right">{m.ordenes_rubro}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {m.quien_le_vende ?? "sin datos"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Vacio({ children }: { readonly children: ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}
