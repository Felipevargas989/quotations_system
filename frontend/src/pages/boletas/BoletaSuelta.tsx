import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { pluralDeLaUnidad } from "../../constants/boletas";
import {
  emitirBoletaSuelta,
  getTarifario,
} from "../../services/boletas.service";
import { humanizeApiError } from "../../utils/apiErrors";

// LA BOLETA DE «NUEVO DOCUMENTO» (doc 19 §9.4, §9.16 y §9.21).
//
// Lo del tarifario (cabañas, ticket diario, tinaja…; D3) por su cantidad,
// con la cabaña que escribe recepción y el correo del huésped si lo da:
// facturacion.cl le manda la boleta (L11). El total sale del tarifario:
// los precios nunca a dedo. Escribir una línea a mano es solo del
// administrador. Desde el 06-11 vive en «Nuevo documento» de la sección
// Facturación, con el alto de las casillas del DTE y abajo el neto, el IVA
// y el total a pagar.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
// El neto y el IVA dentro del total con IVA, como los calcula el motor para
// la boleta (`desgloseDelTotal`): el neto redondeado y el IVA, lo que falta.
const netoDe = (total: number) => Math.round(total / 1.19);
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

interface LineaEnPantalla {
  clave: number;
  tarifarioId: string;
  cantidad?: number;
  /** Solo el administrador. */
  aMano?: boolean;
  descripcion?: string;
  monto?: number;
}

let siguiente = 1;
const lineaNueva = (aMano = false): LineaEnPantalla => ({
  clave: siguiente++,
  tarifarioId: "",
  cantidad: 1,
  aMano,
});

