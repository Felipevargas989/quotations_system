import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  agregarLinea,
  borrarCobro,
  editarCobro,
  editarLinea,
  emitirBoletas,
  quitarLinea,
  type CobroPorBoletear,
  type LineaDelCobro,
} from "../../services/boletas.service";
import { humanizeApiError } from "../../utils/apiErrors";

// UN COBRO POR BOLETEAR (doc 19 §9.4, paso 3a; maqueta del 04-11).
//
// El total lo deja el administrador; recepción lo reparte por cabaña (la
// cabaña la escribe ella), con el correo del huésped si lo da, y emite una
// boleta por cabaña. «Emitir» solo se prende cuando lo repartido suma el
// total. E3: todo se puede cambiar antes de emitir y queda anotado quién
// cambió qué («Ver cambios»). Lo que ya tiene boleta no se toca.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const casilla =
  "w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

const QUE: Record<string, string> = {
  total: "El total",
  descripcion: "Lo que se cobra",
  agrega: "Agregó",
  cabana: "La cabaña",
  monto: "El monto",
  correo: "El correo",
  quita: "Quitó",
  emite: "Emitió",
};

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Una cabaña todavía sin boleta: se edita al salir de la casilla. */
function FilaPorEmitir({
  linea,
  ocupado,
  onGuardar,
  onQuitar,
}: {
  readonly linea: LineaDelCobro;
  readonly ocupado: boolean;
  readonly onGuardar: (cambios: Partial<LineaDelCobro>) => void;
  readonly onQuitar: () => void;
}) {
  const [cabana, setCabana] = useState(linea.cabana);
  const [monto, setMonto] = useState<number | undefined>(linea.monto);
  const [correo, setCorreo] = useState(linea.correo ?? "");
  const [quitando, setQuitando] = useState(false);
  if (quitando)
    return (
      <tr>
        <td colSpan={4} className="py-1.5">
          <ConfirmInline
            question={`¿Quitar ${linea.cabana} del reparto?`}
            yesLabel="Sí, quitar"
            onYes={onQuitar}
            onNo={() => setQuitando(false)}
          />
        </td>
      </tr>
    );
  return (
    <tr className="align-top">
      <td className="py-1.5 pr-2">
        <input
          type="text"
          value={cabana}
          maxLength={22}
          disabled={ocupado}
          onChange={(e) => setCabana(e.target.value)}
          onBlur={() =>
            cabana.trim() &&
            cabana.trim() !== linea.cabana &&
            onGuardar({ cabana: cabana.trim() })
          }
          className={casilla}
        />
      </td>
      <td className="py-1.5 pr-2">
        <NumberInput
          value={monto}
          min={0}
          currency
          disabled={ocupado}
          onChange={setMonto}
          onCommit={(v) => v && v !== linea.monto && onGuardar({ monto: v })}
          className="px-2 py-1 text-sm"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="email"
          value={correo}
          placeholder="—"
          disabled={ocupado}
          onChange={(e) => setCorreo(e.target.value)}
          onBlur={() =>
            correo.trim() !== (linea.correo ?? "") &&
            onGuardar({ correo: correo.trim() || null })
          }
          className={casilla}
        />
      </td>
      <td className="py-1.5 whitespace-nowrap text-xs text-gray-500">
        Por emitir
        <button
          type="button"
          disabled={ocupado}
          onClick={() => setQuitando(true)}
          title="Quitar la cabaña"
          className="ml-2 align-middle text-gray-400 hover:text-red-600"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

export default function CobroPorBoletear({
  cobro,
  esAdmin,
  onCambio,
  onBorrado,
}: {
  readonly cobro: CobroPorBoletear;
  readonly esAdmin: boolean;
  readonly onCambio: (cobro: CobroPorBoletear) => void;
  readonly onBorrado: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [nueva, setNueva] = useState<{
    cabana: string;
    monto?: number;
    correo: string;
  }>({ cabana: "", correo: "" });
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [verCambios, setVerCambios] = useState(false);

  const hacer = async (
    accion: () => Promise<CobroPorBoletear>,
    error: string,
  ) => {
    setOcupado(true);
    try {
      onCambio(await accion());
      return true;
    } catch (e) {
      toast.error(humanizeApiError(e, error));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const agregar = async () => {
    if (!nueva.cabana.trim() || !nueva.monto) return;
    const ok = await hacer(
      () =>
        agregarLinea(cobro.id, {
          cabana: nueva.cabana.trim(),
          monto: nueva.monto ?? 0,
          correo: nueva.correo.trim() || null,
        }),
      "No se pudo agregar la cabaña.",
    );
    if (ok) setNueva({ cabana: "", correo: "" });
  };

  const emitir = async () => {
    setConfirmando(false);
    setOcupado(true);
    try {
      const r = await emitirBoletas(cobro.id);
      onCambio(r.cobro);
      if (r.emitidas.length)
        toast.success(
          `${r.emitidas.length === 1 ? "Boleta" : "Boletas"} N° ${r.emitidas.join(", ")} ${r.emitidas.length === 1 ? "emitida" : "emitidas"}.`,
        );
      if (r.aviso) toast.warn(r.aviso, { sticky: true });
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudieron emitir las boletas."));
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setBorrando(false);
    setOcupado(true);
    try {
      await borrarCobro(cobro.id);
      onBorrado();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo quitar el cobro."));
    } finally {
      setOcupado(false);
    }
  };

  const porEmitir = cobro.lineas.filter((l) => l.folio == null);
  const porEmitirSuma = porEmitir.reduce((s, l) => s + l.monto, 0);
  const listo = cobro.falta === 0 && cobro.porEmitir > 0;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 break-words">
            {cobro.descripcion}
          </p>
          <p className="text-xs text-gray-500">
            Total puesto por {cobro.creado_por_nombre ?? "administración"} ·{" "}
            {cobro.lineas.length}{" "}
            {cobro.lineas.length === 1 ? "cabaña" : "cabañas"}
            {cobro.numero ? ` · N° ${cobro.numero}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {total !== undefined ? (
            <div className="flex items-center gap-1">
              <div className="w-32">
                <NumberInput
                  value={total}
                  min={0}
                  currency
                  onChange={setTotal}
                  className="px-2 py-1 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={ocupado || !total}
                onClick={async () => {
                  if (
                    total &&
                    (await hacer(
                      () => editarCobro(cobro.id, { total }),
                      "No se pudo cambiar el total.",
                    ))
                  )
                    setTotal(undefined);
                }}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setTotal(undefined)}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <p className="flex items-center justify-end gap-1.5 text-lg font-semibold text-gray-900">
              {clp(cobro.total)}
              <button
                type="button"
                onClick={() => setTotal(cobro.total)}
                title="Cambiar el total (queda anotado)"
                className="text-gray-400 hover:text-blue-600"
              >
                <Pencil size={13} />
              </button>
            </p>
          )}
          <p className="text-xs text-gray-500">
            Boleteado {clp(cobro.boleteado)}
            {cobro.total - cobro.boleteado > 0
              ? ` · faltan ${clp(cobro.total - cobro.boleteado)}`
              : ""}
          </p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-1 font-medium">Cabaña</th>
            <th className="w-36 py-1 font-medium">Monto</th>
            <th className="py-1 font-medium">Correo del huésped</th>
            <th className="w-28 py-1 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {cobro.lineas.map((l) =>
            l.folio != null || l.estado ? (
              <tr key={l.id}>
                <td className="py-1.5 pr-2 text-gray-900">{l.cabana}</td>
                <td className="py-1.5 pr-2">{clp(l.monto)}</td>
                <td className="py-1.5 pr-2 text-gray-600 break-all">
                  {l.correo || "—"}
                </td>
                <td className="py-1.5 text-xs">
                  {l.estado === "por_confirmar" ? (
                    <span className="font-semibold text-amber-700">
                      Por confirmar
                    </span>
                  ) : (
                    <span className="font-semibold text-green-700">
                      N° {l.folio}
                    </span>
                  )}
                  {l.pdf_path && (
                    <span className="ml-2">
                      <FileViewLink
                        url={l.pdf_path}
                        title={`Boleta N° ${l.folio}.pdf`}
                      />
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              <FilaPorEmitir
                key={l.id}
                linea={l}
                ocupado={ocupado}
                onGuardar={(c) =>
                  void hacer(
                    () => editarLinea(cobro.id, l.id, c),
                    "No se pudo guardar el cambio.",
                  )
                }
                onQuitar={() =>
                  void hacer(
                    () => quitarLinea(cobro.id, l.id),
                    "No se pudo quitar la cabaña.",
                  )
                }
              />
            ),
          )}
          <tr className="align-top">
            <td className="py-1.5 pr-2">
              <input
                type="text"
                value={nueva.cabana}
                maxLength={22}
                placeholder="Cabaña"
                onChange={(e) => setNueva({ ...nueva, cabana: e.target.value })}
                className={casilla}
              />
            </td>
            <td className="py-1.5 pr-2">
              <NumberInput
                value={nueva.monto}
                min={0}
                currency
                placeholder="$"
                onChange={(v) => setNueva({ ...nueva, monto: v })}
                className="px-2 py-1 text-sm"
              />
            </td>
            <td className="py-1.5 pr-2">
              <input
                type="email"
                value={nueva.correo}
                placeholder="Opcional"
                onChange={(e) => setNueva({ ...nueva, correo: e.target.value })}
                className={casilla}
              />
            </td>
            <td className="py-1.5">
              <button
                type="button"
                disabled={ocupado || !nueva.cabana.trim() || !nueva.monto}
                onClick={() => void agregar()}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-40"
              >
                <Plus size={13} /> Agregar
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold ${cobro.falta === 0 ? "text-green-700" : cobro.falta > 0 ? "text-amber-700" : "text-red-600"}`}
        >
          {cobro.falta === 0
            ? "Lo repartido suma el total: falta $0"
            : cobro.falta > 0
              ? `Falta repartir ${clp(cobro.falta)}`
              : `Lo repartido pasa el total por ${clp(-cobro.falta)}`}
        </p>
        {confirmando ? (
          <ConfirmInline
            question={`¿Emitir ${porEmitir.length} ${porEmitir.length === 1 ? "boleta" : "boletas"} por ${clp(porEmitirSuma)}? Una boleta emitida no se borra.`}
            yesLabel="Sí, emitir"
            tono="normal"
            onYes={() => void emitir()}
            onNo={() => setConfirmando(false)}
          />
        ) : (
          cobro.porEmitir > 0 && (
            <button
              type="button"
              disabled={!listo || ocupado}
              onClick={() => setConfirmando(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {ocupado
                ? "Emitiendo…"
                : `Emitir ${cobro.porEmitir} ${cobro.porEmitir === 1 ? "boleta" : "boletas"}`}
            </button>
          )
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {cobro.cambios.length > 0 ? (
          <button
            type="button"
            onClick={() => setVerCambios((v) => !v)}
            className="font-semibold text-gray-500 hover:text-gray-700"
          >
            {verCambios
              ? "Ocultar cambios"
              : `Ver cambios (${cobro.cambios.length})`}
          </button>
        ) : (
          <span />
        )}
        {esAdmin &&
          cobro.boleteado === 0 &&
          (borrando ? (
            <ConfirmInline
              question="¿Quitar este cobro por boletear?"
              yesLabel="Sí, quitar"
              onYes={() => void borrar()}
              onNo={() => setBorrando(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setBorrando(true)}
              className="text-gray-400 hover:text-red-600"
            >
              Quitar cobro
            </button>
          ))}
      </div>
      {verCambios && (
        <ul className="space-y-0.5 text-xs text-gray-600">
          {cobro.cambios.map((c, i) => (
            <li key={i}>
              {cuando(c.created_at)} · {c.nombre ?? "—"} · {QUE[c.que] ?? c.que}
              {c.antes ? `: ${c.antes}` : ""}
              {c.despues ? `${c.antes ? " →" : ":"} ${c.despues}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
