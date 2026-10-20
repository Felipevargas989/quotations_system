import { useState } from "react";
import { Search } from "lucide-react";
import ListaConGrupos, {
  PreguntaEnFila,
} from "../../components/listas/ListaConGrupos";
import EditarGuardado from "../../components/listas/EditarGuardado";
import GruposDeLista from "../../components/listas/GruposDeLista";
import { useListaBuscable } from "../../hooks/useListaBuscable";
import { useGruposDeMenus } from "../../hooks/useGruposDeMenus";
import type { ServiceGroup } from "../../types/serviceGroups.types";
import {
  porPrecioYNombre,
  precioPorPersonaDeMenu as precioPorPersonaDe,
} from "../../utils/precioPorPersona";
import { nombreBajoElGrupo, ordenarPorGrupo } from "../../utils/gruposDeLista";

/**
 * EL PANEL DE MENÚS GUARDADOS del cotizador (extraído de QuotationForm
 * el 09-09 por el portero de tamaño). Cada fila es NOMBRE · PRECIO POR
 * PERSONA (Felipe, 09-09: "el nombre, un punto y el precio; ese dato
 * vale ahí"). La categoría no se repite: la lista ya es de la categoría de
 * la casilla; solo cuando la casilla no tiene categoría se dice de cuál es
 * cada menú, en gris chico debajo.
 *
 * GRUPOS (12-10-2026, migración 121). Felipe: "¿podría este tener el mismo
 * diseño (lo tenemos como pieza?) así podemos ordenar también los menús
 * guardados de cada categoría". La lista es la pieza común ListaConGrupos
 * (la misma de "Partir de un paquete"): buscador, un título por grupo de la
 * categoría en el orden que decide la empresa ("Ordenar grupos…", al pie),
 * de menor a mayor precio dentro, y el lápiz de cada menú cambia su nombre
 * y su grupo. Sin categoría en la casilla, la lista mezcla categorías y no
 * se agrupa.
 *
 * Las ventanas van FUERA del panel (hermanas): el panel tiene su propio
 * z-index y las taparía.
 */
