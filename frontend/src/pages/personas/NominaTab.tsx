import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Copy,
  FileText,
  Plus,
  X,
} from "lucide-react";
import MultiSelect from "../../components/MultiSelect";
import { toast } from "../../components/toast/Toast";
import { eventosQueryOptions } from "./FichasTab";
import {
  createPayroll,
  getPayroll,
  getPayrolls,
  marcarPago,
} from "../../services/people.service";
import type {
  Asignacion,
  NominaDetalle,
  PagoPersona,
} from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { nombreBanco, etiquetaTipoCuenta } from "../../utils/bancos";
import { formatISOUTCDateToString, hoyEnChile } from "../../utils/dates";
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
  personId: number;
  persona: Asignacion["people"];
  jornadas: Asignacion[];
  propinas: Asignacion[];
  totalJornada: number;
  totalPropina: number;
  pago: PagoPersona | null;
}

export default function NominaTab() {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
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
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Nóminas de pago</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Se arma eligiendo qué liquidar. Lo que no entra queda
              pendiente para la próxima — no hay que acordarse de nada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Armar nómina
          </button>
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
                  <span className="flex-1 font-medium text-gray-900">
                    {n.label}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatISOUTCDateToString(iso(n.created_at))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creando && (
        <ArmarNomina
          onCerrar={() => setCreando(false)}
          onCreada={(id) => {
            setCreando(false);
            qc.invalidateQueries({ queryKey: ["people", "payrolls"] });
            setAbierta(id);
          }}
        />
      )}
    </div>
  );
}