export default function BoletaSuelta({
  esAdmin,
  onEmitida,
}: {
  readonly esAdmin: boolean;
  readonly onEmitida: () => void;
}) {
  const tarifario = useQuery({
    queryKey: ["boletas", "tarifario"],
    queryFn: getTarifario,
  });
  const activos = (tarifario.data ?? []).filter((i) => i.activo);
  const [lineas, setLineas] = useState<LineaEnPantalla[]>(() => [lineaNueva()]);
  const [cabana, setCabana] = useState("");
  const [correo, setCorreo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [ultima, setUltima] = useState<{
    folio: number | null;
    total: number;
    pdf_path: string | null;
  } | null>(null);

  const itemDe = (l: LineaEnPantalla) =>
    activos.find((i) => String(i.id) === l.tarifarioId);
  const valorDe = (l: LineaEnPantalla) =>
    l.aMano ? (l.monto ?? 0) : (itemDe(l)?.precio ?? 0) * (l.cantidad ?? 0);
  const total = lineas.reduce((s, l) => s + valorDe(l), 0);
  const lista =
    lineas.length > 0 &&
    lineas.every((l) =>
      l.aMano
        ? !!l.descripcion?.trim() && !!l.monto
        : !!itemDe(l) && (l.cantidad ?? 0) >= 1,
    );

  const poner = (clave: number, cambios: Partial<LineaEnPantalla>) =>
    setLineas((ls) =>
      ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)),
    );

  const emitir = async () => {
    setConfirmando(false);
    setEmitiendo(true);
    try {
      const r = await emitirBoletaSuelta({
        lineas: lineas.map((l) =>
          l.aMano
            ? { descripcion: l.descripcion?.trim(), monto: l.monto }
            : { tarifario_id: Number(l.tarifarioId), cantidad: l.cantidad },
        ),
        cabana: cabana.trim() || null,
        correo: correo.trim() || null,
      });
      if (r.boleta) {
        setUltima(r.boleta);
        toast.success(`Boleta N° ${r.boleta.folio} emitida.`);
        setLineas([lineaNueva()]);
        setCabana("");
        setCorreo("");
      }
      if (r.aviso) toast.warn(r.aviso, { sticky: true });
      onEmitida();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo emitir la boleta."));
    } finally {
      setEmitiendo(false);
    }
  };

  if (tarifario.isPending)
    return <p className="text-sm text-gray-400">Cargando el tarifario…</p>;
  if (activos.length === 0 && !esAdmin)
    return (
      <p className="text-sm text-gray-500">
        Todavía no hay tarifario: lo arma el administrador en «Tarifario».
      </p>
    );

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {ultima && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Boleta N° {ultima.folio} emitida por {clp(ultima.total)}.
          {ultima.pdf_path && (
            <FileViewLink
              url={ultima.pdf_path}
              title={`Boleta N° ${ultima.folio}.pdf`}
            />
          )}
        </p>
      )}

      <div className="space-y-2">
        {lineas.map((l) => (
          <div key={l.clave} className="flex flex-wrap items-end gap-2">
            {l.aMano ? (
              <>
                <label className="block min-w-[14rem] flex-1">
                  <span className="flex justify-between text-xs text-gray-500">
                    Qué se cobra (a mano)
                    <span>{Array.from(l.descripcion ?? "").length}/80</span>
                  </span>
                  <input
                    type="text"
                    value={l.descripcion ?? ""}
                    maxLength={80}
                    onChange={(e) =>
                      poner(l.clave, { descripcion: e.target.value })
                    }
                    className={casilla}
                  />
                </label>
                <label className="block w-36">
                  <span className="text-xs text-gray-500">Monto con IVA</span>
                  <NumberInput
                    value={l.monto}
                    min={0}
                    currency
                    placeholder="0"
                    onChange={(v) => poner(l.clave, { monto: v })}
                    className="text-sm"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="min-w-[16rem] flex-1">
                  <span className="text-xs text-gray-500">Qué se cobra</span>
                  <SelectWithSearch
                    options={activos.map((i) => ({
                      value: String(i.id),
                      label: i.nombre,
                      hint: `${clp(i.precio)} por ${i.unidad}`,
                    }))}
                    value={l.tarifarioId}
                    onChange={(v) => poner(l.clave, { tarifarioId: v ?? "" })}
                    placeholder="Elegir del tarifario"
                    tamano="sm"
                  />
                </div>
                <label className="block w-24">
                  <span className="text-xs text-gray-500">
                    {itemDe(l)
                      ? pluralDeLaUnidad(itemDe(l)?.unidad ?? "")
                      : "Cantidad"}
                  </span>
                  <NumberInput
                    value={l.cantidad}
                    min={1}
                    onChange={(v) => poner(l.clave, { cantidad: v })}
                    className="text-sm"
                  />
                </label>
              </>
            )}
            <span className="w-28 pb-2 text-right text-sm text-gray-900">
              {clp(valorDe(l))}
            </span>
            {lineas.length > 1 && (
              <button
                type="button"
                title="Quitar la línea"
                onClick={() =>
                  setLineas((ls) => ls.filter((x) => x.clave !== l.clave))
                }
                className="pb-2 text-gray-400 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-4">
          {activos.length > 0 && (
            <button
              type="button"
              onClick={() => setLineas((ls) => [...ls, lineaNueva()])}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <Plus size={13} /> Agregar línea
            </button>
          )}
          {esAdmin && (
            <button
              type="button"
              onClick={() => setLineas((ls) => [...ls, lineaNueva(true)])}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:underline"
            >
              <Plus size={13} /> Línea a mano (solo administración)
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="flex justify-between text-xs text-gray-500">
            Cabaña (opcional)
            <span>{Array.from(cabana).length}/22</span>
          </span>
          <input
            type="text"
            value={cabana}
            maxLength={22}
            placeholder="Ej.: Cabaña 4"
            onChange={(e) => setCabana(e.target.value)}
            className={casilla}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">
            Correo del huésped (opcional: le llega la boleta)
          </span>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className={casilla}
          />
        </label>
      </div>

      <dl className="ml-auto grid w-full grid-cols-2 gap-x-3 text-sm sm:w-64">
        <dt className="text-gray-500">Neto</dt>
        <dd className="text-right">{clp(netoDe(total))}</dd>
        <dt className="text-gray-500">IVA 19 %</dt>
        <dd className="text-right">{clp(total - netoDe(total))}</dd>
        <dt className="font-semibold">Total a pagar</dt>
        <dd className="text-right font-semibold">{clp(total)}</dd>
      </dl>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3">
        {confirmando ? (
          <ConfirmInline
            question={`¿Emitir la boleta por ${clp(total)}? Una boleta emitida no se borra.`}
            yesLabel="Sí, emitir"
            tono="normal"
            onYes={() => void emitir()}
            onNo={() => setConfirmando(false)}
          />
        ) : (
          <button
            type="button"
            disabled={!lista || emitiendo || total <= 0}
            onClick={() => setConfirmando(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {emitiendo ? "Emitiendo…" : "Emitir boleta"}
          </button>
        )}
      </div>
    </div>
  );
}