export default function MenusGuardados({
  grupos: menus,
  conCategoria,
  confirmandoId,
  onElegir,
  onPedirEliminar,
  onConfirmarEliminar,
  onCancelarEliminar,
  onRenombrar,
}: {
  readonly grupos: ServiceGroup[];
  readonly conCategoria: boolean;
  readonly confirmandoId: number | null;
  readonly onElegir: (g: ServiceGroup) => void;
  readonly onPedirEliminar: (id: number) => void;
  readonly onConfirmarEliminar: (id: number) => Promise<void> | void;
  readonly onCancelarEliminar: () => void;
  readonly onRenombrar: (id: number, nombre: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<ServiceGroup | null>(null);
  const [ordenandoGrupos, setOrdenandoGrupos] = useState(false);
  const gruposDeMenus = useGruposDeMenus();

  // La categoría de la casilla: todos los menús de la lista son de ella.
  const categoria = conCategoria ? (menus[0]?.category ?? null) : null;
  const grupos = categoria ? gruposDeMenus.gruposDe(categoria) : [];
  // Sin los grupos todavía, la lista no se dibuja: salía por precio sin
  // títulos y un instante después saltaba a sus grupos (20-10-2026).
  const esperandoGrupos = Boolean(categoria) && gruposDeMenus.cargando;

  // Por grupo y, dentro, de menor a mayor precio por persona (10-10). El
  // buscador mira el nombre del menú Y el de su grupo.
  const enLista = ordenarPorGrupo(
    menus,
    grupos,
    (m) => (categoria ? m.menu_group_id : null),
    porPrecioYNombre<ServiceGroup>(precioPorPersonaDe),
  );
  const porId = new Map(enLista.map((x) => [String(x.elemento.id), x]));
  const lista = useListaBuscable({
    opciones: enLista.map(({ elemento, grupo }) => ({
      value: String(elemento.id),
      label: grupo ? `${elemento.name} · ${grupo.name}` : elemento.name,
    })),
    abierta: true,
    marcarPrimero: true,
  });

  const menuDe = (id: number) => menus.find((m) => m.id === id);

  const filas = lista.filtradas.flatMap((opcion) => {
    const x = porId.get(opcion.value);
    if (!x) return [];
    const { elemento: m, grupo } = x;
    return [
      {
        id: m.id,
        nombre: m.name,
        visible: grupo ? nombreBajoElGrupo(m.name, grupo.name) : m.name,
        precio: precioPorPersonaDe(m),
        grupo,
        detalle: conCategoria ? undefined : m.category,
      },
    ];
  });

  const borrando = confirmandoId != null ? menuDe(confirmandoId) : undefined;
  const pregunta: PreguntaEnFila | null = borrando
    ? {
        id: borrando.id,
        pregunta: `¿Eliminar "${borrando.name}"?`,
        si: "Sí, eliminar",
        onSi: () => onConfirmarEliminar(borrando.id),
      }
    : null;

  return (
    <>
      <div className="absolute left-0 z-10 w-[26rem] max-w-[calc(100vw-2rem)] mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
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
                  const m = menuDe(Number(valor));
                  if (m) onElegir(m);
                })
              }
              placeholder="Buscar menú o grupo…"
              className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              aria-label="Buscar menú guardado"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {esperandoGrupos ? (
            <p className="px-3 py-2 text-sm text-gray-400">Cargando…</p>
          ) : (
            <>
              <ListaConGrupos
                filas={filas}
                conTitulos={grupos.length > 0}
                marcada={lista.marcada}
                refMarcada={lista.refMarcada}
                pregunta={pregunta}
                onNo={onCancelarEliminar}
                onElegir={(id) => {
                  const m = menuDe(id);
                  if (m) onElegir(m);
                }}
                onEditar={(id) => setEditando(menuDe(id) ?? null)}
                onPedirEliminar={onPedirEliminar}
                tituloEliminar="Eliminar menú guardado"
              />
              {lista.filtradas.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">
                  Ninguno calza con la búsqueda.
                </p>
              )}
            </>
          )}
        </div>
        {categoria && (
          <div className="flex justify-end border-t border-gray-200">
            <button
              type="button"
              onClick={() => setOrdenandoGrupos(true)}
              className="px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              title="Crear, renombrar, ordenar y borrar los grupos de esta categoría"
            >
              Ordenar grupos…
            </button>
          </div>
        )}
      </div>

      {editando && (
        <EditarGuardado
          titulo="Editar menú guardado"
          etiquetaNombre="Nombre del menú"
          nombre={editando.name}
          grupoId={editando.menu_group_id ?? null}
          grupos={gruposDeMenus.gruposDe(editando.category)}
          ayudaGrupos={`Aún no hay grupos de ${editando.category}: se crean en «Ordenar grupos…», al pie de esta lista.`}
          onGuardar={async ({ nombre, grupoId }) => {
            if (nombre !== editando.name) {
              await onRenombrar(editando.id, nombre);
            }
            if (grupoId !== (editando.menu_group_id ?? null)) {
              await gruposDeMenus.asignar(editando.id, grupoId);
            }
          }}
          onCerrar={() => setEditando(null)}
        />
      )}
      {ordenandoGrupos && categoria && (
        <GruposDeLista
          titulo={`Grupos de ${categoria}`}
          subtitulo="Ordenan «Usar menú guardado» de esta categoría: un título por grupo y, dentro, de menor a mayor precio."
          grupos={grupos}
          cuantos={(id) => menus.filter((m) => m.menu_group_id === id).length}
          unidad={{ uno: "menú", varios: "menús" }}
          crear={(nombre) => gruposDeMenus.crear(categoria, nombre)}
          renombrar={gruposDeMenus.renombrar}
          ordenar={(ids) => gruposDeMenus.ordenar(categoria, ids)}
          borrar={gruposDeMenus.borrar}
          onCerrar={() => setOrdenandoGrupos(false)}
        />
      )}
    </>
  );
}
