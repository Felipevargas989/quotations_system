import { Fragment, useState } from "react";
import { Package, Pencil, Search, Trash2 } from "lucide-react";
import { useListaBuscable } from "../../hooks/useListaBuscable";
import { useGruposDePaquetes } from "../../hooks/useGruposDePaquetes";
import ConfirmInline from "../ConfirmInline";
import EditarPaquete from "../paquetes/EditarPaquete";
import GruposDePaquetes from "../paquetes/GruposDePaquetes";
import { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";
import {
  porPrecioYNombre,
  precioPorPersonaDePaquete,
} from "../../utils/precioPorPersona";
import {
  nombreBajoElGrupo,
  ordenarPorGrupo,
} from "../../utils/gruposDePaquetes";

/**
 * "PARTIR DE UN PAQUETE" — el botón y su lista, con buscador.
 *
 * Higuera del 03-09 (Felipe: "tendré muchos paquetes y es tedioso el
 * scroll"): el panel vivía a mano dentro de QuotationForm —el gigante
 * congelado— y no tenía buscador. Acá afuera gana el motor compartido
 * de la casa (useListaBuscable): busca sin tildes, flechas y Enter,
 * Escape, cierra al pinchar fuera.
 *
 * GRUPOS (12-10-2026, migración 120). Felipe: "un cliente me pregunta por
 * un paseo y debo tener dos o tres alternativas juntas" y "mejor crear y
 * editar listas". Un título por grupo, en el orden que decide la empresa
 * ("Ordenar grupos…", al pie) y, dentro, de menor a mayor precio. Los sin
 * grupo van al final bajo "Otros"; sin ningún grupo creado, la lista se ve
 * como antes. Cada fila lleva su lápiz (nombre y grupo) y su basurero.
 *
 * No es un SelectWithSearch porque cada fila lleva sus acciones y el pie
 * trae "+ Crear paquete nuevo…" y "Ordenar grupos…" — acciones que la
 * pieza estándar no carga.
 */
export default function SelectorDePaquetes({
  paquetes,
  deshabilitado,
  puedeCrear,
  hayServiciosCargados,
  onCargar,
  onEliminar,
  onCrearNuevo,
}: {
  readonly paquetes: ServiceGroupCollection[];
  /** Modo restringido o nada que ofrecer: el botón ni se enciende. */
  readonly deshabilitado: boolean;
  /** Crear paquete necesita menús guardados de donde armarlo. */
  readonly puedeCrear: boolean;
  /** Con servicios ya cargados, cargar un paquete pide confirmación. */
  readonly hayServiciosCargados: () => boolean;
  readonly onCargar: (paquete: ServiceGroupCollection) => void;
  readonly onEliminar: (paquete: ServiceGroupCollection) => Promise<void>;
  readonly onCrearNuevo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [confirma, setConfirma] = useState<{
    id: number;
    accion: "cargar" | "eliminar";
  } | null>(null);
  const [editando, setEditando] = useState<ServiceGroupCollection | null>(null);
  const [ordenandoGrupos, setOrdenandoGrupos] = useState(false);
  const { grupos, editarPaquete } = useGruposDePaquetes();

  const cerrar = () => {
    setAbierto(false);
    setConfirma(null);
  };

  // Por grupo y, dentro, de menor a mayor precio por persona (10-10). El
  // buscador mira el nombre del paquete Y el de su grupo: "full day" trae
  // el grupo entero aunque los nombres no lo digan.
  const enLista = ordenarPorGrupo(
    paquetes,
    grupos,
    porPrecioYNombre<ServiceGroupCollection>(precioPorPersonaDePaquete),
  );
  const grupoDe = new Map(
    enLista.map(({ paquete, grupo }) => [String(paquete.id), grupo]),
  );
  const hayGrupos = grupos.length > 0;
  const lista = useListaBuscable({
    opciones: enLista.map(({ paquete, grupo }) => ({
      value: String(paquete.id),
      label: grupo ? `${paquete.name} · ${grupo.name}` : paquete.name,
    })),
    abierta: abierto,
    marcarPrimero: true,
    alCerrar: cerrar,
  });

  const elegir = (paquete: ServiceGroupCollection) => {
    if (hayServiciosCargados()) {
      setConfirma({ id: paquete.id, accion: "cargar" });
    } else {
      onCargar(paquete);
      cerrar();
    }
  };

  const abrir = () => {
    lista.reiniciar();
    setConfirma(null);
    setAbierto(true);
  };

  return (
    <div ref={lista.refRaiz} className="relative">
      <button
        type="button"
        onClick={() => (abierto ? cerrar() : abrir())}
        disabled={deshabilitado}
        className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg flex items-center space-x-2 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        title="Usar o crear un paquete (evento completo guardado)"
      >
        <Package size={16} />
        <span>Partir de un paquete</span>
      </button>

      {abierto && (
        <div className="absolute right-0 z-10 w-96 max-w-[90vw] mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          {paquetes.length > 0 && (
            <div className="p-2 border-b border-gray-200">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  ref={lista.refBuscador}
                  value={lista.texto}
                  onChange={lista.alEscribir}
                  onKeyDown={(e) =>
                    lista.teclaEnLista(e, (valor) => {
                      const p = paquetes.find((x) => String(x.id) === valor);
                      if (p) elegir(p);
                    })
                  }
                  placeholder="Buscar paquete o grupo…"
                  className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                  aria-label="Buscar paquete"
                />
              </div>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto">
            {lista.filtradas.map((opcion, i) => {
              const paquete = paquetes.find(
                (p) => String(p.id) === opcion.value,
              );
              if (!paquete) return null;
              // Título cuando empieza un grupo (también en la lista
              // filtrada por el buscador).
              const grupo = grupoDe.get(opcion.value) ?? null;
              const grupoAnterior =
                i > 0
                  ? (grupoDe.get(lista.filtradas[i - 1].value) ?? null)
                  : undefined;
              const titulo =
                hayGrupos &&
                (grupoAnterior === undefined ||
                  (grupoAnterior?.id ?? null) !== (grupo?.id ?? null)) ? (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-t border-gray-100 first:border-t-0">
                    {grupo?.name ?? "Otros"}
                  </div>
                ) : null;
              if (confirma?.id === paquete.id) {
                return (
                  <Fragment key={paquete.id}>
                    {titulo}
                    <div className="px-3 py-2">
                      <ConfirmInline
                        question={
                          confirma.accion === "cargar"
                            ? "Ya hay servicios cargados. El paquete se agrega abajo, no los reemplaza."
                            : `¿Eliminar "${paquete.name}"?`
                        }
                        yesLabel={
                          confirma.accion === "cargar"
                            ? "Agregar"
                            : "Sí, eliminar"
                        }
                        onYes={async () => {
                          if (confirma.accion === "cargar") {
                            onCargar(paquete);
                            cerrar();
                          } else {
                            await onEliminar(paquete);
                            setConfirma(null);
                          }
                        }}
                        onNo={() => setConfirma(null)}
                      />
                    </div>
                  </Fragment>
                );
              }
              const porPersona = precioPorPersonaDePaquete(paquete);
              return (
                <Fragment key={paquete.id}>
                  {titulo}
                  <div
                    className={`flex items-center justify-between px-3 py-2 hover:bg-gray-100 ${
                      i === lista.marcada ? "bg-blue-50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      ref={i === lista.marcada ? lista.refMarcada : undefined}
                      onClick={() => elegir(paquete)}
                      className="flex-1 min-w-0 text-left text-sm"
                    >
                      {/* Igual que los menús guardados: nombre · precio por
                        persona de los variables (Felipe, 06-10). El precio
                        nunca se corta; si falta espacio, se corta el nombre.
                        Bajo su título no repite el grupo ("Estándar" bajo
                        "Full day"). */}
                      <span className="flex items-baseline gap-1 min-w-0">
                        <span className="text-gray-900 truncate">
                          {grupo
                            ? nombreBajoElGrupo(paquete.name, grupo.name)
                            : paquete.name}
                        </span>
                        {porPersona > 0 && (
                          <span className="text-gray-500 shrink-0 whitespace-nowrap">
                            · ${porPersona.toLocaleString("es-CL")}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cerrar();
                        setEditando(paquete);
                      }}
                      className="ml-2 text-gray-400 hover:text-blue-600"
                      title="Cambiar nombre o grupo"
                      aria-label={`Editar ${paquete.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirma({ id: paquete.id, accion: "eliminar" });
                      }}
                      className="ml-2 text-red-600 hover:text-red-800"
                      title="Eliminar paquete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Fragment>
              );
            })}
            {paquetes.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">
                Aún no hay paquetes guardados.
              </p>
            )}
            {paquetes.length > 0 && lista.filtradas.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">
                Ninguno calza con la búsqueda.
              </p>
            )}
          </div>
          <div className="flex border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                cerrar();
                onCrearNuevo();
              }}
              disabled={!puedeCrear}
              className="flex-1 px-3 py-2 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed"
              title="Crear un paquete agrupando menús guardados"
            >
              + Crear paquete nuevo…
            </button>
            <button
              type="button"
              onClick={() => {
                cerrar();
                setOrdenandoGrupos(true);
              }}
              className="px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              title="Crear, renombrar, ordenar y borrar los grupos de esta lista"
            >
              Ordenar grupos…
            </button>
          </div>
        </div>
      )}

      {editando && (
        <EditarPaquete
          paquete={editando}
          onGuardar={(cambios) => editarPaquete(editando.id, cambios)}
          onCerrar={() => setEditando(null)}
        />
      )}
      {ordenandoGrupos && (
        <GruposDePaquetes
          paquetes={paquetes}
          onCerrar={() => setOrdenandoGrupos(false)}
        />
      )}
    </div>
  );
}
