import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Plus,
} from "lucide-react";
import MultiSelect from "../../components/MultiSelect";
import { toast } from "../../components/toast/Toast";
import { eventosQueryOptions } from "./FichasTab";
import Modal from "../../components/Modal";
import { estadoDelPago } from "./estadoDelPago";
import Tooltip from "../../components/Tooltip";
import {
  createPayroll,
  getLiquidacionesPendientes,
  previaPayroll,
  getPayroll,
  getPayrolls,
  marcarPago,
} from "../../services/people.service";
import type {
  Asignacion,
  LineaDeNomina,
  LiquidacionPendiente,
  NominaDetalle,
  PagoPersona,
} from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { nombreBanco, etiquetaTipoCuenta } from "../../utils/bancos";
import {
  formatFechaEvento,
  formatISOUTCDateToString,
} from "../../utils/dates";
import { formatearRut } from "../../utils/rut";

// LA NÓMINA, EL PAGO Y EL DETALLE (etapa 6)
//
// La nómina NO es una semana: es un SELECTOR de qué se liquida — todo
// lo pendiente hasta una fecha, un rango, o eventos sueltos. Cada fila
// queda marcada con la nómina que la pagó; pendiente = lo que no entró
// en ninguna. No hay que acordarse de nada.
//
// El pago es a mano en el portal del banco (Santander cobra el
// archivo): una persona a la vez, grande, con botón de copiar en cada
// dato y barra de progreso. La marca de pagado se pone EN EL MOMENTO.
// Jornada y propina por separado: los eventos cruzan de semana.

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

interface PorPersona {
  /** Las fichas que caen en este pago: normalmente una, dos si la
   *  persona quedó cargada dos veces con el mismo RUT. */
  personIds: number[];
  persona: Asignacion["people"];
  jornadas: Asignacion[];
  propinas: Asignacion[];
  totalJornada: number;
  totalPropina: number;
  pagos: PagoPersona[];
}

