import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getConfigOportunidades,
  guardarConfigOportunidades,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";

// LO QUE VENDE LA EMPRESA, EN «MI EMPRESA» (decisión 30 del doc 17, 19-10).
// Felipe: lo que le sirve a su negocio "debería estar siempre resumido en
// Mi empresa, así se mantiene escalable", y "sí, correcto, dejemos eso
// ahí". Es una sola descripción: la lee el radar para el semáforo y el
// resumen de negocio de lo que se sigue. Se guarda con la configuración del
// módulo (oportunidades_config.perfil), sin tocar regiones ni comunas.

export default function DescripcionDeLaEmpresa() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["oportunidades", "config"],
    queryFn: getConfigOportunidades,
  });
  const [perfil, setPerfil] = useState("");
  useEffect(() => {
    if (data) setPerfil(data.perfil);
  }, [data]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarConfigOportunidades({
        regiones: data?.regiones ?? [],
        comunas_cercanas: data?.comunas_cercanas ?? [],
        perfil,
      }),
    onSuccess: (config) => {
      qc.setQueryData(["oportunidades", "config"], config);
      toast.success(
        "Guardado. La próxima revisión de Mercado Público ya la usa.",
      );
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Store size={15} /> Lo que vende tu empresa
        </h2>
        <p className="text-xs text-gray-500">
          La IA lo lee para el semáforo de cada licitación y para el resumen de
          negocio de las que sigues. Di también lo que está por evaluar y lo que
          NO vendes.
        </p>
      </div>
      <textarea
        aria-label="Lo que vende tu empresa"
        value={perfil}
        onChange={(e) => setPerfil(e.target.value)}
        rows={7}
        maxLength={3000}
        disabled={!data}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => guardar.mutate()}
        disabled={!data || guardar.isPending || perfil === data.perfil}
        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {guardar.isPending ? "Guardando…" : "Guardar"}
      </button>
    </section>
  );
}
