import { useState } from "react";
import { Package, Search } from "lucide-react";
import { useListaBuscable } from "../../hooks/useListaBuscable";
import { useGruposDePaquetes } from "../../hooks/useGruposDePaquetes";
import ListaConGrupos, { PreguntaEnFila } from "../listas/ListaConGrupos";
import EditarGuardado from "../listas/EditarGuardado";
import GruposDeLista from "../listas/GruposDeLista";
import { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";
import {
  porPrecioYNombre,
  precioPorPersonaDePaquete,
} from "../../utils/precioPorPersona";
import { nombreBajoElGrupo, ordenarPorGrupo } from "../../utils/gruposDeLista";

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
 * editar listas". La lista es la pieza común ListaConGrupos (la misma de
 * "Usar menú guardado"): un título por grupo, en el orden que decide la
 * empresa ("Ordenar grupos…", al pie) y, dentro, de menor a mayor precio.
 * Cada fila lleva su lápiz (nombre y grupo) y su basurero.
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
  const { grupos, crear, renombrar, ordenar, borrar, editarPaquete } =
    useGruposDePaquetes();

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
    (p) => p.package_group_id,
    porPrecioYNombre<ServiceGroupCollection>(precioPorPersonaDePaquete),
  );
  const porId = new Map(enLista.map((x) => [String(x.elemento.id), x]));
  const lista = useListaBuscable({
    opciones: enLista.map(({ elemento, grupo }) => ({
      value: String(elemento.id),
      label: grupo ? `${elemento.name} · ${grupo.name}` : elemento.name,
    })),
    abierta: abierto,
    marcarPrimero: true,
    alCerrar: cerrar,
  });

  const paqueteDe = (id: number) => paquetes.find((p) => p.id === id);

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

  const filas = lista.filtradas.flatMap((opcion) => {
    const x = porId.get(opcion.value);
    if (!x) return [];
    const { elemento: p, grupo } = x;
    return [
      {
        id: p.id,
        nombre: p.name,
        visible: grupo ? nombreBajoElGrupo(p.name, grupo.name) : p.name,
        precio: precioPorPersonaDePaquete(p),
        grupo,
      },
    ];
  });

  const confirmando = confirma ? paqueteDe(confirma.id) : undefined;
  const pregunta: PreguntaEnFila | null =
    confirma && confirmando
      ? confirma.accion === "cargar"
        ? {
            id: confirma.id,
            pregunta:
              "Ya hay servicios cargados. El paquete se agrega abajo, no los reemplaza.",
            si: "Agregar",
            onSi: () => {
              onCargar(confirmando);
              cerrar();
            },
          }
        : {
            id: confirma.id,
            pregunta: `¿Eliminar "${confirmando.name}"?`,
            si: "Sí, eliminar",
            onSi: async () => {
              await onEliminar(confirmando);
              setConfirma(null);
            },
          }
      : null;

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
                      const p = paqueteDe(Number(valor));
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
            <ListaConGrupos
              filas={filas}
              conTitulos={grupos.length > 0}
              marcada={lista.marcada}
              refMarcada={lista.refMarcada}
              pregunta={pregunta}
              onNo={() => setConfirma(null)}
              onElegir={(id) => {
                const p = paqueteDe(id);
                if (p) elegir(p);
              }}
              onEditar={(id) => {
                cerrar();
                setEditando(paqueteDe(id) ?? null);
              }}
              onPedirEliminar={(id) => setConfirma({ id, accion: "eliminar" })}
              tituloEliminar="Eliminar paquete"
            />
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
        <EditarGuardado
          titulo="Editar paquete"
          etiquetaNombre="Nombre del paquete"
          nombre={editando.name}
          grupoId={editando.package_group_id ?? null}
          grupos={grupos}
          ayudaGrupos="Aún no hay grupos: se crean en «Ordenar grupos…», al pie de «Partir de un paquete»."
          onGuardar={({ nombre, grupoId }) =>
            editarPaquete(editando.id, {
              name: nombre,
              package_group_id: grupoId,
            })
          }
          onCerrar={() => setEditando(null)}
        />
      )}
      {ordenandoGrupos && (
        <GruposDeLista
          titulo="Grupos de paquetes"
          subtitulo="Ordenan «Partir de un paquete»: un título por grupo y, dentro, de menor a mayor precio."
          grupos={grupos}
          cuantos={(id) =>
            paquetes.filter((p) => p.package_group_id === id).length
          }
          unidad={{ uno: "paquete", varios: "paquetes" }}
          crear={crear}
          renombrar={renombrar}
          ordenar={ordenar}
          borrar={borrar}
          onCerrar={() => setOrdenandoGrupos(false)}
        />
      )}
    </div>
  );
}
