import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQuotationById } from "../services/quotations.service";
import { getPaymentsByQuotationId } from "../services/payments.service";
import { Save, Plus, Trash2, AlertTriangle, Lock } from "lucide-react";
import Modal from "./Modal";
import { NumberInput } from "./inputs";
import { formatFechaEvento, hoyEnChile } from "../utils/dates";
import { useAuth } from "../contexts/AuthContext";
import { montoDelAbono } from "../utils/abonoParaReservar";
import { saleWithoutTip } from "../utils/quotationMoney";
import {
  abonadoEn,
  cuotaConPlata,
  fechaDelSaldo,
  filasIniciales,
  propuestaDeMontos,
  type CuotaDelPlan,
  type FilaDelPlan,
} from "../utils/planDePagos";

// EL PLAN DE PAGOS: una lista simple de cuotas — comentario, fecha y MONTO
// en pesos (el % se calcula solo, informativo). Sirve para dos cosas:
// - "aceptar": se abre al pasar una cotización a Aceptada (tablero y ficha
//   del negocio); guardar crea el plan y acepta.
// - "editar" (28-10-2026, caso 703): «Editar plan de pagos» de Post-Venta;
//   cambia montos, fechas y cantidad de cuotas sin tocar el estado, y solo
//   mientras no haya ningún pago (Felipe: "no creo que se deba poder editar
//   después de cargar la primera cuota").
// En los dos, las cuotas con plata se ven fijas arriba y no se mueven: lo
// que se reparte es lo que falta (doc 14 §Editar el plan). El plan nuevo
// parte con el abono de Mi empresa hoy y el saldo 7 días antes del evento
// (utils/planDePagos.ts); sin % en la empresa, una cuota por el total.

interface PaymentPlanEditorProps {
  readonly quotation: {
    id: string;
    quotation_number: string | number;
    client_name?: string;
    total_amount: number;
    event_date?: Date | string | null;
  };
  readonly modo?: "aceptar" | "editar";
  readonly guardando?: boolean;
  /** Llegan SOLO las cuotas sin plata, en su orden. */
  readonly onSave: (
    plan: {
      payment_type: string;
      amount: number;
      due_date: string;
      notes: string;
    }[],
  ) => void;
  readonly onCancel: () => void;
}

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

