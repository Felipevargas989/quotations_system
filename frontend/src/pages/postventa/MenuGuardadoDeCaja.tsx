import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import MenusGuardados from "../quotations/MenusGuardados";
import { useServiceGroups } from "../../hooks/useServiceGroups";
import type { ServiceGroup } from "../../types/serviceGroups.types";

/**
 * «📖 Usar menú guardado» DE UNA CASILLA en la pestaña Servicios (la misma
 * en la ficha de la cotización y en Post-Venta). Felipe, 20-10-2026: "en el
 * cotizador funciona magistralmente, pero acá… el botón elegir menú nunca
 * desaparece, trae la cantidad de servicios (no suma nada) y no trae el
 * precio".
 *
 * Es la pieza del cotizador tal cual (`MenusGuardados`): nombre · precio por
 * persona, agrupado por nivel y de menor a mayor precio, con el lápiz y el
 * basurero de cada menú. Con categoría en la casilla muestra solo los menús
 * de esa categoría; sin categoría, todos, con su categoría en gris.
 *
 * La pieza no trae su propio cierre (en el cotizador la cierra el escucha
 * global de `.dropdown-container`): acá se cierra sola al elegir, al pinchar
 * fuera o con Escape. Las ventanas de la pieza (renombrar, ordenar grupos)
 * se dibujan adentro de este envoltorio, así que pinchar en ellas no cuenta
 * como «fuera».
 */
export default function MenuGuardadoDeCaja({
  categoria,
  deshabilitado,
  onElegir,
  onAbrir,
}: {
  /** La categoría de la casilla; vacía si todavía no tiene. */
  readonly categoria: string;
  readonly deshabilitado?: boolean;
  readonly onElegir: (menu: ServiceGroup) => void;
  /** Al abrir la lista: la casilla cierra lo suyo (el buscador de
   *  servicios) para que no queden dos listas encimadas. */
  readonly onAbrir?: () => void;
}) {
  const { groups, removeGroup, renameGroup } = useServiceGroups();
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const envoltorio = useRef<HTMLDivElement>(null);

  const menus = groups.filter((g) => !categoria || g.category === categoria);

  const cerrar = () => {
    setAbierto(false);
    setConfirmando(null);
  };

  useEffect(() => {
    if (!abierto) return;
    const alPincharFuera = (e: MouseEvent) => {
      const destino = e.target as Element | null;
      if (envoltorio.current?.contains(destino)) return;
      // Una ventana de la casa que se haya ido a otra parte del documento
      // tampoco cuenta como fuera.
      if (destino?.closest?.('[role="dialog"]')) return;
      cerrar();
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("mousedown", alPincharFuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alPincharFuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  return (
    <div ref={envoltorio} className="relative dropdown-container inline-block">
      <button
        type="button"
        onClick={() => {
          if (abierto) {
            cerrar();
            return;
          }
          onAbrir?.();
          setAbierto(true);
        }}
        disabled={deshabilitado || menus.length === 0}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700 disabled:text-gray-300"
        title={
          menus.length === 0
            ? "No hay menús guardados de esta categoría"
            : "Cargar en esta casilla un menú guardado"
        }
      >
        <BookOpen size={12} /> Usar menú guardado
      </button>
      {abierto && menus.length > 0 && (
        <MenusGuardados
          grupos={menus}
          conCategoria={Boolean(categoria)}
          confirmandoId={confirmando}
          onElegir={(menu) => {
            onElegir(menu);
            cerrar();
          }}
          onPedirEliminar={setConfirmando}
          onConfirmarEliminar={async (id) => {
            await removeGroup(id);
            setConfirmando(null);
          }}
          onCancelarEliminar={() => setConfirmando(null)}
          onRenombrar={renameGroup}
        />
      )}
    </div>
  );
}
