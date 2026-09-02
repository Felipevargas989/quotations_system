import { Component, ReactNode } from "react";

/**
 * LA RED BAJO TODA LA APLICACIÓN (Felipe, 02-09).
 *
 * El vigilante de main.tsx (03-08) recarga cuando falla el precargado
 * de una pieza, pero la pantalla blanca del 01-09 —subiendo un
 * comprobante en producción— entró por otra puerta: la pieza PRINCIPAL
 * de una página perezosa que ya no existía tras publicar una versión
 * nueva. React.lazy lanza, no había quién atajara, y la app moría en
 * blanco.
 *
 * Esta red ataja CUALQUIER caída de render:
 *  - Si el error huele a "pieza que ya no existe" (hubo versión nueva),
 *    recarga UNA vez con el mismo candado de main.tsx — el bucle es
 *    imposible: dos recargas automáticas seguidas no existen.
 *  - Cualquier otro error: pantalla honesta con botón de recarga, en
 *    vez del blanco mudo que asusta.
 */

const CANDADO = "eventia_recarga";
const VENTANA_MS = 10_000;

const esPiezaPerdida = (error: unknown): boolean => {
  const texto = String(
    (error as { message?: string })?.message ?? error ?? "",
  ).toLowerCase();
  return (
    texto.includes("dynamically imported module") ||
    texto.includes("importing a module script failed") ||
    texto.includes("loading chunk") ||
    texto.includes("preload css")
  );
};

/** true = recargó (no hay que pintar nada); false = el candado lo frenó. */
const recargarConCandado = (): boolean => {
  const ultima = Number(sessionStorage.getItem(CANDADO) || 0);
  if (Date.now() - ultima <= VENTANA_MS) return false;
  sessionStorage.setItem(CANDADO, String(Date.now()));
  window.location.reload();
  return true;
};

interface Estado {
  caida: boolean;
}

export default class RedDeSeguridad extends Component<
  { readonly children: ReactNode },
  Estado
> {
  state: Estado = { caida: false };

  static getDerivedStateFromError(): Estado {
    return { caida: true };
  }

  componentDidCatch(error: unknown) {
    if (esPiezaPerdida(error) && recargarConCandado()) return;
    // Queda en pantalla el aviso honesto; el detalle va a la consola
    // para poder diagnosticar si Felipe manda un pantallazo.
    console.error("Eventia se cayó al pintar:", error);
  }

  render() {
    if (!this.state.caida) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <p className="text-3xl mb-3">🔌</p>
          <h1 className="text-lg font-bold text-gray-900 mb-2">
            Algo se desconectó
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Puede ser la conexión a internet o una actualización del
            sistema. Tu información está guardada — esto es solo la
            pantalla.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            Recargar la página
          </button>
        </div>
      </div>
    );
  }
}