export default function PaymentPlanEditor({
  quotation,
  modo = "aceptar",
  guardando = false,
  onSave,
  onCancel,
}: PaymentPlanEditorProps) {
  // El total FRESCO desde el motor (caso 501, 06-09): la pantalla que
  // abre este editor trae el total de su lista, que puede llevar hasta
  // 30 segundos de atraso. El portero del motor igual lo rechazaría; esto
  // evita la molestia. Las cuotas, frescas por lo mismo.
  const frescoQuery = useQuery({
    queryKey: ["quotation", "fresca", quotation.id],
    queryFn: () => getQuotationById(quotation.id),
    staleTime: 0,
  });
  const cuotasQuery = useQuery({
    queryKey: ["payments", "editor", quotation.id],
    queryFn: () => getPaymentsByQuotationId(quotation.id),
    staleTime: 0,
  });
  const { company } = useAuth();
  const fresca = frescoQuery.data?.data;
  const total = Math.round(
    Number(fresca?.total_amount ?? quotation.total_amount ?? 0),
  );
  const cuotas = (cuotasQuery.data?.data ?? []) as CuotaDelPlan[];
  const fijas = cuotas.filter(cuotaConPlata);
  const libres = cuotas.filter((c) => !cuotaConPlata(c));
  const conPlata = fijas.reduce((s, c) => s + Math.round(Number(c.amount)), 0);
  const objetivo = total - conPlata;
  // El abono de Mi empresa (migración 160), sobre el total sin propina:
  // el mismo número que la hoja de la cotización muestra bajo el TOTAL. Solo
  // cuando todavía no se ha pagado nada.
  const abono =
    fijas.length === 0
      ? montoDelAbono(
          saleWithoutTip(fresca ?? null),
          company?.abono_reserva_pct,
        )
      : null;
  const hoy = hoyEnChile();
  const fechaEvento = fresca?.event_date ?? quotation.event_date ?? null;
  // 13-08: leía la fecha del evento en hora chilena y la mostraba un
  // día antes. Va en UTC, como se guarda.
  const eventDateTxt = fechaEvento ? formatFechaEvento(fechaEvento) : null;
  // Listo = llegó lo FRESCO: si hay algo guardado de una vez anterior, se
  // espera a que termine de pedirse de nuevo (una cuota que se pagó entre
  // medio no puede aparecer como libre).
  const listo =
    frescoQuery.isSuccess &&
    cuotasQuery.isSuccess &&
    !frescoQuery.isFetching &&
    !cuotasQuery.isFetching;
  const sinLeer = frescoQuery.isError || cuotasQuery.isError;

  // Las filas parten cuando llegan el total y las cuotas: las cuotas sin
  // plata que ya existen o, si no hay, la propuesta (abono y saldo).
  const [rows, setRows] = useState<FilaDelPlan[] | null>(null);
  const [montosAMano, setMontosAMano] = useState(false);
  useEffect(() => {
    if (!listo || sinLeer || rows !== null) return;
    setRows(
      libres.length > 0
        ? libres.map((c) => ({
            label: c.payment_type?.trim() || `Cuota ${c.payment_number}`,
            due_date: String(c.due_date).slice(0, 10),
            amount: Math.round(Number(c.amount)),
          }))
        : filasIniciales({
            objetivo,
            abono,
            conPagos: fijas.length,
            hoy,
            fechaEvento,
          }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, sinLeer]);

  const filas = rows ?? [];
  const suma = filas.reduce((s, r) => s + (r.amount || 0), 0);
  const diff = objetivo - suma; // >0 falta asignar · <0 sobra
  const pct = (amount: number | undefined) =>
    total > 0 ? Math.round(((amount || 0) / total) * 1000) / 10 : 0;

  // ¿Los montos siguen siendo la propuesta del sistema? Mientras nadie
  // escriba un monto a mano, cada cuota que se agrega o se quita vuelve a
  // repartir: el abono primero y el resto parejo (Felipe, 06-10: "que la
  // propuesta inicial siempre sea fraccionada"). En cuanto se edita un
  // monto, se respeta lo escrito y la cuota nueva nace con lo que falte.
  const repartir = (lista: FilaDelPlan[]) => {
    const montos = propuestaDeMontos(objetivo, lista.length, abono);
    return lista.map((r, i) => ({ ...r, amount: montos[i] }));
  };

  const updateRow = (i: number, patch: Partial<FilaDelPlan>) => {
    if ("amount" in patch) setMontosAMano(true);
    setRows((prev) =>
      (prev ?? []).map((r, ix) => (ix === i ? { ...r, ...patch } : r)),
    );
  };

  const addRow = () =>
    setRows((prev) => {
      const antes = prev ?? [];
      const nuevas = [
        ...antes,
        {
          label: `Cuota ${fijas.length + antes.length + 1}`,
          // Las cuotas suelen ir en orden: la nueva parte con la fecha de
          // la última; sin ninguna, la del saldo.
          due_date:
            antes[antes.length - 1]?.due_date ??
            fechaDelSaldo(fechaEvento, hoy),
          amount: undefined,
        },
      ];
      if (!montosAMano) return repartir(nuevas);
      // Con montos escritos a mano: la nueva nace con lo que falta.
      return nuevas.map((r, i) =>
        i === nuevas.length - 1
          ? { ...r, amount: diff > 0 ? diff : undefined }
          : r,
      );
    });

  const removeRow = (i: number) =>
    setRows((prev) => {
      const quedan = (prev ?? []).filter((_, ix) => ix !== i);
      return montosAMano || quedan.length === 0 ? quedan : repartir(quedan);
    });

  const rowsValid = filas.every(
    (r) => (r.amount || 0) > 0 && r.due_date && r.label.trim(),
  );
  // Si lo pagado ya cubre el total, el plan puede quedar sin cuotas nuevas.
  const canSave =
    rows !== null &&
    !guardando &&
    objetivo >= 0 &&
    rowsValid &&
    diff === 0 &&
    (filas.length > 0 || objetivo === 0);

  const handleSave = () => {
    if (!canSave) return;
    onSave(
      filas.map((r) => ({
        payment_type: r.label.trim(),
        amount: Math.round(r.amount || 0),
        due_date: r.due_date,
        notes: "",
      })),
    );
  };

  const editando = modo === "editar";
  const pie = (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-yellow-800 text-sm font-medium">
          {editando
            ? "El cliente ve el plan nuevo en su portal; no se le manda correo. Después del primer pago, el plan ya no se edita."
            : "Al aceptar, la cotización queda Aceptada y el evento pasa a Post-Venta con estas cuotas para el seguimiento de pagos."}
        </p>
      </div>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save size={16} />
          <span>
            {guardando
              ? "Guardando…"
              : editando
                ? "Guardar plan"
                : "Aceptar plan y cotización"}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      titulo={editando ? "Editar plan de pagos" : "Plan de pagos"}
      subtitulo={
        <>
          Cotización #{quotation.quotation_number}
          {quotation.client_name ? ` · ${quotation.client_name}` : ""}
          {eventDateTxt ? ` · Evento: ${eventDateTxt}` : ""}
          <span className="block text-lg font-bold text-green-600">
            Total: {clp(total)}
          </span>
        </>
      }
      ancho="max-w-3xl"
      pie={pie}
      onCerrar={onCancel}
    >
      {sinLeer ? (
        <p className="text-sm text-red-600">
          No se pudo leer el plan de pagos de esta cotización. Cierra y vuelve a
          intentarlo.
        </p>
      ) : rows === null ? (
        <p className="text-sm text-gray-500">Cargando el plan de pagos…</p>
      ) : (
        <div className="space-y-3">
          {/* Encabezados de la lista */}
          <div className="grid grid-cols-[1fr,150px,150px,64px,32px] gap-2 px-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Comentario</span>
            <span>Vence</span>
            <span className="text-right">Monto</span>
            <span className="text-right">%</span>
            <span></span>
          </div>

          {/* Las cuotas con plata: fijas, no se editan (doc 14). */}
          {fijas.map((c) => {
            const abonado = abonadoEn(c);
            const monto = Math.round(Number(c.amount));
            return (
              <div
                key={c.id}
                className="grid grid-cols-[1fr,150px,150px,64px,32px] gap-2 items-center rounded-lg bg-gray-50 px-1 py-1.5 text-sm text-gray-600"
                title="Esta cuota tiene pagos registrados: no se mueve"
              >
                <span className="px-2 truncate">
                  {c.payment_type || `Cuota ${c.payment_number}`}
                  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    {abonado >= monto || c.status === "pagado"
                      ? "Pagada"
                      : `Abonado ${clp(abonado)}`}
                  </span>
                </span>
                <span className="px-2">
                  {formatFechaEvento(String(c.due_date))}
                </span>
                <span className="px-2 text-right tabular-nums">
                  {clp(monto)}
                </span>
                <span className="text-right text-gray-400 tabular-nums">
                  {pct(monto)}%
                </span>
                <Lock size={14} className="justify-self-end text-gray-400" />
              </div>
            );
          })}

          {objetivo < 0 && (
            <p className="text-sm font-semibold text-amber-700">
              Lo pagado ya supera el total de la cotización: no hay cuotas que
              repartir.
            </p>
          )}

          {filas.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr,150px,150px,64px,32px] gap-2 items-center"
            >
              <input
                value={r.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="Ej: Abono reserva, contra factura…"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="date"
                value={r.due_date}
                onChange={(e) => updateRow(i, { due_date: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <NumberInput
                value={r.amount}
                onChange={(v) => updateRow(i, { amount: v || undefined })}
                min={0}
                formatThousands
                placeholder="0"
              />
              <span className="text-right text-sm text-gray-400 tabular-nums">
                {pct(r.amount)}%
              </span>
              {filas.length > 1 || objetivo === 0 ? (
                <button
                  onClick={() => removeRow(i)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 justify-self-end"
                  title="Quitar cuota"
                >
                  <Trash2 size={15} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={addRow}
              disabled={objetivo <= 0}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Agregar cuota
            </button>
            {/* Suma contra lo que falta repartir, en vivo */}
            {diff === 0 ? (
              <span className="text-sm font-semibold text-green-600">
                Suma {clp(suma + conPlata)}
              </span>
            ) : diff > 0 ? (
              <span className="text-sm font-semibold text-amber-600">
                Suma {clp(suma + conPlata)} · falta asignar {clp(diff)}
              </span>
            ) : (
              <span className="text-sm font-semibold text-red-600">
                Suma {clp(suma + conPlata)} · sobran {clp(-diff)}
              </span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
