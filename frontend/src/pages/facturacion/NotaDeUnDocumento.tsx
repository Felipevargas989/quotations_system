import { useState } from "react";
import { X } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import { LARGO_MAXIMO } from "../../constants/facturacion";
import {
  emitirNota,
  revisarNota,
  type AccionDeNota,
  type DocumentoDeLaLista,
  type NotaPedida,
  type VistaDeLaNota,
} from "../../services/documentosTributarios.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { fechaCorta } from "../../utils/ordenesDeCompra";

// ANULAR, REBAJAR O CORREGIR (doc 19 §9.5, paso 4; maqueta del 04-11).
//
// De una factura: «Anular completa» (NC por el total, código 1), «Rebajar
// un monto» (NC parcial, código 3) o «Corregir un texto» (NC en $0, código
// 2). De una nota de crédito: anularla con una nota de débito; de una nota
// de débito, con una de crédito. El plazo del SII va a la vista (para anular,
// este mes o el siguiente; para rebajar, 6 meses). Nada sale sin «Ver cómo
// sale» y la confirmación: una nota emitida no se borra.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const casilla =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

const OPCIONES: {
  accion: AccionDeNota;
  titulo: string;
  detalle: string;
}[] = [
  {
    accion: "anular",
    titulo: "Anular completa",
    detalle: "NC por el total · código 1",
  },
  {
    accion: "rebajar",
    titulo: "Rebajar un monto",
    detalle: "NC parcial · código 3",
  },
  {
    accion: "corregir",
    titulo: "Corregir un texto",
    detalle: "NC en $0 · código 2",
  },
];

const NOMBRE_DE_LA_NOTA: Record<number, string> = {
  56: "Nota de débito",
  61: "Nota de crédito",
};

