// PERCEPCIÓN DE CARGA (28-07) — EL esqueleto único del sistema.
// Toda espera de página (descarga de la pieza, verificación de sesión,
// verificación de permisos) muestra ESTA MISMA textura gris: una sola
// "sensación de preparando" de principio a fin. Antes convivían
// círculos girando y esqueletos distintos — el ojo contaba varias
// esperas y la app se sentía más lenta de lo que era (hallazgo de
// Felipe, 28-07).
export default function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="space-y-6 animate-pulse max-w-7xl mx-auto">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-xl"></div>
          ))}
        </div>
        <div className="h-72 bg-gray-200 rounded-xl"></div>
      </div>
    </div>
  );
}
