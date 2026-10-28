import { imagenDePersonaje, nombreDePersonaje } from "../utils/personajes";

// EL PERSONAJE DE UNA PERSONA (Felipe, 27-10-2026; migración 167): la
// imagen 3D que eligió en Mi cuenta. Sin una clave de la lista no pinta
// nada, así que se puede poner siempre.
export default function Personaje({
  clave,
  tamano = 20,
  className = "",
}: {
  readonly clave?: string | null;
  readonly tamano?: number;
  readonly className?: string;
}) {
  const src = imagenDePersonaje(clave);
  if (!src) return null;
  const nombre = nombreDePersonaje(clave);
  return (
    <img
      src={src}
      alt={nombre}
      title={nombre}
      width={tamano}
      height={tamano}
      loading="lazy"
      className={`inline-block shrink-0 select-none ${className}`}
    />
  );
}
