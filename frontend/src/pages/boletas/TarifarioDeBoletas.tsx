import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { UNIDADES_DEL_TARIFARIO } from "../../constants/boletas";
import {
  borrarItemDelTarifario,
  crearItemDelTarifario,
  editarItemDelTarifario,
  getTarifario,
  type ItemDelTarifario,
} from "../../services/boletas.service";
import { humanizeApiError } from "../../utils/apiErrors";

// EL TARIFARIO DE LAS BOLETAS (D3, Felipe 04-11: "tarifario aparte puede
// ser cabañas, ticket diario, otros"). Lo que recepción boletea suelto,
// aparte del catálogo del cotizador. Lo escribe el administrador; los
// precios van con IVA. Una boleta guarda su propia copia de lo cobrado:
// cambiar o quitar un ítem no cambia ninguna boleta ya emitida.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const LLAVE = ["boletas", "tarifario"];
const casilla =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const UNIDADES = UNIDADES_DEL_TARIFARIO.map((u) => ({
  value: u.valor,
  label: `Por ${u.valor}`,
}));

type Borrador = { nombre: string; precio?: number; unidad: string };

function Campos({
  b,
  onChange,
}: {
  readonly b: Borrador;
  readonly onChange: (b: Borrador) => void;
}) {
  return (
    <>
      <label className="block min-w-[14rem] flex-1">
        <span className="flex justify-between text-xs text-gray-500">
          Nombre (sale en la boleta)
          <span>{Array.from(b.nombre).length}/60</span>
        </span>
        <input
          type="text"
          value={b.nombre}
          maxLength={60}
          placeholder="Ej.: Cabaña 4 personas temporada alta"
          onChange={(e) => onChange({ ...b, nombre: e.target.value })}
          className={casilla}
        />
      </label>
      <label className="block w-32">
        <span className="text-xs text-gray-500">Precio con IVA</span>
        <NumberInput
          value={b.precio}
          min={0}
          currency
          placeholder="0"
          onChange={(v) => onChange({ ...b, precio: v })}
          className="px-3 py-1.5 text-sm"
        />
      </label>
      <div className="w-36">
        <span className="text-xs text-gray-500">Unidad</span>
        <SelectWithSearch
          options={UNIDADES}
          value={b.unidad}
          onChange={(v) => v && onChange({ ...b, unidad: v })}
          tamano="sm"
        />
      </div>
    </>
  );
}

export default function TarifarioDeBoletas() {
  const queryClient = useQueryClient();
  const tarifario = useQuery({ queryKey: LLAVE, queryFn: getTarifario });
  const [nuevo, setNuevo] = useState<Borrador>({ nombre: "", unidad: "noche" });
  const [editando, setEditando] = useState<{ id: number; b: Borrador } | null>(
    null,
  );
  const [borrandoId, setBorrandoId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (
    accion: () => Promise<ItemDelTarifario[]>,
    error: string,
  ) => {
    setOcupado(true);
    try {
      queryClient.setQueryData(LLAVE, await accion());
      return true;
    } catch (e) {
      toast.error(humanizeApiError(e, error));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const valido = (b: Borrador) => !!b.nombre.trim() && !!b.precio;
  const items = tarifario.data ?? [];

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">
        Lo que recepción boletea suelto: cabañas, ticket diario, tinaja… Los
        precios van con IVA. Cambiar un ítem no cambia las boletas ya emitidas.
      </p>
      {tarifario.isPending ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay nada.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((i) =>
            editando?.id === i.id ? (
              <li key={i.id} className="flex flex-wrap items-end gap-2 py-2">
                <Campos
                  b={editando.b}
                  onChange={(b) => setEditando({ id: i.id, b })}
                />
                <button
                  type="button"
                  disabled={ocupado || !valido(editando.b)}
                  onClick={async () => {
                    if (
                      await hacer(
                        () =>
                          editarItemDelTarifario(i.id, {
                            nombre: editando.b.nombre.trim(),
                            precio: editando.b.precio,
                            unidad: editando.b.unidad,
                          }),
                        "No se pudo guardar.",
                      )
                    )
                      setEditando(null);
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold"
                >
                  Cancelar
                </button>
              </li>
            ) : borrandoId === i.id ? (
              <li key={i.id} className="py-2">
                <ConfirmInline
                  question={`¿Quitar «${i.nombre}» del tarifario?`}
                  yesLabel="Sí, quitar"
                  onYes={async () => {
                    await hacer(
                      () => borrarItemDelTarifario(i.id),
                      "No se pudo quitar.",
                    );
                    setBorrandoId(null);
                  }}
                  onNo={() => setBorrandoId(null)}
                />
              </li>
            ) : (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span
                  className={`min-w-0 break-words ${i.activo ? "text-gray-900" : "text-gray-400 line-through"}`}
                >
                  {i.nombre}
                  <span className="text-gray-500">
                    {" "}
                    · {clp(i.precio)} por {i.unidad}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-gray-400">
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={i.activo}
                      disabled={ocupado}
                      onChange={(e) =>
                        void hacer(
                          () =>
                            editarItemDelTarifario(i.id, {
                              activo: e.target.checked,
                            }),
                          "No se pudo cambiar.",
                        )
                      }
                    />
                    Activo
                  </label>
                  <button
                    type="button"
                    title="Editar"
                    onClick={() =>
                      setEditando({
                        id: i.id,
                        b: {
                          nombre: i.nombre,
                          precio: i.precio,
                          unidad: i.unidad,
                        },
                      })
                    }
                    className="hover:text-blue-600"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Quitar"
                    onClick={() => setBorrandoId(i.id)}
                    className="hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
        <Campos b={nuevo} onChange={setNuevo} />
        <button
          type="button"
          disabled={ocupado || !valido(nuevo)}
          onClick={async () => {
            if (
              await hacer(
                () =>
                  crearItemDelTarifario({
                    nombre: nuevo.nombre.trim(),
                    precio: nuevo.precio ?? 0,
                    unidad: nuevo.unidad,
                  }),
                "No se pudo agregar.",
              )
            )
              setNuevo({ nombre: "", unidad: nuevo.unidad });
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
        >
          <Plus size={13} /> Agregar
        </button>
      </div>
    </div>
  );
}
