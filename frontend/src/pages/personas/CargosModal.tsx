import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Power, X } from "lucide-react";
import Modal from "../../components/Modal";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  createRole,
  deactivateRole,
  getRoles,
  peopleQueryOptions,
  rolesQueryOptions,
  updateRole,
} from "../../services/people.service";
import { humanizeApiError } from "../../utils/apiErrors";
import type { Cargo } from "../../types/people.types";

// LOS CARGOS
//
// Un cargo es SOLO un nombre. No lleva escrito si participa o no en la
// propina: eso se decide en cada reparto (decisión de Felipe, 14-08). Por
// eso acá no hay ningún porcentaje ni casilla de "recibe propina".
//
// Y un cargo NO SE BORRA, SE APAGA: si alguien lo tiene como cargo
// habitual, borrarlo dejaría esa ficha apuntando a la nada.

export default function CargosModal({ onCerrar }: { readonly onCerrar: () => void }) {
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  // Acá sí se piden TODOS, incluidos los apagados, para poder prenderlos
  // de vuelta. El desplegable de la ficha solo muestra los activos.
  // Se muestran de inmediato los que la pantalla ya tenía cargados, y la
  // lista completa (con los apagados) los reemplaza cuando llega. Sin esto
  // el modal se abría en blanco y parecía colgado.
  const yaCargados = qc.getQueryData<Cargo[]>(rolesQueryOptions.queryKey);
  const { data: cargos = [], isLoading } = useQuery({
    queryKey: ["people", "roles", "todos"],
    queryFn: () => getRoles(true),
    placeholderData: yaCargados,
  });

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ["people", "roles"] });
    await qc.invalidateQueries({ queryKey: rolesQueryOptions.queryKey });
    await qc.invalidateQueries({ queryKey: peopleQueryOptions.queryKey });
  };

  const agregar = useMutation({
    mutationFn: (name: string) => createRole(name),
    onSuccess: async () => {
      await refrescar();
      setNuevo("");
      toast.success("Cargo agregado.");
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const renombrar = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateRole(id, { name }),
    onSuccess: async () => {
      await refrescar();
      setEditandoId(null);
      toast.success("Cargo renombrado.");
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const cambiarValorSugerido = useMutation({
    mutationFn: ({ id, valor }: { id: number; valor: number | null }) =>
      updateRole(id, { list_price_fixed: valor }),
    onSuccess: async () => {
      await refrescar();
      toast.success("Valor guardado.");
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const cambiarEncendido = useMutation({
    mutationFn: ({ id, prender }: { id: number; prender: boolean }) =>
      prender ? updateRole(id, { is_active: true }) : deactivateRole(id),
    onSuccess: async () => {
      await refrescar();
      toast.success("Listo.");
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const activos = cargos.filter((c) => c.is_active);
  const apagados = cargos.filter((c) => !c.is_active);

  // LA PIEZA DE LA CASA (Felipe, 17-08: "no lo puedo cerrar"). Este modal
  // estaba hecho a mano y centrado en un contenedor que desplaza: con
  // muchos cargos crecía más que la pantalla, la cabecera con la X se iba
  // hacia arriba fuera de la vista, y no tenía Escape ni cierre al fondo.
  // Modal ancla arriba, tapa la altura, deja la cabecera siempre visible
  // y cierra con Escape y clic afuera — justo lo que faltaba.
  return (
    <Modal titulo="Cargos" ancho="max-w-md" onCerrar={onCerrar}>
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const limpio = nuevo.trim();
              if (limpio) agregar.mutate(limpio);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="Barra, Sonido, Valet…"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!nuevo.trim() || agregar.isPending}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </form>

          {isLoading && cargos.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Cargando…</p>
          )}

          <ul className="divide-y divide-gray-100">
            {activos.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                {editandoId === c.id ? (
                  <>
                    <input
                      type="text"
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() =>
                        renombrar.mutate({ id: c.id, name: nombreEditado })
                      }
                      disabled={!nombreEditado.trim()}
                      aria-label="Guardar nombre"
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      aria-label="Cancelar"
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 truncate text-gray-900">{c.name}</span>
                    {/* El valor sugerido SE EDITA ACÁ desde el 15-08: los
                        cargos salieron de Logística y esta es su única
                        puerta. Sigue siendo una sugerencia — quien decide
                        si una jornada cuesta es la persona (planta o
                        freelance ese día). */}
                    {/* NumberInput trae un contenedor w-full: hay que
                        encajonarlo para que el nombre, la caja y los
                        iconos queden en UNA linea (Felipe, 15-08). */}
                    <div className="w-24 shrink-0">
                      <NumberInput
                        value={c.list_price_fixed ?? undefined}
                        min={0}
                        currency
                        placeholder="0"
                        onCommit={(v) => {
                          const val = v ?? null;
                          if (val !== c.list_price_fixed)
                            cambiarValorSugerido.mutate({ id: c.id, valor: val });
                        }}
                        className="px-2 py-1 text-sm text-right"
                        aria-label={`Valor sugerido de ${c.name}`}
                      />
                    </div>
                    <button
                      onClick={() => {
                        setEditandoId(c.id);
                        setNombreEditado(c.name);
                      }}
                      aria-label={`Renombrar ${c.name}`}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        cambiarEncendido.mutate({ id: c.id, prender: false })
                      }
                      aria-label={`Apagar ${c.name}`}
                      title="Sacarlo de la lista, sin borrarlo"
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>

          {apagados.length > 0 && (
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-2">
                Apagados — no aparecen al elegir, pero las fichas que ya los
                tenían no se rompen
              </p>
              <ul className="divide-y divide-gray-100">
                {apagados.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1 text-gray-400 line-through">
                      {c.name}
                    </span>
                    <button
                      onClick={() =>
                        cambiarEncendido.mutate({ id: c.id, prender: true })
                      }
                      className="text-sm px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                    >
                      Prender
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-500">
            El valor es una <strong>sugerencia</strong> para ahorrar tecleo.
            No decide nada: lo que hace que una jornada cueste plata es que la
            persona sea freelance ese día, no el cargo.
          </p>
          <p className="text-xs text-gray-500">
            Si lleva propina o no <strong>no se decide acá</strong>: se decide
            en cada reparto.
          </p>
        </div>
    </Modal>
  );
}
