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
