// Color de la etiqueta de tipo de cliente, compartido entre la lista de
// clientes y la ficha 360°. Los 6 tipos estándar conservan sus colores
// históricos; los tipos creados por la empresa reciben un color
// automático ESTABLE (mismo nombre → mismo color, en cualquier sesión).
export const getClientTypeColor = (type: string) => {
  const colors = {
    "Colegios & Universidades": "bg-blue-100 text-blue-800",
    Particulares: "bg-green-100 text-green-800",
    "Tour Operadores": "bg-purple-100 text-purple-800",
    Empresas: "bg-orange-100 text-orange-800",
    Iglesias: "bg-yellow-100 text-yellow-800",
    "Empresas Publicas": "bg-red-100 text-red-800",
  };
  const known = colors[type as keyof typeof colors];
  if (known) return known;
  const palette = [
    "bg-teal-100 text-teal-800",
    "bg-rose-100 text-rose-800",
    "bg-indigo-100 text-indigo-800",
    "bg-lime-100 text-lime-800",
    "bg-cyan-100 text-cyan-800",
    "bg-fuchsia-100 text-fuchsia-800",
  ];
  let hash = 0;
  for (const ch of type) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
};

// El punto de color de un tipo en un filtro (05-11-2026, el tablero de
// cotizaciones): la misma familia que su etiqueta, en un tono que se ve
// chico. Las clases van escritas enteras para que Tailwind las genere.
const PUNTO: Record<string, string> = {
  "bg-blue-100 text-blue-800": "bg-blue-500",
  "bg-green-100 text-green-800": "bg-green-500",
  "bg-purple-100 text-purple-800": "bg-purple-500",
  "bg-orange-100 text-orange-800": "bg-orange-500",
  "bg-yellow-100 text-yellow-800": "bg-yellow-500",
  "bg-red-100 text-red-800": "bg-red-500",
  "bg-teal-100 text-teal-800": "bg-teal-500",
  "bg-rose-100 text-rose-800": "bg-rose-500",
  "bg-indigo-100 text-indigo-800": "bg-indigo-500",
  "bg-lime-100 text-lime-800": "bg-lime-500",
  "bg-cyan-100 text-cyan-800": "bg-cyan-500",
  "bg-fuchsia-100 text-fuchsia-800": "bg-fuchsia-500",
};

export const getClientTypeDot = (type: string) =>
  PUNTO[getClientTypeColor(type)] ?? "bg-gray-400";