/** El selector de qué se liquida. */
function ArmarNomina({
  onCerrar,
  onCreada,
}: {
  readonly onCerrar: () => void;
  readonly onCreada: (id: number) => void;
}) {
  const hoy = hoyEnChile();
  const [modo, setModo] = useState<"hasta" | "rango" | "eventos">("hasta");
  const [hasta, setHasta] = useState(hoy);
  const [desde, setDesde] = useState(hoy);
  const [eventosSel, setEventosSel] = useState<string[]>([]);
  const [label, setLabel] = useState(
    `Nómina del ${formatISOUTCDateToString(hoy)}`,
  );

  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const opcionesEventos = eventos.map((q) => ({
    value: q.id,
    label: `N° ${String(q.numero)} · ${q.cliente}`,
  }));

  const crear = useMutation({
    mutationFn: () =>
      createPayroll({
        label,
        ...(modo === "hasta" ? { hasta } : {}),
        ...(modo === "rango" ? { desde, hasta } : {}),
        ...(modo === "eventos" ? { quotation_ids: eventosSel } : {}),
      }),
    onSuccess: (n) => {
      if (n.fuera && n.fuera.length > 0) {
        toast.warn(
          `Nómina armada. Quedaron FUERA ${String(n.fuera.length)} pozos de propina sin repartir.`,
        );
      } else {
        toast.success("Nómina armada con todo lo pendiente del filtro.");
      }
      onCreada(n.id);
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const campoFecha =
    "border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mt-10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">¿Qué se liquida?</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-1 text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            aria-label="Nombre de la nómina"
          />
          {(
            [
              ["hasta", "Todo lo pendiente hasta una fecha"],
              ["rango", "Un rango de días"],
              ["eventos", "Eventos sueltos"],
            ] as const
          ).map(([id, texto]) => (
            <label key={id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={modo === id}
                onChange={() => setModo(id)}
              />
              {texto}
            </label>
          ))}
          <div className="pl-6 flex items-center gap-2 flex-wrap">
            {modo === "rango" && (
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className={campoFecha}
                aria-label="Desde"
              />
            )}
            {modo !== "eventos" && (
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className={campoFecha}
                aria-label="Hasta"
              />
            )}
            {modo === "eventos" && (
              <div className="w-full">
                <MultiSelect
                  options={opcionesEventos}
                  value={eventosSel}
                  onChange={setEventosSel}
                  placeholder="Elegir eventos…"
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => crear.mutate()}
            disabled={
              crear.isPending || (modo === "eventos" && eventosSel.length === 0)
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {crear.isPending ? "Armando…" : "Armar la nómina"}
          </button>
        </div>
      </div>
    </div>
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
      eventos.map((q) => [q.id, `N° ${String(q.numero)} · ${q.cliente}`]),
    );
    return (qid: string | null) =>
      qid === null ? "Personal de planta" : (m.get(qid) ?? "Evento");
  }, [eventos]);

  const porPersona: PorPersona[] = useMemo(() => {
    if (!nomina) return [];
    const m = new Map<number, PorPersona>();
    const de = (a: Asignacion): PorPersona => {
      if (!m.has(a.person_id)) {
        m.set(a.person_id, {
          personId: a.person_id,
          persona: a.people ?? null,
          jornadas: [],
          propinas: [],
          totalJornada: 0,
          totalPropina: 0,
          pago: nomina.pagos.find((p) => p.person_id === a.person_id) ?? null,
        });
      }
      return m.get(a.person_id)!;
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
      (p.totalJornada === 0 || p.pago?.jornada_paid) &&
      (p.totalPropina === 0 || p.pago?.propina_paid),
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
              <tr key={p.personId}>
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
  const j = p.totalJornada === 0 || p.pago?.jornada_paid;
  const t = p.totalPropina === 0 || p.pago?.propina_paid;
  if (j && t)
    return (
      <span className="text-emerald-700 text-xs font-medium">
        <Check className="w-3.5 h-3.5 inline -mt-0.5" /> pagada
      </span>
    );
  if (j || t)
    return <span className="text-amber-700 text-xs font-medium">parcial</span>;
  return <span className="text-gray-400 text-xs">pendiente</span>;
}

/** EL PAGO: una persona a la vez, grande, con copiar en cada dato.
 *  "Ya la pagué" marca EN EL MOMENTO y pasa a la siguiente. */
function PagoUnoAUno({
  nomina,
  porPersona,
  onCambio,
  onCerrar,
}: {
  readonly nomina: NominaDetalle;
  readonly porPersona: PorPersona[];
  readonly onCambio: () => void;
  readonly onCerrar: () => void;
}) {
  const pendientes = porPersona.filter(
    (p) =>
      !(
        (p.totalJornada === 0 || p.pago?.jornada_paid) &&
        (p.totalPropina === 0 || p.pago?.propina_paid)
      ),
  );
  const [idx, setIdx] = useState(0);
  const p = pendientes[idx] ?? null;

  const marcar = useMutation({
    mutationFn: () =>
      marcarPago(nomina.id, {
        person_id: p!.personId,
        jornada_paid: true,
        propina_paid: true,
      }),
    onSuccess: () => {
      onCambio();
      if (idx >= pendientes.length - 1) onCerrar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  if (!p) return null;
  const persona = p.persona;
  const total = p.totalJornada + p.totalPropina;

  const copiar = (texto: string, que: string) => {
    void navigator.clipboard.writeText(texto);
    toast.success(`${que} copiado.`);
  };

  const dato = (etiqueta: string, valor: string | null | undefined) => (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100">
      <span className="text-sm text-gray-500">{etiqueta}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-gray-900">{valor || "—"}</span>
        {valor && (
          <button
            type="button"
            onClick={() => copiar(valor, etiqueta)}
            aria-label={`Copiar ${etiqueta}`}
            className="p-1 text-gray-400 hover:text-blue-700 rounded"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mt-10">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {idx + 1} de {pendientes.length} por pagar
            </span>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="p-1 text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full mt-2">
            <div
              className="h-1.5 bg-blue-600 rounded-full transition-all"
              style={{
                width: `${String((idx / pendientes.length) * 100)}%`,
              }}
            />
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-xl font-bold text-gray-900">{persona?.name}</h3>
          {!persona?.bank_code || !persona.account_number ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4" /> Le faltan datos bancarios —
              se completan en el Directorio.
            </p>
          ) : null}
          <div className="mt-3">
            {dato("RUT", persona?.rut ? formatearRut(persona.rut) : null)}
            {dato("Banco", persona?.bank_code ? nombreBanco(persona.bank_code) : null)}
            {dato(
              "Tipo de cuenta",
              persona?.account_type
                ? etiquetaTipoCuenta(persona.account_type)
                : null,
            )}
            {dato("N° de cuenta", persona?.account_number)}
            {dato("Monto", String(Math.round(total)))}
          </div>
          <div className="mt-3 text-sm text-gray-600">
            {p.totalJornada > 0 && (
              <div>
                Jornadas ({p.jornadas.length}):{" "}
                <strong>{clp(p.totalJornada)}</strong>
              </div>
            )}
            {p.totalPropina > 0 && (
              <div>
                Propinas: <strong>{clp(p.totalPropina)}</strong>
              </div>
            )}
            <div className="font-bold text-gray-900 mt-1">
              Total a transferir: {clp(total)}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() =>
              idx >= pendientes.length - 1 ? onCerrar() : setIdx(idx + 1)
            }
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
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
        </div>
      </div>
    </div>
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
  const esPlanta = p.persona?.default_kind === "planta";
  const muestraJornadas = !esPlanta || p.jornadas.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mt-10 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{p.persona?.name}</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-1 text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          {muestraJornadas && p.jornadas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                {esPlanta ? "Turnos extra pagados" : "Días trabajados"}
              </h4>
              <ul className="space-y-0.5">
                {p.jornadas.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="text-gray-700">
                      {formatISOUTCDateToString(iso(a.day))} ·{" "}
                      {nombreEvento(a.quotation_id)}
                      {a.management_resources?.name && (
                        <span className="text-gray-400">
                          {" "}
                          · {a.management_resources.name}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums">{clp(Number(a.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.propinas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                Propinas
              </h4>
              <ul className="space-y-0.5">
                {p.propinas.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="text-gray-700">
                      {formatISOUTCDateToString(iso(a.day))} ·{" "}
                      {nombreEvento(a.quotation_id)}
                    </span>
                    <span className="tabular-nums">
                      {clp(Number(a.tip_amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-2 border-t border-gray-200 font-bold text-gray-900 flex justify-between">
            <span>Total</span>
            <span className="tabular-nums">
              {clp(p.totalJornada + p.totalPropina)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