export default function NominaTab() {
  const [abierta, setAbierta] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: nominas = [] } = useQuery({
    queryKey: ["people", "payrolls"],
    queryFn: getPayrolls,
  });

  if (abierta !== null) {
    return <NominaAbierta id={abierta} onVolver={() => setAbierta(null)} />;
  }

  return (
    <div className="space-y-4">
      <LiquidacionesPorPagar
        onCreada={(id) => {
          qc.invalidateQueries({ queryKey: ["people", "payrolls"] });
          setAbierta(id);
        }}
      />

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Nóminas de pago</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Nacen arriba, en Liquidaciones por pagar. Lo que no entra
              queda pendiente para la próxima — no hay que acordarse de
              nada.
            </p>
          </div>
          {/* Sin "Armar nómina": las nóminas nacen de las liquidaciones
              seleccionadas arriba, con la revisión antes del banco. El
              armado por rango de fechas era el camino viejo (Felipe,
              17-08). */}
        </div>
        {nominas.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Todavía no se arma ninguna nómina.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {nominas.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setAbierta(n.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 truncate">
                      {n.label}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {formatISOUTCDateToString(iso(n.created_at))}
                      {n.personas !== undefined &&
                        ` · ${n.pagadas ?? 0} de ${n.personas} pagadas`}
                    </span>
                  </span>
                  {/* COLUMNAS DE ANCHO FIJO (Felipe, 17-08): la plata a la
                      derecha en su columna, y el chip con un ancho único
                      para los dos estados. Sin esto cada fila calculaba
                      lo suyo y la lista bailaba. */}
                  <span className="w-28 text-right tabular-nums text-gray-900 shrink-0">
                    {n.total !== undefined && n.total > 0 ? clp(n.total) : ""}
                  </span>
                  {/* EL ESTADO SE DEDUCE, no se guarda: una nómina está
                      pagada cuando no le queda nadie por pagar. Así no
                      hay una marca que se pueda quedar mintiendo. */}
                  <span
                    className={`w-24 text-center text-xs px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                      n.estado === "pagada"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}
                  >
                    {n.estado === "pagada" ? "Pagada" : "En el banco"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

/**
 * LIQUIDACIONES POR PAGAR (Felipe, 16-08).
 *
 * Cada evento cerrado y cada día de restaurante repartido que todavía
 * no entró a una nómina. Se marcan los que se van a pagar ahora y se
 * transforman en UNA nómina, que consolida por persona.
 *
 * El porqué, en sus palabras: si esa semana hay cinco eventos y diez
 * días de restaurante con la misma gente, no se puede subir diez veces
 * al banco. Se junta lo de cada persona y se sube una vez.
 */
function LiquidacionesPorPagar({
  onCreada,
}: {
  readonly onCreada: (id: number) => void;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const { data: pendientes = [], isLoading } = useQuery({
    queryKey: ["people", "liquidaciones-pendientes"],
    queryFn: getLiquidacionesPendientes,
    staleTime: 0,
  });
  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const qc = useQueryClient();

  const nombre = useMemo(() => {
    const m = new Map(eventos.map((q) => [q.id, q.cliente]));
    return (l: LiquidacionPendiente) =>
      l.tipo === "dia"
        ? `Restaurante · ${formatISOUTCDateToString(l.day ?? "")}`
        : (m.get(l.quotation_id ?? "") ?? "Evento");
  }, [eventos]);

  const clave = (l: LiquidacionPendiente) =>
    l.tipo === "dia" ? `dia:${l.day}` : `ev:${l.quotation_id}`;

  const elegidas = pendientes.filter((l) => marcadas.has(clave(l)));
  const totalElegido = elegidas.reduce((t, l) => t + l.total, 0);
  // EL RUT ES REGLA DE AVANCE (Felipe, 16-08): sin RUT no se puede
  // cargar al banco, así que no se genera la nómina y se dice a quién
  // le falta — por nombre, para poder ir a arreglarlo.
  const faltanRut = [...new Set(elegidas.flatMap((l) => l.sin_rut))];

  const [revisando, setRevisando] = useState(false);

  const generar = useMutation({
    mutationFn: () =>
      createPayroll({
        label: `Nómina ${new Date().toLocaleDateString("es-CL")}`,
        quotation_ids: elegidas
          .filter((l) => l.tipo === "evento")
          .map((l) => l.quotation_id!)
          .filter(Boolean),
        dias: elegidas
          .filter((l) => l.tipo === "dia")
          .map((l) => l.day!)
          .filter(Boolean),
      }),
    onSuccess: (nomina) => {
      toast.success(
        `Nómina generada: ${nomina.personas ?? 0} ${
          nomina.personas === 1 ? "persona" : "personas"
        } por pagar.`,
      );
      setMarcadas(new Set());
      setRevisando(false);
      qc.invalidateQueries({ queryKey: ["people", "liquidaciones-pendientes"] });
      onCreada(nomina.id);
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">
            Liquidaciones por pagar
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Lo que ya liquidaste y todavía no se paga. Marca lo que va en
            esta nómina: el sistema junta por persona para subir un solo
            pago al banco.
          </p>
        </div>
        {marcadas.size > 0 && (
          <button
            type="button"
            onClick={() => setRevisando(true)}
            disabled={generar.isPending || faltanRut.length > 0}
            title={
              faltanRut.length > 0
                ? `Falta el RUT de ${faltanRut.join(", ")}`
                : undefined
            }
            className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-50 whitespace-nowrap"
          >
            {generar.isPending
              ? "Generando…"
              : `Revisar y generar · ${clp(totalElegido)}`}
          </button>
        )}
      </div>

      {faltanRut.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          {faltanRut.length === 1
            ? `${faltanRut[0]} no tiene RUT cargado`
            : `Sin RUT: ${faltanRut.join(", ")}`}
          . Sin RUT no se puede subir al banco — complétalo en su ficha y
          vuelve.
        </p>
      )}

      {revisando && (
        <RevisarAntesDeGenerar
          seleccion={{
            quotation_ids: elegidas
              .filter((l) => l.tipo === "evento")
              .map((l) => l.quotation_id!)
              .filter(Boolean),
            dias: elegidas
              .filter((l) => l.tipo === "dia")
              .map((l) => l.day!)
              .filter(Boolean),
          }}
          generando={generar.isPending}
          onGenerar={() => generar.mutate()}
          onCerrar={() => setRevisando(false)}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500 p-6 text-center">Cargando…</p>
      ) : pendientes.length === 0 ? (
        <p className="text-sm text-gray-500 p-6 text-center">
          Nada por pagar: todo lo liquidado ya está en una nómina.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {pendientes.map((l) => {
            const k = clave(l);
            const marcada = marcadas.has(k);
            return (
              <li key={k}>
                <label
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${
                    marcada ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => {
                      const s2 = new Set(marcadas);
                      if (marcada) s2.delete(k);
                      else s2.add(k);
                      setMarcadas(s2);
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 truncate">
                      {nombre(l)}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {l.personas} {l.personas === 1 ? "persona" : "personas"}
                      {l.jornadas > 0 && ` · jornadas ${clp(l.jornadas)}`}
                      {l.propinas > 0 && ` · propinas ${clp(l.propinas)}`}
                    </span>
                    {l.sin_rut.length > 0 && (
                      <span className="block text-xs text-amber-700 mt-0.5">
                        sin RUT: {l.sin_rut.join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-medium text-gray-900">
                    {clp(l.total)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * LA REVISIÓN ANTES DE SUBIR AL BANCO (Felipe, 16-08).
 *
 * "La mayoría de la gente ya está en el banco creada, entonces es
 * buscarla, pero igual es bueno poder ver el detalle para confirmar sus
 * datos bancarios."
 *
 * Muestra exactamente lo que se va a pagar, ya consolidado por persona,
 * con los datos con que se sube. Lo calcula el backend con la MISMA
 * consulta que después genera la nómina: si fueran dos caminos, un día
 * mostraría una cosa y pagaría otra.
 */
function RevisarAntesDeGenerar({
  seleccion,
  generando,
  onGenerar,
  onCerrar,
}: {
  readonly seleccion: { quotation_ids: string[]; dias: string[] };
  readonly generando: boolean;
  readonly onGenerar: () => void;
  readonly onCerrar: () => void;
}) {
  const {
    data: previa,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["people", "previa-nomina", seleccion],
    queryFn: () => previaPayroll(seleccion),
    staleTime: 0,
  });

  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const nombreOrigen = useMemo(() => {
    const m = new Map(eventos.map((q) => [q.id, q.cliente]));
    return (qid: string | null) =>
      qid === null ? "Restaurante" : (m.get(qid) ?? "Evento");
  }, [eventos]);

  /** El desglose de una cifra: de dónde sale y cuántos días. */
  const desglose = (
    linea: LineaDeNomina,
    cual: "jornadas" | "propinas" | "total",
  ) => {
    const partes = linea.detalle
      .map((d) => ({
        nombre: nombreOrigen(d.quotation_id),
        dias: d.dias,
        monto:
          cual === "total" ? d.jornadas + d.propinas : (d[cual] ?? 0),
      }))
      .filter((d) => d.monto > 0);
    return {
      lista: partes,
      texto: partes
        .map(
          (d) =>
            `${d.nombre}: ${d.dias} ${d.dias === 1 ? "día" : "días"} · ${clp(d.monto)}`,
        )
        .join(" — "),
    };
  };

  /** La cifra con su explicación al pasar el mouse. */
  const cifra = (
    linea: LineaDeNomina,
    cual: "jornadas" | "propinas" | "total",
    monto: number,
    clase: string,
  ) => {
    if (!monto) return <span className="text-gray-400">—</span>;
    const d = desglose(linea, cual);
    return (
      <Tooltip
        // Las columnas de la derecha abren hacia la izquierda: si no, el
        // detalle se sale del modal y se corta (Felipe, 17-08).
        lado="izquierda"
        titulo={d.texto}
        contenido={
          <span className="block space-y-0.5">
            {d.lista.map((x) => (
              <span key={x.nombre} className="flex justify-between gap-3">
                <span>
                  {x.nombre}
                  <span className="text-gray-400">
                    {" "}
                    · {x.dias} {x.dias === 1 ? "día" : "días"}
                  </span>
                </span>
                <span className="tabular-nums">{clp(x.monto)}</span>
              </span>
            ))}
          </span>
        }
      >
        <span className={clase}>{clp(monto)}</span>
      </Tooltip>
    );
  };

  const dato = (v: string | null | undefined) =>
    v && v.trim() ? v : <span className="text-red-600">falta</span>;

  return (
    <Modal
      titulo="Revisa antes de subir al banco"
      subtitulo={
        previa
          ? `${previa.personas.length} ${
              previa.personas.length === 1 ? "persona" : "personas"
            } · ${clp(previa.total)}`
          : undefined
      }
      ancho="max-w-5xl"
      onCerrar={onCerrar}
      pie={
        <>
          {/* Si uno completa una cuenta en otra pestaña, esta pantalla no
              se entera sola: acá se vuelve a preguntar (Felipe, 16-08). */}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mr-auto px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-lg disabled:opacity-50"
          >
            {isFetching ? "Actualizando…" : "Actualizar datos"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onGenerar}
            disabled={generando || !previa || previa.sin_rut.length > 0}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-40 whitespace-nowrap"
          >
            {generando ? "Generando…" : "Generar nómina"}
          </button>
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-gray-500 py-6 text-center">Calculando…</p>
      ) : error || !previa ? (
        <p className="text-sm text-red-700 py-6 text-center">
          {humanizeApiError(error)}
        </p>
      ) : (
        <div className="space-y-3">
          {previa.fichas_repetidas.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {previa.fichas_repetidas.join(", ")}{" "}
              {previa.fichas_repetidas.length === 1
                ? "aparece"
                : "aparecen"}{" "}
              con más de una ficha y el mismo RUT. Se paga una sola vez —
              conviene unificar esas fichas en Personal.
            </p>
          )}
          {previa.sin_cuenta.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Sin cuenta bancaria: {previa.sin_cuenta.join(", ")}. La nómina
              se genera igual; ese pago tendrás que resolverlo aparte.
            </p>
          )}

          {/* Sin overflow-x-auto: ese contenedor recorta también hacia
              ARRIBA, y el detalle al pasar el mouse por una cifra de la
              primera fila quedaba cortado (Felipe, 17-08). El modal ya es
              ancho para las siete columnas; si un día no cupiera, el
              propio modal desplaza. */}
          <div className="overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Persona</th>
                  <th className="py-2 pr-3 font-semibold">RUT</th>
                  <th className="py-2 pr-3 font-semibold">Banco</th>
                  <th className="py-2 pr-3 font-semibold">Cuenta</th>
                  <th className="py-2 pr-3 font-semibold text-right">
                    Jornadas
                  </th>
                  <th className="py-2 pr-3 font-semibold text-right">
                    Propinas
                  </th>
                  <th className="py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previa.personas.map((p) => (
                  <tr key={p.person_ids.join("-")}>
                    <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">
                      {p.nombre}
                      {p.person_ids.length > 1 && (
                        <span className="ml-1.5 text-xs text-amber-700">
                          ({p.person_ids.length} fichas)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                      {p.rut ? formatearRut(p.rut) : dato(null)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.bank_code ? nombreBanco(p.bank_code) : dato(null)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                      {p.account_number ? (
                        <>
                          {p.account_number}
                          {p.account_type && (
                            <span className="text-xs text-gray-400 ml-1.5">
                              {etiquetaTipoCuenta(p.account_type as never)}
                            </span>
                          )}
                        </>
                      ) : (
                        dato(null)
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                      {cifra(p, "jornadas", p.jornadas, "cursor-help")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                      {cifra(p, "propinas", p.propinas, "cursor-help")}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-900">
                      {cifra(
                        p,
                        "total",
                        p.total,
                        "cursor-help font-semibold underline decoration-dotted decoration-gray-300 underline-offset-4",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={6} className="py-2 text-right font-medium">
                    Total a subir
                  </td>
                  <td className="py-2 text-right tabular-nums font-bold text-gray-900">
                    {clp(previa.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NominaAbierta({
  id,
  onVolver,
}: {
  readonly id: number;
  readonly onVolver: () => void;
}) {
  const qc = useQueryClient();
  const [pagando, setPagando] = useState(false);
  const [detalleDe, setDetalleDe] = useState<PorPersona | null>(null);

  const { data: nomina } = useQuery({
    queryKey: ["people", "payroll", id],
    queryFn: () => getPayroll(id),
  });
  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const nombreEvento = useMemo(() => {
    const m = new Map(
      // El nombre del cliente manda: "Iglesia Adventista" dice más que
      // "N° 394" cuando uno está pagando (Felipe, 16-08). El número
      // queda al lado, chico, para poder buscar la cotización.
      eventos.map((q) => [q.id, `${q.cliente} · N° ${String(q.numero)}`]),
    );
    // El restaurante es "Staff" en toda la nómina, igual que en la
    // pestaña de Planificación (Felipe, 17-08).
    return (qid: string | null) =>
      qid === null ? "Staff" : (m.get(qid) ?? "Evento");
  }, [eventos]);

  const porPersona: PorPersona[] = useMemo(() => {
    if (!nomina) return [];
    // CONSOLIDADO POR RUT (Felipe, 16-08), igual que en la revisión: una
    // línea = una transferencia. Si la misma persona quedó cargada dos
    // veces con el mismo RUT, se paga una sola vez. Sin RUT va por
    // ficha: juntar a dos desconocidos sería peor.
    const m = new Map<string, PorPersona>();
    const de = (a: Asignacion): PorPersona => {
      const rut = (a.people?.rut ?? "").trim();
      const llave = rut ? `rut:${rut}` : `ficha:${a.person_id}`;
      if (!m.has(llave)) {
        m.set(llave, {
          personIds: [],
          persona: a.people ?? null,
          jornadas: [],
          propinas: [],
          totalJornada: 0,
          totalPropina: 0,
          pagos: [],
        });
      }
      const fila = m.get(llave)!;
      // El backend jamás manda sillas vacías a una nómina; el filtro es
      // solo para que el tipo lo diga.
      if (a.person_id != null && !fila.personIds.includes(a.person_id)) {
        fila.personIds.push(a.person_id);
        const suyo = nomina.pagos.find((p) => p.person_id === a.person_id);
        if (suyo) fila.pagos.push(suyo);
      }
      return fila;
    };
    for (const a of nomina.jornadas) {
      const p = de(a);
      p.jornadas.push(a);
      p.totalJornada += Number(a.amount ?? 0);
    }
    for (const a of nomina.propinas) {
      const p = de(a);
      p.propinas.push(a);
      p.totalPropina += Number(a.tip_amount ?? 0);
    }
    return [...m.values()].sort((a, b) =>
      (a.persona?.name ?? "").localeCompare(b.persona?.name ?? ""),
    );
  }, [nomina]);

  const refrescar = () =>
    qc.invalidateQueries({ queryKey: ["people", "payroll", id] });

  const pagadas = porPersona.filter(
    (p) =>
      estadoDelPago(p) === "pagada",
  );

  if (!nomina) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a las nóminas"
          className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">{nomina.label}</h2>
          <p className="text-xs text-gray-500">
            {pagadas.length} de {porPersona.length} personas pagadas
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPagando(true)}
          disabled={pagadas.length === porPersona.length}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          Pagar una a una
        </button>
      </div>

      {/* EL RESUMEN — una línea por persona: lo que va al banco. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 font-medium text-center">Días</th>
              <th className="px-3 py-2 font-medium text-right">Jornadas</th>
              <th className="px-3 py-2 font-medium text-right">Propinas</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-center">Pago</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {porPersona.map((p) => (
              <tr key={p.personIds.join("-")}>
                <td className="px-3 py-2 text-gray-900">{p.persona?.name}</td>
                <td className="px-3 py-2 text-center tabular-nums">
                  {p.jornadas.length || "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.totalJornada > 0 ? clp(p.totalJornada) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.totalPropina > 0 ? clp(p.totalPropina) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {clp(p.totalJornada + p.totalPropina)}
                </td>
                <td className="px-3 py-2 text-center">
                  <EstadoPago p={p} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setDetalleDe(p)}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200 font-bold">
              <td className="px-3 py-2">Total</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">
                {clp(porPersona.reduce((t, p) => t + p.totalJornada, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {clp(porPersona.reduce((t, p) => t + p.totalPropina, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {clp(
                  porPersona.reduce(
                    (t, p) => t + p.totalJornada + p.totalPropina,
                    0,
                  ),
                )}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {pagando && (
        <PagoUnoAUno
          nomina={nomina}
          porPersona={porPersona}
          nombreEvento={nombreEvento}
          onCambio={refrescar}
          onCerrar={() => setPagando(false)}
        />
      )}

      {detalleDe && (
        <DetalleTrabajador
          p={detalleDe}
          nombreEvento={nombreEvento}
          onCerrar={() => setDetalleDe(null)}
        />
      )}
    </div>
  );
}

function EstadoPago({ p }: { readonly p: PorPersona }) {
  // Dos estados, no tres: al banco sube UN monto por persona.
  if (estadoDelPago(p) === "pagada")
    return (
      <span className="text-emerald-700 text-xs font-medium">
        <Check className="w-3.5 h-3.5 inline -mt-0.5" /> pagada
      </span>
    );
  return <span className="text-gray-400 text-xs">pendiente</span>;
}

/**
 * EL DESGLOSE DE LO QUE SE LE PAGA A UNA PERSONA (Felipe, 17-08): fecha
 * en largo, evento por cliente o Staff, cargo, jornadas aparte de
 * propinas con su subtotal, y el total. Es UNA pieza para el pago uno a
 * uno y para el "detalle" de la tabla: dos copias se habrían separado.
 */
function DesgloseDePago({
  p,
  nombreEvento,
  etiquetaTotal,
}: {
  readonly p: PorPersona;
  readonly nombreEvento: (qid: string | null) => string;
  readonly etiquetaTotal: string;
}) {
  const fecha = (d: string | null | undefined) => {
    const dia = iso(d);
    if (!dia) return "sin fecha";
    const t = formatFechaEvento(dia, "largo"); // "miércoles 15 de agosto de 2026"
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const porFecha = (xs: readonly Asignacion[]) =>
    xs.slice().sort((a, b) => iso(a.day).localeCompare(iso(b.day)));
  const fila = (a: Asignacion, monto: number, k: string) => (
    <li key={k} className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-gray-900">{fecha(a.day)}</span>
        <span className="block text-xs text-gray-500 truncate">
          {nombreEvento(a.quotation_id)}
          {a.management_resources?.name && ` · ${a.management_resources.name}`}
        </span>
      </span>
      <span className="tabular-nums text-sm text-gray-900 whitespace-nowrap">
        {clp(monto)}
      </span>
    </li>
  );
  const seccion = (
    titulo: string,
    subtotal: number,
    xs: readonly Asignacion[],
    monto: (a: Asignacion) => number,
    prefijo: string,
  ) => (
    <section className="mt-4">
      <h4 className="text-xs font-semibold uppercase text-gray-500 flex items-center justify-between">
        <span>{titulo}</span>
        <span className="tabular-nums text-gray-700">{clp(subtotal)}</span>
      </h4>
      <ul className="divide-y divide-gray-100 mt-1">
        {porFecha(xs).map((a) => fila(a, monto(a), `${prefijo}-${String(a.id)}`))}
      </ul>
    </section>
  );
  const total = p.totalJornada + p.totalPropina;
  return (
    <>
      {p.totalJornada > 0 &&
        seccion("Jornadas", p.totalJornada, p.jornadas, (a) => Number(a.amount ?? 0), "j")}
      {p.totalPropina > 0 &&
        seccion(
          "Propinas",
          p.totalPropina,
          p.propinas,
          (a) => Number(a.tip_amount ?? 0),
          "p",
        )}
      <div className="mt-4 pt-3 border-t-2 border-gray-300 flex items-center justify-between">
        <span className="font-bold text-gray-900">{etiquetaTotal}</span>
        <span className="text-lg font-bold text-gray-900 tabular-nums">
          {clp(total)}
        </span>
      </div>
    </>
  );
}

/** EL PAGO: una persona a la vez, con el DETALLE de qué se le paga
 *  —fecha, evento o staff, jornadas aparte de propinas— y el total,
 *  para aprobar en el banco. "Ya la pagué" marca EN EL MOMENTO y pasa a
 *  la siguiente. */
function PagoUnoAUno({
  nomina,
  porPersona,
  nombreEvento,
  onCambio,
  onCerrar,
}: {
  readonly nomina: NominaDetalle;
  readonly porPersona: PorPersona[];
  readonly nombreEvento: (qid: string | null) => string;
  readonly onCambio: () => void;
  readonly onCerrar: () => void;
}) {
  const pendientes = porPersona.filter(
    (p) =>
      estadoDelPago(p) !== "pagada",
  );
  const [idx, setIdx] = useState(0);
  const p = pendientes[idx] ?? null;

  const marcar = useMutation({
    // Una línea puede venir de dos fichas con el mismo RUT: el pago fue
    // uno solo, así que se marcan las dos.
    mutationFn: async () => {
      for (const personId of p!.personIds) {
        await marcarPago(nomina.id, {
          person_id: personId,
          jornada_paid: true,
          propina_paid: true,
        });
      }
    },
    onSuccess: () => {
      onCambio();
      if (idx >= pendientes.length - 1) onCerrar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  if (!p) return null;
  const persona = p.persona;

  // La pieza de la casa (18-08): un desglose largo hacía crecer este
  // modal a mano más que la pantalla y se perdía la cabecera. El avance
  // ("3 de 7 por pagar" y la barra) va como subtítulo; el pie conserva
  // "Saltar" a la izquierda y "Ya la pagué" a la derecha.
  return (
    <Modal
      titulo={persona?.name ?? "Pago"}
      subtitulo={
        <span className="block">
          {idx + 1} de {pendientes.length} por pagar
          <span className="block h-1.5 bg-gray-100 rounded-full mt-1.5">
            <span
              className="block h-1.5 bg-blue-600 rounded-full transition-all"
              style={{ width: `${String((idx / pendientes.length) * 100)}%` }}
            />
          </span>
        </span>
      }
      ancho="max-w-md"
      onCerrar={onCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={() =>
              idx >= pendientes.length - 1 ? onCerrar() : setIdx(idx + 1)
            }
            className="mr-auto px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Saltar por ahora
          </button>
          <button
            type="button"
            onClick={() => marcar.mutate()}
            disabled={marcar.isPending}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {marcar.isPending ? "Marcando…" : "Ya la pagué"}
          </button>
        </>
      }
    >
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            {persona?.rut ? formatearRut(persona.rut) : "sin RUT"}
            {persona?.bank_code && ` · ${nombreBanco(persona.bank_code)}`}
            {persona?.account_number && ` · ${persona.account_number}`}
          </p>
          {!persona?.bank_code || !persona.account_number ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4" /> Le faltan datos bancarios —
              se completan en Staff.
            </p>
          ) : null}

          <DesgloseDePago
            p={p}
            nombreEvento={nombreEvento}
            etiquetaTotal="Total a transferir"
          />
        </div>
    </Modal>
  );
}

/** EL DETALLE PARA EL TRABAJADOR: qué días, qué propina y por qué.
 *  SIN NINGÚN dato bancario — es un papel que se le muestra a alguien.
 *  Si es de planta, la sección de jornadas solo aparece si hizo un
 *  turno extra pagado. */
function DetalleTrabajador({
  p,
  nombreEvento,
  onCerrar,
}: {
  readonly p: PorPersona;
  readonly nombreEvento: (qid: string | null) => string;
  readonly onCerrar: () => void;
}) {
  return (
    // La pieza de la casa (18-08): mismo motivo que los otros dos.
    <Modal titulo={p.persona?.name ?? "Detalle"} ancho="max-w-md" onCerrar={onCerrar}>
      {/* El mismo desglose que la pantalla de pago (Felipe, 17-08). */}
      <DesgloseDePago p={p} nombreEvento={nombreEvento} etiquetaTotal="Total" />
    </Modal>
  );
}
