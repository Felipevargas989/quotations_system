import { Fragment, useState } from "react";
import { Package, Search, Trash2 } from "lucide-react";
import { useListaBuscable } from "../../hooks/useListaBuscable";
import ConfirmInline from "../ConfirmInline";
import { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";
import {
  porPrecioYNombre,
  precioPorPersonaDePaquete,
} from "../../utils/precioPorPersona";
import {
  grupoDePaquete,
  mismoGrupo,
  nombreSinGrupo,
  porGrupoY,
} from "../../utils/grupoDePaquete";

/**
 * "PARTIR DE UN PAQUETE" — el botón y su lista, con buscador.
 *
 * Higuera del 03-09 (Felipe: "tendré muchos paquetes y es tedioso el
 * scroll"): el panel vivía a mano dentro de QuotationForm —el gigante
 * congelado— y no tenía buscador. Acá afuera gana el motor compartido
 * de la casa (useListaBuscable): busca sin tildes, flechas y Enter,
 * Escape, cierra al pinchar fuera.
 *
 * No es un SelectWithSearch porque cada fila lleva además su basurero
 * (eliminar el paquete, con confirmación) y el pie trae "+ Crear
 * paquete nuevo…" — acciones que la pieza estándar no carga.
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

  const cerrar = () => {
    setAbierto(false);
    setConfirma(null);
  };

  // Agrupados por lo que va antes de los dos puntos del nombre ("Full
  // day: …", "Matrimonio: …"; Felipe, 12-10-2026: "un cliente me pregunta
  // por un paseo y debo tener dos o tres alternativas juntas") y, dentro
  // de cada grupo, de menor a mayor precio por persona (10-10-2026). El
  // buscador sigue mirando el nombre entero: "full day" los trae todos.
  const hayGrupos = paquetes.some((p) => grupoDePaquete(p.name));
  const lista = useListaBuscable({
    opciones: [...paquetes]
      .sort(
        porGrupoY<ServiceGroupCollection>(
          porPrecioYNombre<ServiceGroupCollection>(precioPorPersonaDePaquete),
        ),
      )
      .map((p) => ({ value: String(p.id), label: p.name })),
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
                  placeholder="Buscar paquete…"
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
              // Título cuando empieza un grupo. Solo si la empresa usa
              // grupos: si ningún paquete los tiene, la lista queda como
              // antes. Los sin grupo van al final, bajo "Otros".
              const anterior =
                i > 0
                  ? paquetes.find(
                      (p) => String(p.id) === lista.filtradas[i - 1].value,
                    )
                  : undefined;
              const titulo =
                hayGrupos &&
                (!anterior || !mismoGrupo(anterior.name, paquete.name)) ? (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-t border-gray-100 first:border-t-0">
                    {grupoDePaquete(paquete.name) || "Otros"}
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
                        Bajo un título, sin repetir el grupo ("Adulto
                        mayor" bajo "Full day"). */}
                      <span className="flex items-baseline gap-1 min-w-0">
                        <span className="text-gray-900 truncate">
                          {hayGrupos
                            ? nombreSinGrupo(paquete.name)
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
          <button
            type="button"
            onClick={() => {
              cerrar();
              onCrearNuevo();
            }}
            disabled={!puedeCrear}
            className="w-full border-t border-gray-200 px-3 py-2 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            title="Crear un paquete agrupando menús guardados"
          >
            + Crear paquete nuevo…
          </button>
        </div>
      )}
    </div>
  );
}
