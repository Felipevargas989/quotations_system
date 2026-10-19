import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import MultiSelect from "../../components/MultiSelect";
import { toast } from "../../components/toast/Toast";
import {
  getConfigOportunidades,
  guardarConfigOportunidades,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { REGIONES_DE_CHILE } from "./oportunidades.utils";

// LA CONFIGURACIÓN DEL MÓDULO (doc 17 §5.7): regiones y comunas cercanas
// (lo que la IA sabe de la empresa pasó a «Mi empresa» el 19-10, decisión 30). Editable aquí, por empresa (Felipe,
// 16-10: "eso debería ser configurable en el módulo de Eventia"). El monto
// de alto valor y el correo de avisos viven en Configuración de empresa:
// aquí solo se muestran, para no tenerlos en dos lados.

export default function ConfiguracionOportunidades() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["oportunidades", "config"],
    queryFn: getConfigOportunidades,
  });

  const [regiones, setRegiones] = useState<string[]>([]);
  const [comunas, setComunas] = useState<string[]>([]);
  const [nuevaComuna, setNuevaComuna] = useState("");

  useEffect(() => {
    if (!data) return;
    setRegiones(data.regiones);
    setComunas(data.comunas_cercanas);
  }, [data]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarConfigOportunidades({
        regiones,
        comunas_cercanas: comunas,
        // Lo que vende la empresa se edita en «Mi empresa»: aquí va como está.
        perfil: data?.perfil ?? "",
      }),
    onSuccess: (config) => {
      qc.setQueryData(["oportunidades", "config"], config);
      toast.success(
        "Configuración guardada. La próxima revisión de Mercado Público ya la usa.",
      );
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  const agregarComuna = () => {
    const c = nuevaComuna.trim();
    if (!c) return;
    if (!comunas.some((x) => x.toLowerCase() === c.toLowerCase())) {
      setComunas([...comunas, c]);
    }
    setNuevaComuna("");
  };

  if (isPending) {
    return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-10 text-center text-sm text-red-600">
        No se pudo cargar la configuración.
      </p>
    );
  }

  // Si quedó guardada una región escrita distinto, se muestra igual.
  const opcionesDeRegion = [
    ...REGIONES_DE_CHILE,
    ...regiones.filter(
      (r) => !(REGIONES_DE_CHILE as readonly string[]).includes(r),
    ),
  ].map((r) => ({ value: r, label: r }));

  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">
          Regiones de interés
        </h2>
        <p className="text-xs text-gray-500">
          El radar guarda las licitaciones de todo Chile; aquí eliges cuáles lee
          la IA para ti. Las compras ágiles se piden solo de estas regiones.
        </p>
        <MultiSelect
          options={opcionesDeRegion}
          value={regiones}
          onChange={setRegiones}
          placeholder="Elige una o varias regiones"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">
          Comunas cercanas
        </h2>
        <p className="text-xs text-gray-500">
          Lo de estas comunas que sea del rubro nunca queda en rojo, y lleva la
          marca "Comuna cercana".
        </p>
        <div className="flex flex-wrap gap-1.5">
          {comunas.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-gray-50 text-gray-700"
            >
              {c}
              <button
                type="button"
                aria-label={`Quitar ${c}`}
                onClick={() => setComunas(comunas.filter((x) => x !== c))}
                className="text-gray-400 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={nuevaComuna}
            onChange={(e) => setNuevaComuna(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregarComuna();
              }
            }}
            placeholder="Quillón"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={agregarComuna}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Plus size={14} />
            Agregar
          </button>
        </div>
      </section>

      <p className="p-3 rounded-lg bg-gray-50 text-sm text-gray-600">
        Lo que vende tu empresa ahora se escribe en «Mi empresa» (19-10): es una
        sola descripción para el semáforo y el resumen de negocio.
      </p>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="p-3 rounded-lg bg-gray-50 text-sm">
          <p className="text-xs text-gray-500">Monto de alto valor</p>
          <p className="font-semibold text-gray-900">
            {data.umbral_alto_valor
              ? formatCurrency(data.umbral_alto_valor, "CLP")
              : "Sin definir"}
          </p>
          <p className="text-xs text-gray-500">
            Se cambia en Configuración de empresa.
          </p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 text-sm">
          <p className="text-xs text-gray-500">Correo de la empresa</p>
          <p className="font-semibold text-gray-900 break-all">
            {data.correo_avisos ?? "Sin definir"}
          </p>
          <p className="text-xs text-gray-500">
            Se cambia en Configuración de empresa.
          </p>
        </div>
      </section>

      <div>
        <button
          type="button"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
