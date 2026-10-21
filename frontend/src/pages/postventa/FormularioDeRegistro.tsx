import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { MEDIOS_DE_PAGO } from "../../constants/mediosDePago";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";

/**
 * EL FORMULARIO DE «REGISTRAR PAGO» Y «REGISTRAR REEMBOLSO» (20-10-2026).
 * Felipe: "¿por qué el registrar reembolso no tiene la misma estructura que
 * el registrar pagos (incluyendo el arrastrar y soltar)? (…) mantener todo
 * homogéneo (me gustó si el color rojo se nota que es un reembolso)".
 *
 * Una sola pieza para los dos: monto con su ayuda, fecha, medio, comprobante
 * (botón o arrastrar, validado al llegar) y notas. Azul para pagos, rojo para
 * reembolsos. El arrastre es el de la casa (useArrastreDeArchivos): antes
 * «Registrar pago» llevaba su copia a mano.
 */
export interface CamposDelRegistro {
  readonly monto: number;
  readonly fecha: string;
  readonly medio: string;
  readonly notas: string;
  readonly archivo: File | null;
}

const TONOS = {
  pago: {
    caja: "border-blue-200 bg-blue-50/40",
    arrastre: "border-blue-400 border-dashed bg-blue-50/60",
    aviso: "text-blue-600",
    boton: "bg-blue-600 hover:bg-blue-700",
    anillo: "focus-within:ring-blue-500",
  },
  reembolso: {
    caja: "border-red-200 bg-red-50/40",
    arrastre: "border-red-400 border-dashed bg-red-50/60",
    aviso: "text-red-600",
    boton: "bg-red-600 hover:bg-red-700",
    anillo: "focus-within:ring-red-500",
  },
} as const;

export default function FormularioDeRegistro({
  tono,
  titulo,
  campos,
  onCampos,
  maximo,
  ayudaMonto,
  textoBoton,
  valido,
  guardando,
  error,
  onGuardar,
  onCerrar,
  extra,
}: {
  readonly tono: keyof typeof TONOS;
  readonly titulo: string;
  readonly campos: CamposDelRegistro;
  readonly onCampos: (campos: CamposDelRegistro) => void;
  readonly maximo: number;
  /** Debajo del monto: «Saldo pendiente: $X» o «Falta por reembolsar: $X». */
  readonly ayudaMonto: string;
  readonly textoBoton: string;
  readonly valido: boolean;
  readonly guardando: boolean;
  readonly error: string | null;
  readonly onGuardar: () => void;
  readonly onCerrar: () => void;
  /** Lo propio de cada uno (en pagos, cómo se reparte entre las cuotas). */
  readonly extra?: ReactNode;
}) {
  const t = TONOS[tono];
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const cambiar = (parte: Partial<CamposDelRegistro>) =>
    onCampos({ ...campos, ...parte });

  // Valida tipo y tamaño AL LLEGAR el archivo (revisión 10-08), no al enviar.
  const recibir = (f: File | null | undefined) => {
    if (!f) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) {
      setErrorArchivo("El comprobante debe ser imagen o PDF.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setErrorArchivo("El comprobante no puede superar los 5 MB.");
      return;
    }
    setErrorArchivo(null);
    cambiar({ archivo: f });
  };
  const { arrastrando, zona } = useArrastreDeArchivos((archivos) => {
    recibir(archivos[0]);
    if (archivos.length > 1)
      toast.warn(`Se tomó "${archivos[0].name}". El comprobante va de a uno.`);
  });

  return (
    <div
      className={`border rounded-xl p-4 space-y-3 max-w-2xl transition-colors ${
        arrastrando ? t.arrastre : t.caja
      }`}
      {...zona}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-800">{titulo}</h4>
        <button
          type="button"
          onClick={onCerrar}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600">Monto</label>
          <NumberInput
            value={campos.monto || undefined}
            onChange={(v) => cambiar({ monto: v || 0 })}
            min={0}
            max={maximo}
            formatThousands
            currency
            placeholder="0"
            className="text-right"
          />
          <p className="text-[11px] text-gray-400 mt-0.5">{ayudaMonto}</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Fecha</label>
          <input
            type="date"
            value={campos.fecha}
            onChange={(e) => cambiar({ fecha: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600">
          Medio de pago
        </label>
        <SelectWithSearch
          options={MEDIOS_DE_PAGO.map((m) => ({ value: m, label: m }))}
          value={campos.medio}
          onChange={(medio) => cambiar({ medio })}
          placeholder="Medio de pago"
          searchPlaceholder="Buscar medio…"
          noResultsText="Sin resultados"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">
          Comprobante{" "}
          <span className="font-normal text-gray-400">
            (imagen o PDF · máx. 5 MB)
          </span>
        </label>
        <div className="mt-1.5 flex items-center gap-2.5">
          <label
            className={`cursor-pointer shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 ${t.anillo}`}
          >
            Seleccionar archivo
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                recibir(e.target.files?.[0]);
                // Valor limpio: re-elegir el MISMO archivo vuelve a sonar.
                e.currentTarget.value = "";
              }}
            />
          </label>
          <span
            className={
              arrastrando
                ? `text-xs font-bold ${t.aviso}`
                : "text-xs text-gray-400"
            }
          >
            {arrastrando ? "¡Suéltalo aquí! ↓" : "o arrastra aquí"}
          </span>
        </div>
        {campos.archivo && (
          <p className="text-xs text-gray-600 truncate mt-1">
            Listo para subir:{" "}
            <b className="text-gray-800">{campos.archivo.name}</b>
          </p>
        )}
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600">
          Notas (opcional)
        </label>
        <input
          type="text"
          value={campos.notas}
          onChange={(e) => cambiar({ notas: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
          placeholder="Información adicional…"
        />
      </div>
      {extra}
      {(errorArchivo || error) && (
        <p className="text-xs text-red-600">{errorArchivo || error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCerrar}
          className="px-3 py-1.5 text-sm text-gray-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando || !valido}
          className={`px-4 py-1.5 text-white rounded-lg text-sm font-semibold disabled:opacity-50 ${t.boton}`}
        >
          {guardando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </div>
  );
}