export default function NotaDeUnDocumento({
  doc,
  onCerrar,
  onEmitida,
}: {
  readonly doc: DocumentoDeLaLista;
  readonly onCerrar: () => void;
  readonly onEmitida: () => void;
}) {
  const esFactura = doc.tipo === 33;
  const opciones = OPCIONES.filter(
    (o) =>
      (o.accion === "anular" && doc.acciones.anular) ||
      (o.accion === "rebajar" && doc.acciones.rebajar) ||
      (o.accion === "corregir" && doc.acciones.corregir),
  );
  const [accion, setAccion] = useState<AccionDeNota>(
    opciones[0]?.accion ?? "anular",
  );
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState<number | undefined>(undefined);
  const [receptor, setReceptor] = useState({
    razon_social: "",
    giro: "",
    direccion: "",
    comuna: "",
  });
  const [vista, setVista] = useState<VistaDeLaNota | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const nota = (): NotaPedida => ({
    accion,
    motivo: motivo.trim(),
    monto: accion === "rebajar" ? (monto ?? null) : null,
    receptor:
      accion === "corregir"
        ? Object.fromEntries(
            Object.entries(receptor).filter(([, v]) => v.trim()),
          )
        : null,
  });

  const verComoSale = async () => {
    setOcupado(true);
    try {
      setVista(await revisarNota(doc.id, nota()));
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo armar la nota."));
    } finally {
      setOcupado(false);
    }
  };

  const emitir = async () => {
    setConfirmando(false);
    setOcupado(true);
    try {
      const r = await emitirNota(doc.id, nota());
      if (r.estado === "por_confirmar")
        toast.warn(
          "Se cortó la conexión con facturacion.cl: la nota queda por confirmar. No la emitas de nuevo.",
          { sticky: true },
        );
      else
        toast.success(
          `${NOMBRE_DE_LA_NOTA[r.tipo] ?? "Nota"} N° ${r.folio} emitida.`,
        );
      onEmitida();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo emitir la nota."));
    } finally {
      setOcupado(false);
    }
  };

  const plazo =
    doc.plazos &&
    (accion === "rebajar"
      ? `Para rebajar, el SII da 6 meses: hasta el ${fechaCorta(doc.plazos.rebajar)}.`
      : `Para ${accion === "anular" ? "anular" : "corregir"}, el SII da este mes o el siguiente: hasta el ${fechaCorta(doc.plazos.anular)}.`);
  const listo =
    !!motivo.trim() && (accion !== "rebajar" || (!!monto && monto > 0));

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">
          Anular{" "}
          {esFactura ? "la factura" : doc.tipo === 61 ? "la NC" : "la ND"}{" "}
          {doc.folio}
          {!esFactura && (
            <span className="font-normal text-gray-500">
              {" "}
              · con una {doc.tipo === 61 ? "nota de débito" : "nota de crédito"}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar"
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      {esFactura && (
        <div className="grid gap-2 sm:grid-cols-3">
          {opciones.map((o) => (
            <button
              key={o.accion}
              type="button"
              onClick={() => {
                setAccion(o.accion);
                setVista(null);
              }}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${accion === o.accion ? "border-blue-600 bg-white ring-2 ring-blue-200" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <span className="block font-semibold text-gray-900">
                {o.titulo}
              </span>
              <span className="block text-xs text-gray-500">{o.detalle}</span>
            </button>
          ))}
        </div>
      )}

      <label className="block">
        <span className="flex justify-between text-xs text-gray-500">
          Motivo (va en la nota)
          <span>{Array.from(motivo).length}/90</span>
        </span>
        <input
          type="text"
          value={motivo}
          maxLength={90}
          placeholder={
            accion === "rebajar"
              ? "Ej.: Vinieron 20 personas menos"
              : accion === "corregir"
                ? "Ej.: El giro correcto es Elaboración de cervezas"
                : "Ej.: Se emitió con el RUT equivocado"
          }
          onChange={(e) => {
            setMotivo(e.target.value);
            setVista(null);
          }}
          className={casilla}
        />
      </label>

      {accion === "rebajar" && (
        <label className="block">
          <span className="text-xs text-gray-500">
            Cuánto se rebaja, con IVA
            {doc.saldo != null ? ` (le quedan ${clp(doc.saldo)})` : ""}
          </span>
          <div className="w-48">
            <NumberInput
              value={monto}
              min={0}
              currency
              placeholder="0"
              onChange={(v) => {
                setMonto(v);
                setVista(null);
              }}
              className="px-3 py-1.5 text-sm"
            />
          </div>
        </label>
      )}

      {accion === "corregir" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["razon_social", "Razón social", LARGO_MAXIMO.razon_social],
              ["giro", "Giro", LARGO_MAXIMO.giro],
              ["direccion", "Dirección", LARGO_MAXIMO.direccion],
              ["comuna", "Comuna", LARGO_MAXIMO.comuna],
            ] as const
          ).map(([campo, nombre, largo]) => (
            <label key={campo} className="block">
              <span className="flex justify-between text-xs text-gray-500">
                {nombre}, como debe decir (si cambia)
                <span>
                  {Array.from(receptor[campo]).length}/{largo}
                </span>
              </span>
              <input
                type="text"
                value={receptor[campo]}
                maxLength={largo}
                onChange={(e) => {
                  setReceptor({ ...receptor, [campo]: e.target.value });
                  setVista(null);
                }}
                className={casilla}
              />
            </label>
          ))}
        </div>
      )}

      {plazo && <p className="text-xs text-gray-600">{plazo}</p>}

      {vista && (
        <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <p className="font-semibold text-gray-900">
            {NOMBRE_DE_LA_NOTA[vista.tipo] ?? "Nota"} N° {vista.folio}{" "}
            <span className="font-normal text-gray-500">
              (el siguiente) · {fechaCorta(vista.fecha)}
            </span>
          </p>
          <p className="text-gray-700">
            {accion === "anular"
              ? "Anula"
              : accion === "rebajar"
                ? "Rebaja"
                : "Corrige"}{" "}
            {vista.modifica} · {vista.receptor.razon_social}
          </p>
          {vista.lineas.map((l, i) => (
            <p key={i} className="text-xs text-gray-600">
              {l.cantidad} × {l.descripcion} · neto {clp(l.cantidad * l.precio)}
            </p>
          ))}
          {vista.montos && (
            <p className="text-xs text-gray-600">
              Neto {clp(vista.montos.neto)} · IVA {clp(vista.montos.iva)} ·{" "}
              <span className="font-semibold text-gray-900">
                Total {clp(vista.montos.total)}
              </span>
            </p>
          )}
          {vista.avisos.map((a) => (
            <p key={a} className="text-xs text-amber-700">
              • {a}
            </p>
          ))}
          {vista.problemas.map((p) => (
            <p key={p} className="text-xs text-red-600">
              • {p}
            </p>
          ))}
          {vista.ambiente === "simulado" && (
            <p className="text-xs text-amber-700">
              Simulada: facturacion.cl todavía no está conectado y no sale nada
              al SII.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {confirmando && vista?.montos ? (
          <ConfirmInline
            question={`¿Emitir la ${(NOMBRE_DE_LA_NOTA[vista.tipo] ?? "nota").toLowerCase()} por ${clp(vista.montos.total)}? Una nota emitida no se borra.`}
            yesLabel="Sí, emitir"
            tono="normal"
            onYes={() => void emitir()}
            onNo={() => setConfirmando(false)}
          />
        ) : (
          <>
            <button
              type="button"
              disabled={!listo || ocupado}
              onClick={() => void verComoSale()}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Ver cómo sale
            </button>
            <button
              type="button"
              disabled={!vista?.ok || ocupado}
              onClick={() => setConfirmando(true)}
              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {ocupado ? "Un momento…" : "Emitir nota"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
