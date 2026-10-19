import { CheckCircle2, Loader2, Pencil, X } from "lucide-react";
import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import { subirDocumentoDeEmpresa } from "../../services/oportunidades.service";
import {
  type DatosDeRespaldo,
  leerRespaldo,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import RespaldoDeExperiencia from "./RespaldoDeExperiencia";
import { RESPALDO_VACIO, resumenDelRespaldo, TIPO_RESPALDO } from "./respaldos";

// VARIOS RESPALDOS A LA VEZ, QUE SE LEEN SOLOS (decisión 34 del doc 17,
// 19-10). Felipe: "¿podría ser que yo suba el documento, que se lea
// automáticamente y que rellene los campos... finalmente subo todas las
// órdenes de compra". Se arrastran las órdenes de compra o facturas; la IA
// lee cada una (si es de Mercado Público, la confirma su ficha pública);
// se revisa la lista y se guarda todo. Nada se guarda sin revisar.

const MAX_MB = 15;

type Fila = {
  clave: string;
  archivo: File;
  estado: "leyendo" | "leido" | "sin_leer";
  datos: DatosDeRespaldo;
  aviso: string | null;
  editando: boolean;
};

export default function RespaldosEnLote({
  alGuardar,
}: {
  /** Cuando se guardó alguno: recargar la carpeta. */
  readonly alGuardar: () => void;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (clave: string, cambios: Partial<Fila>) =>
    setFilas((fs) =>
      fs.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)),
    );

  const recibir = (archivos: File[]) => {
    const nuevas: Fila[] = [];
    for (const [i, archivo] of archivos.entries()) {
      if (!/\.(pdf|jpe?g|png|webp)$/i.test(archivo.name)) {
        toast.error(
          `"${archivo.name}": para leerlo solo, súbelo en PDF o como foto.`,
        );
        continue;
      }
      if (archivo.size > MAX_MB * 1024 * 1024) {
        toast.error(`"${archivo.name}" pesa más de ${MAX_MB} MB.`);
        continue;
      }
      nuevas.push({
        clave: `${Date.now()}-${i}-${archivo.name}`,
        archivo,
        estado: "leyendo",
        datos: RESPALDO_VACIO,
        aviso: null,
        editando: false,
      });
    }
    if (nuevas.length === 0) return;
    setFilas((fs) => [...fs, ...nuevas]);
    // De a uno: no se le piden diez a la vez a la IA.
    void (async () => {
      for (const f of nuevas) {
        try {
          const { datos, aviso } = await leerRespaldo(f.archivo);
          cambiar(f.clave, { estado: "leido", datos, aviso });
        } catch (e) {
          cambiar(f.clave, {
            estado: "sin_leer",
            aviso: humanizeApiError(e, "No se pudo leer: complétalo a mano."),
            editando: true,
          });
        }
      }
    })();
  };
  const { arrastrando, zona } = useArrastreDeArchivos(recibir, {
    desactivado: guardando,
  });

  const listos = filas.filter(
    (f) => f.estado !== "leyendo" && f.datos.numero.trim(),
  );
  const leyendo = filas.some((f) => f.estado === "leyendo");

  const guardar = async () => {
    setGuardando(true);
    let guardados = 0;
    for (const f of listos) {
      try {
        await subirDocumentoDeEmpresa(f.archivo, TIPO_RESPALDO, "", f.datos);
        guardados++;
        setFilas((fs) => fs.filter((x) => x.clave !== f.clave));
      } catch (e) {
        cambiar(f.clave, {
          aviso: humanizeApiError(e, "No se pudo guardar."),
        });
      }
    }
    setGuardando(false);
    if (guardados > 0) {
      toast.success(
        guardados === 1
          ? "Respaldo guardado."
          : `${guardados} respaldos guardados.`,
      );
      alGuardar();
    }
  };

  return (
    <div className="space-y-3">
      <div
        {...zona}
        className={`rounded-lg border-2 border-dashed p-4 space-y-2 transition-colors ${
          arrastrando ? "border-blue-400 bg-blue-50/60" : "border-gray-200"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
            Elegir órdenes de compra o facturas
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              onChange={(e) => {
                const elegidos = Array.from(e.target.files ?? []);
                e.currentTarget.value = "";
                recibir(elegidos);
              }}
            />
          </label>
          <span
            className={
              arrastrando
                ? "text-xs font-bold text-blue-600"
                : "text-xs text-gray-500"
            }
          >
            {arrastrando
              ? "¡Suéltalos aquí! ↓"
              : "o arrástralos aquí, varios a la vez · PDF o foto"}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          La IA lee cada uno y llena el número, el mandante, el contrato, el año
          y el monto. Si es de Mercado Público, lo confirma su ficha pública.
          Revísalos antes de guardar.
        </p>
      </div>

      {filas.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {filas.map((f) => (
            <li key={f.clave} className="px-3 py-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {f.estado === "leyendo" ? (
                  <Loader2
                    size={14}
                    className="animate-spin text-gray-500"
                    aria-hidden="true"
                  />
                ) : (
                  f.estado === "leido" && (
                    <CheckCircle2
                      size={14}
                      className="text-green-600"
                      aria-hidden="true"
                    />
                  )
                )}
                <span className="min-w-0 flex-1 text-sm text-gray-900 break-all">
                  {f.estado === "leyendo"
                    ? `${f.archivo.name}: leyendo…`
                    : f.datos.numero
                      ? resumenDelRespaldo(f.datos)
                      : f.archivo.name}
                </span>
                {f.estado !== "leyendo" && (
                  <button
                    type="button"
                    onClick={() => cambiar(f.clave, { editando: !f.editando })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                  >
                    <Pencil size={12} /> {f.editando ? "Listo" : "Editar"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setFilas((fs) => fs.filter((x) => x.clave !== f.clave))
                  }
                  disabled={guardando}
                  aria-label={`Quitar ${f.archivo.name}`}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
              {f.aviso && <p className="text-xs text-amber-800">{f.aviso}</p>}
              {f.editando && (
                <RespaldoDeExperiencia
                  datos={f.datos}
                  onChange={(datos) => cambiar(f.clave, { datos })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {filas.length > 0 && (
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || leyendo || listos.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando && <Loader2 size={14} className="animate-spin" />}
          {guardando
            ? "Guardando…"
            : leyendo
              ? "Leyendo…"
              : `Guardar ${listos.length} ${listos.length === 1 ? "respaldo" : "respaldos"}`}
        </button>
      )}
    </div>
  );
}
