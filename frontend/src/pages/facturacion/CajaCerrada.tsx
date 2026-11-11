// LA CAJA QUEDÓ CERRADA (doc 19 §9.47; Felipe, 10-11-2026: «quedó pegada la
// pantalla de la recepcionista… un check, ojalá con movimiento, que diga la
// caja fue correctamente cerrada»). El primer cierre de producción había
// salido bien, pero la pantalla solo ponía una línea azul chica y volvía a
// mostrar «Abrir la caja»: parecía que no había pasado nada. Ahora el check
// se dibuja una vez y el formulario para abrir otra caja sale recién con su
// botón. El cierre sigue ciego: aquí no va ningún monto.

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function CajaCerrada({
  cerradaEn,
  nombre,
  alAbrirOtra,
}: {
  readonly cerradaEn: string;
  /** Quien cerró: el perfil de la sesión. */
  readonly nombre: string | null;
  readonly alAbrirOtra: () => void;
}) {
  return (
    <div
      role="status"
      className="rounded-xl border border-green-200 bg-white px-4 py-8 text-center"
    >
      <div className="mx-auto mb-4 flex h-24 w-24 animate-caja-aparece items-center justify-center rounded-full bg-green-50 motion-reduce:animate-none">
        <svg
          width="84"
          height="84"
          viewBox="0 0 80 80"
          fill="none"
          aria-hidden="true"
          className="text-green-600"
        >
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            pathLength={100}
            className="animate-caja-circulo [stroke-dasharray:100] motion-reduce:animate-none"
          />
          <path
            d="M25 41 L36 52 L56 30"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            className="animate-caja-visto [stroke-dasharray:100] motion-reduce:animate-none"
          />
        </svg>
      </div>
      <div className="animate-caja-texto motion-reduce:animate-none">
        <p className="text-xl font-semibold text-green-800">
          La caja fue cerrada correctamente
        </p>
        <p className="mt-1 text-sm text-gray-700">
          Cerró {nombre ?? "—"} · {hora(cerradaEn)}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          La revisa el administrador.
        </p>
        <button
          type="button"
          onClick={alAbrirOtra}
          className="mt-5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          Abrir una caja nueva
        </button>
      </div>
    </div>
  );
}
