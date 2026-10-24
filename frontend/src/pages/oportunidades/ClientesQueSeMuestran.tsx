import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, X } from "lucide-react";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { clientsQueryOptions } from "../../services/clients.service";
import { guardarClientesQueSeMuestran } from "../../services/experiencia.service";
import type { VistaDelOferente } from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  clientesQueSeMuestran,
  TIPO_PARTICULAR,
  TIPO_PUBLICO,
} from "./reglasDeLaExperiencia";

// LOS CLIENTES QUE SE PUEDEN MOSTRAR COMO EXPERIENCIA (decisión 76 del doc
// 17, 24-10). Felipe: "quiero no decir tanto mis clientes, que me pueden ir
// a buscar... CCU es buena opción porque es un cliente fidelizado... Fepasa
// no tanto, prefiero esconderlo... todo lo que sea municipalidad es
// correcto". Los públicos se muestran solos y los particulares nunca: aquí
// se eligen solo los privados, una lista corta.

export default function ClientesQueSeMuestran({
  vista,
}: {
  readonly vista: VistaDelOferente;
}) {
  const qc = useQueryClient();
  const { data: clientes = [] } = useQuery(clientsQueryOptions);
  const elegidos = clientesQueSeMuestran(vista);
  const guardar = useMutation({
    mutationFn: (ids: string[]) => guardarClientesQueSeMuestran(ids),
    onSuccess: (nueva) => qc.setQueryData(["oportunidades", "oferente"], nueva),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo guardar la lista.")),
  });

  const nombre = new Map(clientes.map((c) => [c.id, c.name]));
  const opciones = clientes
    .filter(
      (c) =>
        c.client_type !== TIPO_PUBLICO &&
        c.client_type !== TIPO_PARTICULAR &&
        !elegidos.includes(c.id),
    )
    .map((c) => ({ value: c.id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Eye size={15} /> Clientes que puedes mostrar como experiencia
        </h2>
        <p className="text-xs text-gray-500">
          Los clientes públicos (municipalidades, servicios, hospitales) se
          muestran solos y los particulares nunca. Aquí eliges los privados que
          no te importa mostrar, como un cliente fidelizado. Los demás no
          aparecen en ninguna postulación.
        </p>
      </div>
      {elegidos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {elegidos.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-800"
            >
              {nombre.get(id) ?? "Cliente"}
              <button
                type="button"
                onClick={() =>
                  guardar.mutate(elegidos.filter((otro) => otro !== id))
                }
                disabled={guardar.isPending}
                aria-label={`Sacar a ${nombre.get(id) ?? "este cliente"}`}
                className="rounded-full p-0.5 hover:bg-blue-100 disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">
          Todavía no hay privados en la lista: solo se muestran los públicos.
        </p>
      )}
      <div className="max-w-sm">
        <SelectWithSearch
          options={opciones}
          value=""
          onChange={(id) => id && guardar.mutate([...elegidos, id])}
          placeholder="Agregar un cliente privado"
          searchPlaceholder="Buscar cliente…"
          disabled={guardar.isPending}
          mostrarConteo={false}
          tamano="sm"
          sinLimpiar
        />
      </div>
    </section>
  );
}
